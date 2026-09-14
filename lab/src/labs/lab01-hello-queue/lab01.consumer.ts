import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumeMessage } from 'amqplib';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import { LAB01_QUEUE, NotificationMessage } from './lab01.constants';

@Injectable()
export class Lab01Consumer implements OnModuleInit {
  private readonly logger = new Logger(Lab01Consumer.name);

  constructor(private readonly rabbit: RabbitMQService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.CONSUMERS !== 'on') {
      this.logger.warn('Consumers are OFF (start with CONSUMERS=on to enable)');
      return;
    }

    const channel = this.rabbit.getChannel();

    // Same assert as the producer. Whoever runs first creates the queue.
    await channel.assertQueue(LAB01_QUEUE, { durable: false });

    this.logger.log(`Waiting for messages in "${LAB01_QUEUE}"`);

    // channel.consume doing two things:
    // 1. Subscribe to the queue
    // 2. Process messages
    await channel.consume(
      LAB01_QUEUE,
      (msg: ConsumeMessage | null) => {
        // null means the broker cancelled this consumer
        if (msg === null) return;

        const content = JSON.parse(
          msg.content.toString(),
        ) as NotificationMessage;

        this.logger.log(`Notification sent to user ${content.userId}`);
        // we can do some more processing here, like sending an email or push notification
        // await emailService.sendEmail(...);
        // await smsService.sendSms(...);

        // "I am done with it, you may delete it."
        channel.ack(msg);
      },
      // { noAck = false } means "I will acknowledge the message when I am done with it"
      // the message is not automatically considered successful Wait for an acknowledgment from me to delete it from the queue. If I crash before acknowledging, the message will be re-delivered to another consumer.
      { noAck: false },
    );
  }
}
