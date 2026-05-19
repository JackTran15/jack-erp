import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
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
  let userRepo: jest.Mocked<Pick<Repository<UserEntity>, 'findOne' | 'update'>>;
  let userRoleRepo: jest.Mocked<Pick<Repository<UserRoleEntity>, 'find'>>;
  let roleRepo: jest.Mocked<Pick<Repository<RoleEntity>, 'createQueryBuilder'>>;
  let userBranchRepo: jest.Mocked<Pick<Repository<UserBranchAssignmentEntity>, 'find'>>;
  let sessionStore: jest.Mocked<Pick<SessionStore, 'createSession' | 'getSession' | 'revokeSession'>>;
  let rbacService: jest.Mocked<Pick<RbacService, 'getUserPermissions'>>;

  beforeEach(async () => {
    userRepo = { findOne: jest.fn(), update: jest.fn() };
    userRoleRepo = { find: jest.fn() };
    userBranchRepo = { find: jest.fn() };
    sessionStore = {
      createSession: jest.fn(),
      getSession: jest.fn(),
      revokeSession: jest.fn(),
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
});
