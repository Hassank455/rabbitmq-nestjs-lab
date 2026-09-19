import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import {
  DomainEvent,
  LAB05_ALL_SERVICES,
  LAB05_EXCHANGE,
  LAB05_SUBSCRIPTIONS,
  Lab05Service,
  lab05QueueFor,
} from './lab05.constants';

@Injectable()
export class Lab05Consumer implements OnModuleInit {
  private readonly logger = new Logger(Lab05Consumer.name);

  private readonly workerName = process.env.WORKER_NAME ?? 'worker';

  constructor(private readonly rabbit: RabbitMQService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.CONSUMERS !== 'on') {
      this.logger.warn('Lab05 consumers are OFF');
      return;
    }

    for (const service of this.parseServices(process.env.LAB05_SERVICES)) {
      await this.startService(service);
    }
  }

  private async startService(service: Lab05Service): Promise<void> {
    const channel = await this.rabbit.createChannel();
    const queue = lab05QueueFor(service);
    const patterns = LAB05_SUBSCRIPTIONS[service];

    await channel.assertExchange(LAB05_EXCHANGE, 'topic', { durable: false });
    await channel.assertQueue(queue, { durable: false });

    // Same bindQueue call as lab04. The ONLY difference is that the
    // exchange type makes the broker interpret * and # instead of
    // comparing the string literally.
    for (const pattern of patterns) {
      await channel.bindQueue(queue, LAB05_EXCHANGE, pattern);
    }

    await channel.prefetch(1);

    await channel.consume(
      queue,
      (msg) => {
        if (msg === null) return;

        const event = JSON.parse(msg.content.toString()) as DomainEvent;

        // Still only the PUBLISHED key — never which pattern matched.
        // With wildcards that gap gets wider: 'payments' cannot tell
        // whether 'order.paid.*' or 'payment.#' brought this message.
        this.logger.log(
          `[${this.workerName}] ${service.padEnd(11)} ← ` +
            `${msg.fields.routingKey.padEnd(22)} #${event.eventId}`,
        );

        channel.ack(msg);
      },
      { noAck: false },
    );

    this.logger.log(
      `[${this.workerName}] ${service.padEnd(11)} bound to [${patterns.join(' , ')}]`,
    );
  }

  private parseServices(raw: string | undefined): Lab05Service[] {
    if (!raw) return [...LAB05_ALL_SERVICES];
    if (raw === 'none') return [];

    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is Lab05Service =>
        (LAB05_ALL_SERVICES as readonly string[]).includes(s),
      );
  }
}
