import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Channel, ConsumeMessage } from 'amqplib';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import {
  InvoiceMessage,
  LAB06_DURABLE,
  LAB06_EXCHANGE,
  LAB06_QUEUE,
  LAB06_ROUTING_KEY,
} from './lab06.constants';

@Injectable()
export class Lab06Consumer implements OnModuleInit {
  private readonly logger = new Logger(Lab06Consumer.name);

  private readonly delayMs = Number(process.env.LAB06_DELAY ?? 2000);

  /** on → declare the queue and binding, but do not consume. */
  private readonly paused = process.env.LAB06_PAUSED === 'on';

  constructor(private readonly rabbit: RabbitMQService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.CONSUMERS !== 'on') {
      this.logger.warn('Lab06 consumers are OFF');
      return;
    }

    // NOT createChannel() like labs 01–05.
    // registerConsumer() runs setup() now AND again after every reconnect.
    await this.rabbit.registerConsumer('lab06.invoices', (channel) =>
      this.setup(channel),
    );
  }

  /** Declares EVERYTHING from scratch: after a restart, nothing may exist. */
  private async setup(channel: Channel): Promise<void> {
    await channel.assertExchange(LAB06_EXCHANGE, 'direct', {
      durable: LAB06_DURABLE,
    });

    // durable: true → the QUEUE definition survives a broker restart.
    // Its messages survive only if they were published as persistent.
    await channel.assertQueue(LAB06_QUEUE, { durable: LAB06_DURABLE });

    await channel.bindQueue(LAB06_QUEUE, LAB06_EXCHANGE, LAB06_ROUTING_KEY);

    if (this.paused) {
      this.logger.warn(`PAUSED: "${LAB06_QUEUE}" is bound, nobody consumes it`);
      return;
    }

    await channel.prefetch(1);

    await channel.consume(
      LAB06_QUEUE,
      (msg) => {
        if (msg === null) return;
        void this.handle(channel, msg);
      },
      { noAck: false },
    );
  }

  private async handle(channel: Channel, msg: ConsumeMessage): Promise<void> {
    const invoice = JSON.parse(msg.content.toString()) as InvoiceMessage;
    const again = msg.fields.redelivered ? '  (redelivered)' : '';

    this.logger.log(`⏳ invoice #${invoice.invoiceId}${again}`);

    await new Promise((resolve) => setTimeout(resolve, this.delayMs));

    try {
      // An ack is only valid on the channel that DELIVERED the message.
      // If the broker restarted during the delay, that channel is dead
      // and ack() throws "Channel closed".
      channel.ack(msg);
      this.logger.log(`✅ invoice #${invoice.invoiceId}`);
    } catch (err) {
      // Never acked → if it survived the restart, the broker delivers it
      // AGAIN on the new channel. The work above already ran once.
      this.logger.warn(
        `❌ ack for #${invoice.invoiceId} failed: ${(err as Error).message}`,
      );
    }
  }
}
