import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { SessionStore } from '../redis/session.store';
import { RbacService } from '../rbac/rbac.service';
import { UserEntity } from './user.entity';
import { UserRoleEntity } from './user-role.entity';
import { RoleEntity } from './role.entity';
import { UserBranchAssignmentEntity } from '../branch/user-branch-assignment.entity';
import type {
  JwtPayload,
  LoginResponse,
  RefreshResponse,
  SessionInfo,
} from '@erp/shared-interfaces';

const ACCESS_TOKEN_TTL = 15 * 60;
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly sessionStore: SessionStore,
    private readonly rbacService: RbacService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(UserBranchAssignmentEntity)
    private readonly userBranchRepo: Repository<UserBranchAssignmentEntity>,
  ) {
    this.jwtSecret = this.config.get<string>('JWT_SECRET', 'change-me-secret');
    this.jwtRefreshSecret = this.config.get<string>(
      'JWT_REFRESH_SECRET',
      'change-me-refresh-secret',
    );
  }

  async login(
    email: string,
    password: string,
    orgId: string,
  ): Promise<LoginResponse> {
    const user = await this.userRepo.findOne({
      where: { email, organizationId: orgId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const session = await this.buildSessionInfo(user.id, orgId);
    const { roles, branchIds } = session;
    const jti = uuidv4();

    await this.sessionStore.createSession(
      jti,
      {
        userId: user.id,
        organizationId: orgId,
        branchIds,
        roles,
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL,
      },
      REFRESH_TOKEN_TTL,
    );

    const accessToken = this.signAccessToken({
      userId: user.id,
      organizationId: orgId,
      roles,
      branchIds,
      jti,
    });

    const refreshToken = this.signRefreshToken({ jti, userId: user.id });

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    this.logger.log(`User ${user.id} logged in (org=${orgId})`);

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL,
      session,
    };
  }

  async refresh(refreshToken: string): Promise<RefreshResponse> {
    let decoded: { jti: string; userId: string };
    try {
      decoded = jwt.verify(refreshToken, this.jwtRefreshSecret) as any;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.sessionStore.getSession(decoded.jti);
    if (!session) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    const roles = await this.resolveUserRoles(
      session.userId,
      session.organizationId,
    );
    const branchIds = await this.resolveUserBranches(
      session.userId,
      session.organizationId,
    );

    await this.sessionStore.revokeSession(decoded.jti);

    const newJti = uuidv4();
    await this.sessionStore.createSession(
      newJti,
      {
        userId: session.userId,
        organizationId: session.organizationId,
        branchIds,
        roles,
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL,
      },
      REFRESH_TOKEN_TTL,
    );

    const newAccessToken = this.signAccessToken({
      userId: session.userId,
      organizationId: session.organizationId,
      roles,
      branchIds,
      jti: newJti,
    });

    const newRefreshToken = this.signRefreshToken({
      jti: newJti,
      userId: session.userId,
    });

    this.logger.debug(`Token rotated for user ${session.userId}`);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: ACCESS_TOKEN_TTL,
    };
  }

  async logout(jti: string): Promise<void> {
    await this.sessionStore.revokeSession(jti);
    this.logger.debug(`Session ${jti} revoked`);
  }

  async getSession(jti: string): Promise<SessionInfo | null> {
    const session = await this.sessionStore.getSession(jti);
    if (!session) return null;
    return this.buildSessionInfo(session.userId, session.organizationId);
  }

  private async buildSessionInfo(
    userId: string,
    organizationId: string,
  ): Promise<SessionInfo> {
    const [roles, branchIds, permissions] = await Promise.all([
      this.resolveUserRoles(userId, organizationId),
      this.resolveUserBranches(userId, organizationId),
      this.rbacService.getUserPermissions(userId, organizationId),
    ]);
    return { userId, organizationId, roles, branchIds, permissions };
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: ACCESS_TOKEN_TTL });
  }

  private signRefreshToken(payload: {
    jti: string;
    userId: string;
  }): string {
    return jwt.sign(payload, this.jwtRefreshSecret, {
      expiresIn: REFRESH_TOKEN_TTL,
    });
  }

  private async resolveUserRoles(
    userId: string,
    orgId: string,
  ): Promise<string[]> {
    const userRoles = await this.userRoleRepo.find({
      where: { userId, organizationId: orgId },
    });
    if (userRoles.length === 0) return [];

    const roleIds = userRoles.map((ur) => ur.roleId);
    const roles = await this.roleRepo
      .createQueryBuilder('role')
      .where('role.id IN (:...roleIds)', { roleIds })
      .getMany();

    return roles.map((r) => r.name);
  }

  private async resolveUserBranches(
    userId: string,
    orgId: string,
  ): Promise<string[]> {
    const assignments = await this.userBranchRepo.find({
      where: { userId, organizationId: orgId },
    });
    return assignments.map((a) => a.branchId);
  }
}
