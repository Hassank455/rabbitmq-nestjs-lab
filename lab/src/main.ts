import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Without this, Ctrl+C kills the process and onModuleDestroy never runs,
  // so the AMQP connection is never closed cleanly.
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  console.log(`HTTP ready on http://localhost:${port}`);
}

void bootstrap();
