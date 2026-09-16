import { Module } from '@nestjs/common';
import { RabbitMQModule } from '../../rabbitmq/rabbitmq.module';
import { Lab04Consumer } from './lab04.consumer';
import { Lab04Controller } from './lab04.controller';

@Module({
  imports: [RabbitMQModule],
  controllers: [Lab04Controller],
  providers: [Lab04Consumer],
})
export class Lab04Module {}
