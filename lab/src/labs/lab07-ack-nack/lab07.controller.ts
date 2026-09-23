import { Body, Controller, Post } from '@nestjs/common';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import {
  LAB07_EXCHANGE,
  LAB07_ROUTING_KEY,
  PaymentKind,
  PaymentMessage,
} from './lab07.constants';

@Controller('lab07')
export class Lab07Controller {
  private paymentSeq = 0;

  constructor(private readonly rabbit: RabbitMQService) {}

  @Post('pay')
  async pay(
    @Body() body: { kind?: PaymentKind; count?: number },
  ): Promise<{ published: number[]; kind: PaymentKind }> {
    const channel = this.rabbit.getChannel();

    await channel.assertExchange(LAB07_EXCHANGE, 'direct', { durable: true });

    const kind = body.kind ?? 'ok';
    const count = body.count ?? 1;
    const published: number[] = [];

    for (let i = 0; i < count; i++) {
      const payment: PaymentMessage = {
        paymentId: ++this.paymentSeq,
        kind,
        amount: 99,
      };

      channel.publish(
        LAB07_EXCHANGE,
        LAB07_ROUTING_KEY,
        Buffer.from(JSON.stringify(payment)),
        { persistent: true },
      );

      published.push(payment.paymentId);
    }

    return { kind, published };
  }
}
