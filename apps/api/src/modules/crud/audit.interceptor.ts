import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('CrudAudit');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const { method, url, params, body } = request;

    const isWrite = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);
    if (!isWrite) return next.handle();

    const entityKey = params.entityKey;
    const entityId = params.id;
    const actor = (request as any).user ?? {};
    const operation = this.resolveOperation(method);
    const snapshotBefore = body?._version;

    return next.handle().pipe(
      tap({
        next: (result) => {
          this.logger.log(
            JSON.stringify({
              event: 'crud_audit',
              operation,
              entityKey,
              entityId: entityId ?? result?.id,
              actorId: actor.userId ?? 'unknown',
              organizationId: actor.organizationId ?? 'unknown',
              branchId: actor.branchId,
              url,
              payloadKeys: body ? Object.keys(body) : [],
              versionBefore: snapshotBefore,
              timestamp: new Date().toISOString(),
            }),
          );
        },
        error: (error) => {
          this.logger.warn(
            JSON.stringify({
              event: 'crud_audit_error',
              operation,
              entityKey,
              entityId,
              actorId: actor.userId ?? 'unknown',
              error: error.message,
              timestamp: new Date().toISOString(),
            }),
          );
        },
      }),
    );
  }

  private resolveOperation(method: string): string {
    switch (method) {
      case 'POST':
        return 'create';
      case 'PATCH':
      case 'PUT':
        return 'update';
      case 'DELETE':
        return 'delete';
      default:
        return method.toLowerCase();
    }
  }
}
