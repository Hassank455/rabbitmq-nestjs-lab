import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import {
  LAB03_EXCHANGE,
  LAB03_SERVICES,
  Lab03Service,
  OrderCreatedEvent,
  lab03QueueFor,
} from './lab03.constants';

@Injectable()
export class Lab03Consumer implements OnModuleInit {
  private readonly logger = new Logger(Lab03Consumer.name);

  private readonly workerName = process.env.WORKER_NAME ?? 'worker';

  constructor(private readonly rabbit: RabbitMQService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.CONSUMERS !== 'on') {
      this.logger.warn('Lab03 consumers are OFF');
      return;
    }

    // SERVICES=email,sms   → run only those services in this process
    // SERVICES=none        → run no named service (useful with LIVE=on)
    // (unset)              → run all three
    for (const service of this.parseServices(process.env.SERVICES)) {
      await this.startService(service);
    }

    if (process.env.LIVE === 'on') {
      await this.startLiveSubscriber();
    }
  }

  /**
   * A "real" subscriber: a NAMED queue that outlives this process.
   * If the service is down, its queue keeps collecting copies.
   */
  private async startService(service: Lab03Service): Promise<void> {
    // One channel per subscription (same reasoning as Lab 02).
    const channel = await this.rabbit.createChannel();
    const queue = lab03QueueFor(service);

    // 1. Declare the exchange here too. Startup order must not matter:
    //    binding to an exchange that does not exist yet = NOT_FOUND, channel dies.
    await channel.assertExchange(LAB03_EXCHANGE, 'fanout', { durable: false });

    // 2. The SERVICE owns its queue. The publisher has never heard of it.
    await channel.assertQueue(queue, { durable: false });

    // 3. THE BINDING: "copy every message from this exchange into my queue".
    //    Fanout ignores the binding key, so we pass ''.
    //    Idempotent: binding twice does not create two bindings.
    await channel.bindQueue(queue, LAB03_EXCHANGE, '');

    await channel.prefetch(1);

    await channel.consume(
      queue,
      (msg) => {
        if (msg === null) return;

        const event = JSON.parse(msg.content.toString()) as OrderCreatedEvent;

        this.logger.log(
          `[${this.workerName}] ${service.padEnd(9)} ← order #${event.orderId}`,
        );

        channel.ack(msg);
      },
      { noAck: false },
    );

    this.logger.log(`[${this.workerName}] ${service} bound "${queue}"`);
  }

  /**
   * A "temporary" subscriber: a live dashboard that only cares
   * about orders WHILE it is running.
   */
  private async startLiveSubscriber(): Promise<void> {
    const channel = await this.rabbit.createChannel();

    await channel.assertExchange(LAB03_EXCHANGE, 'fanout', { durable: false });

    // Name '' → the BROKER invents a unique name (amq.gen-XXXX).
    // exclusive: true → only this connection may use it, and it is
    // DELETED the moment this connection closes.
    const { queue } = await channel.assertQueue('', { exclusive: true });

    await channel.bindQueue(queue, LAB03_EXCHANGE, '');

    this.logger.log(`[${this.workerName}] LIVE dashboard on "${queue}"`);

    await channel.consume(
      queue,
      (msg) => {
        if (msg === null) return;

        const event = JSON.parse(msg.content.toString()) as OrderCreatedEvent;

        this.logger.log(
          `[${this.workerName}] 📺 LIVE    ← order #${event.orderId}`,
        );
      },
      // noAck: true is a deliberate choice here, not laziness:
      // a live view does not care if it misses a message during a crash.
      { noAck: true },
    );
  }

  private parseServices(raw: string | undefined): Lab03Service[] {
    if (!raw) return [...LAB03_SERVICES];
    if (raw === 'none') return [];

    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is Lab03Service =>
        (LAB03_SERVICES as readonly string[]).includes(s),
      );
  }
}
