import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface ActorContext {
  userId: string;
  organizationId: string;
  branchId?: string;
  roles: string[];
  permissions?: string[];
}

export const Actor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActorContext => {
    const request = ctx.switchToHttp().getRequest<Request>();

    // TKT-006: Extract from validated JWT token
    return {
      userId: (request as any).user?.userId ?? 'system',
      organizationId: (request as any).user?.organizationId ?? 'default',
      branchId: (request as any).user?.branchId,
      roles: (request as any).user?.roles ?? [],
    };
  },
);
