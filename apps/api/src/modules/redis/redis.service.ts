import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private readonly prefix: string = 'erp';

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('REDIS_HOST', 'localhost')!;
    const port = this.config.get<number>('REDIS_PORT', 6380)!;
    const password =
      this.config.get<string>('REDIS_PASSWORD', 'erp_redis_secret') || undefined;
    const db = this.config.get<number>('REDIS_DB', 0)!;

    this.client = new Redis({
      host,
      port,
      password,
      db,
      retryStrategy: (times) => Math.min(times * 200, 5000),
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) =>
      this.logger.error('Redis connection error', err.message),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log('Redis disconnected');
  }

  private buildKey(namespace: string, key: string): string {
    return `${this.prefix}:${namespace}:${key}`;
  }

  async get(namespace: string, key: string): Promise<string | null> {
    return this.client.get(this.buildKey(namespace, key));
  }

  async set(
    namespace: string,
    key: string,
    value: string,
  ): Promise<'OK'> {
    return this.client.set(this.buildKey(namespace, key), value);
  }

  async setex(
    namespace: string,
    key: string,
    ttlSeconds: number,
    value: string,
  ): Promise<'OK'> {
    return this.client.setex(
      this.buildKey(namespace, key),
      ttlSeconds,
      value,
    );
  }

  async del(namespace: string, key: string): Promise<number> {
    return this.client.del(this.buildKey(namespace, key));
  }

  async exists(namespace: string, key: string): Promise<boolean> {
    const result = await this.client.exists(this.buildKey(namespace, key));
    return result === 1;
  }

  async ttl(namespace: string, key: string): Promise<number> {
    return this.client.ttl(this.buildKey(namespace, key));
  }

  async hget(
    namespace: string,
    key: string,
    field: string,
  ): Promise<string | null> {
    return this.client.hget(this.buildKey(namespace, key), field);
  }

  async hset(
    namespace: string,
    key: string,
    field: string,
    value: string,
  ): Promise<number> {
    return this.client.hset(this.buildKey(namespace, key), field, value);
  }

  async hdel(
    namespace: string,
    key: string,
    ...fields: string[]
  ): Promise<number> {
    return this.client.hdel(this.buildKey(namespace, key), ...fields);
  }

  async hgetall(
    namespace: string,
    key: string,
  ): Promise<Record<string, string>> {
    return this.client.hgetall(this.buildKey(namespace, key));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Scan and delete keys matching a pattern within a namespace.
   * Uses SCAN to avoid blocking Redis on large keyspaces.
   */
  async deleteByPattern(
    namespace: string,
    pattern: string,
  ): Promise<number> {
    const fullPattern = `${this.prefix}:${namespace}:${pattern}`;
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        fullPattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        deleted += await this.client.del(...keys);
      }
    } while (cursor !== '0');

    return deleted;
  }
}
