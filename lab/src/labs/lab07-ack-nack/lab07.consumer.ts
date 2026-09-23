import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Channel, ConsumeMessage } from 'amqplib';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import {
  LAB07_DELAY,
  LAB07_EXCHANGE,
  LAB07_MAX_ATTEMPTS,
  LAB07_QUEUE,
  LAB07_ROUTING_KEY,
  LAB07_STRATEGY,
  PaymentMessage,
} from './lab07.constants';

@Injectable()
export class Lab07Consumer implements OnModuleInit {
  private readonly logger = new Logger(Lab07Consumer.name);

  /**
   * How many times WE have seen each paymentId.
   * AMQP gives us no attempt counter — only a boolean `redelivered`.
   * This Map is the naive fix. Lab 07 exists to show why it is not enough.
   */
  private readonly attempts = new Map<number, number>();

  constructor(private readonly rabbit: RabbitMQService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.CONSUMERS !== 'on') {
      this.logger.warn('Lab07 consumers are OFF');
      return;
    }

    await this.rabbit.registerConsumer('lab07.payments', (channel) =>
      this.setup(channel),
    );
  }

  private async setup(channel: Channel): Promise<void> {
    await channel.assertExchange(LAB07_EXCHANGE, 'direct', { durable: true });
    await channel.assertQueue(LAB07_QUEUE, { durable: true });
    await channel.bindQueue(LAB07_QUEUE, LAB07_EXCHANGE, LAB07_ROUTING_KEY);

    // prefetch(1) makes the failure behaviour visible:
    // one message at a time, so a stuck message stops everything.
    await channel.prefetch(1);

    this.logger.log(`strategy = ${LAB07_STRATEGY}`);

    await channel.consume(
      LAB07_QUEUE,
      (msg) => {
        if (msg === null) return;
        void this.handle(channel, msg);
      },
      { noAck: false },
    );
  }

  private async handle(channel: Channel, msg: ConsumeMessage): Promise<void> {
    const payment = JSON.parse(msg.content.toString()) as PaymentMessage;

    const attempt = (this.attempts.get(payment.paymentId) ?? 0) + 1;
    this.attempts.set(payment.paymentId, attempt);

    this.logger.log(
      `#${payment.paymentId} ${payment.kind.padEnd(9)} attempt=${attempt} ` +
        `redelivered=${msg.fields.redelivered}`,
    );

    await new Promise((resolve) => setTimeout(resolve, LAB07_DELAY));

    if (!this.fails(payment, attempt)) {
      channel.ack(msg);
      this.attempts.delete(payment.paymentId);
      this.logger.log(`✅ #${payment.paymentId} done`);
      return;
    }

    switch (LAB07_STRATEGY) {
      case 'requeue':
        // Back to the queue, at its ORIGINAL position (the front).
        // A message that always fails will be redelivered forever.
        channel.nack(msg, false, true);
        this.logger.warn(`↩️  #${payment.paymentId} requeued`);
        break;

      case 'drop':
        // requeue: false → no DLX configured yet, so the message is GONE.
        channel.nack(msg, false, false);
        this.logger.error(`🗑️  #${payment.paymentId} dropped`);
        break;

      case 'smart':
        if (attempt < LAB07_MAX_ATTEMPTS) {
          channel.nack(msg, false, true);
          this.logger.warn(
            `↩️  #${payment.paymentId} retry ${attempt}/${LAB07_MAX_ATTEMPTS}`,
          );
        } else {
          channel.nack(msg, false, false);
          this.attempts.delete(payment.paymentId);
          this.logger.error(
            `🗑️  #${payment.paymentId} gave up after ${attempt} attempts`,
          );
        }
        break;

      case 'hang':
        // No ack, no nack, no error. The broker keeps it "unacked" and,
        // with prefetch(1), sends this consumer nothing else. Ever.
        this.logger.error(`💀 #${payment.paymentId} left unacked`);
        break;
    }
  }

  /** Decides whether this delivery "fails". */
  private fails(payment: PaymentMessage, attempt: number): boolean {
    if (payment.kind === 'ok') return false;
    if (payment.kind === 'poison') return true; // never succeeds
    return attempt < 3; // transient: succeeds on the 3rd delivery
  }
}
