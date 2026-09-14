import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import { LAB02_QUEUE, TaskMessage } from './lab02.constants';

@Injectable()
export class Lab02Consumer implements OnModuleInit {
  private readonly logger = new Logger(Lab02Consumer.name);

  private channel!: amqp.Channel;

  private workerName = 'worker';
  private defaultDelay = 1000;

  /** How many handlers are running RIGHT NOW. Makes concurrency visible. */
  private inFlight = 0;

  /** How many tasks this worker finished. Makes distribution visible. */
  private processed = 0;

  constructor(private readonly rabbit: RabbitMQService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.CONSUMERS !== 'on') {
      this.logger.warn('Lab02 consumer is OFF');
      return;
    }

    this.workerName = process.env.WORKER_NAME ?? 'worker';
    this.defaultDelay = Number(process.env.WORKER_DELAY ?? 1000);

    // 0 means UNLIMITED in AMQP: the broker pushes as fast as it can.
    const prefetch = Number(process.env.PREFETCH ?? 0);

    // Its OWN channel — prefetch is per-channel, not per-connection.
    this.channel = await this.rabbit.createChannel();

    await this.channel.assertQueue(LAB02_QUEUE, { durable: false });

    // ⭐ THE LINE.
    // "Never send me more than N messages that I have not acked yet."
    await this.channel.prefetch(prefetch);

    this.logger.log(
      `[${this.workerName}] ready | delay=${this.defaultDelay}ms | ` +
        `prefetch=${prefetch === 0 ? 'UNLIMITED' : prefetch}`,
    );

    await this.channel.consume(
      LAB02_QUEUE,
      (msg) => {
        if (msg === null) return;

        // `void` is deliberate and honest: amqplib does NOT await this
        // callback. It fires it and immediately moves to the next message.
        // That is precisely why prefetch is our concurrency limit.
        void this.handleTask(msg);
      },
      { noAck: false },
    );
  }

  private async handleTask(msg: amqp.ConsumeMessage): Promise<void> {
    const task = JSON.parse(msg.content.toString()) as TaskMessage;
    const delay = task.durationMs ?? this.defaultDelay;

    this.inFlight++;

    const redelivered = msg.fields.redelivered ? ' 🔁 REDELIVERED' : '';

    this.logger.log(
      `[${this.workerName}] ▶ START task ${task.taskId} ` +
        `| in-flight: ${this.inFlight}${redelivered}`,
    );

    // Pretend to do real work (DB write, HTTP call, PDF render...)
    await this.sleep(delay);

    this.inFlight--;
    this.processed++;

    this.logger.log(
      `[${this.workerName}] ✔ DONE  task ${task.taskId} ` +
        `| ${delay}ms | total processed: ${this.processed}`,
    );

    // ACK LAST. Always after the work succeeded, never before.
    this.channel.ack(msg);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
