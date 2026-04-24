import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import { IdempotencyStatus } from '@erp/shared-interfaces';

export interface IdempotencyRecord {
  status: IdempotencyStatus;
  fingerprint: string;
  response: unknown;
  createdAt: string;
}

export interface IdempotencyLookupResult {
  status: IdempotencyStatus;
  fingerprint: string;
  response: unknown;
}

const NAMESPACE = 'idempotency';
const DEFAULT_TTL_SECONDS = 86400; // 24 hours

@Injectable()
export class IdempotencyStore {
  private readonly logger = new Logger(IdempotencyStore.name);

  constructor(private readonly redis: RedisService) {}

  private buildKeySegment(
    actorId: string,
    endpoint: string,
    key: string,
  ): string {
    return `${actorId}:${endpoint}:${key}`;
  }

  async store(
    key: string,
    actorId: string,
    endpoint: string,
    fingerprint: string,
    response: unknown,
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    const record: IdempotencyRecord = {
      status: IdempotencyStatus.CREATED,
      fingerprint,
      response,
      createdAt: new Date().toISOString(),
    };

    await this.redis.setex(
      NAMESPACE,
      this.buildKeySegment(actorId, endpoint, key),
      ttlSeconds,
      JSON.stringify(record),
    );

    this.logger.debug(
      `Idempotency record stored: ${actorId}:${endpoint}:${key}`,
    );
  }

  /**
   * Lookup an idempotency key.
   * - If key exists and fingerprint matches → REPLAYED
   * - If key exists and fingerprint differs → CONFLICT
   * - If key does not exist → null (caller should process then store as CREATED)
   */
  async lookup(
    key: string,
    actorId: string,
    endpoint: string,
    fingerprint?: string,
  ): Promise<IdempotencyLookupResult | null> {
    const raw = await this.redis.get(
      NAMESPACE,
      this.buildKeySegment(actorId, endpoint, key),
    );

    if (!raw) return null;

    let record: IdempotencyRecord;
    try {
      record = JSON.parse(raw) as IdempotencyRecord;
    } catch {
      this.logger.warn(
        `Corrupt idempotency record for ${actorId}:${endpoint}:${key}`,
      );
      return null;
    }

    if (fingerprint && record.fingerprint !== fingerprint) {
      return {
        status: IdempotencyStatus.CONFLICT,
        fingerprint: record.fingerprint,
        response: record.response,
      };
    }

    return {
      status: IdempotencyStatus.REPLAYED,
      fingerprint: record.fingerprint,
      response: record.response,
    };
  }
}
