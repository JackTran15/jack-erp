import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { parseHeaderBranchId } from '../utils/branch-request.util';

export interface ActorContext {
  userId: string;
  organizationId: string;
  branchId?: string;
  /** Every branch the user is assigned to (JWT `branchIds`); empty = no branch access. */
  branchIds?: string[];
  roles: string[];
  permissions?: string[];
  search?: string;
}

export const Actor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActorContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = (request as any).user;
    const allowed: string[] = Array.isArray(user?.branchIds)
      ? user.branchIds
      : [];
    const headerBranch = parseHeaderBranchId(request);
    const fromHeader =
      headerBranch && allowed.includes(headerBranch) ? headerBranch : undefined;
    const fromJwt = user?.branchId as string | undefined;
    const fromJwtList = allowed[0] ?? undefined;

    return {
      userId: user?.userId ?? 'system',
      organizationId: user?.organizationId ?? 'default',
      // always: header (current branch switch) > jwt > jwtList
      branchId: fromHeader ?? fromJwt ?? fromJwtList,
      branchIds: allowed,
      roles: user?.roles ?? [],
    };
  },
);
