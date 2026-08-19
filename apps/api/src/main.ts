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
  const configService = app.get(ConfigService);

  // Production sits behind a reverse proxy/load balancer, so the raw socket
  // address is the proxy's, not the caller's. `trust proxy` makes Express
  // derive `req.ip` from X-Forwarded-For instead — required for the API-key
  // guard's IP whitelist check to see the real client (see ADR-03,
  // .ai/features/api-key-auth/03-logical-design.md). Hop count is
  // env-configurable since it depends on the real deploy topology.
  //
  // Number(...) is load-bearing, not defensive style: ConfigService.get()
  // returns whatever dotenv loaded — a STRING — whenever the key comes from
  // an env file (including .env.example's last-resort default), and
  // Express's `trust proxy` treats a string completely differently from a
  // number (it tries to parse it as a trusted-IP list, not a hop count).
  // `app.set('trust proxy', '1')` silently does NOT trust X-Forwarded-For at
  // all — verified live: it broke every IP-whitelist check until this cast
  // was added.
  app.set(
    'trust proxy',
    Number(configService.get<string | number>('TRUST_PROXY_HOPS', 1)),
  );

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
      .addApiKey(
        { type: 'apiKey', name: 'X-Api-Key', in: 'header' },
        'api-key',
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
