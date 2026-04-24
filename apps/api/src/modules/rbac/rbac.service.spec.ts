import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RbacService } from './rbac.service';
import { CacheService } from '../redis/cache.service';
import { UserRoleEntity } from '../auth/user-role.entity';
import { RolePermissionEntity } from '../auth/role-permission.entity';
import { PermissionEntity } from '../auth/permission.entity';

describe('RbacService', () => {
  let service: RbacService;
  let cacheService: jest.Mocked<Pick<CacheService, 'getOrSet' | 'invalidate' | 'invalidatePattern'>>;
  let userRoleRepo: { find: jest.Mock };
  let rolePermissionRepo: { createQueryBuilder: jest.Mock };
  let permissionRepo: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    cacheService = {
      getOrSet: jest.fn(),
      invalidate: jest.fn(),
      invalidatePattern: jest.fn(),
    };
    userRoleRepo = { find: jest.fn() };

    const rpQb = {
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    rolePermissionRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(rpQb),
    };

    const pQb = {
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    permissionRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(pQb),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacService,
        { provide: CacheService, useValue: cacheService },
        { provide: getRepositoryToken(UserRoleEntity), useValue: userRoleRepo },
        { provide: getRepositoryToken(RolePermissionEntity), useValue: rolePermissionRepo },
        { provide: getRepositoryToken(PermissionEntity), useValue: permissionRepo },
      ],
    }).compile();

    service = module.get(RbacService);
  });

  describe('getUserPermissions', () => {
    it('returns resolved permissions via cache', async () => {
      cacheService.getOrSet.mockResolvedValue(['customer.read', 'customer.write']);

      const perms = await service.getUserPermissions('user-1', 'org-1');

      expect(perms).toEqual(['customer.read', 'customer.write']);
      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        'rbac',
        'perms:user-1:org-1',
        expect.any(Function),
        300,
      );
    });

    it('resolves permissions from database when cache misses', async () => {
      cacheService.getOrSet.mockImplementation(
        async (_ns, _key, fetchFn) => fetchFn(),
      );
      userRoleRepo.find.mockResolvedValue([
        { userId: 'user-1', roleId: 'role-1', organizationId: 'org-1' },
      ]);

      const rpQb = {
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { roleId: 'role-1', permissionId: 'perm-1' },
          { roleId: 'role-1', permissionId: 'perm-2' },
        ]),
      };
      rolePermissionRepo.createQueryBuilder.mockReturnValue(rpQb);

      const pQb = {
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 'perm-1', key: 'customer.read' },
          { id: 'perm-2', key: 'customer.write' },
        ]),
      };
      permissionRepo.createQueryBuilder.mockReturnValue(pQb);

      const perms = await service.getUserPermissions('user-1', 'org-1');

      expect(perms).toEqual(['customer.read', 'customer.write']);
    });

    it('returns empty array when user has no roles', async () => {
      cacheService.getOrSet.mockImplementation(
        async (_ns, _key, fetchFn) => fetchFn(),
      );
      userRoleRepo.find.mockResolvedValue([]);

      const perms = await service.getUserPermissions('user-1', 'org-1');

      expect(perms).toEqual([]);
    });
  });

  describe('hasPermission', () => {
    it('returns true when user has the permission', async () => {
      cacheService.getOrSet.mockResolvedValue(['customer.read', 'customer.write']);

      const result = await service.hasPermission('user-1', 'org-1', 'customer.read');

      expect(result).toBe(true);
    });

    it('returns false when user lacks the permission', async () => {
      cacheService.getOrSet.mockResolvedValue(['customer.read']);

      const result = await service.hasPermission('user-1', 'org-1', 'customer.write');

      expect(result).toBe(false);
    });
  });

  describe('permissions cached after first lookup', () => {
    it('calls cache getOrSet on every call (caching delegated to CacheService)', async () => {
      cacheService.getOrSet.mockResolvedValue(['customer.read']);

      await service.getUserPermissions('user-1', 'org-1');
      await service.getUserPermissions('user-1', 'org-1');

      expect(cacheService.getOrSet).toHaveBeenCalledTimes(2);
      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        'rbac',
        'perms:user-1:org-1',
        expect.any(Function),
        300,
      );
    });
  });

  describe('cache invalidation', () => {
    it('invalidateUserPermissions clears cached permissions for a user', async () => {
      cacheService.invalidate.mockResolvedValue(undefined);

      await service.invalidateUserPermissions('user-1', 'org-1');

      expect(cacheService.invalidate).toHaveBeenCalledWith(
        'rbac',
        'perms:user-1:org-1',
      );
    });

    it('invalidateOrgPermissions clears all org permission caches', async () => {
      cacheService.invalidatePattern.mockResolvedValue(5);

      await service.invalidateOrgPermissions('org-1');

      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'rbac',
        'perms:*:org-1',
      );
    });
  });
});
