import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { RbacService } from '../rbac/rbac.service';
import { EntityRegistryService } from './entity-registry.service';

type CrudOperation = 'create' | 'read' | 'update' | 'delete';

const OPERATION_BY_METHOD: Record<string, CrudOperation> = {
  GET: 'read',
  POST: 'create',
  PATCH: 'update',
  PUT: 'update',
  DELETE: 'delete',
};

/**
 * Enforces each registered entity's own `CrudEntityConfig.permissions` on the
 * generic `/admin/entities/:entityKey/**` routes. The required key is resolved
 * per request (entity key + HTTP method), so a static `@RequirePermission`
 * cannot express it — hence a dedicated guard rather than `PermissionGuard`.
 *
 * Routes without an `:entityKey` param (the registry listing) stay open; an
 * unknown entity key falls through so the controller answers 404, not 403.
 */
@Injectable()
export class CrudPermissionGuard implements CanActivate {
  private readonly logger = new Logger(CrudPermissionGuard.name);

  constructor(
    private readonly registry: EntityRegistryService,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const entityKey: string | undefined = request.params?.entityKey;
    if (!entityKey) return true;

    const config = this.registry.getEntityConfig(entityKey);
    if (!config) return true;

    const operation = OPERATION_BY_METHOD[request.method];
    const requiredPermission = operation && config.permissions?.[operation];
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
        `Permission denied: user=${user.userId} entity=${entityKey} permission=${requiredPermission}`,
      );
      throw new ForbiddenException(
        `Missing required permission: ${requiredPermission}`,
      );
    }

    return true;
  }
}
