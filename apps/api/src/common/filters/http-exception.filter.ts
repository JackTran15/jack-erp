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

      body = {
        code: `HTTP_${status}`,
        message:
          typeof exceptionResponse === 'string'
            ? exceptionResponse
            : (exceptionResponse as any).message ?? exception.message,
        details: {
          requestId,
          ...(typeof exceptionResponse === 'object' ? exceptionResponse : {}),
        },
      };
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      body = {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: { requestId },
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
