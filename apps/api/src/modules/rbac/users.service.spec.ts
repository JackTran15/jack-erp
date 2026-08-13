import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { RbacService } from './rbac.service';
import { UserEntity } from '../auth/user.entity';
import { RoleEntity } from '../auth/role.entity';
import { UserRoleEntity } from '../auth/user-role.entity';
import { UserBranchAssignmentEntity } from '../branch/user-branch-assignment.entity';
import { BranchEntity } from '../branch/branch.entity';
import { EmployeeProfileEntity } from './employee/employee-profile.entity';
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
    // Defaults to empty so branch/role scope lookups resolve in every test
    // without each one having to stub them.
    find: jest.fn().mockResolvedValue([]),
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
  let profileRepo: ReturnType<typeof makeMockRepo>;
  let rbac: jest.Mocked<
    Pick<
      RbacService,
      | 'invalidateUserPermissions'
      | 'invalidateOrgPermissions'
      | 'getUserPermissions'
      | 'getRolePermissionKeys'
    >
  >;
  let manager: ReturnType<typeof makeMockManager>;

  beforeEach(async () => {
    userRepo = makeMockRepo();
    roleRepo = makeMockRepo();
    userRoleRepo = makeMockRepo();
    userBranchRepo = makeMockRepo();
    branchRepo = makeMockRepo();
    profileRepo = makeMockRepo();
    manager = makeMockManager();
    rbac = {
      invalidateUserPermissions: jest.fn().mockResolvedValue(undefined),
      invalidateOrgPermissions: jest.fn().mockResolvedValue(undefined),
      // Unscoped by default: most tests are about role/permission rules, not
      // branch scoping. Tests that exercise scoping override this.
      getUserPermissions: jest.fn().mockResolvedValue(['iam.user.read.all']),
      getRolePermissionKeys: jest.fn().mockResolvedValue(new Map()),
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
        {
          provide: getRepositoryToken(EmployeeProfileEntity),
          useValue: profileRepo,
        },
        { provide: RbacService, useValue: rbac },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('list', () => {
    const makeUser = (over: Record<string, unknown> = {}) => ({
      id: 'u-1',
      email: 'a@example.com',
      firstName: 'A',
      lastName: 'B',
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-02T00:00:00.000Z'),
      ...over,
    });

    it('includes code + lightweight profile when a profile exists, null otherwise', async () => {
      const userWith = makeUser({ id: 'u-1' });
      const userWithout = makeUser({ id: 'u-2', email: 'b@example.com' });
      userRepo.findAndCount.mockResolvedValue([[userWith, userWithout], 2]);
      profileRepo.find.mockResolvedValue([
        {
          userId: 'u-1',
          code: 'NV000001',
          jobPosition: { id: 'jp-1', name: 'Sales' },
          photoUrl: 'http://cdn/p1.png',
          mobile: '0900000001',
          employmentStatus: 'OFFICIAL',
        },
      ]);

      const result = await service.list(
        { page: 1, pageSize: 20 },
        actor,
      );

      expect(result.total).toBe(2);
      expect(result.data[0]).toMatchObject({
        id: 'u-1',
        code: 'NV000001',
        profile: {
          code: 'NV000001',
          jobPosition: { id: 'jp-1', name: 'Sales' },
          photoUrl: 'http://cdn/p1.png',
          mobile: '0900000001',
          employmentStatus: 'OFFICIAL',
        },
      });
      expect(result.data[1]).toMatchObject({
        id: 'u-2',
        code: null,
        profile: null,
      });
    });

    it('adds an id In(...) clause when the search term matches employee codes', async () => {
      // Unscoped actor: this test is about the code clause, not branch scoping.
      rbac.getUserPermissions.mockResolvedValue(['iam.user.read.all']);
      profileRepo.find
        .mockResolvedValueOnce([{ id: 'p-1', userId: 'u-1' }]) // code-match lookup
        .mockResolvedValueOnce([]); // batch profile load for the page
      userRepo.findAndCount.mockResolvedValue([[makeUser()], 1]);

      await service.list({ page: 1, pageSize: 20, search: 'NV0001' }, actor);

      const findArg = userRepo.findAndCount.mock.calls[0][0];
      expect(Array.isArray(findArg.where)).toBe(true);
      // email + firstName + lastName + id-in-code-matches
      expect(findArg.where).toHaveLength(4);
      expect(findArg.where[3]).toHaveProperty('id');
    });

    /**
     * The code-match branch sets its own `id`, overwriting the scope clause
     * spread beside it — so the intersection has to happen before the query is
     * built, or searching by employee code would reach other branches.
     */
    it('drops code matches for users outside the actor branch scope', async () => {
      rbac.getUserPermissions.mockResolvedValue(['iam.user.read']);
      // Actor sees only their own branch, which u-99 is not part of.
      userBranchRepo.find
        .mockResolvedValueOnce([{ branchId: 'b-1' }]) // actor's branches
        .mockResolvedValueOnce([{ userId: 'u-actor' }]); // members of b-1
      profileRepo.find
        .mockResolvedValueOnce([{ id: 'p-9', userId: 'u-99' }]) // code match, other branch
        .mockResolvedValueOnce([]);
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list({ page: 1, pageSize: 20, search: 'NV0099' }, actor);

      const findArg = userRepo.findAndCount.mock.calls[0][0];
      // No 4th branch: the only code match was filtered out as out-of-scope.
      expect(findArg.where).toHaveLength(3);
      for (const clause of findArg.where) {
        expect(clause).toHaveProperty('id');
      }
    });

    it('restricts the query to the actor branch scope without iam.user.read.all', async () => {
      rbac.getUserPermissions.mockResolvedValue(['iam.user.read']);
      userBranchRepo.find
        .mockResolvedValueOnce([{ branchId: 'b-1' }])
        .mockResolvedValueOnce([{ userId: 'u-1' }, { userId: 'u-2' }]);
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list({ page: 1, pageSize: 20 }, actor);

      const findArg = userRepo.findAndCount.mock.calls[0][0];
      expect(findArg.where).toHaveProperty('id');
    });

    it('does not restrict the query when the actor holds iam.user.read.all', async () => {
      rbac.getUserPermissions.mockResolvedValue(['iam.user.read.all']);
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list({ page: 1, pageSize: 20 }, actor);

      const findArg = userRepo.findAndCount.mock.calls[0][0];
      expect(findArg.where).not.toHaveProperty('id');
    });

    it('omits the code clause when the search term matches no employee codes', async () => {
      profileRepo.find
        .mockResolvedValueOnce([]) // no code matches
        .mockResolvedValueOnce([]); // batch profile load
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list({ page: 1, pageSize: 20, search: 'nope' }, actor);

      const findArg = userRepo.findAndCount.mock.calls[0][0];
      expect(findArg.where).toHaveLength(3);
    });
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

  describe('privilege escalation via role grants', () => {
    /** Actor holds the branch-manager-ish set; r-super needs more than that. */
    function arrangeRoles(roleKeys: Record<string, string[]>) {
      const ids = Object.keys(roleKeys);
      userRepo.exist.mockResolvedValue(true);
      userRepo.findOne.mockResolvedValue({
        id: 'u-1',
        isActive: true,
        organizationId: 'org-1',
      });
      roleRepo.find.mockResolvedValue(ids.map((id) => ({ id })));
      roleRepo.findOne.mockImplementation(async ({ where }: any) => ({
        id: where.id,
        name: where.id === 'r-super' ? 'Quản trị hệ thống' : 'Nhân viên',
      }));
      userRoleRepo.find.mockResolvedValue([]);
      rbac.getUserPermissions.mockResolvedValue([
        'pos.sale.create',
        'iam.user.write',
        'iam.user.read.all',
      ]);
      rbac.getRolePermissionKeys.mockResolvedValue(new Map(Object.entries(roleKeys)));
    }

    it('setRoles refuses a role carrying permissions the actor lacks', async () => {
      arrangeRoles({ 'r-super': ['pos.sale.create', 'iam.role.permissions.write'] });

      await expect(
        service.setRoles('u-1', ['r-super'], actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(rbac.invalidateUserPermissions).not.toHaveBeenCalled();
    });

    it('setRoles allows a role whose permissions are a subset of the actors', async () => {
      arrangeRoles({ 'r-staff': ['pos.sale.create'] });

      await expect(
        service.setRoles('u-1', ['r-staff'], actor),
      ).resolves.toEqual(['r-staff']);
    });

    /**
     * Granting roles was already guarded, but `iam.user.write` alone used to let
     * a branch manager edit — and reset the password of — a Quản lý tổng or
     * Quản trị hệ thống account, i.e. take it over outright.
     */
    describe('privilege escalation via writes on a higher account', () => {
      /** Target holds a permission the actor does not. */
      function arrangeHigherTarget() {
        userRepo.exist.mockResolvedValue(true);
        userRepo.findOne.mockResolvedValue({
          id: 'u-admin',
          isActive: true,
          organizationId: 'org-1',
        });
        rbac.getUserPermissions.mockImplementation(async (userId: string) =>
          userId === 'u-admin'
            ? ['iam.user.write', 'iam.role.permissions.write']
            : ['iam.user.write', 'iam.user.read.all'],
        );
      }

      it.each([
        ['update', () => service.update('u-admin', { firstName: 'X' }, actor)],
        [
          'resetPassword',
          () =>
            service.resetPassword(
              'u-admin',
              { newTemporaryPassword: 'Pwd@1234' },
              actor,
            ),
        ],
        ['deactivate', () => service.deactivate('u-admin', actor)],
        ['setBranches', () => service.setBranches('u-admin', [], actor)],
      ])('%s is refused on an account holding permissions the actor lacks', async (
        _name,
        call,
      ) => {
        arrangeHigherTarget();

        await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
        expect(userRepo.save).not.toHaveBeenCalled();
      });

      it('refuses a write on a subordinate at another branch, by id', async () => {
        userRepo.exist.mockResolvedValue(true);
        userRepo.findOne.mockResolvedValue({
          id: 'u-other-branch',
          isActive: true,
          organizationId: 'org-1',
        });
        // Branch-scoped actor whose branch does not contain the target.
        rbac.getUserPermissions.mockResolvedValue(['iam.user.write']);
        userBranchRepo.find
          .mockResolvedValueOnce([{ branchId: 'b-1' }])
          .mockResolvedValueOnce([{ userId: 'u-actor' }]);

        await expect(
          service.update('u-other-branch', { firstName: 'X' }, actor),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(userRepo.save).not.toHaveBeenCalled();
      });

      it('still allows the same writes on a subordinate account', async () => {
        userRepo.exist.mockResolvedValue(true);
        userRepo.findOne.mockResolvedValue({
          id: 'u-staff',
          isActive: true,
          organizationId: 'org-1',
        });
        rbac.getUserPermissions.mockImplementation(async (userId: string) =>
          userId === 'u-staff'
            ? ['pos.sale.create']
            : ['pos.sale.create', 'iam.user.write', 'iam.user.read.all'],
        );

        await expect(
          service.resetPassword(
            'u-staff',
            { newTemporaryPassword: 'Pwd@1234' },
            actor,
          ),
        ).resolves.toBeUndefined();
        expect(userRepo.save).toHaveBeenCalled();
      });

      it('never locks the actor out of their own account', async () => {
        userRepo.exist.mockResolvedValue(true);
        userRepo.findOne.mockResolvedValue({
          id: actor.userId,
          email: 'me@example.com',
          firstName: 'Me',
          lastName: 'Self',
          isActive: true,
          organizationId: 'org-1',
          lastLoginAt: null,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          updatedAt: new Date('2025-01-02T00:00:00.000Z'),
        });
        // Even if the cache reports keys the actor "lacks", self is exempt.
        rbac.getUserPermissions.mockResolvedValue(['anything']);

        await expect(
          service.update(actor.userId, { firstName: 'Me' }, actor),
        ).resolves.toBeDefined();
      });
    });

    it('create refuses initial roleIds carrying permissions the actor lacks', async () => {
      arrangeRoles({ 'r-super': ['iam.role.permissions.write'] });
      userRepo.findOne.mockResolvedValue(null); // no duplicate email

      await expect(
        service.create(
          {
            email: 'a@example.com',
            firstName: 'A',
            lastName: 'B',
            temporaryPassword: 'Pwd@1234',
            roleIds: ['r-super'],
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(manager.save).not.toHaveBeenCalled();
    });
  });
});
