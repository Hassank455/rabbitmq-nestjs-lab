import { Module } from '@nestjs/common';
import { RabbitMQModule } from '../../rabbitmq/rabbitmq.module';
import { Lab02Consumer } from './lab02.consumer';
import { Lab02Controller } from './lab02.controller';

@Module({
  imports: [RabbitMQModule],
  controllers: [Lab02Controller],
  providers: [Lab02Consumer],
})
export class Lab02Module {}
