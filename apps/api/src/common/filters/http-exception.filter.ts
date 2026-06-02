import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import type { ApiError } from '@erp/shared-interfaces';

type ExceptionResponseBody = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  error?: unknown;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request.headers['x-request-id'] as string) ?? 'unknown';

    let status: number;
    let body: ApiError;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const responseBody =
        typeof exceptionResponse === 'object' && exceptionResponse !== null
          ? (exceptionResponse as ExceptionResponseBody)
          : {};
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : Array.isArray(responseBody.message)
            ? responseBody.message.map(String).join(', ')
            : typeof responseBody.message === 'string'
              ? responseBody.message
              : exception.message;

      body = {
        code:
          typeof responseBody.code === 'string'
            ? responseBody.code
            : `HTTP_${status}`,
        message,
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.originalUrl ?? request.url,
        requestId,
        details:
          responseBody.details ??
          (typeof exceptionResponse === 'object' ? exceptionResponse : undefined),
      };
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      body = {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.originalUrl ?? request.url,
        requestId,
      };
    }

    const logLine = `[${requestId}] ${request.method} ${request.url} -> ${status}`;

    if (status >= 500) {
      // Server-side bugs: keep the stack trace.
      this.logger.error(
        logLine,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (status === HttpStatus.NOT_FOUND) {
      // 404s are expected churn (favicon probes, scanners, stale links).
      // `verbose` is hidden at the default Nest log level, so set
      // `LOG_LEVELS=verbose` to see them when triaging routing issues.
      this.logger.verbose(logLine);
    } else {
      // Other 4xx (validation, auth, conflict, …): one-line warn, no stack.
      this.logger.warn(logLine);
    }

    response.status(status).json(body);
  }
}
