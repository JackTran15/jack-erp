import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { parseHeaderBranchId } from '../utils/branch-request.util';

export interface ActorContext {
  userId: string;
  organizationId: string;
  branchId?: string;
  roles: string[];
  permissions?: string[];
  search?: string;
}

export const Actor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActorContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = (request as any).user;
    const fromJwt = user?.branchId as string | undefined;
    const allowed: string[] = Array.isArray(user?.branchIds)
      ? user.branchIds
      : [];
    const headerBranch = parseHeaderBranchId(request);
    const fromHeader =
      headerBranch && allowed.includes(headerBranch) ? headerBranch : undefined;
    const fromJwtList = allowed[0] ?? undefined;

    return {
      userId: user?.userId ?? 'system',
      organizationId: user?.organizationId ?? 'default',
      // Prefer active branch from JWT, then validated X-Branch-Id header, else first assigned branch
      branchId: fromJwt ?? fromHeader ?? fromJwtList,
      roles: user?.roles ?? [],
    };
  },
);
