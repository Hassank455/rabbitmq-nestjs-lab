import { Module } from '@nestjs/common';
import { Lab01Module } from './labs/lab01-hello-queue/lab01.module';
import { Lab02Module } from './labs/lab02-work-queue/lab02.module';
import { Lab03Module } from './labs/lab03-fanout/lab03.module';
import { Lab04Module } from './labs/lab04-direct/lab04.module';
import { Lab05Module } from './labs/lab05-topic/lab05.module';
import { Lab06Module } from './labs/lab06-durability/lab06.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';

@Module({
  imports: [
    RabbitMQModule,
    Lab01Module,
    Lab02Module,
    Lab03Module,
    Lab04Module,
    Lab05Module,
    Lab06Module,
  ],
})
export class AppModule {}
