import { Module } from '@nestjs/common';
import { RabbitMQModule } from '../../rabbitmq/rabbitmq.module';
import { Lab03Controller } from './lab03.controller';
import { Lab03Consumer } from './lab03.consumer';

@Module({
  imports: [RabbitMQModule],
  controllers: [Lab03Controller],
  providers: [Lab03Consumer],
})
export class Lab03Module {}
