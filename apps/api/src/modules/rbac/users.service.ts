import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, ILike } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  PaginatedResponse,
  UserSummary,
  UserDetail,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { UserEntity } from '../auth/user.entity';
import { RoleEntity } from '../auth/role.entity';
import { UserRoleEntity } from '../auth/user-role.entity';
import { UserBranchAssignmentEntity } from '../branch/user-branch-assignment.entity';
import { BranchEntity } from '../branch/branch.entity';
import { RbacService } from './rbac.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const BCRYPT_COST = 10;

export interface UserListParams {
  page: number;
  pageSize: number;
  search?: string;
  isActive?: boolean;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
    @InjectRepository(UserBranchAssignmentEntity)
    private readonly userBranchRepo: Repository<UserBranchAssignmentEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    private readonly rbacService: RbacService,
    private readonly dataSource: DataSource,
  ) {}

  async list(
    query: UserListParams,
    actor: ActorContext,
  ): Promise<PaginatedResponse<UserSummary>> {
    const where: Record<string, unknown> = {
      organizationId: actor.organizationId,
    };
    if (typeof query.isActive === 'boolean') {
      where.isActive = query.isActive;
    }

    const baseFind = {
      where: query.search
        ? [
            { ...where, email: ILike(`%${query.search}%`) },
            { ...where, firstName: ILike(`%${query.search}%`) },
            { ...where, lastName: ILike(`%${query.search}%`) },
          ]
        : where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: { createdAt: 'DESC' as const },
    };

    const [rows, total] = await this.userRepo.findAndCount(baseFind);

    return {
      data: rows.map((u) => this.toView(u)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findById(id: string, actor: ActorContext): Promise<UserDetail> {
    const user = await this.userRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    const [roles, branches] = await Promise.all([
      this.userRoleRepo.find({
        where: { userId: id, organizationId: actor.organizationId },
      }),
      this.userBranchRepo.find({
        where: { userId: id, organizationId: actor.organizationId },
      }),
    ]);
    return {
      ...this.toView(user),
      roleIds: roles.map((r) => r.roleId),
      branchIds: branches.map((b) => b.branchId),
    };
  }

  async create(
    dto: CreateUserDto,
    actor: ActorContext,
  ): Promise<UserDetail> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existing = await this.userRepo.findOne({
      where: { email: normalizedEmail, organizationId: actor.organizationId },
    });
    if (existing) {
      throw new ConflictException(
        `User with email ${normalizedEmail} already exists in this organization`,
      );
    }

    if (dto.roleIds?.length) {
      await this.assertRolesExist(dto.roleIds, actor.organizationId);
    }
    if (dto.branchIds?.length) {
      await this.assertBranchesExist(dto.branchIds, actor.organizationId);
    }

    const passwordHash = await bcrypt.hash(dto.temporaryPassword, BCRYPT_COST);

    const created = await this.dataSource.transaction(async (manager) => {
      const user = manager.create(UserEntity, {
        organizationId: actor.organizationId,
        email: normalizedEmail,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        isActive: true,
        lastLoginAt: null,
      });
      const savedUser = await manager.save(UserEntity, user);

      if (dto.roleIds?.length) {
        const roleRows = dto.roleIds.map((roleId) =>
          manager.create(UserRoleEntity, {
            userId: savedUser.id,
            roleId,
            organizationId: actor.organizationId,
          }),
        );
        await manager.save(UserRoleEntity, roleRows);
      }

      if (dto.branchIds?.length) {
        const branchRows = dto.branchIds.map((branchId) =>
          manager.create(UserBranchAssignmentEntity, {
            userId: savedUser.id,
            branchId,
            organizationId: actor.organizationId,
            assignedBy: actor.userId,
          }),
        );
        await manager.save(UserBranchAssignmentEntity, branchRows);
      }

      return savedUser;
    });

    await this.rbacService.invalidateUserPermissions(
      created.id,
      actor.organizationId,
    );

    this.logger.log(
      `Created user ${created.id} (email=${normalizedEmail}, org=${actor.organizationId})`,
    );

    return this.findById(created.id, actor);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: ActorContext,
  ): Promise<UserDetail> {
    const user = await this.userRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    if (dto.firstName !== undefined) user.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) user.lastName = dto.lastName.trim();
    if (dto.isActive !== undefined) user.isActive = dto.isActive;

    await this.userRepo.save(user);

    if (dto.isActive === false) {
      await this.rbacService.invalidateUserPermissions(
        id,
        actor.organizationId,
      );
    }

    return this.findById(id, actor);
  }

  async resetPassword(
    id: string,
    dto: ResetPasswordDto,
    actor: ActorContext,
  ): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    user.passwordHash = await bcrypt.hash(
      dto.newTemporaryPassword,
      BCRYPT_COST,
    );
    await this.userRepo.save(user);

    this.logger.log(
      `Password reset for user ${id} by ${actor.userId} (org=${actor.organizationId})`,
    );
  }

  /** Soft delete: deactivates the account. The row is preserved to keep FK integrity with audit data. */
  async deactivate(id: string, actor: ActorContext): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    if (id === actor.userId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    if (!user.isActive) return;

    user.isActive = false;
    await this.userRepo.save(user);
    await this.rbacService.invalidateUserPermissions(
      id,
      actor.organizationId,
    );
  }

  async getRoleIds(id: string, actor: ActorContext): Promise<string[]> {
    await this.ensureUserExists(id, actor);
    const rows = await this.userRoleRepo.find({
      where: { userId: id, organizationId: actor.organizationId },
    });
    return rows.map((r) => r.roleId);
  }

  async setRoles(
    id: string,
    roleIds: string[],
    actor: ActorContext,
  ): Promise<string[]> {
    await this.ensureUserExists(id, actor);
    if (roleIds.length) {
      await this.assertRolesExist(roleIds, actor.organizationId);
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(UserRoleEntity, {
        userId: id,
        organizationId: actor.organizationId,
      });
      if (roleIds.length) {
        const rows = roleIds.map((roleId) =>
          manager.create(UserRoleEntity, {
            userId: id,
            roleId,
            organizationId: actor.organizationId,
          }),
        );
        await manager.save(UserRoleEntity, rows);
      }
    });

    await this.rbacService.invalidateUserPermissions(
      id,
      actor.organizationId,
    );

    return roleIds;
  }

  async getBranchIds(id: string, actor: ActorContext): Promise<string[]> {
    await this.ensureUserExists(id, actor);
    const rows = await this.userBranchRepo.find({
      where: { userId: id, organizationId: actor.organizationId },
    });
    return rows.map((b) => b.branchId);
  }

  async setBranches(
    id: string,
    branchIds: string[],
    actor: ActorContext,
  ): Promise<string[]> {
    await this.ensureUserExists(id, actor);
    if (branchIds.length) {
      await this.assertBranchesExist(branchIds, actor.organizationId);
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(UserBranchAssignmentEntity, {
        userId: id,
        organizationId: actor.organizationId,
      });
      if (branchIds.length) {
        const rows = branchIds.map((branchId) =>
          manager.create(UserBranchAssignmentEntity, {
            userId: id,
            branchId,
            organizationId: actor.organizationId,
            assignedBy: actor.userId,
          }),
        );
        await manager.save(UserBranchAssignmentEntity, rows);
      }
    });

    return branchIds;
  }

  private async ensureUserExists(
    id: string,
    actor: ActorContext,
  ): Promise<void> {
    const exists = await this.userRepo.exist({
      where: { id, organizationId: actor.organizationId },
    });
    if (!exists) {
      throw new NotFoundException(`User ${id} not found`);
    }
  }

  private async assertRolesExist(
    roleIds: string[],
    organizationId: string,
  ): Promise<void> {
    const found = await this.roleRepo.find({
      where: { id: In(roleIds), organizationId },
    });
    if (found.length !== roleIds.length) {
      const foundIds = new Set(found.map((r) => r.id));
      const missing = roleIds.filter((rid) => !foundIds.has(rid));
      throw new BadRequestException(
        `Roles not found in this organization: ${missing.join(', ')}`,
      );
    }
  }

  private async assertBranchesExist(
    branchIds: string[],
    organizationId: string,
  ): Promise<void> {
    const found = await this.branchRepo.find({
      where: { id: In(branchIds), organizationId },
    });
    if (found.length !== branchIds.length) {
      const foundIds = new Set(found.map((b) => b.id));
      const missing = branchIds.filter((bid) => !foundIds.has(bid));
      throw new BadRequestException(
        `Branches not found in this organization: ${missing.join(', ')}`,
      );
    }
  }

  private toView(u: UserEntity): UserSummary {
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    };
  }
}
