import { Module } from '@nestjs/common';
import { RabbitMQModule } from '../../rabbitmq/rabbitmq.module';
import { Lab07Consumer } from './lab07.consumer';
import { Lab07Controller } from './lab07.controller';

@Module({
  imports: [RabbitMQModule],
  controllers: [Lab07Controller],
  providers: [Lab07Consumer],
})
export class Lab07Module {}
