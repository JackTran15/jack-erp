import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const { method, url } = request;
    const requestId = request.headers['x-request-id'] as string;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          this.logger.log(
            `[${requestId}] ${method} ${url} -> ${response.statusCode} (${duration}ms)`,
          );
        },
        error: (error) => {
          const duration = Date.now() - start;
          this.logger.error(
            `[${requestId}] ${method} ${url} -> ERROR (${duration}ms): ${error.message}`,
          );
        },
      }),
    );
  }
}
