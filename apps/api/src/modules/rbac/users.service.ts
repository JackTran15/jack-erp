import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, In, Repository, ILike } from "typeorm";
import * as bcrypt from "bcryptjs";
import {
  PaginatedResponse,
  UserSummary,
  UserListItem,
  UserDetail,
  EmployeeProfileView,
  EmploymentStatus,
  EmployeeAccessMode,
  IAM_PERMISSION_KEYS,
} from "@erp/shared-interfaces";
import { ActorContext } from "../../common/decorators/actor-context.decorator";
import { UserEntity } from "../auth/user.entity";
import { RoleEntity } from "../auth/role.entity";
import { UserRoleEntity } from "../auth/user-role.entity";
import { UserBranchAssignmentEntity } from "../branch/user-branch-assignment.entity";
import { BranchEntity } from "../branch/branch.entity";
import { JobPositionEntity } from "../hr/job-position/job-position.entity";
import { EmployeeProfileEntity } from "./employee/employee-profile.entity";
import { EmployeeAddressEntity } from "./employee/employee-address.entity";
import { EmployeeEmergencyContactEntity } from "./employee/employee-emergency-contact.entity";
import { EmployeeAccessScheduleEntity } from "./employee/employee-access-schedule.entity";
import { RbacService } from "./rbac.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { EmployeeProfileDto } from "./dto/employee-profile.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

const BCRYPT_COST = 10;

/** Sentinel for "match nothing" — an empty `In([])` would match every row. */
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

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
    @InjectRepository(EmployeeProfileEntity)
    private readonly profileRepo: Repository<EmployeeProfileEntity>,
    private readonly rbacService: RbacService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * User ids the actor may see, or `null` for no restriction. Without
   * `iam.user.read.all` an actor sees the employees of their own branches plus
   * the accounts above them (chain managers / admins), which the list renders
   * read-only — see {@link UserListItem.canEdit}.
   */
  async visibleUserIds(actor: ActorContext): Promise<string[] | null> {
    const keys = await this.rbacService.getUserPermissions(
      actor.userId,
      actor.organizationId,
    );
    if (keys.includes("iam.user.read.all")) return null;

    const elevatedRoles = await this.elevatedRoleIds(actor);
    const [branchPeers, elevatedUsers] = await Promise.all([
      this.userIdsInActorBranches(actor),
      this.userIdsWithRoles(elevatedRoles, actor.organizationId),
    ]);
    return [...new Set([...branchPeers, ...elevatedUsers])];
  }

  /** Ids of accounts the actor may not modify (they hold permissions the actor lacks). */
  async unmanageableUserIds(actor: ActorContext): Promise<Set<string>> {
    const elevated = await this.userIdsWithRoles(
      await this.elevatedRoleIds(actor),
      actor.organizationId,
    );
    elevated.delete(actor.userId);
    return elevated;
  }

  async list(
    query: UserListParams,
    actor: ActorContext,
  ): Promise<PaginatedResponse<UserListItem>> {
    const where: Record<string, unknown> = {
      organizationId: actor.organizationId,
    };
    if (typeof query.isActive === "boolean") {
      where.isActive = query.isActive;
    }
    const visibleIds = await this.visibleUserIds(actor);
    if (visibleIds !== null) {
      // Empty scope must match nothing, not everything.
      where.id = visibleIds.length ? In(visibleIds) : In([NIL_UUID]);
    }

    // Resolve users whose employee code matches the search term so the OR clause
    // below can match on code in addition to email/firstName/lastName.
    let codeMatchedUserIds: string[] = [];
    if (query.search) {
      const matches = await this.profileRepo.find({
        where: {
          organizationId: actor.organizationId,
          code: ILike(`%${query.search}%`),
        },
        select: { id: true, userId: true },
      });
      codeMatchedUserIds = matches.map((m) => m.userId);
      // That branch sets its own `id`, overwriting the scope clause spread in
      // beside it — intersect here so a code search cannot reach another branch.
      if (visibleIds !== null) {
        const visible = new Set(visibleIds);
        codeMatchedUserIds = codeMatchedUserIds.filter((id) => visible.has(id));
      }
    }

    const baseFind = {
      where: query.search
        ? [
            { ...where, email: ILike(`%${query.search}%`) },
            { ...where, firstName: ILike(`%${query.search}%`) },
            { ...where, lastName: ILike(`%${query.search}%`) },
            ...(codeMatchedUserIds.length
              ? [{ ...where, id: In(codeMatchedUserIds) }]
              : []),
          ]
        : where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: { createdAt: "DESC" as const },
    };

    const [rows, total] = await this.userRepo.findAndCount(baseFind);

    return {
      data: await this.toListItems(rows, actor),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * Batch-loads employee profiles (with job position) for the given user rows and
   * maps them to `UserListItem`. Shared by `list()` and the v2 employee search so
   * both produce a byte-identical row shape. Single profile query — no N+1.
   */
  async toListItems(
    rows: UserEntity[],
    actor: ActorContext,
  ): Promise<UserListItem[]> {
    const [profiles, unmanageable] = await Promise.all([
      rows.length
        ? this.profileRepo.find({
            where: {
              userId: In(rows.map((u) => u.id)),
              organizationId: actor.organizationId,
            },
            relations: ["jobPosition"],
          })
        : Promise.resolve([]),
      this.unmanageableUserIds(actor),
    ]);
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
    return rows.map((u) => ({
      ...this.toListItem(u, profileByUser.get(u.id)),
      canEdit: !unmanageable.has(u.id),
    }));
  }

  async findById(id: string, actor: ActorContext): Promise<UserDetail> {
    // Out-of-scope accounts read as non-existent rather than forbidden, so the
    // endpoint does not confirm who works at another branch.
    const visibleIds = await this.visibleUserIds(actor);
    if (visibleIds !== null && !visibleIds.includes(id)) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return this.buildUserDetail(id, actor);
  }

  /**
   * Detail without the visibility check — for callers that just wrote the row
   * (create/update), where a freshly created account may not be in the actor's
   * branch scope yet and must still be returned.
   */
  private async buildUserDetail(
    id: string,
    actor: ActorContext,
  ): Promise<UserDetail> {
    const user = await this.userRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    const [roles, branches, profile] = await Promise.all([
      this.userRoleRepo.find({
        where: { userId: id, organizationId: actor.organizationId },
      }),
      this.userBranchRepo.find({
        where: { userId: id, organizationId: actor.organizationId },
      }),
      this.profileRepo.findOne({
        where: { userId: id, organizationId: actor.organizationId },
        relations: [
          "jobPosition",
          "addresses",
          "emergencyContact",
          "accessSchedule",
        ],
      }),
    ]);
    return {
      ...this.toView(user, profile),
      roleIds: roles.map((r) => r.roleId),
      branchIds: branches.map((b) => b.branchId),
      profile: profile ? this.toProfileView(profile) : null,
      canEdit: !(await this.unmanageableUserIds(actor)).has(id),
    };
  }

  /**
   * `permissions` lets a client gate UI on a permission key instead of matching
   * role display names — role names are org-editable free text, permission keys
   * are not. Resolved through the same cached path the guards use, so it always
   * agrees with what the server will actually allow.
   */
  async getMe(actor: ActorContext): Promise<
    UserDetail & {
      roles: { id: string; name: string }[];
      permissions: string[];
    }
  > {
    const [detail, roles, permissions] = await Promise.all([
      this.findById(actor.userId, actor),
      this.roleRepo
        .createQueryBuilder('role')
        .innerJoin(UserRoleEntity, 'ur', 'ur.role_id = role.id AND ur.user_id = :userId AND ur.organization_id = :orgId', {
          userId: actor.userId,
          orgId: actor.organizationId,
        })
        .select(['role.id', 'role.name'])
        .getMany(),
      this.rbacService.getUserPermissions(actor.userId, actor.organizationId),
    ]);
    return { ...detail, roles, permissions };
  }

  async create(dto: CreateUserDto, actor: ActorContext): Promise<UserDetail> {
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
      await this.assertCanGrantRoles(dto.roleIds, actor);
    }
    if (dto.branchIds?.length) {
      await this.assertBranchesExist(dto.branchIds, actor.organizationId);
      await this.assertBranchesInActorScope(dto.branchIds, actor);
    }

    const passwordHash = await bcrypt.hash(dto.temporaryPassword, BCRYPT_COST);

    const created = await this.dataSource.transaction(async (manager) => {
      const user = manager.create(UserEntity, {
        organizationId: actor.organizationId,
        email: normalizedEmail,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim() ?? "",
        isActive: dto.isActive ?? true,
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

      if (dto.profile) {
        await this.upsertProfile(manager, savedUser.id, dto.profile, actor);
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

    return this.buildUserDetail(created.id, actor);
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
    await this.assertCanManageUser(id, actor);

    await this.dataSource.transaction(async (manager) => {
      if (dto.firstName !== undefined) user.firstName = dto.firstName.trim();
      if (dto.lastName !== undefined) user.lastName = dto.lastName.trim();
      if (dto.isActive !== undefined) user.isActive = dto.isActive;

      await manager.save(UserEntity, user);

      if (dto.profile) {
        await this.upsertProfile(manager, id, dto.profile, actor);
      }
    });

    if (dto.isActive === false) {
      await this.rbacService.invalidateUserPermissions(
        id,
        actor.organizationId,
      );
    }

    return this.buildUserDetail(id, actor);
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
    await this.assertCanManageUser(id, actor);

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
      throw new BadRequestException("You cannot deactivate your own account");
    }
    await this.assertCanManageUser(id, actor);
    if (!user.isActive) return;

    user.isActive = false;
    await this.userRepo.save(user);
    await this.rbacService.invalidateUserPermissions(id, actor.organizationId);
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
    await this.assertCanManageUser(id, actor);
    if (roleIds.length) {
      await this.assertRolesExist(roleIds, actor.organizationId);
      await this.assertCanGrantRoles(roleIds, actor);
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

    await this.rbacService.invalidateUserPermissions(id, actor.organizationId);

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
    await this.assertCanManageUser(id, actor);
    if (branchIds.length) {
      await this.assertBranchesExist(branchIds, actor.organizationId);
      await this.assertBranchesInActorScope(branchIds, actor);
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
        `Roles not found in this organization: ${missing.join(", ")}`,
      );
    }
  }

  /**
   * You cannot hand out a permission you do not hold yourself. Keeps the flat
   * role model safe without hardcoding a role hierarchy: a branch manager can
   * grant Nhân viên (a subset of their own keys) but never Quản trị hệ thống.
   */
  private async assertCanGrantRoles(
    roleIds: string[],
    actor: ActorContext,
  ): Promise<void> {
    const grantable = await this.rbacService.getGrantableRoleIds(
      actor.userId,
      actor.organizationId,
      roleIds,
    );
    const rejected = roleIds.find((id) => !grantable.has(id));
    if (!rejected) return;

    // Only on the rejection path: name the offending keys for the message.
    const [actorKeys, keysByRole, role] = await Promise.all([
      this.rbacService.getUserPermissions(actor.userId, actor.organizationId),
      this.rbacService.getRolePermissionKeys([rejected]),
      this.roleRepo.findOne({ where: { id: rejected } }),
    ]);
    const actorSet = new Set(actorKeys);
    const excess = (keysByRole.get(rejected) ?? []).filter(
      (key) => !actorSet.has(key),
    );
    this.logger.warn(
      `User ${actor.userId} tried to grant role ${rejected} with ${excess.length} permission(s) they lack: ${excess.join(", ")}`,
    );
    throw new ForbiddenException(
      `Cannot grant role "${role?.name ?? rejected}": it includes ${excess.length} permission(s) you do not have`,
    );
  }

  /**
   * Role ids in the org that grant at least one permission the actor lacks —
   * i.e. accounts "above" the actor. Computed per role (a handful) rather than
   * per user, so it stays a constant two queries no matter how many employees
   * the organization has.
   */
  private async elevatedRoleIds(actor: ActorContext): Promise<Set<string>> {
    const roles = await this.roleRepo.find({
      where: { organizationId: actor.organizationId },
      select: { id: true },
    });
    const roleIds = roles.map((r) => r.id);
    const grantable = await this.rbacService.getGrantableRoleIds(
      actor.userId,
      actor.organizationId,
      roleIds,
    );
    return new Set(roleIds.filter((id) => !grantable.has(id)));
  }

  /** User ids in the org holding at least one of the given roles. */
  private async userIdsWithRoles(
    roleIds: Set<string>,
    organizationId: string,
  ): Promise<Set<string>> {
    if (roleIds.size === 0) return new Set();
    const rows = await this.userRoleRepo.find({
      where: { roleId: In([...roleIds]), organizationId },
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  }

  /** Branch ids the actor is assigned to, read live rather than from the JWT. */
  private async actorBranchIds(actor: ActorContext): Promise<Set<string>> {
    const rows = await this.userBranchRepo.find({
      where: { userId: actor.userId, organizationId: actor.organizationId },
      select: { branchId: true },
    });
    return new Set(rows.map((r) => r.branchId));
  }

  /** User ids sharing at least one branch with the actor. */
  private async userIdsInActorBranches(
    actor: ActorContext,
  ): Promise<Set<string>> {
    const branchIds = [...(await this.actorBranchIds(actor))];
    if (branchIds.length === 0) return new Set([actor.userId]);
    const rows = await this.userBranchRepo.find({
      where: { branchId: In(branchIds), organizationId: actor.organizationId },
      select: { userId: true },
    });
    return new Set([...rows.map((r) => r.userId), actor.userId]);
  }

  /**
   * You cannot act on an account holding permissions you do not hold yourself —
   * the same rule as {@link assertCanGrantRoles}, applied to the target account
   * rather than to a role. Without it, `iam.user.write` let a branch manager
   * reset the password of (and therefore take over) a Quản lý tổng or Quản trị
   * hệ thống account. Acting on your own account is always allowed.
   */
  private async assertCanManageUser(
    targetId: string,
    actor: ActorContext,
  ): Promise<void> {
    if (targetId === actor.userId) return;

    // Out of scope is out of reach: writes must respect the same branch scope as
    // reads, or knowing an id would be enough to edit another branch's staff.
    const visibleIds = await this.visibleUserIds(actor);
    if (visibleIds !== null && !visibleIds.includes(targetId)) {
      throw new NotFoundException(`User ${targetId} not found`);
    }

    const [actorKeys, targetKeys] = await Promise.all([
      this.rbacService.getUserPermissions(actor.userId, actor.organizationId),
      this.rbacService.getUserPermissions(targetId, actor.organizationId),
    ]);
    const actorSet = new Set(actorKeys);
    const excess = targetKeys.filter((key) => !actorSet.has(key));
    if (excess.length === 0) return;

    this.logger.warn(
      `User ${actor.userId} tried to manage user ${targetId} holding ${excess.length} permission(s) they lack: ${excess.join(", ")}`,
    );
    throw new ForbiddenException(
      `Cannot manage this account: it holds ${excess.length} permission(s) you do not have`,
    );
  }

  /**
   * Branches the actor may hand out. Without `iam.user.branches.write.all` an
   * actor can only staff the branches they themselves belong to — otherwise a
   * branch manager holding `iam.user.branches.write` could create an employee
   * straight into any branch of the chain.
   *
   * Reads the assignments from the database rather than `actor.branchIds`: that
   * list is baked into a 15-minute access token, so it can outlive a
   * reassignment.
   */
  private async assertBranchesInActorScope(
    branchIds: string[],
    actor: ActorContext,
  ): Promise<void> {
    const unrestricted = await this.rbacService.hasPermission(
      actor.userId,
      actor.organizationId,
      IAM_PERMISSION_KEYS.USER_BRANCHES_WRITE_ALL,
    );
    if (unrestricted) return;

    const allowed = await this.actorBranchIds(actor);
    const rejected = branchIds.filter((bid) => !allowed.has(bid));
    if (rejected.length === 0) return;

    const branches = await this.branchRepo.find({
      where: { id: In(rejected), organizationId: actor.organizationId },
    });
    const names = branches.map((b) => b.name);
    this.logger.warn(
      `User ${actor.userId} tried to assign ${rejected.length} branch(es) outside their own scope: ${rejected.join(", ")}`,
    );
    throw new ForbiddenException(
      `Cannot assign branches you do not belong to: ${(names.length ? names : rejected).join(", ")}`,
    );
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
        `Branches not found in this organization: ${missing.join(", ")}`,
      );
    }
  }

  /**
   * Inserts or updates the employee HR profile for a user inside an open transaction.
   * Provided child collections (addresses / accessSchedule / emergencyContact) fully
   * replace the existing rows; collections left undefined are untouched.
   */
  private async upsertProfile(
    manager: EntityManager,
    userId: string,
    dto: EmployeeProfileDto,
    actor: ActorContext,
  ): Promise<void> {
    if (dto.jobPositionId) {
      const jobPosition = await manager.findOne(JobPositionEntity, {
        where: { id: dto.jobPositionId, organizationId: actor.organizationId },
      });
      if (!jobPosition) {
        throw new BadRequestException(
          `Job position ${dto.jobPositionId} not found in this organization`,
        );
      }
    }

    const codeOwner = await manager.findOne(EmployeeProfileEntity, {
      where: { code: dto.code, organizationId: actor.organizationId },
    });
    if (codeOwner && codeOwner.userId !== userId) {
      throw new ConflictException(
        `Employee code ${dto.code} already exists in this organization`,
      );
    }

    const fields = {
      code: dto.code,
      mobile: dto.mobile ?? null,
      homePhone: dto.homePhone ?? null,
      idCardNumber: dto.idCardNumber ?? null,
      idCardIssuePlace: dto.idCardIssuePlace ?? null,
      idCardIssueDate: this.toDateOnly(dto.idCardIssueDate),
      birthDate: this.toDateOnly(dto.birthDate),
      gender: dto.gender ?? null,
      maritalStatus: dto.maritalStatus ?? null,
      employmentStatus: dto.employmentStatus ?? EmploymentStatus.OFFICIAL,
      photoUrl: dto.photoUrl ?? null,
      jobPositionId: dto.jobPositionId ?? null,
      probationDate: this.toDateOnly(dto.probationDate),
      officialDate: this.toDateOnly(dto.officialDate),
      salary: dto.salary ?? 0,
      deposit: dto.deposit ?? 0,
      originalDocumentsNote: dto.originalDocumentsNote ?? null,
      accessMode: dto.accessMode ?? EmployeeAccessMode.FREE,
    };

    const existing = await manager.findOne(EmployeeProfileEntity, {
      where: { userId, organizationId: actor.organizationId },
    });

    let profile: EmployeeProfileEntity;
    if (existing) {
      manager.merge(
        EmployeeProfileEntity,
        existing,
        fields as Partial<EmployeeProfileEntity>,
      );
      profile = await manager.save(EmployeeProfileEntity, existing);
    } else {
      profile = await manager.save(
        EmployeeProfileEntity,
        manager.create(EmployeeProfileEntity, {
          ...fields,
          userId,
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          createdBy: actor.userId,
        }),
      );
    }

    const profileId = profile.id;
    const audit = {
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
    };

    if (dto.addresses !== undefined) {
      await manager.delete(EmployeeAddressEntity, {
        employeeProfileId: profileId,
      });
      if (dto.addresses.length) {
        const rows = dto.addresses.map((a) =>
          manager.create(EmployeeAddressEntity, {
            employeeProfileId: profileId,
            type: a.type,
            address: a.address ?? null,
            country: a.country ?? null,
            province: a.province ?? null,
            district: a.district ?? null,
            ward: a.ward ?? null,
            ...audit,
          }),
        );
        await manager.save(EmployeeAddressEntity, rows);
      }
    }

    if (dto.emergencyContact !== undefined) {
      await manager.delete(EmployeeEmergencyContactEntity, {
        employeeProfileId: profileId,
      });
      const e = dto.emergencyContact;
      const hasData =
        e.fullName ||
        e.relationship ||
        e.mobile ||
        e.homePhone ||
        e.email ||
        e.address;
      if (hasData) {
        await manager.save(
          EmployeeEmergencyContactEntity,
          manager.create(EmployeeEmergencyContactEntity, {
            employeeProfileId: profileId,
            fullName: e.fullName ?? null,
            relationship: e.relationship ?? null,
            mobile: e.mobile ?? null,
            homePhone: e.homePhone ?? null,
            email: e.email ?? null,
            address: e.address ?? null,
            ...audit,
          }),
        );
      }
    }

    if (dto.accessSchedule !== undefined) {
      await manager.delete(EmployeeAccessScheduleEntity, {
        employeeProfileId: profileId,
      });
      if (dto.accessSchedule.length) {
        const rows = dto.accessSchedule.map((s) =>
          manager.create(EmployeeAccessScheduleEntity, {
            employeeProfileId: profileId,
            weekday: s.weekday,
            enabled: s.enabled,
            startTime: s.startTime,
            endTime: s.endTime,
            ...audit,
          }),
        );
        await manager.save(EmployeeAccessScheduleEntity, rows);
      }
    }
  }

  /** Normalizes an ISO date/datetime string to a plain `YYYY-MM-DD` for `date` columns. */
  private toDateOnly(value?: string | null): string | null {
    if (!value) return null;
    return value.slice(0, 10);
  }

  private toProfileView(p: EmployeeProfileEntity): EmployeeProfileView {
    const trimTime = (t: string): string =>
      typeof t === "string" && t.length >= 5 ? t.slice(0, 5) : t;
    return {
      code: p.code,
      mobile: p.mobile ?? null,
      homePhone: p.homePhone ?? null,
      idCardNumber: p.idCardNumber ?? null,
      idCardIssuePlace: p.idCardIssuePlace ?? null,
      idCardIssueDate: p.idCardIssueDate ?? null,
      birthDate: p.birthDate ?? null,
      gender: p.gender ?? null,
      maritalStatus: p.maritalStatus ?? null,
      employmentStatus: p.employmentStatus,
      photoUrl: p.photoUrl ?? null,
      jobPositionId: p.jobPositionId ?? null,
      jobPosition: p.jobPosition
        ? { id: p.jobPosition.id, name: p.jobPosition.name }
        : null,
      probationDate: p.probationDate ?? null,
      officialDate: p.officialDate ?? null,
      salary: Number(p.salary ?? 0),
      deposit: Number(p.deposit ?? 0),
      originalDocumentsNote: p.originalDocumentsNote ?? null,
      accessMode: p.accessMode,
      addresses: (p.addresses ?? []).map((a) => ({
        type: a.type,
        address: a.address ?? null,
        country: a.country ?? null,
        province: a.province ?? null,
        district: a.district ?? null,
        ward: a.ward ?? null,
      })),
      emergencyContact: p.emergencyContact
        ? {
            fullName: p.emergencyContact.fullName ?? null,
            relationship: p.emergencyContact.relationship ?? null,
            mobile: p.emergencyContact.mobile ?? null,
            homePhone: p.emergencyContact.homePhone ?? null,
            email: p.emergencyContact.email ?? null,
            address: p.emergencyContact.address ?? null,
          }
        : null,
      accessSchedule: (p.accessSchedule ?? []).map((s) => ({
        weekday: s.weekday,
        enabled: s.enabled,
        startTime: trimTime(s.startTime),
        endTime: trimTime(s.endTime),
      })),
    };
  }

  private toView(
    u: UserEntity,
    p: EmployeeProfileEntity | undefined | null,
  ): UserSummary {
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
      code: p?.code ?? null,
    };
  }

  private toListItem(
    u: UserEntity,
    p: EmployeeProfileEntity | undefined,
  ): UserListItem {
    return {
      ...this.toView(u, p),
      code: p?.code ?? null,
      profile: p
        ? {
            code: p.code,
            jobPosition: p.jobPosition
              ? { id: p.jobPosition.id, name: p.jobPosition.name }
              : null,
            photoUrl: p.photoUrl ?? null,
            mobile: p.mobile ?? null,
            employmentStatus: p.employmentStatus,
          }
        : null,
    };
  }
}
