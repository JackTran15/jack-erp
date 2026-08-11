import { NestFactory } from '@nestjs/core';
import {
  ValidationPipe,
  Logger,
  VERSION_NEUTRAL,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './modules/websocket/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  // Default body-parser limit is 100kb, which bulk goods-receipt/goods-issue
  // payloads (many line items) can exceed → PayloadTooLargeError.
  app.useBodyParser('json', { limit: '5mb' });
  app.useBodyParser('urlencoded', { limit: '5mb', extended: true });

  // Silently short-circuit favicon probes so they don't trip the global
  // HttpExceptionFilter (and drop a 404 stack into the logs on every page load).
  app.use('/favicon.ico', (_req: any, res: any) => res.status(204).end());

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: VERSION_NEUTRAL,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Reflect the request Origin instead of using '*' so credentialed requests
  // (cookies, Authorization) still work — browsers reject Access-Control-Allow-
  // Origin: '*' when credentials are involved. `origin: true` echoes whatever
  // Origin the client sent, which is effectively "allow every domain".
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    // Content-Disposition is not a CORS-safelisted response header, so without
    // it here the browser hides the filename the export routes set and every
    // download lands under whatever name the client guessed. It carries only a
    // slug, nothing worth withholding.
    exposedHeaders: ['X-Request-Id', 'X-Total-Count', 'Content-Disposition'],
  });

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
