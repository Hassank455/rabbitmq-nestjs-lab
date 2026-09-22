import { Body, Controller, Post } from '@nestjs/common';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import {
  InvoiceMessage,
  LAB06_DURABLE,
  LAB06_EXCHANGE,
  LAB06_PERSISTENT,
  LAB06_ROUTING_KEY,
} from './lab06.constants';

@Controller('lab06')
export class Lab06Controller {
  private invoiceSeq = 0;

  constructor(private readonly rabbit: RabbitMQService) {}

  @Post('invoices')
  async create(@Body() body: { count?: number }): Promise<{
    exchange: string;
    durable: boolean;
    persistent: boolean;
    published: number[];
  }> {
    // Broker down → getChannel() throws 503 instead of a confusing 500.
    const channel = this.rabbit.getChannel();

    // durable: true → the EXCHANGE definition survives a broker restart.
    await channel.assertExchange(LAB06_EXCHANGE, 'direct', {
      durable: LAB06_DURABLE,
    });

    const count = body.count ?? 1;
    const published: number[] = [];

    for (let i = 0; i < count; i++) {
      const invoice: InvoiceMessage = {
        invoiceId: ++this.invoiceSeq,
        amount: 250,
        persistent: LAB06_PERSISTENT,
        createdAt: new Date().toISOString(),
      };

      // persistent: true → deliveryMode 2 → the broker writes the message
      // to disk, but ONLY if it lands in a DURABLE queue.
      channel.publish(
        LAB06_EXCHANGE,
        LAB06_ROUTING_KEY,
        Buffer.from(JSON.stringify(invoice)),
        { persistent: LAB06_PERSISTENT },
      );

      published.push(invoice.invoiceId);
    }

    return {
      exchange: LAB06_EXCHANGE,
      durable: LAB06_DURABLE,
      persistent: LAB06_PERSISTENT,
      published,
    };
  }
}
