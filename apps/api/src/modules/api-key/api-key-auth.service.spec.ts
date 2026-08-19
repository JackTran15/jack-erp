import {
  ApiKeyAuthService,
  API_KEY_CACHE_NAMESPACE,
} from './api-key-auth.service';
import { hashApiKey } from './api-key-crypto.util';
import { ApiKeyEntity } from './api-key.entity';

const recordStub = (overrides: Partial<ApiKeyEntity> = {}): ApiKeyEntity =>
  ({
    id: 'key-1',
    organizationId: 'org-1',
    userId: 'shadow-user-1',
    name: 'Đối tác ABC',
    keyPrefix: 'abc12345',
    keyHash: hashApiKey('raw-secret'),
    roles: ['role-1'],
    branchIds: undefined,
    ipWhitelist: ['203.0.113.5', '198.51.100.0/28'],
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1',
    ...overrides,
  }) as ApiKeyEntity;

describe('ApiKeyAuthService', () => {
  let repository: { findOne: jest.Mock };
  let branchRepository: { find: jest.Mock };
  let cache: { getOrSet: jest.Mock; invalidate: jest.Mock };
  let config: { get: jest.Mock };
  let service: ApiKeyAuthService;

  beforeEach(() => {
    repository = { findOne: jest.fn() };
    branchRepository = { find: jest.fn() };
    // Simulates a cache miss on every call by default — actually invokes the
    // fetcher, so `validate()`'s DB-facing behaviour is still exercised.
    // Cache-specific behaviour (namespace/key/TTL wiring) gets its own tests.
    cache = {
      getOrSet: jest.fn((_ns, _key, fetchFn) => fetchFn()),
      invalidate: jest.fn(),
    };
    config = { get: jest.fn((_key, fallback) => fallback) };
    service = new ApiKeyAuthService(
      repository as never,
      branchRepository as never,
      cache as never,
      config as never,
    );
  });

  it('returns not_found when no key matches the hash', async () => {
    repository.findOne.mockResolvedValue(null);

    const result = await service.validate('wrong-secret', '203.0.113.5');

    expect(result).toEqual({ kind: 'not_found' });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { keyHash: hashApiKey('wrong-secret') },
    });
    expect(branchRepository.find).not.toHaveBeenCalled();
  });

  it('returns ok with the mapped actor when the key is valid and the IP is whitelisted', async () => {
    repository.findOne.mockResolvedValue(
      recordStub({ branchIds: ['branch-1', 'branch-2'] }),
    );

    const result = await service.validate('raw-secret', '203.0.113.5');

    expect(result).toEqual({
      kind: 'ok',
      actor: {
        apiKeyId: 'key-1',
        organizationId: 'org-1',
        userId: 'shadow-user-1',
        branchIds: ['branch-1', 'branch-2'],
      },
    });
    // Key already carries an explicit branch list — no org-wide lookup needed.
    expect(branchRepository.find).not.toHaveBeenCalled();
  });

  it('matches a CIDR entry in the whitelist', async () => {
    repository.findOne.mockResolvedValue(
      recordStub({ branchIds: ['branch-1'] }),
    );

    const result = await service.validate('raw-secret', '198.51.100.5');

    expect(result.kind).toBe('ok');
  });

  it('returns ip_denied when the key is valid but the IP is not whitelisted', async () => {
    repository.findOne.mockResolvedValue(
      recordStub({ branchIds: ['branch-1'] }),
    );

    const result = await service.validate('raw-secret', '10.0.0.1');

    expect(result).toEqual({ kind: 'ip_denied' });
  });

  it('resolves every branch in the org when the key has no branch restriction', async () => {
    repository.findOne.mockResolvedValue(recordStub({ branchIds: undefined }));
    branchRepository.find.mockResolvedValue([
      { id: 'branch-1' },
      { id: 'branch-2' },
      { id: 'branch-3' },
    ]);

    const result = await service.validate('raw-secret', '203.0.113.5');

    expect(branchRepository.find).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      select: ['id'],
    });
    expect(result.kind).toBe('ok');
    expect((result as any).actor.branchIds).toEqual([
      'branch-1',
      'branch-2',
      'branch-3',
    ]);
  });

  describe('caching (ADR-02 / A-07)', () => {
    it('looks up through CacheService.getOrSet, keyed by the key hash, in the shared namespace', async () => {
      repository.findOne.mockResolvedValue(
        recordStub({ branchIds: ['branch-1'] }),
      );

      await service.validate('raw-secret', '203.0.113.5');

      expect(cache.getOrSet).toHaveBeenCalledWith(
        API_KEY_CACHE_NAMESPACE,
        hashApiKey('raw-secret'),
        expect.any(Function),
        60,
      );
    });

    it('uses API_KEY_CACHE_TTL_SECONDS from config when set', async () => {
      config.get.mockImplementation((key: string, fallback: unknown) =>
        key === 'API_KEY_CACHE_TTL_SECONDS' ? 120 : fallback,
      );
      repository.findOne.mockResolvedValue(
        recordStub({ branchIds: ['branch-1'] }),
      );

      await service.validate('raw-secret', '203.0.113.5');

      expect(cache.getOrSet).toHaveBeenCalledWith(
        API_KEY_CACHE_NAMESPACE,
        expect.any(String),
        expect.any(Function),
        120,
      );
    });

    it('a cache hit skips the DB entirely', async () => {
      cache.getOrSet.mockResolvedValue({
        actor: {
          apiKeyId: 'key-1',
          organizationId: 'org-1',
          userId: 'shadow-user-1',
          branchIds: ['branch-1'],
        },
        ipWhitelist: ['203.0.113.5'],
      });

      const result = await service.validate('raw-secret', '203.0.113.5');

      expect(result.kind).toBe('ok');
      expect(repository.findOne).not.toHaveBeenCalled();
      expect(branchRepository.find).not.toHaveBeenCalled();
    });

    it('a cached not_found (null) result still skips the DB', async () => {
      cache.getOrSet.mockResolvedValue(null);

      const result = await service.validate('wrong-secret', '203.0.113.5');

      expect(result).toEqual({ kind: 'not_found' });
      expect(repository.findOne).not.toHaveBeenCalled();
    });
  });
});
