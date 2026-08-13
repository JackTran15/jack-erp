import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { JwtPayload } from '@erp/shared-interfaces';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UserEntity } from './user.entity';
import { UserRoleEntity } from './user-role.entity';
import { RoleEntity } from './role.entity';
import { UserBranchAssignmentEntity } from '../branch/user-branch-assignment.entity';
import { SessionStore } from '../redis/session.store';
import { HandoffStore } from './handoff.store';
import { RbacService } from '../rbac/rbac.service';

jest.mock('jsonwebtoken');
jest.mock('bcryptjs');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const JWT_SECRET = 'test-secret';
const JWT_REFRESH_SECRET = 'test-refresh-secret';

const mockUser: Partial<UserEntity> = {
  id: 'user-1',
  email: 'admin@example.com',
  organizationId: 'org-1',
  passwordHash: 'hashed-pw',
  isActive: true,
  firstName: 'Admin',
  lastName: 'User',
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: jest.Mocked<
    Pick<Repository<UserEntity>, 'findOne' | 'update' | 'save'>
  >;
  let userRoleRepo: jest.Mocked<Pick<Repository<UserRoleEntity>, 'find'>>;
  let roleRepo: jest.Mocked<Pick<Repository<RoleEntity>, 'createQueryBuilder'>>;
  let userBranchRepo: jest.Mocked<Pick<Repository<UserBranchAssignmentEntity>, 'find'>>;
  let sessionStore: jest.Mocked<Pick<SessionStore, 'createSession' | 'getSession' | 'revokeSession'>>;
  let handoffStore: jest.Mocked<Pick<HandoffStore, 'issue' | 'consume'>>;
  let rbacService: jest.Mocked<Pick<RbacService, 'getUserPermissions'>>;

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
      save: jest.fn().mockImplementation(async (u) => u),
    };
    userRoleRepo = { find: jest.fn() };
    userBranchRepo = { find: jest.fn() };
    sessionStore = {
      createSession: jest.fn(),
      getSession: jest.fn(),
      revokeSession: jest.fn(),
    };
    handoffStore = {
      issue: jest.fn(),
      consume: jest.fn(),
    };
    rbacService = {
      getUserPermissions: jest.fn().mockResolvedValue([
        'iam.role.read',
        'iam.user.read',
      ]),
    };

    const mockQb = {
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ name: 'admin' }]),
    };
    roleRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal: string) => {
              if (key === 'JWT_SECRET') return JWT_SECRET;
              if (key === 'JWT_REFRESH_SECRET') return JWT_REFRESH_SECRET;
              return defaultVal;
            }),
          },
        },
        { provide: SessionStore, useValue: sessionStore },
        { provide: HandoffStore, useValue: handoffStore },
        { provide: RbacService, useValue: rbacService },
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        { provide: getRepositoryToken(UserRoleEntity), useValue: userRoleRepo },
        { provide: getRepositoryToken(RoleEntity), useValue: roleRepo },
        {
          provide: getRepositoryToken(UserBranchAssignmentEntity),
          useValue: userBranchRepo,
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => jest.restoreAllMocks());

  // ---- helpers to wire up common mocks ----
  function setupValidLogin() {
    userRepo.findOne.mockResolvedValue(mockUser as UserEntity);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    userRoleRepo.find.mockResolvedValue([
      { id: 'ur-1', userId: 'user-1', roleId: 'role-1', organizationId: 'org-1' } as UserRoleEntity,
    ]);
    userBranchRepo.find.mockResolvedValue([
      { branchId: 'branch-1' } as UserBranchAssignmentEntity,
    ]);
    (jwt.sign as jest.Mock).mockReturnValue('signed-token');
    userRepo.update.mockResolvedValue(undefined as any);
    sessionStore.createSession.mockResolvedValue(undefined);
  }

  // =========================================================================
  // login
  // =========================================================================
  describe('login', () => {
    it('returns tokens on valid credentials', async () => {
      setupValidLogin();

      const result = await service.login('admin@example.com', 'password', 'org-1');

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { email: 'admin@example.com', organizationId: 'org-1' },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith('password', 'hashed-pw');
      expect(result).toEqual({
        accessToken: 'signed-token',
        refreshToken: 'signed-token',
        expiresIn: 900,
        session: expect.objectContaining({
          userId: 'user-1',
          organizationId: 'org-1',
          roles: ['admin'],
          branchIds: ['branch-1'],
          permissions: ['iam.role.read', 'iam.user.read'],
        }),
      });
      expect(sessionStore.createSession).toHaveBeenCalled();
      expect(userRepo.update).toHaveBeenCalledWith('user-1', {
        lastLoginAt: expect.any(Date),
      });
    });

    it('bakes the first assigned branch as the active branch', async () => {
      setupValidLogin();
      userBranchRepo.find.mockResolvedValue([
        { branchId: 'branch-1' } as UserBranchAssignmentEntity,
        { branchId: 'branch-2' } as UserBranchAssignmentEntity,
      ]);

      await service.login('admin@example.com', 'password', 'org-1');

      expect(sessionStore.createSession).toHaveBeenCalledWith(
        'mock-uuid',
        expect.objectContaining({ branchId: 'branch-1' }),
        expect.any(Number),
      );
    });

    it('throws on invalid password', async () => {
      userRepo.findOne.mockResolvedValue(mockUser as UserEntity);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login('admin@example.com', 'wrong', 'org-1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws when user is inactive', async () => {
      userRepo.findOne.mockResolvedValue({
        ...mockUser,
        isActive: false,
      } as UserEntity);

      await expect(
        service.login('admin@example.com', 'password', 'org-1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws when user is not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.login('nobody@example.com', 'password', 'org-1'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // =========================================================================
  // refresh
  // =========================================================================
  describe('refresh', () => {
    it('rotates tokens on valid refresh token', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({
        jti: 'old-jti',
        userId: 'user-1',
      });
      sessionStore.getSession.mockResolvedValue({
        userId: 'user-1',
        organizationId: 'org-1',
        branchIds: ['branch-1'],
        roles: ['admin'],
        issuedAt: 1000,
        expiresAt: 999999,
      });
      sessionStore.revokeSession.mockResolvedValue(undefined);
      sessionStore.createSession.mockResolvedValue(undefined);
      userRoleRepo.find.mockResolvedValue([
        { id: 'ur-1', userId: 'user-1', roleId: 'role-1', organizationId: 'org-1' } as UserRoleEntity,
      ]);
      userBranchRepo.find.mockResolvedValue([
        { branchId: 'branch-1' } as UserBranchAssignmentEntity,
      ]);
      (jwt.sign as jest.Mock).mockReturnValue('new-signed-token');

      const result = await service.refresh('valid-refresh-token');

      expect(sessionStore.revokeSession).toHaveBeenCalledWith('old-jti');
      expect(sessionStore.createSession).toHaveBeenCalledWith(
        'mock-uuid',
        expect.objectContaining({ userId: 'user-1' }),
        expect.any(Number),
      );
      expect(result).toEqual({
        accessToken: 'new-signed-token',
        refreshToken: 'new-signed-token',
        expiresIn: 900,
      });
    });

    it('preserves the active branch across rotation', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({
        jti: 'old-jti',
        userId: 'user-1',
      });
      sessionStore.getSession.mockResolvedValue({
        userId: 'user-1',
        organizationId: 'org-1',
        branchIds: ['branch-1', 'branch-2'],
        branchId: 'branch-2',
        roles: ['admin'],
        issuedAt: 1000,
        expiresAt: 999999,
      });
      sessionStore.revokeSession.mockResolvedValue(undefined);
      sessionStore.createSession.mockResolvedValue(undefined);
      userRoleRepo.find.mockResolvedValue([
        { id: 'ur-1', userId: 'user-1', roleId: 'role-1', organizationId: 'org-1' } as UserRoleEntity,
      ]);
      userBranchRepo.find.mockResolvedValue([
        { branchId: 'branch-1' } as UserBranchAssignmentEntity,
        { branchId: 'branch-2' } as UserBranchAssignmentEntity,
      ]);
      (jwt.sign as jest.Mock).mockReturnValue('new-signed-token');

      await service.refresh('valid-refresh-token');

      expect(sessionStore.createSession).toHaveBeenCalledWith(
        'mock-uuid',
        expect.objectContaining({ branchId: 'branch-2' }),
        expect.any(Number),
      );
    });

    it('falls back to the first branch when the active branch is no longer assigned', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({
        jti: 'old-jti',
        userId: 'user-1',
      });
      sessionStore.getSession.mockResolvedValue({
        userId: 'user-1',
        organizationId: 'org-1',
        branchIds: ['branch-1', 'branch-9'],
        branchId: 'branch-9',
        roles: ['admin'],
        issuedAt: 1000,
        expiresAt: 999999,
      });
      sessionStore.revokeSession.mockResolvedValue(undefined);
      sessionStore.createSession.mockResolvedValue(undefined);
      userRoleRepo.find.mockResolvedValue([
        { id: 'ur-1', userId: 'user-1', roleId: 'role-1', organizationId: 'org-1' } as UserRoleEntity,
      ]);
      userBranchRepo.find.mockResolvedValue([
        { branchId: 'branch-1' } as UserBranchAssignmentEntity,
      ]);
      (jwt.sign as jest.Mock).mockReturnValue('new-signed-token');

      await service.refresh('valid-refresh-token');

      expect(sessionStore.createSession).toHaveBeenCalledWith(
        'mock-uuid',
        expect.objectContaining({ branchId: 'branch-1' }),
        expect.any(Number),
      );
    });

    it('throws when refresh token is invalid', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid');
      });

      await expect(service.refresh('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws when session is expired or revoked', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({
        jti: 'gone-jti',
        userId: 'user-1',
      });
      sessionStore.getSession.mockResolvedValue(null);

      await expect(service.refresh('stale-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // =========================================================================
  // logout
  // =========================================================================
  describe('logout', () => {
    it('revokes the session by jti', async () => {
      sessionStore.revokeSession.mockResolvedValue(undefined);

      await service.logout('jti-123');

      expect(sessionStore.revokeSession).toHaveBeenCalledWith('jti-123');
    });
  });

  // =========================================================================
  // switchBranch
  // =========================================================================
  describe('switchBranch', () => {
    const current: JwtPayload = {
      userId: 'user-1',
      organizationId: 'org-1',
      roles: ['admin'],
      branchIds: ['branch-1', 'branch-2'],
      branchId: 'branch-1',
      jti: 'old-jti',
      iat: 1000,
      exp: 999999,
    };

    function setupAssignedBranches(branchIds: string[]) {
      userRoleRepo.find.mockResolvedValue([
        { id: 'ur-1', userId: 'user-1', roleId: 'role-1', organizationId: 'org-1' } as UserRoleEntity,
      ]);
      userBranchRepo.find.mockResolvedValue(
        branchIds.map((branchId) => ({ branchId }) as UserBranchAssignmentEntity),
      );
    }

    it('rotates the session and mints tokens carrying the new active branch', async () => {
      setupAssignedBranches(['branch-1', 'branch-2']);
      sessionStore.revokeSession.mockResolvedValue(undefined);
      sessionStore.createSession.mockResolvedValue(undefined);
      (jwt.sign as jest.Mock).mockReturnValue('switched-token');

      const result = await service.switchBranch(current, 'branch-2');

      expect(sessionStore.revokeSession).toHaveBeenCalledWith('old-jti');
      expect(sessionStore.createSession).toHaveBeenCalledWith(
        'mock-uuid',
        expect.objectContaining({
          userId: 'user-1',
          organizationId: 'org-1',
          branchId: 'branch-2',
          branchIds: ['branch-1', 'branch-2'],
        }),
        expect.any(Number),
      );
      expect(result).toEqual({
        accessToken: 'switched-token',
        refreshToken: 'switched-token',
        expiresIn: 900,
        session: expect.objectContaining({
          branchIds: ['branch-1', 'branch-2'],
        }),
      });
    });

    it('throws and keeps the current session when the branch is not assigned', async () => {
      setupAssignedBranches(['branch-1']);
      sessionStore.revokeSession.mockResolvedValue(undefined);

      await expect(service.switchBranch(current, 'branch-2')).rejects.toThrow(
        ForbiddenException,
      );
      expect(sessionStore.revokeSession).not.toHaveBeenCalled();
      expect(sessionStore.createSession).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // handoff (backoffice → POS single sign-on)
  // =========================================================================
  describe('createHandoffCode', () => {
    const current: JwtPayload = {
      userId: 'user-1',
      organizationId: 'org-1',
      roles: ['admin'],
      branchIds: ['branch-1', 'branch-2'],
      branchId: 'branch-1',
      jti: 'bo-jti',
      iat: 1000,
      exp: 999999,
    };

    function setupAssignedBranches(branchIds: string[]) {
      userBranchRepo.find.mockResolvedValue(
        branchIds.map((branchId) => ({ branchId }) as UserBranchAssignmentEntity),
      );
    }

    it('issues a single-use code carrying the requested branch', async () => {
      setupAssignedBranches(['branch-1', 'branch-2']);

      const result = await service.createHandoffCode(current, 'branch-2');

      expect(handoffStore.issue).toHaveBeenCalledWith(
        'mock-uuid',
        { userId: 'user-1', organizationId: 'org-1', branchId: 'branch-2' },
        expect.any(Number),
      );
      expect(result).toEqual({ code: 'mock-uuid', expiresIn: 60 });
    });

    it('falls back to the caller active branch when none is requested', async () => {
      setupAssignedBranches(['branch-1', 'branch-2']);

      await service.createHandoffCode(current);

      expect(handoffStore.issue).toHaveBeenCalledWith(
        'mock-uuid',
        expect.objectContaining({ branchId: 'branch-1' }),
        expect.any(Number),
      );
    });

    it('refuses a branch the user is not assigned to', async () => {
      setupAssignedBranches(['branch-1']);

      await expect(
        service.createHandoffCode(current, 'branch-9'),
      ).rejects.toThrow(ForbiddenException);
      expect(handoffStore.issue).not.toHaveBeenCalled();
    });
  });

  describe('exchangeHandoffCode', () => {
    function arrangeUser(isActive = true) {
      userRepo.findOne.mockResolvedValue({
        id: 'user-1',
        organizationId: 'org-1',
        isActive,
      } as UserEntity);
      userRoleRepo.find.mockResolvedValue([
        { id: 'ur-1', userId: 'user-1', roleId: 'role-1', organizationId: 'org-1' } as UserRoleEntity,
      ]);
      userBranchRepo.find.mockResolvedValue([
        { branchId: 'branch-1' } as UserBranchAssignmentEntity,
        { branchId: 'branch-2' } as UserBranchAssignmentEntity,
      ]);
    }

    it('mints a new session without touching the issuing one', async () => {
      handoffStore.consume.mockResolvedValue({
        userId: 'user-1',
        organizationId: 'org-1',
        branchId: 'branch-2',
      });
      arrangeUser();
      sessionStore.createSession.mockResolvedValue(undefined);
      (jwt.sign as jest.Mock).mockReturnValue('handoff-token');

      const result = await service.exchangeHandoffCode('some-code');

      expect(sessionStore.revokeSession).not.toHaveBeenCalled();
      expect(sessionStore.createSession).toHaveBeenCalledWith(
        'mock-uuid',
        expect.objectContaining({
          userId: 'user-1',
          organizationId: 'org-1',
          branchId: 'branch-2',
        }),
        expect.any(Number),
      );
      expect(result).toEqual({
        accessToken: 'handoff-token',
        refreshToken: 'handoff-token',
        expiresIn: 900,
        session: expect.objectContaining({ userId: 'user-1' }),
      });
    });

    it('falls back to the first branch when the coded branch is gone', async () => {
      handoffStore.consume.mockResolvedValue({
        userId: 'user-1',
        organizationId: 'org-1',
        branchId: 'branch-9',
      });
      arrangeUser();
      sessionStore.createSession.mockResolvedValue(undefined);
      (jwt.sign as jest.Mock).mockReturnValue('handoff-token');

      await service.exchangeHandoffCode('some-code');

      expect(sessionStore.createSession).toHaveBeenCalledWith(
        'mock-uuid',
        expect.objectContaining({ branchId: 'branch-1' }),
        expect.any(Number),
      );
    });

    it('throws when the code is unknown, expired or already used', async () => {
      handoffStore.consume.mockResolvedValue(null);

      await expect(service.exchangeHandoffCode('used')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(sessionStore.createSession).not.toHaveBeenCalled();
    });

    it('throws when the user was deactivated after the code was issued', async () => {
      handoffStore.consume.mockResolvedValue({
        userId: 'user-1',
        organizationId: 'org-1',
      });
      arrangeUser(false);

      await expect(service.exchangeHandoffCode('some-code')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(sessionStore.createSession).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getSession
  // =========================================================================
  describe('getSession', () => {
    it('returns session info when session exists', async () => {
      sessionStore.getSession.mockResolvedValue({
        userId: 'user-1',
        organizationId: 'org-1',
        branchIds: ['branch-1'],
        roles: ['admin'],
        issuedAt: 1000,
        expiresAt: 999999,
      });
      userRoleRepo.find.mockResolvedValue([
        { id: 'ur-1', userId: 'user-1', roleId: 'role-1', organizationId: 'org-1' } as UserRoleEntity,
      ]);
      userBranchRepo.find.mockResolvedValue([
        { branchId: 'branch-1' } as UserBranchAssignmentEntity,
      ]);

      const result = await service.getSession('jti-123');

      expect(result).toEqual({
        userId: 'user-1',
        organizationId: 'org-1',
        roles: ['admin'],
        branchIds: ['branch-1'],
        permissions: ['iam.role.read', 'iam.user.read'],
      });
      expect(rbacService.getUserPermissions).toHaveBeenCalledWith(
        'user-1',
        'org-1',
      );
    });

    it('returns null when session does not exist', async () => {
      sessionStore.getSession.mockResolvedValue(null);

      const result = await service.getSession('jti-unknown');

      expect(result).toBeNull();
    });
  });

  /**
   * Staff roles hold no `iam.*` key, so before this existed they could not
   * change their own password at all — the only path was an admin editing them.
   * bcryptjs is mocked module-wide in this file, so the assertions are about
   * which comparisons happen and what gets persisted, not about real hashing.
   */
  describe('changeOwnPassword', () => {
    const ORG = 'org-1';
    const USER = 'user-1';

    // The outer beforeEach re-stubs bcrypt.compare but leaves call history on
    // bcrypt.hash, so "was it hashed at all?" needs a clean slate per test.
    beforeEach(() => {
      (bcrypt.compare as jest.Mock).mockReset();
      (bcrypt.hash as jest.Mock).mockReset();
    });

    function arrangeUser(isActive = true) {
      userRepo.findOne.mockResolvedValue({
        id: USER,
        organizationId: ORG,
        isActive,
        passwordHash: 'current-hash',
      } as UserEntity);
    }

    it('rotates the hash when the current password matches', async () => {
      arrangeUser();
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(true) // currentPassword vs stored
        .mockResolvedValueOnce(false); // newPassword differs from stored
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

      await service.changeOwnPassword(USER, ORG, 'password123', 'Str0ngPwd!');

      expect(bcrypt.hash).toHaveBeenCalledWith('Str0ngPwd!', 10);
      expect(userRepo.save).toHaveBeenCalledTimes(1);
      const saved = userRepo.save.mock.calls[0][0] as UserEntity;
      expect(saved.passwordHash).toBe('new-hash');
    });

    it('rejects a wrong current password without touching the hash', async () => {
      arrangeUser();
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(
        service.changeOwnPassword(USER, ORG, 'wrong-one', 'Str0ngPwd!'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(userRepo.save).not.toHaveBeenCalled();
      expect(bcrypt.hash).not.toHaveBeenCalled();
    });

    it('rejects reusing the current password', async () => {
      arrangeUser();
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(true) // current matches
        .mockResolvedValueOnce(true); // new one matches too => unchanged

      await expect(
        service.changeOwnPassword(USER, ORG, 'password123', 'password123'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('refuses a deactivated account', async () => {
      arrangeUser(false);

      await expect(
        service.changeOwnPassword(USER, ORG, 'password123', 'Str0ngPwd!'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('scopes the lookup to the caller org', async () => {
      arrangeUser();
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await service.changeOwnPassword(USER, ORG, 'password123', 'Str0ngPwd!');

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { id: USER, organizationId: ORG },
      });
    });
  });
});
