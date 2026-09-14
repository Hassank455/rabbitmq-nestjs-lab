import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);

  private connection!: amqp.ChannelModel;

  /** Shared channel, used for publishing only. */
  private channel!: amqp.Channel;

  /** Every channel we handed out, so shutdown can close them all. */
  private readonly channels: amqp.Channel[] = [];

  async onModuleInit(): Promise<void> {
    const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';

    // ONE TCP connection per process. Expensive to open.
    this.connection = await amqp.connect(url);

    this.connection.on('error', (err: Error) =>
      this.logger.error(`Connection error: ${err.message}`),
    );
    this.connection.on('close', () => this.logger.warn('Connection closed'));

    // The shared publishing channel is just the first channel we create.
    this.channel = await this.createChannel();

    this.logger.log(`Connected to RabbitMQ at ${url}`);
  }

  /**
   * Shared channel. Fine for PUBLISHING:
   * publishers have no prefetch and no consumer state to isolate.
   */
  getChannel(): amqp.Channel {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not ready yet');
    }
    return this.channel;
  }

  /**
   * A dedicated channel. Every CONSUMER should call this, because:
   *   1. prefetch() is a per-channel setting
   *   2. a protocol error kills the channel and every consumer on it
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
    // Closing a channel whose connection already died throws — ignore it.
    for (const channel of this.channels) {
      await channel.close().catch(() => undefined);
    }

    await this.connection?.close();
    this.logger.log('RabbitMQ connection closed');
  }
}
