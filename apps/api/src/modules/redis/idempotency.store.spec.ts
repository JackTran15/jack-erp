import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyStore, IdempotencyRecord } from './idempotency.store';
import { RedisService } from './redis.service';
import { IdempotencyStatus } from '@erp/shared-interfaces';

describe('IdempotencyStore', () => {
  let store: IdempotencyStore;
  let redis: Record<string, jest.Mock>;

  beforeEach(async () => {
    redis = {
      setex: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyStore,
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    store = module.get(IdempotencyStore);
  });

  describe('store', () => {
    it('should save with correct key pattern (actorId:endpoint:key)', async () => {
      await store.store('k1', 'actor-1', '/api/checkout', 'fp-abc', { ok: true });

      expect(redis.setex).toHaveBeenCalledWith(
        'idempotency',
        'actor-1:/api/checkout:k1',
        86400,
        expect.any(String),
      );

      const storedJson = redis.setex.mock.calls[0][3];
      const parsed: IdempotencyRecord = JSON.parse(storedJson);
      expect(parsed.status).toBe(IdempotencyStatus.CREATED);
      expect(parsed.fingerprint).toBe('fp-abc');
      expect(parsed.response).toEqual({ ok: true });
    });

    it('should accept a custom TTL', async () => {
      await store.store('k1', 'actor-1', '/api/checkout', 'fp-abc', null, 3600);

      expect(redis.setex).toHaveBeenCalledWith(
        'idempotency',
        'actor-1:/api/checkout:k1',
        3600,
        expect.any(String),
      );
    });
  });

  describe('lookup', () => {
    const existingRecord: IdempotencyRecord = {
      status: IdempotencyStatus.CREATED,
      fingerprint: 'fp-abc',
      response: { saleId: 's1' },
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    it('should return REPLAYED for matching fingerprint', async () => {
      redis.get.mockResolvedValue(JSON.stringify(existingRecord));

      const result = await store.lookup('k1', 'actor-1', '/api/checkout', 'fp-abc');

      expect(result).not.toBeNull();
      expect(result!.status).toBe(IdempotencyStatus.REPLAYED);
      expect(result!.response).toEqual({ saleId: 's1' });
    });

    it('should return CONFLICT for mismatched fingerprint', async () => {
      redis.get.mockResolvedValue(JSON.stringify(existingRecord));

      const result = await store.lookup('k1', 'actor-1', '/api/checkout', 'fp-DIFFERENT');

      expect(result).not.toBeNull();
      expect(result!.status).toBe(IdempotencyStatus.CONFLICT);
      expect(result!.fingerprint).toBe('fp-abc');
    });

    it('should return null for unknown key', async () => {
      redis.get.mockResolvedValue(null);

      const result = await store.lookup('unknown', 'actor-1', '/api/checkout', 'fp-xyz');

      expect(result).toBeNull();
    });

    it('should return null for corrupt data', async () => {
      redis.get.mockResolvedValue('not-valid-json{{{');

      const result = await store.lookup('k1', 'actor-1', '/api/checkout');

      expect(result).toBeNull();
    });
  });
});
