import { Body, Controller, Post } from '@nestjs/common';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import { LAB01_QUEUE, NotificationMessage } from './lab01.constants';

@Controller('lab01')
export class Lab01Controller {
  constructor(private readonly rabbit: RabbitMQService) {}

  @Post('publish')
  async publish(
    @Body() body: Partial<NotificationMessage>,
  ): Promise<{ published: boolean; payload: NotificationMessage }> {
    const channel = this.rabbit.getChannel();

    // assertQueue(q, opts) is idempotent. If the queue already exists, it does nothing, if it doesn't exist, it creates it. Whoever runs first creates the queue.
    await channel.assertQueue(LAB01_QUEUE, { durable: false });

    const payload: NotificationMessage = {
      userId: body.userId ?? 10,
      message: body.message ?? 'Welcome to the platform',
    };

    // sendToQueue(q, buf) is literally publish('', q, buf)
    // '' is the DEFAULT EXCHANGE, auto-bound to every queue by its name.
    // AMQP bodies are raw bytes, so we must send a Buffer.
    const published = channel.sendToQueue(
      LAB01_QUEUE,
      Buffer.from(JSON.stringify(payload)),
    );

    return { published, payload };
  }
}
