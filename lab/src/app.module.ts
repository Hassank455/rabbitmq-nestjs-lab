import { Module } from '@nestjs/common';
import { Lab01Module } from './labs/lab01-hello-queue/lab01.module';
import { Lab02Module } from './labs/lab02-work-queue/lab02.module';
import { Lab03Module } from './labs/lab03-fanout/lab03.module';
import { Lab04Module } from './labs/lab04-direct/lab04.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';

@Module({
  imports: [RabbitMQModule, Lab01Module, Lab02Module, Lab03Module, Lab04Module],
})
export class AppModule {}
