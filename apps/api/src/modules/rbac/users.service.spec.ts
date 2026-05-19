import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { RbacService } from './rbac.service';
import { UserEntity } from '../auth/user.entity';
import { RoleEntity } from '../auth/role.entity';
import { UserRoleEntity } from '../auth/user-role.entity';
import { UserBranchAssignmentEntity } from '../branch/user-branch-assignment.entity';
import { BranchEntity } from '../branch/branch.entity';
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
    findAndCount: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn().mockImplementation((data) => ({ ...data })),
    delete: jest.fn(),
    exist: jest.fn(),
  };
}

function makeMockManager() {
  return {
    create: jest.fn().mockImplementation((_entity, data) => ({ ...data })),
    save: jest.fn().mockImplementation(async (_entity, value) => value),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let userRepo: ReturnType<typeof makeMockRepo>;
  let roleRepo: ReturnType<typeof makeMockRepo>;
  let userRoleRepo: ReturnType<typeof makeMockRepo>;
  let userBranchRepo: ReturnType<typeof makeMockRepo>;
  let branchRepo: ReturnType<typeof makeMockRepo>;
  let rbac: jest.Mocked<
    Pick<RbacService, 'invalidateUserPermissions' | 'invalidateOrgPermissions'>
  >;
  let manager: ReturnType<typeof makeMockManager>;

  beforeEach(async () => {
    userRepo = makeMockRepo();
    roleRepo = makeMockRepo();
    userRoleRepo = makeMockRepo();
    userBranchRepo = makeMockRepo();
    branchRepo = makeMockRepo();
    manager = makeMockManager();
    rbac = {
      invalidateUserPermissions: jest.fn().mockResolvedValue(undefined),
      invalidateOrgPermissions: jest.fn().mockResolvedValue(undefined),
    };

    const dataSource = {
      transaction: jest.fn((cb: any) => cb(manager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        { provide: getRepositoryToken(RoleEntity), useValue: roleRepo },
        { provide: getRepositoryToken(UserRoleEntity), useValue: userRoleRepo },
        {
          provide: getRepositoryToken(UserBranchAssignmentEntity),
          useValue: userBranchRepo,
        },
        { provide: getRepositoryToken(BranchEntity), useValue: branchRepo },
        { provide: RbacService, useValue: rbac },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('create', () => {
    it('rejects when a user with the same email already exists in this org', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create(
          {
            email: 'a@example.com',
            firstName: 'A',
            lastName: 'B',
            temporaryPassword: 'Pwd@1234',
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('normalises the email to lowercase before persisting', async () => {
      userRepo.findOne
        .mockResolvedValueOnce(null) // duplicate check
        .mockResolvedValueOnce({
          id: 'new-id',
          email: 'a@example.com',
          firstName: 'A',
          lastName: 'B',
          isActive: true,
          lastLoginAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      userRoleRepo.find.mockResolvedValue([]);
      userBranchRepo.find.mockResolvedValue([]);

      await service.create(
        {
          email: 'A@Example.COM',
          firstName: 'A',
          lastName: 'B',
          temporaryPassword: 'Pwd@1234',
        },
        actor,
      );

      const savedUser = manager.save.mock.calls[0][1];
      expect(savedUser.email).toBe('a@example.com');
    });

    it('rejects when initial roleIds reference roles outside the org', async () => {
      userRepo.findOne.mockResolvedValue(null);
      roleRepo.find.mockResolvedValue([{ id: 'role-1' }]);

      await expect(
        service.create(
          {
            email: 'a@example.com',
            firstName: 'A',
            lastName: 'B',
            temporaryPassword: 'Pwd@1234',
            roleIds: ['role-1', 'role-2'],
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('invalidates the new users permission cache after creation', async () => {
      userRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'new-id',
          email: 'a@example.com',
          firstName: 'A',
          lastName: 'B',
          isActive: true,
          lastLoginAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      userRoleRepo.find.mockResolvedValue([]);
      userBranchRepo.find.mockResolvedValue([]);
      manager.save = jest.fn().mockImplementation(async (entity, value) => {
        if (entity?.name === 'UserEntity' || (value && 'passwordHash' in value)) {
          return { ...value, id: 'new-id' };
        }
        return value;
      });

      await service.create(
        {
          email: 'a@example.com',
          firstName: 'A',
          lastName: 'B',
          temporaryPassword: 'Pwd@1234',
        },
        actor,
      );

      expect(rbac.invalidateUserPermissions).toHaveBeenCalledWith(
        'new-id',
        'org-1',
      );
    });
  });

  describe('deactivate', () => {
    it('refuses to deactivate the calling administrator themselves', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'admin-1',
        isActive: true,
        organizationId: 'org-1',
      });

      await expect(service.deactivate('admin-1', actor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('is a no-op when the user is already inactive', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u-2',
        isActive: false,
      });

      await service.deactivate('u-2', actor);

      expect(userRepo.save).not.toHaveBeenCalled();
      expect(rbac.invalidateUserPermissions).not.toHaveBeenCalled();
    });

    it('throws when the user is not found in the org', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.deactivate('missing', actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('soft-deletes by clearing isActive and invalidates the permission cache', async () => {
      const user = { id: 'u-2', isActive: true };
      userRepo.findOne.mockResolvedValue(user);

      await service.deactivate('u-2', actor);

      expect(user.isActive).toBe(false);
      expect(userRepo.save).toHaveBeenCalledWith(user);
      expect(rbac.invalidateUserPermissions).toHaveBeenCalledWith(
        'u-2',
        'org-1',
      );
    });
  });

  describe('setRoles', () => {
    it('invalidates the permission cache after replacing the role set', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u-1',
        isActive: true,
        organizationId: 'org-1',
      });
      userRepo.exist.mockResolvedValue(true);
      roleRepo.find.mockResolvedValue([{ id: 'r-1' }, { id: 'r-2' }]);
      userRoleRepo.find.mockResolvedValue([]);

      await service.setRoles('u-1', ['r-1', 'r-2'], actor);

      expect(rbac.invalidateUserPermissions).toHaveBeenCalledWith(
        'u-1',
        'org-1',
      );
    });

    it('rejects role ids that do not belong to the actor org', async () => {
      userRepo.exist.mockResolvedValue(true);
      roleRepo.find.mockResolvedValue([{ id: 'r-1' }]);

      await expect(
        service.setRoles('u-1', ['r-1', 'r-2'], actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
