import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './app.config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'; // Import Swagger
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );
  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Broken Record Store API')
    .setDescription('The broken record store management API')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(AppConfig.port);
}
bootstrap();
