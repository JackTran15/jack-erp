import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators';
import { RbacService } from './rbac.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const declared = this.reflector.getAllAndOverride<string | string[]>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!declared) return true;

    // A single key and a list of keys are the same thing to the check below;
    // several keys mean OR. Normalising here (rather than in the decorator)
    // keeps the metadata readable as written when debugging.
    const requiredPermissions = Array.isArray(declared) ? declared : [declared];

    if (requiredPermissions.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.userId || !user?.organizationId) {
      throw new ForbiddenException('Authentication context missing');
    }

    const allowed = await this.rbacService.hasAnyPermission(
      user.userId,
      user.organizationId,
      requiredPermissions,
    );

    if (!allowed) {
      const listed = requiredPermissions.join(' or ');
      this.logger.warn(
        `Permission denied: user=${user.userId} permission=${listed}`,
      );
      throw new ForbiddenException(`Missing required permission: ${listed}`);
    }

    return true;
  }
}
