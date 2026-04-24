import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { RequestIdInterceptor } from './interceptors/request-id.interceptor';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { AuthGuard } from './guards/auth.guard';

@Global()
@Module({
  providers: [
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
  exports: [],
})
export class CommonModule {}
