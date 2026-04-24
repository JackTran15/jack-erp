import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { Observable, of, tap } from 'rxjs';
import { Request, Response } from 'express';
import { IdempotencyStatus } from '@erp/shared-interfaces';
import { IdempotencyStore } from '../../modules/redis/idempotency.store';
import { createHash } from 'crypto';

const SKIP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly idempotencyStore: IdempotencyStore) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    if (SKIP_METHODS.has(request.method)) {
      return next.handle();
    }

    const idempotencyKey = request.headers['x-idempotency-key'] as
      | string
      | undefined;

    if (!idempotencyKey) {
      return next.handle();
    }

    const actorId = (request as any).user?.userId ?? 'anonymous';
    const endpoint = `${request.method}:${request.route?.path ?? request.url}`;
    const fingerprint = this.computeFingerprint(request);

    const existing = await this.idempotencyStore.lookup(
      idempotencyKey,
      actorId,
      endpoint,
      fingerprint,
    );

    if (existing) {
      if (existing.status === IdempotencyStatus.CONFLICT) {
        this.logger.warn(
          `Idempotency conflict: ${idempotencyKey} for ${endpoint}`,
        );
        response.setHeader(
          'X-Idempotency-Status',
          IdempotencyStatus.CONFLICT,
        );
        throw new ConflictException({
          code: 'IDEMPOTENCY_CONFLICT',
          message:
            'Idempotency key already used with a different request body',
        });
      }

      this.logger.debug(
        `Idempotency replay: ${idempotencyKey} for ${endpoint}`,
      );
      response.setHeader(
        'X-Idempotency-Status',
        IdempotencyStatus.REPLAYED,
      );
      return of(existing.response);
    }

    return next.handle().pipe(
      tap(async (responseBody) => {
        try {
          await this.idempotencyStore.store(
            idempotencyKey,
            actorId,
            endpoint,
            fingerprint,
            responseBody,
          );
          response.setHeader(
            'X-Idempotency-Status',
            IdempotencyStatus.CREATED,
          );
        } catch (err) {
          this.logger.error(
            `Failed to store idempotency record: ${idempotencyKey}`,
            (err as Error).message,
          );
        }
      }),
    );
  }

  private computeFingerprint(request: Request): string {
    const data = JSON.stringify(request.body ?? {});
    return createHash('sha256').update(data).digest('hex');
  }
}
