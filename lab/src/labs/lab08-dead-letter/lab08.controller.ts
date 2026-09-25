import { Body, Controller, Get, Post } from '@nestjs/common';
import type { Channel, GetMessage } from 'amqplib';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import {
  LAB08_DLQ,
  LAB08_EXCHANGE,
  LAB08_PEEK_LIMIT,
  LAB08_ROUTING_KEY,
  OrderKind,
  OrderMessage,
} from './lab08.constants';

interface DeadLetterView {
  body: unknown;
  firstDeathReason?: string;
  firstDeathQueue?: string;
  deaths: string[];
}

@Controller('lab08')
export class Lab08Controller {
  private orderSeq = 0;

  constructor(private readonly rabbit: RabbitMQService) {}

  @Post('orders')
  async publish(
    @Body() body: { kind?: OrderKind; count?: number; expiresInMs?: number },
  ): Promise<{ kind: OrderKind; published: number[] }> {
    const channel = this.rabbit.getChannel();

    await channel.assertExchange(LAB08_EXCHANGE, 'direct', { durable: true });

    const kind = body.kind ?? 'ok';
    const count = body.count ?? 1;
    const published: number[] = [];

    for (let i = 0; i < count; i++) {
      const order: OrderMessage = { orderId: ++this.orderSeq, kind };

      channel.publish(
        LAB08_EXCHANGE,
        LAB08_ROUTING_KEY,
        Buffer.from(JSON.stringify(order)),
        {
          persistent: true,
          // Per-message TTL. Unread after this many ms → dead-lettered as 'expired'.
          expiration:
            body.expiresInMs !== undefined
              ? String(body.expiresInMs)
              : undefined,
        },
      );

      published.push(order.orderId);
    }

    return { kind, published };
  }

  /**
   * Look inside the DLQ without removing anything.
   * Uses its OWN channel: if the DLQ does not exist, the broker closes
   * the channel (404), and it must not be the shared publishing channel.
   */
  @Get('dlq')
  async peek(): Promise<{ count: number; messages: DeadLetterView[] }> {
    const channel = await this.rabbit.createChannel();

    try {
      const held: GetMessage[] = [];

      while (held.length < LAB08_PEEK_LIMIT) {
        const msg = await channel.get(LAB08_DLQ, { noAck: false });
        if (msg === false) break; // queue is empty
        held.push(msg);
      }

      const messages = held.map((msg) => this.describe(msg));

      // Put every message back, untouched.
      for (const msg of held) channel.nack(msg, false, true);

      return { count: messages.length, messages };
    } finally {
      await channel.close();
    }
  }

  /**
   * Move every message that is in the DLQ RIGHT NOW back to the work exchange.
   */
  @Post('dlq/replay')
  async replay(): Promise<{ replayed: number }> {
    const channel = await this.rabbit.createChannel();

    try {
      // Snapshot the size first. A poison message replayed now dies again
      // and lands back in the DLQ while we are still looping. "Until empty"
      // would never end.
      const { messageCount } = await channel.checkQueue(LAB08_DLQ);
      let replayed = 0;

      while (replayed < messageCount) {
        const msg = await channel.get(LAB08_DLQ, { noAck: false });
        if (msg === false) break;

        this.republish(channel, msg);

        // Only AFTER the copy is published. Crash in between → a duplicate,
        // never a loss. (Proving the broker has the copy → Lab 11.)
        channel.ack(msg);
        replayed++;
      }

      return { replayed };
    } finally {
      await channel.close();
    }
  }

  private republish(channel: Channel, msg: GetMessage): void {
    const deaths = msg.properties.headers?.['x-death'] ?? [];

    // x-death remembers the ORIGINAL exchange and routing key.
    const exchange = deaths[0]?.exchange ?? LAB08_EXCHANGE;
    const routingKey = deaths[0]?.['routing-keys'][0] ?? LAB08_ROUTING_KEY;

    channel.publish(exchange, routingKey, msg.content, {
      persistent: true,
      headers: msg.properties.headers, // keep x-death → the count keeps growing
    });
  }

  private describe(msg: GetMessage): DeadLetterView {
    const headers = msg.properties.headers ?? {};
    const deaths = headers['x-death'] ?? [];

    return {
      body: JSON.parse(msg.content.toString()) as unknown,
      firstDeathReason: headers['x-first-death-reason'],
      firstDeathQueue: headers['x-first-death-queue'],
      deaths: deaths.map(
        (d) =>
          `${d.reason} from ${d.queue} ×${d.count} (key: ${d['routing-keys'].join(',')})`,
      ),
    };
  }
}
