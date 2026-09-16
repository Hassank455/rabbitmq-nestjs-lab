import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import {
  LAB04_ALL_SERVICES,
  LAB04_EXCHANGE,
  LAB04_SUBSCRIPTIONS,
  Lab04Service,
  OrderEvent,
  lab04QueueFor,
} from './lab04.constants';

@Injectable()
export class Lab04Consumer implements OnModuleInit {
  private readonly logger = new Logger(Lab04Consumer.name);

  private readonly workerName = process.env.WORKER_NAME ?? 'worker';

  constructor(private readonly rabbit: RabbitMQService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.CONSUMERS !== 'on') {
      this.logger.warn('Lab04 consumers are OFF');
      return;
    }

    // LAB04_SERVICES=email,audit → run only those in this process
    // LAB04_SERVICES=none        → run none
    // (unset)                    → run all four
    for (const service of this.parseServices(process.env.LAB04_SERVICES)) {
      await this.startService(service);
    }
  }

  private async startService(service: Lab04Service): Promise<void> {
    const channel = await this.rabbit.createChannel();
    const queue = lab04QueueFor(service);
    const keys = LAB04_SUBSCRIPTIONS[service];

    await channel.assertExchange(LAB04_EXCHANGE, 'direct', { durable: false });
    await channel.assertQueue(queue, { durable: false });

    // ONE queue, MANY bindings. Each call adds one routing rule.
    // If a message somehow matched two bindings of the SAME queue,
    // it is still enqueued ONCE: the QUEUE is the unit of copying,
    // not the binding.
    for (const key of keys) {
      await channel.bindQueue(queue, LAB04_EXCHANGE, key);
    }

    await channel.prefetch(1);

    await channel.consume(
      queue,
      (msg) => {
        if (msg === null) return;

        const event = JSON.parse(msg.content.toString()) as OrderEvent;

        // msg.fields.routingKey = the key the PUBLISHER used.
        // RabbitMQ does not tell you WHICH binding matched — only the key.
        // That is why a multi-binding queue must branch on this value.
        this.logger.log(
          `[${this.workerName}] ${service.padEnd(9)} ← ` +
            `${msg.fields.routingKey.padEnd(16)} order #${event.orderId}`,
        );

        channel.ack(msg);
      },
      { noAck: false },
    );

    this.logger.log(
      `[${this.workerName}] ${service} bound "${queue}" → [${keys.join(', ')}]`,
    );
  }

  private parseServices(raw: string | undefined): Lab04Service[] {
    if (!raw) return [...LAB04_ALL_SERVICES];
    if (raw === 'none') return [];

    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is Lab04Service =>
        (LAB04_ALL_SERVICES as readonly string[]).includes(s),
      );
  }
}
