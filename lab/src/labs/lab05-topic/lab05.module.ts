import { Module } from '@nestjs/common';
import { RabbitMQModule } from '../../rabbitmq/rabbitmq.module';
import { Lab05Consumer } from './lab05.consumer';
import { Lab05Controller } from './lab05.controller';

@Module({
  imports: [RabbitMQModule],
  controllers: [Lab05Controller],
  providers: [Lab05Consumer],
})
export class Lab05Module {}
