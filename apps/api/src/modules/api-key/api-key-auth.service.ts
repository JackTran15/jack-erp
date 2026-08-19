import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyEntity } from './api-key.entity';
import { BranchEntity } from '../branch/branch.entity';
import { CacheService } from '../redis/cache.service';
import { hashApiKey } from './api-key-crypto.util';
import { isIpWhitelisted } from './ip-match.util';

/** Shared with ApiKeyCrudService, which invalidates this same namespace on update/delete. */
export const API_KEY_CACHE_NAMESPACE = 'api-key';

export interface ApiKeyActor {
  apiKeyId: string;
  organizationId: string;
  /**
   * The key's shadow user (ADR-04, 03-logical-design.md) — this, not any
   * `roles` list, is what `PermissionGuard`/`RbacService` actually resolve
   * permissions from. `roles` isn't carried here: it's meaningful only at
   * key-creation/update time (populating that user's `user_roles`), never
   * read again downstream of the guard.
   */
  userId: string;
  /** Always fully resolved — every branch id an unrestricted key may use. */
  branchIds: string[];
}

/** What `lookup()` resolves — the unit T-03-01 caches as a whole (ADR-02). */
export interface ApiKeyRecord {
  actor: ApiKeyActor;
  ipWhitelist: string[];
}

export type ApiKeyValidationResult =
  | { kind: 'not_found' }
  | { kind: 'ip_denied' }
  | { kind: 'ok'; actor: ApiKeyActor };

@Injectable()
export class ApiKeyAuthService {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly repository: Repository<ApiKeyEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepository: Repository<BranchEntity>,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
  ) {}

  /**
   * IP whitelist check runs in-process on every call regardless of cache
   * hit/miss — it is never itself cached, only the record `lookup()`
   * resolves is (ADR-02).
   */
  async validate(
    rawKey: string,
    clientIp: string,
  ): Promise<ApiKeyValidationResult> {
    const record = await this.lookup(hashApiKey(rawKey));
    if (!record) return { kind: 'not_found' };

    if (!isIpWhitelisted(clientIp, record.ipWhitelist)) {
      return { kind: 'ip_denied' };
    }

    return { kind: 'ok', actor: record.actor };
  }

  /**
   * Cached via `CacheService.getOrSet` (ADR-02, A-07): a repeat call with the
   * same key costs zero DB queries within the TTL — including the org-wide
   * branch lookup an unrestricted key would otherwise repeat every request.
   * A miss (unknown key → `null`) is cached too, so spamming an invalid key
   * doesn't hit the DB on every attempt either.
   */
  private async lookup(keyHash: string): Promise<ApiKeyRecord | null> {
    return this.cache.getOrSet(
      API_KEY_CACHE_NAMESPACE,
      keyHash,
      () => this.fetchRecord(keyHash),
      this.config.get<number>('API_KEY_CACHE_TTL_SECONDS', 60),
    );
  }

  /**
   * `findOne` on an entity with `@DeleteDateColumn` excludes soft-deleted
   * (revoked) rows automatically, so a revoked key resolves to `null` with
   * no extra check here.
   */
  private async fetchRecord(keyHash: string): Promise<ApiKeyRecord | null> {
    const entity = await this.repository.findOne({ where: { keyHash } });
    if (!entity) return null;

    const branchIds =
      entity.branchIds ?? (await this.orgBranchIds(entity.organizationId));

    return {
      actor: {
        apiKeyId: entity.id,
        organizationId: entity.organizationId,
        userId: entity.userId,
        branchIds,
      },
      ipWhitelist: entity.ipWhitelist,
    };
  }

  private async orgBranchIds(organizationId: string): Promise<string[]> {
    const rows = await this.branchRepository.find({
      where: { organizationId },
      select: ['id'],
    });
    return rows.map((b) => b.id);
  }
}
