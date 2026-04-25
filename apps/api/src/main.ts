import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './modules/websocket/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors();

  const configService = app.get(ConfigService);
  const redisIoAdapter = new RedisIoAdapter(app, configService);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  const enableSwagger =
    process.env.DISABLE_SWAGGER !== '1' &&
    process.env.NODE_ENV !== 'production';

  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ERP API')
      .setDescription(
        'OpenAPI 3 document for the ERP API. Regenerate the web SDK: `pnpm openapi:generate` (API must be reachable). Machine-readable spec: GET /docs-json',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          in: 'header',
        },
        'access-token',
      )
      .addApiKey(
        { type: 'apiKey', name: 'X-Branch-Id', in: 'header' },
        'branch-id',
      )
      .addApiKey(
        { type: 'apiKey', name: 'X-Request-Id', in: 'header' },
        'request-id',
      )
      .addApiKey(
        { type: 'apiKey', name: 'X-Idempotency-Key', in: 'header' },
        'idempotency-key',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log('OpenAPI UI at /docs, JSON at /docs-json');
  }

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`ERP API listening on port ${port}`);
}

bootstrap();
