import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../redis/cache.service';
import { UserRoleEntity } from '../auth/user-role.entity';
import { RolePermissionEntity } from '../auth/role-permission.entity';
import { PermissionEntity } from '../auth/permission.entity';

const CACHE_NAMESPACE = 'rbac';
const CACHE_TTL_SECONDS = 300;

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  constructor(
    private readonly cacheService: CacheService,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepo: Repository<RolePermissionEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissionRepo: Repository<PermissionEntity>,
  ) {}

  async getUserPermissions(
    userId: string,
    orgId: string,
  ): Promise<string[]> {
    const cacheKey = `perms:${userId}:${orgId}`;

    return this.cacheService.getOrSet<string[]>(
      CACHE_NAMESPACE,
      cacheKey,
      () => this.resolvePermissions(userId, orgId),
      CACHE_TTL_SECONDS,
    );
  }

  async hasPermission(
    userId: string,
    orgId: string,
    permissionKey: string,
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, orgId);
    return permissions.includes(permissionKey);
  }

  async invalidateUserPermissions(
    userId: string,
    orgId: string,
  ): Promise<void> {
    await this.cacheService.invalidate(
      CACHE_NAMESPACE,
      `perms:${userId}:${orgId}`,
    );
    this.logger.debug(
      `Invalidated permission cache for user=${userId} org=${orgId}`,
    );
  }

  async invalidateOrgPermissions(orgId: string): Promise<void> {
    await this.cacheService.invalidatePattern(CACHE_NAMESPACE, `perms:*:${orgId}`);
    this.logger.debug(`Invalidated all permission caches for org=${orgId}`);
  }

  private async resolvePermissions(
    userId: string,
    orgId: string,
  ): Promise<string[]> {
    const userRoles = await this.userRoleRepo.find({
      where: { userId, organizationId: orgId },
    });

    if (userRoles.length === 0) return [];

    const roleIds = userRoles.map((ur) => ur.roleId);

    const rolePermissions = await this.rolePermissionRepo
      .createQueryBuilder('rp')
      .where('rp.role_id IN (:...roleIds)', { roleIds })
      .getMany();

    if (rolePermissions.length === 0) return [];

    const permissionIds = [
      ...new Set(rolePermissions.map((rp) => rp.permissionId)),
    ];

    const permissions = await this.permissionRepo
      .createQueryBuilder('p')
      .where('p.id IN (:...permissionIds)', { permissionIds })
      .getMany();

    return permissions.map((p) => p.key);
  }
}
