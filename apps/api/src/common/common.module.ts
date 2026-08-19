import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { RequestIdInterceptor } from './interceptors/request-id.interceptor';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { MetricsInterceptor } from '../modules/metrics/metrics.interceptor';
import { AuthGuard } from './guards/auth.guard';
import { ApiKeyModule } from '../modules/api-key/api-key.module';

@Global()
@Module({
  imports: [ApiKeyModule],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
  exports: [],
})
export class CommonModule {}
