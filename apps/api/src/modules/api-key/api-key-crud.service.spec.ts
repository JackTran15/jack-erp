import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { UserEntity } from '../auth/user.entity';
import { ApiKeyEntity } from './api-key.entity';
import { ApiKeyCrudService } from './api-key-crud.service';
import { hashApiKey } from './api-key-crypto.util';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  roles: ['admin'],
};

const createDto = {
  name: 'Đối tác ABC',
  roles: ['role-1'],
  ipWhitelist: ['203.0.113.5'],
};

describe('ApiKeyCrudService', () => {
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let cache: { invalidate: jest.Mock; getOrSet: jest.Mock };
  let rbacService: { invalidateUserPermissions: jest.Mock };
  let userRepo: { update: jest.Mock };
  let userRoleRepo: {
    delete: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let roleRepo: { count: jest.Mock };
  let transactionManager: { create: jest.Mock; save: jest.Mock };
  let service: ApiKeyCrudService;

  beforeEach(() => {
    repository = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'key-1', ...x })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    transactionManager = {
      create: jest.fn((_entity, data) => data),
      save: jest.fn(async (_entity, data) =>
        Array.isArray(data) ? data : { id: 'shadow-user-1', ...data },
      ),
    };
    dataSource = {
      transaction: jest.fn((cb) => cb(transactionManager)),
    };
    cache = { invalidate: jest.fn(), getOrSet: jest.fn() };
    rbacService = { invalidateUserPermissions: jest.fn() };
    userRepo = { update: jest.fn() };
    userRoleRepo = {
      delete: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
    };
    roleRepo = { count: jest.fn().mockResolvedValue(1) };

    service = new ApiKeyCrudService(
      repository as never,
      dataSource as never,
      cache as never,
      rbacService as never,
      userRepo as never,
      userRoleRepo as never,
      roleRepo as never,
    );
  });

  describe('create', () => {
    it('creates a shadow user + user_roles before the api key row, wires userId', async () => {
      const result = await service.create(createDto as any, actor);

      expect(transactionManager.save.mock.calls[0][0]).toBe(UserEntity);
      const savedUser = transactionManager.save.mock.calls[0][1];
      expect(savedUser.organizationId).toBe('org-1');
      expect(savedUser.isActive).toBe(false);

      const savedRoles = transactionManager.save.mock.calls[1][1];
      expect(savedRoles).toEqual([
        { userId: 'shadow-user-1', roleId: 'role-1', organizationId: 'org-1' },
      ]);

      expect(repository.save.mock.calls[0][0].userId).toBe('shadow-user-1');
      expect(result.rawKey).toEqual(expect.any(String));
    });

    it('validates before creating the shadow user — invalid roles never reach user_roles', async () => {
      // Regression: create() used to call createShadowUser() before
      // super.create() ever ran validateBusinessRules(), so a malformed
      // roles/ipWhitelist value reached a raw `user_roles.role_id` (uuid
      // column) insert before any validation — live-caught as an unhandled
      // Postgres type error (500), not the intended 400. Proven here by
      // asserting the transaction (shadow-user creation) never starts when
      // validation fails, not just that create() eventually rejects.
      roleRepo.count.mockResolvedValue(0);

      await expect(service.create(createDto as any, actor)).rejects.toThrow(
        'roles must reference existing roles in this organization',
      );

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('returns the raw secret exactly once, alongside the saved entity', async () => {
      const result = await service.create(createDto as any, actor);

      expect(result.rawKey).toEqual(expect.any(String));
      expect(result.keyPrefix).toBe(result.rawKey.slice(0, 8));
    });

    it('never leaks keyHash in the create response', async () => {
      const result = await service.create(createDto as any, actor);

      expect(result).not.toHaveProperty('keyHash');
    });

    it('never persists the raw secret — only its hash reaches save()', async () => {
      const result = await service.create(createDto as any, actor);

      const saved = repository.save.mock.calls[0][0];
      expect(JSON.stringify(saved)).not.toContain(result.rawKey);
      expect(saved.keyHash).toBe(hashApiKey(result.rawKey));
    });
  });

  describe('read paths never leak keyHash', () => {
    it('transformListResults strips keyHash from every row', () => {
      const rows = [
        { id: 'a', keyHash: 'hash-a', name: 'A' },
        { id: 'b', keyHash: 'hash-b', name: 'B' },
      ] as ApiKeyEntity[];

      const out = (service as any).transformListResults(rows);

      expect(out).toEqual([
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ]);
    });

    it('getById strips keyHash from the returned entity', async () => {
      repository.findOne.mockResolvedValue({
        id: 'key-1',
        keyHash: 'hash-1',
        name: 'A',
      });

      const result = await service.getById('key-1', actor);

      expect(result).not.toHaveProperty('keyHash');
    });
  });

  describe('validateBusinessRules', () => {
    const call = (operation: 'create' | 'update' | 'delete', payload: any) =>
      (service as any).validateBusinessRules(operation, payload, actor);

    it('rejects create with no ipWhitelist / no roles', async () => {
      await expect(call('create', { name: 'x', roles: ['role-1'] })).rejects.toThrow(
        'ipWhitelist must contain at least one entry',
      );
      await expect(
        call('create', { name: 'x', ipWhitelist: ['203.0.113.5'] }),
      ).rejects.toThrow('roles must contain at least one entry');
    });

    it('rejects create/update with an empty ipWhitelist or roles array', async () => {
      await expect(
        call('create', { ...createDto, ipWhitelist: [] }),
      ).rejects.toThrow('ipWhitelist must contain at least one entry');
      await expect(
        call('update', { ipWhitelist: [] }),
      ).rejects.toThrow('ipWhitelist must contain at least one entry');
      await expect(
        call('update', { roles: [] }),
      ).rejects.toThrow('roles must contain at least one entry');
    });

    it('rejects a malformed ipWhitelist entry', async () => {
      await expect(
        call('create', { ...createDto, ipWhitelist: ['not-an-ip'] }),
      ).rejects.toThrow(/not a valid IPv4 address or CIDR range/);
      await expect(
        call('create', { ...createDto, ipWhitelist: ['203.0.113.5/99'] }),
      ).rejects.toThrow(/not a valid IPv4 address or CIDR range/);
    });

    it('accepts a valid CIDR entry in ipWhitelist', async () => {
      await expect(
        call('create', { ...createDto, ipWhitelist: ['203.0.113.0/28'] }),
      ).resolves.toBeUndefined();
    });

    it('rejects a non-string entry in roles', async () => {
      await expect(
        call('create', { ...createDto, roles: [123] }),
      ).rejects.toThrow('roles must be an array of strings');
    });

    it('accepts a payload that repeats the same valid role id (dedupe before counting)', async () => {
      roleRepo.count.mockResolvedValue(1); // one distinct role exists
      await expect(
        call('create', { ...createDto, roles: ['role-1', 'role-1'] }),
      ).resolves.toBeUndefined();
    });

    it('rejects roles that do not exist in this organization', async () => {
      roleRepo.count.mockResolvedValue(0);
      await expect(call('create', createDto)).rejects.toThrow(
        'roles must reference existing roles in this organization',
      );
      expect(roleRepo.count).toHaveBeenCalledWith({
        where: { id: expect.anything(), organizationId: 'org-1' },
      });
    });

    it('update omitting ipWhitelist/roles entirely does not validate them (partial patch)', async () => {
      await expect(call('update', { name: 'renamed' })).resolves.toBeUndefined();
      expect(roleRepo.count).not.toHaveBeenCalled();
    });

    it('delete is a no-op', async () => {
      await expect(call('delete', { id: 'key-1' })).resolves.toBeUndefined();
    });
  });

  describe('afterUpdate', () => {
    it('re-reads by id (not entity.keyHash, deleted by getById), reconciles user_roles, invalidates both caches', async () => {
      const entityMissingHash = { id: 'key-1' } as ApiKeyEntity;
      repository.findOne.mockResolvedValue({
        id: 'key-1',
        keyHash: 'abc123',
        userId: 'shadow-user-1',
        roles: ['role-2'],
      });

      await (service as any).afterUpdate(entityMissingHash, actor);

      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 'key-1' } });
      expect(cache.invalidate).toHaveBeenCalledWith('api-key', 'abc123');
      expect(userRoleRepo.delete).toHaveBeenCalledWith({
        userId: 'shadow-user-1',
        organizationId: 'org-1',
      });
      expect(userRoleRepo.save).toHaveBeenCalledWith([
        { userId: 'shadow-user-1', roleId: 'role-2', organizationId: 'org-1' },
      ]);
      expect(rbacService.invalidateUserPermissions).toHaveBeenCalledWith(
        'shadow-user-1',
        'org-1',
      );
    });
  });

  describe('afterDelete', () => {
    it('re-reads the (now soft-deleted) row, deactivates the shadow user, invalidates both caches', async () => {
      repository.findOne.mockResolvedValue({
        id: 'key-1',
        keyHash: 'abc123',
        userId: 'shadow-user-1',
      });

      await (service as any).afterDelete('key-1', actor);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        withDeleted: true,
      });
      expect(cache.invalidate).toHaveBeenCalledWith('api-key', 'abc123');
      expect(userRepo.update).toHaveBeenCalledWith(
        { id: 'shadow-user-1' },
        { isActive: false },
      );
      expect(rbacService.invalidateUserPermissions).toHaveBeenCalledWith(
        'shadow-user-1',
        'org-1',
      );
    });
  });
});
