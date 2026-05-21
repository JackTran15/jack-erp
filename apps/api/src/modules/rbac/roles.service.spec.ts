import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RbacService } from './rbac.service';
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
    find: jest.fn(),
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
    Pick<RbacService, 'invalidateUserPermissions' | 'invalidateOrgPermissions'>
  >;

  beforeEach(async () => {
    roleRepo = makeMockRepo();
    permissionRepo = makeMockRepo();
    rolePermissionRepo = makeMockRepo();
    userRoleRepo = makeMockRepo();
    rbac = {
      invalidateUserPermissions: jest.fn().mockResolvedValue(undefined),
      invalidateOrgPermissions: jest.fn().mockResolvedValue(undefined),
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
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(RolesService);
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

    it('refuses description updates on system roles', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'r-1',
        name: 'Quản trị hệ thống',
        isSystem: true,
        description: null,
        organizationId: 'org-1',
      });

      await expect(
        service.update('r-1', { description: 'updated' }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
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

    it('refuses to change permissions on a system role', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'r-1',
        isSystem: true,
        organizationId: 'org-1',
      });

      await expect(
        service.setPermissions('r-1', ['pos.sale.create'], actor),
      ).rejects.toBeInstanceOf(BadRequestException);
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
