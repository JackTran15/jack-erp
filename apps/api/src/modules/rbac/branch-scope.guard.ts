import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { resolveExplicitBranchId } from '../../common/utils/branch-request.util';
import { REQUIRE_BRANCH_SCOPE_KEY } from '../auth/decorators';

@Injectable()
export class BranchScopeGuard implements CanActivate {
  private readonly logger = new Logger(BranchScopeGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requireBranchScope = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_BRANCH_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requireBranchScope) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as
      | {
          userId?: string;
          organizationId?: string;
          branchIds?: string[];
        }
      | undefined;

    if (!user?.userId || !user?.organizationId) {
      throw new ForbiddenException('Authentication context missing');
    }

    const branchId = resolveExplicitBranchId(request);

    if (!branchId) {
      throw new ForbiddenException('branchId is required for this operation');
    }

    const allowedBranches: string[] = user.branchIds ?? [];

    if (allowedBranches.length === 0) {
      this.logger.warn(
        `Branch scope denied: user=${user.userId} has no branch assignments`,
      );
      throw new ForbiddenException('No branch access assigned');
    }

    if (!allowedBranches.includes(branchId)) {
      this.logger.warn(
        `Branch scope denied: user=${user.userId} branch=${branchId}`,
      );
      throw new ForbiddenException(
        `Access denied for branch: ${branchId}`,
      );
    }

    return true;
  }
}
