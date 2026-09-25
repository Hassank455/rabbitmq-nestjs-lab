import { Module } from '@nestjs/common';
import { RabbitMQModule } from '../../rabbitmq/rabbitmq.module';
import { Lab08Consumer } from './lab08.consumer';
import { Lab08Controller } from './lab08.controller';

@Module({
  imports: [RabbitMQModule],
  controllers: [Lab08Controller],
  providers: [Lab08Consumer],
})
export class Lab08Module {}
