import { Module } from '@nestjs/common';
import { RabbitMQModule } from '../../rabbitmq/rabbitmq.module';
import { Lab06Consumer } from './lab06.consumer';
import { Lab06Controller } from './lab06.controller';

@Module({
  imports: [RabbitMQModule],
  controllers: [Lab06Controller],
  providers: [Lab06Consumer],
})
export class Lab06Module {}
