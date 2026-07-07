import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

/**
 * Records an HTTP duration histogram + request counter for every request.
 * The route label uses the matched route pattern (e.g. /pos/invoices/:id) via
 * request.route?.path — never the raw URL — to keep label cardinality bounded.
 * Unmatched paths (404s) fall back to the constant "unmatched".
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const method = request.method;
    const start = Date.now();

    const record = (statusCode: number): void => {
      const route = request.route?.path ?? 'unmatched';
      this.metrics.observeHttp(
        method,
        route,
        statusCode,
        (Date.now() - start) / 1000,
      );
    };

    return next.handle().pipe(
      tap({
        next: () => record(response.statusCode),
        error: (err: { status?: number }) => record(err?.status ?? 500),
      }),
    );
  }
}
