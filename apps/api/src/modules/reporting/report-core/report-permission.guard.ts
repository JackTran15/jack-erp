import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { REPORT_PERMISSION_KEYS } from '@erp/shared-interfaces';
import { RbacService } from '../../rbac/rbac.service';

/**
 * Enforces one permission per report on the registry-driven report endpoints.
 *
 * Every report of a domain shares the same routes — `POST /reports/inventory/search`
 * with `reportType` in the body, `GET columns?reportType=` — so a static
 * `@RequirePermission` can only express "may open this group of reports". The key
 * that decides *which* report has to be resolved per request, which is the same
 * shape `CrudPermissionGuard` solves for `/admin/entities/:entityKey/**`.
 *
 * This runs alongside `PermissionGuard`, not instead of it: the route decorator
 * still enforces the group-level key (`REPORT_DOMAIN_PERMISSIONS[domain].floor`),
 * and this narrows it to the requested report.
 *
 * A request with no `reportType`, or one naming a report that is not in the
 * catalogue, falls through so the controller answers 400/404 — a caller asking for
 * a report that does not exist should not be told it is forbidden.
 */
@Injectable()
export class ReportPermissionGuard implements CanActivate {
  private readonly logger = new Logger(ReportPermissionGuard.name);

  constructor(private readonly rbacService: RbacService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const reportType: unknown =
      request.body?.reportType ?? request.query?.reportType;
    if (typeof reportType !== 'string' || !reportType) return true;

    const requiredPermission = REPORT_PERMISSION_KEYS[reportType];
    if (!requiredPermission) return true;

    const user = request.user;
    if (!user?.userId || !user?.organizationId) {
      throw new ForbiddenException('Authentication context missing');
    }

    const allowed = await this.rbacService.hasPermission(
      user.userId,
      user.organizationId,
      requiredPermission,
    );

    if (!allowed) {
      this.logger.warn(
        `Permission denied: user=${user.userId} report=${reportType} permission=${requiredPermission}`,
      );
      throw new ForbiddenException(
        `Missing required permission: ${requiredPermission}`,
      );
    }

    return true;
  }
}
