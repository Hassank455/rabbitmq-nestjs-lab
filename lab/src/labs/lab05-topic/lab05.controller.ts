import { Body, Controller, Post } from '@nestjs/common';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import { DomainEvent, LAB05_EXCHANGE } from './lab05.constants';

@Controller('lab05')
export class Lab05Controller {
  private eventSeq = 0;

  constructor(private readonly rabbit: RabbitMQService) {}

  @Post('publish')
  async publish(
    @Body() body: { key?: string; count?: number },
  ): Promise<{ routingKey: string; published: number[] }> {
    const channel = this.rabbit.getChannel();

    // One word different from lab04 again: 'topic'.
    await channel.assertExchange(LAB05_EXCHANGE, 'topic', { durable: false });

    // The publisher publishes a CONCRETE key. It never uses * or #.
    // Wildcards belong to the SUBSCRIBER side only.
    const routingKey = body.key ?? 'order.paid.eu';
    const count = body.count ?? 1;
    const published: number[] = [];

    for (let i = 0; i < count; i++) {
      const event: DomainEvent = {
        eventId: ++this.eventSeq,
        routingKey,
        createdAt: new Date().toISOString(),
      };

      channel.publish(
        LAB05_EXCHANGE,
        routingKey,
        Buffer.from(JSON.stringify(event)),
      );

      published.push(event.eventId);
    }

    return { routingKey, published };
  }
}
