import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

const NAMESPACE = 'cache';
const DEFAULT_TTL_SECONDS = 300;

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redis: RedisService) {}

  private buildKeySegment(namespace: string, key: string): string {
    return `${namespace}:${key}`;
  }

  async getOrSet<T>(
    namespace: string,
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ): Promise<T> {
    const segment = this.buildKeySegment(namespace, key);
    const cached = await this.redis.get(NAMESPACE, segment);

    if (cached !== null) {
      this.logger.debug(`Cache hit: ${NAMESPACE}:${segment}`);
      return JSON.parse(cached) as T;
    }

    this.logger.debug(`Cache miss: ${NAMESPACE}:${segment}`);
    const value = await fetchFn();
    await this.redis.setex(
      NAMESPACE,
      segment,
      ttlSeconds,
      JSON.stringify(value),
    );
    return value;
  }

  async invalidate(namespace: string, key: string): Promise<void> {
    const segment = this.buildKeySegment(namespace, key);
    await this.redis.del(NAMESPACE, segment);
    this.logger.debug(`Cache invalidated: ${NAMESPACE}:${segment}`);
  }

  async invalidatePattern(
    namespace: string,
    pattern: string,
  ): Promise<number> {
    const fullPattern = `${namespace}:${pattern}`;
    const deleted = await this.redis.deleteByPattern(NAMESPACE, fullPattern);
    this.logger.debug(
      `Cache pattern invalidated: ${NAMESPACE}:${fullPattern} (${deleted} keys)`,
    );
    return deleted;
  }
}
