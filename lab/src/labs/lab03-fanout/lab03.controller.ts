import { Body, Controller, Post } from '@nestjs/common';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import { LAB03_EXCHANGE, OrderCreatedEvent } from './lab03.constants';

@Controller('lab03')
export class Lab03Controller {
  private orderSeq = 0;

  constructor(private readonly rabbit: RabbitMQService) {}

  @Post('orders')
  async createOrders(
    @Body() body: { count?: number },
  ): Promise<{ published: number[] }> {
    const channel = this.rabbit.getChannel();

    // The publisher knows ONLY the exchange.
    // No queue names, no service names. That is the whole point.
    // assertExchange means "create exchange if it doesn't exist yet". Idempotent.
    await channel.assertExchange(LAB03_EXCHANGE, 'fanout', { durable: false });

    const count = body.count ?? 1;
    const published: number[] = [];

    for (let i = 0; i < count; i++) {
      const event: OrderCreatedEvent = {
        orderId: ++this.orderSeq,
        customerId: 82,
        total: 120,
        createdAt: new Date().toISOString(),
      };

      // publish(exchange, routingKey, content)
      // A fanout exchange IGNORES the routing key. '' makes that explicit.
      channel.publish(LAB03_EXCHANGE, '', Buffer.from(JSON.stringify(event)));

      published.push(event.orderId);
    }

    return { published };
  }
}
