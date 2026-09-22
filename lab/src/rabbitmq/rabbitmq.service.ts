import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as amqp from 'amqplib';

/**
 * Everything a consumer needs, declared from scratch.
 * It runs again on EVERY reconnect, with a brand-new channel.
 */
export type ConsumerSetup = (channel: amqp.Channel) => Promise<void>;

interface RegisteredConsumer {
  name: string;
  setup: ConsumerSetup;
}

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);

  // A RECOVERING connection: amqplib reopens the TCP connection by itself.
  // It does NOT reopen channels or consumers. That part is our job.
  private connection!: amqp.RecoveringChannelModel;

  /** true between a successful (re)connect and the next disconnect. */
  private ready = false;

  /** Shared publishing channel. undefined while the broker is unreachable. */
  private channel?: amqp.Channel;

  /** Channels of the CURRENT connection, so shutdown can close them. */
  private channels: amqp.Channel[] = [];

  /** Consumers that asked to be restored after every reconnect. */
  private readonly consumers: RegisteredConsumer[] = [];

  async onModuleInit(): Promise<void> {
    const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';

    this.connection = await amqp.connect(url, {
      recovery: {
        initialDelay: 500, // first retry after ~0.5 s
        maxDelay: 10_000, // never wait longer than 10 s between retries
        factor: 2, // 0.5 → 1 → 2 → 4 → 8 → 10 → 10 … seconds
      },
    });

    this.connection.on('disconnect', (err: Error) => {
      // Every channel died together with the connection. Forget them all.
      this.ready = false;
      this.channel = undefined;
      this.channels = [];
      this.logger.error(`Disconnected: ${err.message}`);
    });

    this.connection.on('reconnect-scheduled', ({ attempt, delay }) =>
      this.logger.warn(`Reconnect attempt #${attempt} in ${delay} ms`),
    );

    // Fires after every successful RE-connect.
    this.connection.on('connect', () => void this.onConnected());

    this.connection.on('error', (err: Error) =>
      this.logger.error(`Connection error: ${err.message}`),
    );

    // The FIRST connect already happened inside amqp.connect(),
    // before our 'connect' listener existed. Run the setup by hand once.
    await this.onConnected();
    this.logger.log(`Connected to RabbitMQ at ${url}`);
  }

  /** Rebuild everything that lives on a connection. */
  private async onConnected(): Promise<void> {
    if (this.ready) return;
    this.ready = true;

    this.channel = await this.createChannel();

    for (const consumer of this.consumers) {
      await this.startConsumer(consumer);
    }

    if (this.consumers.length > 0) {
      this.logger.log(`Restored ${this.consumers.length} consumer(s)`);
    }
  }

  /**
   * Shared channel for PUBLISHING.
   * Throws 503 while disconnected instead of hanging or crashing.
   */
  getChannel(): amqp.Channel {
    if (!this.channel) {
      // 503: the request was fine, WE are temporarily unavailable.
      throw new ServiceUnavailableException('RabbitMQ is not connected');
    }
    return this.channel;
  }

  /**
   * The recovery-friendly way to consume (Lab 06 onwards).
   * `setup` must declare EVERYTHING it relies on — exchange, queue,
   * binding, prefetch, consume — because after a broker restart
   * none of it is guaranteed to exist any more.
   */
  async registerConsumer(name: string, setup: ConsumerSetup): Promise<void> {
    const consumer: RegisteredConsumer = { name, setup };
    this.consumers.push(consumer);

    // Connected right now → start now. Otherwise onConnected() will.
    if (this.ready) {
      await this.startConsumer(consumer);
    }
  }

  private async startConsumer(consumer: RegisteredConsumer): Promise<void> {
    try {
      const channel = await this.createChannel();
      await consumer.setup(channel);
      this.logger.log(`Consumer "${consumer.name}" is running`);
    } catch (err) {
      this.logger.error(
        `Consumer "${consumer.name}" failed to start: ${(err as Error).message}`,
      );
    }
  }

  /**
   * A dedicated channel. Labs 01–05 call this directly: it works,
   * but those consumers are NOT restored after a reconnect.
   */
  async createChannel(): Promise<amqp.Channel> {
    const channel = await this.connection.createChannel();

    channel.on('error', (err: Error) =>
      this.logger.error(`Channel error: ${err.message}`),
    );
    channel.on('close', () => this.logger.warn('Channel closed'));

    this.channels.push(channel);
    return channel;
  }

  async onModuleDestroy(): Promise<void> {
    for (const channel of this.channels) {
      await channel.close().catch(() => undefined);
    }

    // Also cancels any pending reconnect timer.
    await this.connection?.close();
    this.logger.log('RabbitMQ connection closed');
  }
}
