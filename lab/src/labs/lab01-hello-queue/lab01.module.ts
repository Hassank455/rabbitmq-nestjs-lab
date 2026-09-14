import { Module } from '@nestjs/common';
import { RabbitMQModule } from '../../rabbitmq/rabbitmq.module';
import { Lab01Controller } from './lab01.controller';
import { Lab01Consumer } from './lab01.consumer';

@Module({
  imports: [RabbitMQModule],
  controllers: [Lab01Controller],
  providers: [Lab01Consumer],
})
export class Lab01Module {}
