import { Body, Controller, Post } from '@nestjs/common';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import { LAB02_QUEUE, TaskMessage } from './lab02.constants';

@Controller('lab02')
export class Lab02Controller {
  constructor(private readonly rabbit: RabbitMQService) {}

  @Post('publish')
  async publish(
    @Body() body: { count?: number; durationMs?: number },
  ): Promise<{ published: number }> {
    // Publishing uses the SHARED channel — no prefetch involved.
    const channel = this.rabbit.getChannel();

    await channel.assertQueue(LAB02_QUEUE, { durable: false });

    const count = body.count ?? 10;

    for (let taskId = 1; taskId <= count; taskId++) {
      const task: TaskMessage = { taskId, durationMs: body.durationMs };

      channel.sendToQueue(LAB02_QUEUE, Buffer.from(JSON.stringify(task)));
    }

    return { published: count };
  }
}
