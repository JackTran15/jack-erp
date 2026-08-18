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

  /**
   * True when the user holds *any* of `permissionKeys` (OR).
   *
   * Resolves the permission set once rather than calling `hasPermission` per
   * key, so widening an endpoint to accept several keys does not multiply
   * lookups. An empty list denies — "required nothing" is expressed by not
   * applying the decorator at all, never by an empty array.
   */
  async hasAnyPermission(
    userId: string,
    orgId: string,
    permissionKeys: string[],
  ): Promise<boolean> {
    if (permissionKeys.length === 0) return false;
    const permissions = await this.getUserPermissions(userId, orgId);
    return permissionKeys.some((key) => permissions.includes(key));
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

  /**
   * Permission keys granted by each role, keyed by roleId. Uncached — this is
   * only used on write paths (granting roles), not on every request.
   */
  async getRolePermissionKeys(
    roleIds: string[],
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>(roleIds.map((id) => [id, []]));
    if (roleIds.length === 0) return result;

    const rolePermissions = await this.rolePermissionRepo
      .createQueryBuilder('rp')
      .where('rp.role_id IN (:...roleIds)', { roleIds })
      .getMany();

    if (rolePermissions.length === 0) return result;

    const permissions = await this.permissionRepo
      .createQueryBuilder('p')
      .where('p.id IN (:...permissionIds)', {
        permissionIds: [
          ...new Set(rolePermissions.map((rp) => rp.permissionId)),
        ],
      })
      .getMany();

    const keyById = new Map(permissions.map((p) => [p.id, p.key]));
    for (const rp of rolePermissions) {
      const key = keyById.get(rp.permissionId);
      if (key) result.get(rp.roleId)?.push(key);
    }
    return result;
  }

  /**
   * Of `roleIds`, the ones the actor may grant: a role is grantable only when
   * every permission key it carries is one the actor already holds.
   *
   * This is the single definition of "a role above me" — used both to reject a
   * grant (users.service) and to hide the role in the UI (roles.service), so
   * the two can never disagree. Deliberately keyed off permission sets rather
   * than role identity: roles here have no `code`, only an editable name.
   */
  async getGrantableRoleIds(
    userId: string,
    orgId: string,
    roleIds: string[],
  ): Promise<Set<string>> {
    if (roleIds.length === 0) return new Set();

    const [actorKeys, keysByRole] = await Promise.all([
      this.getUserPermissions(userId, orgId),
      this.getRolePermissionKeys(roleIds),
    ]);
    const actorSet = new Set(actorKeys);

    const grantable = new Set<string>();
    for (const roleId of roleIds) {
      const roleKeys = keysByRole.get(roleId) ?? [];
      if (roleKeys.every((key) => actorSet.has(key))) grantable.add(roleId);
    }
    return grantable;
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
