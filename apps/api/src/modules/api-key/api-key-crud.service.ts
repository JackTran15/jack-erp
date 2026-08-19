import { randomUUID } from 'node:crypto';
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { BaseCrudService, CrudOperation } from '../crud/base-crud.service';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { CacheService } from '../redis/cache.service';
import { RbacService } from '../rbac/rbac.service';
import { UserEntity } from '../auth/user.entity';
import { UserRoleEntity } from '../auth/user-role.entity';
import { RoleEntity } from '../auth/role.entity';
import { ApiKeyEntity } from './api-key.entity';
import { generateApiKey, hashApiKey } from './api-key-crypto.util';
import { isValidIpOrCidrEntry } from './ip-match.util';
import { API_KEY_CACHE_NAMESPACE } from './api-key-auth.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';

export const API_KEY_SERVICE_TOKEN = 'ApiKeyCrudService';
const BCRYPT_ROUNDS = 10; // matches auth.service.ts's own constant

@Injectable()
export class ApiKeyCrudService extends BaseCrudService<
  ApiKeyEntity,
  CreateApiKeyDto,
  UpdateApiKeyDto
> {
  protected readonly entityConfig: CrudEntityConfig = API_KEY_ENTITY_CONFIG;

  constructor(
    @InjectRepository(ApiKeyEntity)
    protected readonly repository: Repository<ApiKeyEntity>,
    protected readonly dataSource: DataSource,
    private readonly cache: CacheService,
    private readonly rbacService: RbacService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
  ) {
    super(dataSource);
  }

  /**
   * The generic CRUD controller declares its body as `Record<string, any>`
   * (one controller serves every entity), so NestJS's global `ValidationPipe`
   * has no class to reflect and `CreateApiKeyDto`/`UpdateApiKeyDto`'s
   * class-validator decorators never actually run — same as every other
   * generic-CRUD entity in this codebase (e.g. `InventoryProviderCrudService`
   * validates business rules the same way, not via its DTOs either). Enforce
   * the rules that matter here explicitly instead, including the per-item
   * checks the (inert) DTOs only advertise.
   */
  protected override async validateBusinessRules(
    operation: CrudOperation,
    payload: any,
    actor: ActorContext,
  ): Promise<void> {
    if (operation !== 'create' && operation !== 'update') return;

    if (payload.ipWhitelist !== undefined || operation === 'create') {
      if (!Array.isArray(payload.ipWhitelist) || payload.ipWhitelist.length === 0) {
        throw new BadRequestException('ipWhitelist must contain at least one entry');
      }
      const badEntry = payload.ipWhitelist.find(
        (entry: unknown) =>
          typeof entry !== 'string' || !isValidIpOrCidrEntry(entry),
      );
      if (badEntry !== undefined) {
        throw new BadRequestException(
          `ipWhitelist entry is not a valid IPv4 address or CIDR range: ${badEntry}`,
        );
      }
    }
    if (payload.roles !== undefined || operation === 'create') {
      if (!Array.isArray(payload.roles) || payload.roles.length === 0) {
        throw new BadRequestException('roles must contain at least one entry');
      }
      if (payload.roles.some((role: unknown) => typeof role !== 'string')) {
        throw new BadRequestException('roles must be an array of strings');
      }
      // ADR-04: roles are real roles.id values (they populate the shadow
      // user's user_roles), not free-text labels — must actually exist in
      // this organization. Dedupe first: In(...) collapses duplicate ids,
      // so comparing the raw count against payload.roles.length would
      // reject an otherwise-valid payload that just repeats an id.
      const uniqueRoleIds = [...new Set(payload.roles)];
      const found = await this.roleRepo.count({
        where: { id: In(uniqueRoleIds), organizationId: actor.organizationId },
      });
      if (found !== uniqueRoleIds.length) {
        throw new BadRequestException(
          'roles must reference existing roles in this organization',
        );
      }
    }
  }

  /**
   * Overrides the base `create()` — rather than `super.create()` — because the raw
   * secret must be generated before persisting (only its hash is ever saved) and
   * attached to this one response afterward. Computing it here, outside
   * `beforeCreate`, avoids stashing it on `this` — a singleton provider shared
   * across concurrent requests, where instance state would race.
   *
   * ADR-04: also creates the key's shadow user + `user_roles` rows before the
   * `api_keys` row itself, so `userId` can be set on insert. `validateBusinessRules`
   * is called explicitly, up front — `super.create()` also runs it internally,
   * but only *after* `createShadowUser()` would already have run; without this
   * explicit call first, a malformed `roles`/`ipWhitelist` reaches
   * `createShadowUser()`'s raw `user_roles.role_id` (a `uuid` column) insert
   * before any validation, surfacing as an unhandled Postgres type error
   * (500) instead of the intended 400 (caught live, not by a unit test —
   * every unit test mocks the repositories, so a real column type never gets
   * a chance to reject anything).
   *
   * Not wrapped in a single transaction spanning both `createShadowUser()`
   * and `super.create()` — `super.create()` uses `this.repository`, not a
   * transaction-scoped manager, so nesting it inside one here isn't possible
   * without rewriting the base class. A `super.create()` failure after a
   * successful shadow-user creation leaves an orphaned, inactive,
   * permission-less user row — accepted as a low-severity, low-likelihood
   * gap (only a key_hash collision or a DB blip triggers it, since
   * validation itself now always runs first) rather than building a
   * compensation flow for it.
   */
  override async create(
    payload: CreateApiKeyDto,
    actor: ActorContext,
  ): Promise<ApiKeyEntity & { rawKey: string }> {
    await this.validateBusinessRules('create', payload, actor);

    const { raw, prefix } = generateApiKey();
    const userId = await this.createShadowUser(payload.name, payload.roles, actor);

    const enriched = {
      ...payload,
      keyPrefix: prefix,
      keyHash: hashApiKey(raw),
      userId,
    };
    const saved = await super.create(enriched as any, actor);
    const redacted = { ...saved };
    delete (redacted as any).keyHash;
    return { ...redacted, rawKey: raw };
  }

  /**
   * A real `users` row so `PermissionGuard`/`RbacService` — which only ever
   * resolve permissions via a DB `user_roles` lookup keyed on `userId`, never
   * from anything on the request — work for an API-key request completely
   * unmodified (ADR-04). `isActive: false` blocks normal `/auth/login` even
   * if the discarded random password were somehow known; `resolvePermissions`
   * doesn't join `users` at all, so `isActive` has no effect on RBAC
   * resolution for this path.
   */
  private async createShadowUser(
    keyName: string,
    roleIds: string[],
    actor: ActorContext,
  ): Promise<string> {
    const randomPassword = randomUUID() + randomUUID();
    const passwordHash = await bcrypt.hash(randomPassword, BCRYPT_ROUNDS);

    return this.dataSource.transaction(async (manager) => {
      const user = manager.create(UserEntity, {
        organizationId: actor.organizationId,
        email: `api-key+${randomUUID()}@internal.local`,
        passwordHash,
        firstName: 'API Key',
        lastName: keyName,
        isActive: false,
      });
      const savedUser = await manager.save(UserEntity, user);

      const roleRows = roleIds.map((roleId) =>
        manager.create(UserRoleEntity, {
          userId: savedUser.id,
          roleId,
          organizationId: actor.organizationId,
        }),
      );
      await manager.save(UserRoleEntity, roleRows);

      return savedUser.id;
    });
  }

  /**
   * `list()`/`getById()` in the base class return raw columns straight from the
   * DB — `CrudEntityConfig.fields` only controls what the frontend *renders*,
   * it doesn't strip anything server-side. `keyHash` must never leave this
   * service once persisted (03-logical-design.md § Contracts), so both read
   * paths redact it explicitly.
   */
  protected override transformListResults(data: ApiKeyEntity[]): unknown[] {
    return data.map((row) => {
      const redacted = { ...row };
      delete (redacted as any).keyHash;
      return redacted;
    });
  }

  /**
   * `getById()` is also called internally by the base class's `update()` and
   * `remove()` (to reload `existing` before `repository.save()`) — spreading
   * into a plain object here would strip its TypeORM entity prototype and
   * make `save()` throw `CannotDetermineEntityError`. Deleting the property
   * on the same instance keeps it a real `ApiKeyEntity`; TypeORM's `save()`
   * skips columns whose value is `undefined` rather than nulling them out,
   * so this never wipes the persisted hash on an update/revoke round-trip.
   */
  override async getById(
    id: string,
    actor: ActorContext,
  ): Promise<ApiKeyEntity> {
    const entity = await super.getById(id, actor);
    delete (entity as any).keyHash;
    return entity;
  }

  /**
   * Does NOT trust `entity.keyHash` — `update()` builds this object via its
   * own internal `this.getById()` call (this class's override, which
   * deletes `keyHash`) before merging/saving, so by the time `afterUpdate`
   * runs the property is already gone. Re-fetching by id, like
   * `afterDelete` does, is the only way to get the real hash here.
   *
   * ADR-04: also reconciles the shadow user's `user_roles` to the key's
   * current `roles` (delete-all-then-reinsert, unconditionally — cheaper to
   * always do it than to detect "did this particular PATCH touch roles"
   * without risking another singleton-instance-state race) and invalidates
   * `RbacService`'s own permission cache for that user, which this feature's
   * `api-key` cache namespace has no relationship to.
   */
  protected override async afterUpdate(
    entity: ApiKeyEntity,
    actor: ActorContext,
  ): Promise<void> {
    const fresh = await this.repository.findOne({ where: { id: entity.id } });
    if (!fresh) return;

    await this.cache.invalidate(API_KEY_CACHE_NAMESPACE, fresh.keyHash);

    await this.userRoleRepo.delete({
      userId: fresh.userId,
      organizationId: actor.organizationId,
    });
    if (fresh.roles.length > 0) {
      const rows = fresh.roles.map((roleId) =>
        this.userRoleRepo.create({
          userId: fresh.userId,
          roleId,
          organizationId: actor.organizationId,
        }),
      );
      await this.userRoleRepo.save(rows);
    }
    await this.rbacService.invalidateUserPermissions(
      fresh.userId,
      actor.organizationId,
    );
  }

  /** Revoking the key also deactivates its shadow user (defense in depth — the guard already
   * rejects on key lookup alone, since `afterDelete`'s own cache invalidation below makes
   * that immediate; this closes the door in case anything ever reaches RBAC with this userId
   * some other way). */
  protected override async afterDelete(
    id: string,
    actor: ActorContext,
  ): Promise<void> {
    const revoked = await this.repository.findOne({
      where: { id },
      withDeleted: true,
    });
    if (revoked) {
      await this.cache.invalidate(API_KEY_CACHE_NAMESPACE, revoked.keyHash);
      await this.userRepo.update({ id: revoked.userId }, { isActive: false });
      await this.rbacService.invalidateUserPermissions(
        revoked.userId,
        actor.organizationId,
      );
    }
  }
}

export const API_KEY_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'api-keys',
  displayName: 'API Key',
  apiResource: 'admin/entities/api-keys',
  idField: 'id',
  fields: [
    { key: 'name', label: 'Tên', type: 'string', required: true },
    {
      key: 'keyPrefix',
      label: 'Định danh (prefix)',
      type: 'string',
      readOnly: true,
    },
    { key: 'roles', label: 'Vai trò (ID)', type: 'tags', required: true },
    {
      key: 'branchIds',
      label: 'Giới hạn chi nhánh (để trống = mọi chi nhánh)',
      type: 'tags',
      hideInList: true,
    },
    {
      key: 'ipWhitelist',
      label: 'IP whitelist',
      type: 'tags',
      required: true,
    },
    { key: 'createdAt', label: 'Ngày tạo', type: 'date', readOnly: true },
  ],
  searchableFields: ['name', 'keyPrefix'],
  filterDefinitions: [],
  permissions: {
    create: 'api-key.create',
    read: 'api-key.read',
    update: 'api-key.update',
    delete: 'api-key.delete',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.SOFT,
};
