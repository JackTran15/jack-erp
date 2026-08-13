import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { SessionStore } from '../redis/session.store';
import { HandoffStore } from './handoff.store';
import { RbacService } from '../rbac/rbac.service';
import { UserEntity } from './user.entity';
import { UserRoleEntity } from './user-role.entity';
import { RoleEntity } from './role.entity';
import { UserBranchAssignmentEntity } from '../branch/user-branch-assignment.entity';
import type {
  CreateHandoffResponse,
  ExchangeHandoffResponse,
  JwtPayload,
  LoginResponse,
  RefreshResponse,
  SessionInfo,
  SwitchBranchResponse,
} from '@erp/shared-interfaces';

const ACCESS_TOKEN_TTL = 15 * 60;
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;
/** Long enough for one tab-open round trip, short enough that a leaked URL is dead. */
const HANDOFF_CODE_TTL = 60;
/** Matches UsersService.BCRYPT_COST so both password paths cost the same. */
const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly sessionStore: SessionStore,
    private readonly handoffStore: HandoffStore,
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
    const branchId = branchIds[0];
    const jti = uuidv4();

    await this.sessionStore.createSession(
      jti,
      {
        userId: user.id,
        organizationId: orgId,
        branchIds,
        branchId,
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
      branchId,
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

    // Preserve the active branch across rotation; fall back if it is no longer assigned.
    const branchId =
      session.branchId && branchIds.includes(session.branchId)
        ? session.branchId
        : branchIds[0];

    await this.sessionStore.revokeSession(decoded.jti);

    const newJti = uuidv4();
    await this.sessionStore.createSession(
      newJti,
      {
        userId: session.userId,
        organizationId: session.organizationId,
        branchIds,
        branchId,
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
      branchId,
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

  async switchBranch(
    current: JwtPayload,
    branchId: string,
  ): Promise<SwitchBranchResponse> {
    const session = await this.buildSessionInfo(
      current.userId,
      current.organizationId,
    );
    const { roles, branchIds } = session;

    if (!branchIds.includes(branchId)) {
      throw new ForbiddenException('Branch not assigned to user');
    }

    await this.sessionStore.revokeSession(current.jti);

    const jti = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    await this.sessionStore.createSession(
      jti,
      {
        userId: current.userId,
        organizationId: current.organizationId,
        branchIds,
        branchId,
        roles,
        issuedAt: now,
        expiresAt: now + REFRESH_TOKEN_TTL,
      },
      REFRESH_TOKEN_TTL,
    );

    const accessToken = this.signAccessToken({
      userId: current.userId,
      organizationId: current.organizationId,
      roles,
      branchIds,
      branchId,
      jti,
    });

    const refreshToken = this.signRefreshToken({
      jti,
      userId: current.userId,
    });

    this.logger.log(
      `User ${current.userId} switched to branch ${branchId} (org=${current.organizationId})`,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL,
      session,
    };
  }

  /**
   * Mint a single-use code that lets the caller open a sibling SPA (backoffice →
   * POS) already signed in. The apps sit on different origins so they cannot
   * share `localStorage`, and handing over the refresh token would be worse than
   * useless: `refresh()` rotates and revokes the old jti, so the sending app
   * would log itself out. The code is exchanged for an independent session
   * instead.
   */
  async createHandoffCode(
    current: JwtPayload,
    branchId?: string,
  ): Promise<CreateHandoffResponse> {
    const target = branchId ?? current.branchId;
    if (target) {
      const branchIds = await this.resolveUserBranches(
        current.userId,
        current.organizationId,
      );
      if (!branchIds.includes(target)) {
        throw new ForbiddenException('Branch not assigned to user');
      }
    }

    const code = uuidv4();
    await this.handoffStore.issue(
      code,
      {
        userId: current.userId,
        organizationId: current.organizationId,
        branchId: target,
      },
      HANDOFF_CODE_TTL,
    );

    this.logger.log(
      `Handoff code issued for user ${current.userId} (org=${current.organizationId}, branch=${target ?? 'none'})`,
    );

    return { code, expiresIn: HANDOFF_CODE_TTL };
  }

  /**
   * Redeem a handoff code for a fresh session. Deliberately does not touch the
   * issuing session: each app keeps its own jti, so switching branch or logging
   * out on one does not sign the user out of the other.
   */
  async exchangeHandoffCode(code: string): Promise<ExchangeHandoffResponse> {
    const handoff = await this.handoffStore.consume(code);
    if (!handoff) {
      throw new UnauthorizedException('Invalid or expired handoff code');
    }

    const user = await this.userRepo.findOne({
      where: { id: handoff.userId, organizationId: handoff.organizationId },
    });
    if (!user || !user.isActive) {
      // Deactivated between issue and redeem — the code must not outlive access.
      throw new UnauthorizedException('Invalid credentials');
    }

    const session = await this.buildSessionInfo(
      user.id,
      handoff.organizationId,
    );
    const { roles, branchIds } = session;
    const branchId =
      handoff.branchId && branchIds.includes(handoff.branchId)
        ? handoff.branchId
        : branchIds[0];

    const jti = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    await this.sessionStore.createSession(
      jti,
      {
        userId: user.id,
        organizationId: handoff.organizationId,
        branchIds,
        branchId,
        roles,
        issuedAt: now,
        expiresAt: now + REFRESH_TOKEN_TTL,
      },
      REFRESH_TOKEN_TTL,
    );

    const accessToken = this.signAccessToken({
      userId: user.id,
      organizationId: handoff.organizationId,
      roles,
      branchIds,
      branchId,
      jti,
    });

    this.logger.log(
      `Handoff code redeemed by user ${user.id} (org=${handoff.organizationId}, branch=${branchId ?? 'none'})`,
    );

    return {
      accessToken,
      refreshToken: this.signRefreshToken({ jti, userId: user.id }),
      expiresIn: ACCESS_TOKEN_TTL,
      session,
    };
  }

  async logout(jti: string): Promise<void> {
    await this.sessionStore.revokeSession(jti);
    this.logger.debug(`Session ${jti} revoked`);
  }

  /**
   * Self-service password change. Deliberately not an `iam.*` permission: every
   * signed-in user owns their own credentials, and the admin path
   * (`POST /admin/users/:id/reset-password`) is a different operation on someone
   * else's account.
   *
   * `currentPassword` is required even though the caller is authenticated — a
   * stolen access token must not be enough to lock the owner out.
   */
  async changeOwnPassword(
    userId: string,
    organizationId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { id: userId, organizationId },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      // Same wording as login: do not tell a caller which half was wrong.
      throw new UnauthorizedException('Invalid credentials');
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException(
        'Mật khẩu mới phải khác mật khẩu hiện tại',
      );
    }

    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.userRepo.save(user);

    this.logger.log(`User ${userId} changed their own password`);
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
