import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { RbacService } from './rbac.service';
import { CacheService } from '../redis/cache.service';
import { RoleEntity } from '../auth/role.entity';
import { PermissionEntity } from '../auth/permission.entity';
import { RolePermissionEntity } from '../auth/role-permission.entity';
import { UserRoleEntity } from '../auth/user-role.entity';
import { ActorContext } from '../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: undefined,
  roles: [],
};

function makeMockRepo() {
  return {
    findOne: jest.fn(),
    // Defaults to empty so `setPermissions`'s identity-cache invalidation
    // (T-07-03) resolves without every existing test having to stub it.
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
    create: jest.fn().mockImplementation((data) => ({ ...data })),
    delete: jest.fn(),
  };
}

describe('RolesService', () => {
  let service: RolesService;
  let roleRepo: ReturnType<typeof makeMockRepo>;
  let permissionRepo: ReturnType<typeof makeMockRepo>;
  let rolePermissionRepo: ReturnType<typeof makeMockRepo>;
  let userRoleRepo: ReturnType<typeof makeMockRepo>;
  let rbac: jest.Mocked<
    Pick<
      RbacService,
      | 'invalidateUserPermissions'
      | 'invalidateOrgPermissions'
      | 'getGrantableRoleIds'
      | 'getUserPermissions'
      | 'getRolePermissionKeys'
    >
  >;
  let cacheService: jest.Mocked<Pick<CacheService, 'invalidate'>>;

  beforeEach(async () => {
    roleRepo = makeMockRepo();
    permissionRepo = makeMockRepo();
    rolePermissionRepo = makeMockRepo();
    userRoleRepo = makeMockRepo();
    rbac = {
      invalidateUserPermissions: jest.fn().mockResolvedValue(undefined),
      invalidateOrgPermissions: jest.fn().mockResolvedValue(undefined),
      // Everything grantable unless a test says otherwise.
      getGrantableRoleIds: jest.fn(
        async (_userId: string, _orgId: string, roleIds: string[]) =>
          new Set(roleIds),
      ),
      // The default actor is Quản trị hệ thống: it holds every key any test
      // hands out, so the authority guards pass unless a test narrows this.
      getUserPermissions: jest.fn().mockResolvedValue([
        'pos.sale.create',
        'iam.role.write',
        'iam.role.permissions.write',
      ]),
      getRolePermissionKeys: jest.fn(
        async (roleIds: string[]) =>
          new Map<string, string[]>(roleIds.map((id) => [id, []])),
      ),
    };
    cacheService = {
      invalidate: jest.fn().mockResolvedValue(undefined),
    };

    const manager = {
      create: jest.fn().mockImplementation((_e, data) => ({ ...data })),
      save: jest.fn().mockImplementation(async (_e, v) => v),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const dataSource = {
      transaction: jest.fn((cb: any) => cb(manager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: getRepositoryToken(RoleEntity), useValue: roleRepo },
        {
          provide: getRepositoryToken(PermissionEntity),
          useValue: permissionRepo,
        },
        {
          provide: getRepositoryToken(RolePermissionEntity),
          useValue: rolePermissionRepo,
        },
        {
          provide: getRepositoryToken(UserRoleEntity),
          useValue: userRoleRepo,
        },
        { provide: RbacService, useValue: rbac },
        { provide: CacheService, useValue: cacheService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(RolesService);
  });

  describe('list', () => {
    /**
     * The UI hides roles it may not grant. That verdict has to come from the
     * same permission-set comparison the write path enforces, or the form would
     * offer a role the server then rejects with 403.
     */
    it('flags each role assignable only when the caller may grant it', async () => {
      const now = new Date('2025-01-01T00:00:00.000Z');
      roleRepo.find.mockResolvedValue([
        { id: 'r-staff', name: 'Nhân viên bán hàng', description: null, isSystem: false, createdAt: now, updatedAt: now },
        { id: 'r-super', name: 'Quản trị hệ thống', description: null, isSystem: true, createdAt: now, updatedAt: now },
      ]);
      rbac.getGrantableRoleIds.mockResolvedValue(new Set(['r-staff']));

      const roles = await service.list(actor);

      expect(rbac.getGrantableRoleIds).toHaveBeenCalledWith('admin-1', 'org-1', [
        'r-staff',
        'r-super',
      ]);
      expect(roles.map((r) => [r.id, r.assignable])).toEqual([
        ['r-staff', true],
        ['r-super', false],
      ]);
    });
  });

  describe('update', () => {
    it('refuses to rename a system role', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'r-1',
        name: 'Admin',
        isSystem: true,
        description: null,
        organizationId: 'org-1',
      });

      await expect(
        service.update('r-1', { name: 'Renamed' }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    /**
     * The counterpart of the rename ban above: `isSystem` is about the role's
     * name and lifecycle, not about who may touch it. Quản trị hệ thống holds
     * every key in the catalogue, so it may rewrite the description of the very
     * role it wears — refusing that is what locked the administrator out.
     */
    it('lets a caller who may grant a system role edit its description', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'r-1',
        name: 'Quản trị hệ thống',
        isSystem: true,
        description: null,
        organizationId: 'org-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      rolePermissionRepo.find.mockResolvedValue([]);

      await service.update('r-1', { description: 'updated' }, actor);

      expect(roleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'r-1', description: 'updated' }),
      );
    });

    it('refuses an edit by a caller who lacks one of the role\'s permissions', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'r-1',
        name: 'Quản lý tổng',
        isSystem: false,
        description: null,
        organizationId: 'org-1',
      });
      rbac.getGrantableRoleIds.mockResolvedValue(new Set());
      rbac.getRolePermissionKeys.mockResolvedValue(
        new Map([['r-1', ['pos.invoice.cancel']]]),
      );

      await expect(
        service.update('r-1', { description: 'updated' }, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(roleRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('refuses to delete a system role', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'r-1',
        isSystem: true,
        organizationId: 'org-1',
      });

      await expect(service.delete('r-1', actor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('invalidates permission cache for every user that held the deleted role', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'r-1',
        isSystem: false,
        organizationId: 'org-1',
      });
      userRoleRepo.find.mockResolvedValue([
        { userId: 'u-1', roleId: 'r-1', organizationId: 'org-1' },
        { userId: 'u-2', roleId: 'r-1', organizationId: 'org-1' },
      ]);

      await service.delete('r-1', actor);

      expect(rbac.invalidateUserPermissions).toHaveBeenCalledTimes(2);
      expect(rbac.invalidateUserPermissions).toHaveBeenCalledWith('u-1', 'org-1');
      expect(rbac.invalidateUserPermissions).toHaveBeenCalledWith('u-2', 'org-1');
    });

    it('invalidates identity + my-branches cache for every user that held the deleted role (T-07-03, AC-24)', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'r-1',
        isSystem: false,
        organizationId: 'org-1',
      });
      userRoleRepo.find.mockResolvedValue([
        { userId: 'u-1', roleId: 'r-1', organizationId: 'org-1' },
        { userId: 'u-2', roleId: 'r-1', organizationId: 'org-1' },
      ]);

      await service.delete('r-1', actor);

      expect(cacheService.invalidate).toHaveBeenCalledWith(
        'identity',
        'identity:u-1:org-1',
      );
      expect(cacheService.invalidate).toHaveBeenCalledWith(
        'my-branches',
        'u-1:org-1',
      );
      expect(cacheService.invalidate).toHaveBeenCalledWith(
        'users-me',
        'u-1:org-1',
      );
      expect(cacheService.invalidate).toHaveBeenCalledWith(
        'identity',
        'identity:u-2:org-1',
      );
      expect(cacheService.invalidate).toHaveBeenCalledWith(
        'my-branches',
        'u-2:org-1',
      );
      expect(cacheService.invalidate).toHaveBeenCalledWith(
        'users-me',
        'u-2:org-1',
      );
    });

    it('throws when the role is not found', async () => {
      roleRepo.findOne.mockResolvedValue(null);
      await expect(service.delete('missing', actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('setPermissions', () => {
    it('invalidates the entire org permission cache after a role permission change', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'r-1',
        isSystem: false,
        organizationId: 'org-1',
        name: 'Cashier',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      permissionRepo.find.mockResolvedValue([
        { id: 'p-1', key: 'pos.sale.create' },
      ]);
      rolePermissionRepo.find.mockResolvedValue([]);

      await service.setPermissions('r-1', ['pos.sale.create'], actor);

      expect(rbac.invalidateOrgPermissions).toHaveBeenCalledWith('org-1');
    });

    it('invalidates identity + my-branches cache for every user carrying the role (T-07-03, AC-24)', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'r-1',
        isSystem: false,
        organizationId: 'org-1',
        name: 'Cashier',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      permissionRepo.find.mockResolvedValue([
        { id: 'p-1', key: 'pos.sale.create' },
      ]);
      rolePermissionRepo.find.mockResolvedValue([]);
      // Two different reads of user_roles now: the actor's own rows (for the
      // self-demotion guard) and the rows carrying this role. The mock repo
      // ignores `where`, so answer per caller — the actor holds nothing here.
      userRoleRepo.find.mockImplementation(async (opts?: any) =>
        opts?.where?.userId === actor.userId
          ? []
          : [{ userId: 'u-3', roleId: 'r-1', organizationId: 'org-1' }],
      );

      await service.setPermissions('r-1', ['pos.sale.create'], actor);

      expect(cacheService.invalidate).toHaveBeenCalledWith(
        'identity',
        'identity:u-3:org-1',
      );
      expect(cacheService.invalidate).toHaveBeenCalledWith(
        'my-branches',
        'u-3:org-1',
      );
      expect(cacheService.invalidate).toHaveBeenCalledWith(
        'users-me',
        'u-3:org-1',
      );
    });

    /** Same point as the description test above, on the permission matrix. */
    it('lets a caller who may grant a system role rewrite its permissions', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'r-1',
        isSystem: true,
        organizationId: 'org-1',
        name: 'Quản trị hệ thống',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      permissionRepo.find.mockResolvedValue([
        { id: 'p-1', key: 'pos.sale.create' },
      ]);
      rolePermissionRepo.find.mockResolvedValue([]);

      await service.setPermissions('r-1', ['pos.sale.create'], actor);

      expect(rbac.invalidateOrgPermissions).toHaveBeenCalledWith('org-1');
    });

    it('refuses to write a permission the caller does not hold', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'r-1',
        isSystem: false,
        organizationId: 'org-1',
        name: 'Quản lý tổng',
      });
      permissionRepo.find.mockResolvedValue([
        { id: 'p-9', key: 'org.registration.approve' },
      ]);

      await expect(
        service.setPermissions('r-1', ['org.registration.approve'], actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(rbac.invalidateOrgPermissions).not.toHaveBeenCalled();
    });

    /**
     * The trap opened by letting an administrator edit their own role: the last
     * Quản trị hệ thống unchecking their own boxes leaves nobody able to undo
     * it. Only self-demotion is refused — trimming a role the caller does not
     * wear stays ordinary administration.
     */
    it('refuses to drop a permission the caller only holds through this role', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'r-1',
        isSystem: true,
        organizationId: 'org-1',
        name: 'Quản trị hệ thống',
      });
      userRoleRepo.find.mockResolvedValue([
        { userId: 'admin-1', roleId: 'r-1', organizationId: 'org-1' },
      ]);
      permissionRepo.find.mockResolvedValue([
        { id: 'p-1', key: 'pos.sale.create' },
      ]);

      await expect(
        service.setPermissions('r-1', ['pos.sale.create'], actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(rbac.invalidateOrgPermissions).not.toHaveBeenCalled();
    });

    it('allows the same drop when another role gives the permission back', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'r-1',
        isSystem: true,
        organizationId: 'org-1',
        name: 'Quản trị hệ thống',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      userRoleRepo.find.mockResolvedValue([
        { userId: 'admin-1', roleId: 'r-1', organizationId: 'org-1' },
        { userId: 'admin-1', roleId: 'r-2', organizationId: 'org-1' },
      ]);
      rbac.getRolePermissionKeys.mockResolvedValue(
        new Map([['r-2', ['iam.role.write', 'iam.role.permissions.write']]]),
      );
      permissionRepo.find.mockResolvedValue([
        { id: 'p-1', key: 'pos.sale.create' },
      ]);
      rolePermissionRepo.find.mockResolvedValue([]);

      await service.setPermissions('r-1', ['pos.sale.create'], actor);

      expect(rbac.invalidateOrgPermissions).toHaveBeenCalledWith('org-1');
    });

    it('rejects unknown permission keys', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'r-1',
        isSystem: false,
        organizationId: 'org-1',
      });
      permissionRepo.find.mockResolvedValue([
        { id: 'p-1', key: 'pos.sale.create' },
      ]);

      await expect(
        service.setPermissions(
          'r-1',
          ['pos.sale.create', 'not.a.real.permission'],
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
