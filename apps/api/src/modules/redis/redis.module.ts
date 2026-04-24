import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { SessionStore } from './session.store';
import { IdempotencyStore } from './idempotency.store';
import { CacheService } from './cache.service';

@Global()
@Module({
  providers: [RedisService, SessionStore, IdempotencyStore, CacheService],
  exports: [RedisService, SessionStore, IdempotencyStore, CacheService],
})
export class RedisModule {}
