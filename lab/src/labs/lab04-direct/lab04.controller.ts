import { Body, Controller, Post } from '@nestjs/common';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import { LAB04_EXCHANGE, OrderEvent } from './lab04.constants';
import { Buffer } from 'buffer';

@Controller('lab04')
export class Lab04Controller {
  private orderSeq = 0;

  constructor(private readonly rabbit: RabbitMQService) {}

  @Post('publish')
  async publish(
    @Body() body: { key?: string; count?: number },
  ): Promise<{ routingKey: string; published: number[] }> {
    const channel = this.rabbit.getChannel();

    // Same call as lab03, ONE word different: 'direct' instead of 'fanout'.
    // The type is fixed at creation time and can never be changed.
    await channel.assertExchange(LAB04_EXCHANGE, 'direct', { durable: false });

    // The publisher still knows NO queue and NO service name.
    // The only new thing it knows is a LABEL on the message.
    const routingKey = body.key ?? 'order.paid';
    const count = body.count ?? 1;
    const published: number[] = [];

    for (let i = 0; i < count; i++) {
      const event: OrderEvent = {
        orderId: ++this.orderSeq,
        type: routingKey,
        total: 120,
        createdAt: new Date().toISOString(),
      };

      // publish(exchange, routingKey, content)
      // Lab 03 passed ''. Here the key decides everything.
      channel.publish(
        LAB04_EXCHANGE,
        routingKey,
        Buffer.from(JSON.stringify(event)),
      );

      published.push(event.orderId);
    }

    return { routingKey, published };
  }
}
