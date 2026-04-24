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

    this.logger.error(
      `[${requestId}] ${request.method} ${request.url} -> ${status}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json(body);
  }
}
