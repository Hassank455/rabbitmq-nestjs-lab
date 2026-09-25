import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Channel, ConsumeMessage } from 'amqplib';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import {
  LAB08_DELAY,
  LAB08_DLQ,
  LAB08_DLX,
  LAB08_EXCHANGE,
  LAB08_PAUSED,
  LAB08_QUEUE,
  LAB08_ROUTING_KEY,
  OrderMessage,
} from './lab08.constants';

@Injectable()
export class Lab08Consumer implements OnModuleInit {
  private readonly logger = new Logger(Lab08Consumer.name);

  constructor(private readonly rabbit: RabbitMQService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.CONSUMERS !== 'on') {
      this.logger.warn('Lab08 consumers are OFF');
      return;
    }

    await this.rabbit.registerConsumer('lab08.orders', (channel) =>
      this.setup(channel),
    );
  }

  private async setup(channel: Channel): Promise<void> {
    // 1. The dead-letter side FIRST.
    //    If the DLX does not exist when a message dies, the message is dropped.
    await channel.assertExchange(LAB08_DLX, 'fanout', { durable: true });
    await channel.assertQueue(LAB08_DLQ, { durable: true });
    await channel.bindQueue(LAB08_DLQ, LAB08_DLX, '');

    // 2. The work queue, pointing at the DLX.
    //    Queue arguments are fixed at creation (Lab 06): changing them later
    //    means PRECONDITION_FAILED. Use a policy for existing queues.
    await channel.assertExchange(LAB08_EXCHANGE, 'direct', { durable: true });
    await channel.assertQueue(LAB08_QUEUE, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': LAB08_DLX },
    });
    await channel.bindQueue(LAB08_QUEUE, LAB08_EXCHANGE, LAB08_ROUTING_KEY);

    if (LAB08_PAUSED) {
      this.logger.warn(`PAUSED: ${LAB08_QUEUE} is declared but not consumed`);
      return;
    }

    await channel.prefetch(1);

    await channel.consume(
      LAB08_QUEUE,
      (msg) => {
        if (msg === null) return;
        void this.handle(channel, msg);
      },
      { noAck: false },
    );
  }

  private async handle(channel: Channel, msg: ConsumeMessage): Promise<void> {
    const order = JSON.parse(msg.content.toString()) as OrderMessage;

    // Written by the BROKER each time this message was dead-lettered.
    // Unlike Lab 07's Map, it travels WITH the message.
    const deaths = msg.properties.headers?.['x-death'] ?? [];
    const history = deaths.length
      ? `  (died before: ${deaths.map((d) => `${d.reason} ×${d.count}`).join(', ')})`
      : '';

    this.logger.log(`⏳ #${order.orderId} ${order.kind}${history}`);

    await new Promise((resolve) => setTimeout(resolve, LAB08_DELAY));

    if (order.kind === 'ok') {
      channel.ack(msg);
      this.logger.log(`✅ #${order.orderId} done`);
      return;
    }

    // Same call as Lab 07's 'drop' strategy.
    // The difference is the queue argument: now the message is KEPT.
    channel.nack(msg, false, false);
    this.logger.error(`☠️  #${order.orderId} rejected → ${LAB08_DLQ}`);
  }
}
