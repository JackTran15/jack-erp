import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { RoleSummary, RoleDetail } from '@erp/shared-interfaces';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { RoleEntity } from '../auth/role.entity';
import { PermissionEntity } from '../auth/permission.entity';
import { RolePermissionEntity } from '../auth/role-permission.entity';
import { UserRoleEntity } from '../auth/user-role.entity';
import { RbacService } from './rbac.service';
import { CacheService } from '../redis/cache.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

/**
 * Mirrors `AuthService`'s private `IDENTITY_CACHE_NAMESPACE` /
 * `BranchService`'s `MY_BRANCHES_CACHE_NAMESPACE` — duplicated here rather
 * than imported because neither service exposes them and this module has no
 * other dependency on either one (see the identical copy in
 * `UsersService`, T-07-03).
 */
const IDENTITY_CACHE_NAMESPACE = 'identity';
const MY_BRANCHES_CACHE_NAMESPACE = 'my-branches';

/**
 * `/admin/users/me`. Same duplication trade as the two namespaces above.
 * Invalidated here rather than left to its 15-minute TTL — ADR-04 of
 * 2026090805-pos-initial-load-latency.
 */
const USERS_ME_CACHE_NAMESPACE = 'users-me';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissionRepo: Repository<PermissionEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepo: Repository<RolePermissionEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
    private readonly rbacService: RbacService,
    private readonly cacheService: CacheService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Same helper as `UsersService.invalidateUserIdentity` — clears the identity
   * report, `/branches/me` and `/admin/users/me` caches for one user. Swallows
   * Redis errors and only logs (T-07-03 / ADR-08).
   */
  private async invalidateUserIdentity(
    userId: string,
    orgId: string,
  ): Promise<void> {
    try {
      await Promise.all([
        this.cacheService.invalidate(
          IDENTITY_CACHE_NAMESPACE,
          `identity:${userId}:${orgId}`,
        ),
        this.cacheService.invalidate(
          MY_BRANCHES_CACHE_NAMESPACE,
          `${userId}:${orgId}`,
        ),
        this.cacheService.invalidate(
          USERS_ME_CACHE_NAMESPACE,
          `${userId}:${orgId}`,
        ),
      ]);
    } catch (err) {
      this.logger.error(
        `Identity cache invalidation failed for user=${userId} org=${orgId} — falling back to the cache TTL`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  async list(actor: ActorContext): Promise<RoleSummary[]> {
    const roles = await this.roleRepo.find({
      where: { organizationId: actor.organizationId },
      order: { createdAt: 'ASC' },
    });
    const grantable = await this.rbacService.getGrantableRoleIds(
      actor.userId,
      actor.organizationId,
      roles.map((r) => r.id),
    );
    return roles.map((r) => this.toView(r, grantable.has(r.id)));
  }

  async findById(id: string, actor: ActorContext): Promise<RoleDetail> {
    const role = await this.roleRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }
    const [permissionKeys, grantable] = await Promise.all([
      this.getPermissionKeys(role.id),
      this.rbacService.getGrantableRoleIds(actor.userId, actor.organizationId, [
        role.id,
      ]),
    ]);
    return { ...this.toView(role, grantable.has(role.id)), permissionKeys };
  }

  async create(
    dto: CreateRoleDto,
    actor: ActorContext,
  ): Promise<RoleDetail> {
    const trimmedName = dto.name.trim();
    const existing = await this.roleRepo.findOne({
      where: { organizationId: actor.organizationId, name: trimmedName },
    });
    if (existing) {
      throw new ConflictException(
        `Role "${trimmedName}" already exists in this organization`,
      );
    }

    const permissionIds = dto.permissionKeys?.length
      ? await this.resolvePermissionIds(dto.permissionKeys)
      : [];

    const created = await this.dataSource.transaction(async (manager) => {
      const role = manager.create(RoleEntity, {
        organizationId: actor.organizationId,
        name: trimmedName,
        description: dto.description?.trim() ?? null,
        isSystem: false,
      });
      const savedRole = await manager.save(RoleEntity, role);

      if (permissionIds.length) {
        const rows = permissionIds.map((permissionId) =>
          manager.create(RolePermissionEntity, {
            roleId: savedRole.id,
            permissionId,
          }),
        );
        await manager.save(RolePermissionEntity, rows);
      }

      return savedRole;
    });

    this.logger.log(
      `Created role ${created.id} "${trimmedName}" (org=${actor.organizationId})`,
    );

    return this.findById(created.id, actor);
  }

  async update(
    id: string,
    dto: UpdateRoleDto,
    actor: ActorContext,
  ): Promise<RoleDetail> {
    const role = await this.roleRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }

    await this.assertCanManageRole(role.id, role.name, actor);

    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      if (role.isSystem && trimmedName !== role.name) {
        throw new BadRequestException('System roles cannot be renamed');
      }
      if (trimmedName !== role.name) {
        const clash = await this.roleRepo.findOne({
          where: { organizationId: actor.organizationId, name: trimmedName },
        });
        if (clash) {
          throw new ConflictException(
            `Role "${trimmedName}" already exists in this organization`,
          );
        }
      }
      role.name = trimmedName;
    }
    if (dto.description !== undefined) {
      role.description = dto.description?.trim() ?? null;
    }

    await this.roleRepo.save(role);
    return this.findById(id, actor);
  }

  async delete(id: string, actor: ActorContext): Promise<void> {
    const role = await this.roleRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted');
    }

    const affectedUsers = await this.userRoleRepo.find({
      where: { roleId: id, organizationId: actor.organizationId },
    });

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(RolePermissionEntity, { roleId: id });
      await manager.delete(UserRoleEntity, {
        roleId: id,
        organizationId: actor.organizationId,
      });
      await manager.delete(RoleEntity, { id });
    });

    await Promise.all(
      affectedUsers.map((ur) =>
        this.rbacService.invalidateUserPermissions(
          ur.userId,
          actor.organizationId,
        ),
      ),
    );
    await Promise.all(
      affectedUsers.map((ur) =>
        this.invalidateUserIdentity(ur.userId, actor.organizationId),
      ),
    );

    this.logger.log(
      `Deleted role ${id} (org=${actor.organizationId}, affected users=${affectedUsers.length})`,
    );
  }

  async setPermissions(
    id: string,
    permissionKeys: string[],
    actor: ActorContext,
  ): Promise<RoleDetail> {
    const role = await this.roleRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }
    // May the actor touch this role at all — asked before the payload is even
    // read, so an unauthorised caller learns nothing about the catalogue.
    await this.assertCanManageRole(role.id, role.name, actor);

    // Then the payload itself: an unknown key is a client bug and deserves its
    // own 400 rather than being reported as a permission the actor lacks.
    const permissionIds = permissionKeys.length
      ? await this.resolvePermissionIds(permissionKeys)
      : [];

    // Finally the two ways the change can go wrong: keys the actor may not hand
    // out, and keys the actor would be taking away from themselves.
    await this.assertKeysWithinActorAuthority(permissionKeys, role.name, actor);
    await this.assertNotSelfDemotion(role.id, permissionKeys, actor);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(RolePermissionEntity, { roleId: id });
      if (permissionIds.length) {
        const rows = permissionIds.map((permissionId) =>
          manager.create(RolePermissionEntity, {
            roleId: id,
            permissionId,
          }),
        );
        await manager.save(RolePermissionEntity, rows);
      }
    });

    // All users carrying this role need fresh permissions on next request.
    await this.rbacService.invalidateOrgPermissions(actor.organizationId);

    // Permission keys alone never change a user's `roles` or `branchIds`, so
    // this identity cache clear is defensive rather than strictly required —
    // but it is one of the six sites ADR-08 named, and a per-user clear here
    // is no broader than what the users on this role actually need, unlike
    // an org-wide `invalidatePattern`.
    const affectedUsers = await this.userRoleRepo.find({
      where: { roleId: id, organizationId: actor.organizationId },
    });
    await Promise.all(
      affectedUsers.map((ur) =>
        this.invalidateUserIdentity(ur.userId, actor.organizationId),
      ),
    );

    return this.findById(id, actor);
  }

  /**
   * "Quản trị hệ thống" is the organization's administrator, so authority here
   * is read off the actor's own permission set, never off `isSystem`: a role is
   * editable when it carries no key the actor lacks. That is the same predicate
   * `RbacService.getGrantableRoleIds` uses for granting — a role you may hand to
   * someone else is a role you may rewrite — so the edit button and the grant
   * button can never disagree.
   *
   * `isSystem` survives only as a naming/lifecycle flag: it still blocks a
   * rename (`update`) and a delete (`delete`), because the seeds and several
   * call sites find these roles by name. It no longer blocks editing, which is
   * what locked a full-permission administrator out of the roles below them.
   */
  private async assertCanManageRole(
    roleId: string,
    roleName: string,
    actor: ActorContext,
  ): Promise<void> {
    const grantable = await this.rbacService.getGrantableRoleIds(
      actor.userId,
      actor.organizationId,
      [roleId],
    );
    if (grantable.has(roleId)) return;

    // Only on the rejection path: name the offending keys for the message.
    const [actorKeys, keysByRole] = await Promise.all([
      this.rbacService.getUserPermissions(actor.userId, actor.organizationId),
      this.rbacService.getRolePermissionKeys([roleId]),
    ]);
    const actorSet = new Set(actorKeys);
    const excess = (keysByRole.get(roleId) ?? []).filter(
      (key) => !actorSet.has(key),
    );
    this.logger.warn(
      `User ${actor.userId} tried to edit role ${roleId} holding ${excess.length} permission(s) they lack: ${excess.join(', ')}`,
    );
    throw new ForbiddenException(
      `Cannot edit role "${roleName}": it holds ${excess.length} permission(s) you do not have`,
    );
  }

  /**
   * You cannot write a permission into a role that you do not hold yourself —
   * otherwise `iam.role.permissions.write` alone would be a route to any key in
   * the catalogue: add it to a role you already manage, then wear that role.
   * Mirrors `UsersService.assertCanGrantRoles`, one level down.
   */
  private async assertKeysWithinActorAuthority(
    permissionKeys: string[],
    roleName: string,
    actor: ActorContext,
  ): Promise<void> {
    if (permissionKeys.length === 0) return;
    const actorKeys = await this.rbacService.getUserPermissions(
      actor.userId,
      actor.organizationId,
    );
    const actorSet = new Set(actorKeys);
    const excess = permissionKeys.filter((key) => !actorSet.has(key));
    if (excess.length === 0) return;

    this.logger.warn(
      `User ${actor.userId} tried to put ${excess.length} permission(s) they lack into role "${roleName}": ${excess.join(', ')}`,
    );
    throw new ForbiddenException(
      `Cannot save role "${roleName}": it would grant ${excess.length} permission(s) you do not have`,
    );
  }

  /**
   * Letting an administrator edit the role they themselves wear opens the trap
   * `UsersService.assertNotSelfDemotion` guards on the user side: the last
   * Quản trị hệ thống of an organization could uncheck their own boxes and leave
   * nobody able to undo it. Refused when the actor holds this role and the new
   * key set drops something their other roles do not give back.
   *
   * Only *self*-demotion is blocked. Trimming a role the actor does not wear
   * stays allowed — that is ordinary administration, and the actor is still
   * there to reverse it.
   */
  private async assertNotSelfDemotion(
    roleId: string,
    nextKeys: string[],
    actor: ActorContext,
  ): Promise<void> {
    const ownRoles = await this.userRoleRepo.find({
      where: { userId: actor.userId, organizationId: actor.organizationId },
      select: { roleId: true },
    });
    if (!ownRoles.some((ur) => ur.roleId === roleId)) return;

    const otherRoleIds = ownRoles
      .map((ur) => ur.roleId)
      .filter((rid) => rid !== roleId);
    const [currentKeys, keysByOtherRole] = await Promise.all([
      this.rbacService.getUserPermissions(actor.userId, actor.organizationId),
      this.rbacService.getRolePermissionKeys(otherRoleIds),
    ]);
    const kept = new Set([...nextKeys, ...[...keysByOtherRole.values()].flat()]);
    const lost = currentKeys.filter((key) => !kept.has(key));
    if (lost.length === 0) return;

    this.logger.warn(
      `User ${actor.userId} tried to drop ${lost.length} of their own permission(s) via role ${roleId}: ${lost.join(', ')}`,
    );
    throw new ForbiddenException(
      `Cannot remove your own permissions: this would drop ${lost.length} permission(s) you currently hold. Ask another administrator to do it.`,
    );
  }

  private async resolvePermissionIds(keys: string[]): Promise<string[]> {
    const found = await this.permissionRepo.find({
      where: { key: In(keys) },
    });
    if (found.length !== keys.length) {
      const foundKeys = new Set(found.map((p) => p.key));
      const missing = keys.filter((k) => !foundKeys.has(k));
      throw new BadRequestException(
        `Unknown permission keys: ${missing.join(', ')}`,
      );
    }
    return found.map((p) => p.id);
  }

  private async getPermissionKeys(roleId: string): Promise<string[]> {
    const rps = await this.rolePermissionRepo.find({ where: { roleId } });
    if (!rps.length) return [];
    const permissions = await this.permissionRepo.find({
      where: { id: In(rps.map((rp) => rp.permissionId)) },
    });
    return permissions.map((p) => p.key);
  }

  private toView(r: RoleEntity, assignable: boolean): RoleSummary {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      assignable,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
