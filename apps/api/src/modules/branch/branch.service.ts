import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import {
  BranchStatus,
  DocumentType,
  PaginationQuery,
  PaginatedResponse,
} from "@erp/shared-interfaces";
import { ActorContext } from "../../common/decorators/actor-context.decorator";
import { OrganizationService } from "../organization/organization.service";
import { DocumentNumberingService } from "../document-numbering/document-numbering.service";
import { BranchCashProvisioningService } from "../accounting/cash/branch-cash-provisioning.service";
import { BranchEntity } from "./branch.entity";
import { BranchStatusService } from "./branch-status.service";
import { RbacService } from "../rbac/rbac.service";
import { UserBranchAssignmentEntity } from "./user-branch-assignment.entity";
import { CreateBranchDto, UpdateBranchDto } from "./dto";
import { BranchDeactivationImpactDto } from "./dto/branch-deactivation-impact.dto";
import { StorageEntity } from "../inventory/location/storage.entity";
import { ShowroomEntity } from "../inventory/location/showroom.entity";
import { LocationEntity } from "../inventory/location/location.entity";
import { LocationType } from "@erp/shared-interfaces";

/** Reserved for User Root / General Manager — see database/seeds/org-role-permissions.ts. */
const BRANCH_LIFECYCLE_PERMISSION = "branch.archive";

@Injectable()
export class BranchService {
  private readonly logger = new Logger(BranchService.name);

  constructor(
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    @InjectRepository(UserBranchAssignmentEntity)
    private readonly assignmentRepo: Repository<UserBranchAssignmentEntity>,
    private readonly orgService: OrganizationService,
    private readonly branchCashProvisioning: BranchCashProvisioningService,
    private readonly docNumbering: DocumentNumberingService,
    private readonly branchStatus: BranchStatusService,
    private readonly rbac: RbacService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateBranchDto, actor: ActorContext): Promise<BranchEntity> {
    const existing = await this.branchRepo.findOne({
      where: { organizationId: actor.organizationId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `Branch "${dto.name}" already exists in this organization`,
      );
    }

    const code = dto.code?.trim();
    if (code) {
      const dupCode = await this.branchRepo.findOne({
        where: { organizationId: actor.organizationId, code },
      });
      if (dupCode) {
        throw new ConflictException(
          `Branch code "${code}" already exists in this organization`,
        );
      }
    }

    if (dto.parentBranchId) {
      const parent = await this.branchRepo.findOne({
        where: { id: dto.parentBranchId, organizationId: actor.organizationId },
      });
      if (!parent) {
        throw new BadRequestException(
          `Parent branch ${dto.parentBranchId} not found in this organization`,
        );
      }
    }

    const branchCount = await this.branchRepo.count({
      where: { organizationId: actor.organizationId },
    });
    const isMainBranch = branchCount === 0;

    // Issue the showroom storage code outside the transaction: the numbering
    // service runs its own SERIALIZABLE counter transaction.
    const showroomStorageCode = await this.docNumbering.generate(
      DocumentType.WAREHOUSE,
      actor.branchId,
      actor,
    );

    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(BranchEntity);
      const branch = await repo.save(
        repo.create({
          ...dto,
          organizationId: actor.organizationId,
          branchId: undefined,
          isMainBranch,
          status: BranchStatus.ACTIVE,
          createdBy: actor.userId,
        }),
      );

      await manager.save(
        manager.create(UserBranchAssignmentEntity, {
          userId: actor.userId,
          branchId: branch.id,
          organizationId: branch.organizationId,
          assignedBy: actor.userId,
        }),
      );

      // Each branch's default warehouse is its sales showroom ("Kho bán hàng").
      // The storage is the showroom's backing inventory (kept isMainStorage so
      // stock flows can still target it); it is hidden from the warehouses list.
      const showroomName = `${branch.name} - Showroom`;
      const storage = await manager.save(
        manager.create(StorageEntity, {
          name: showroomName,
          code: showroomStorageCode,
          isMainStorage: true,
          isDefaultReceiving: true,
          branchId: branch.id,
          organizationId: branch.organizationId,
          createdBy: actor.userId,
        }),
      );

      await manager.save(
        manager.create(ShowroomEntity, {
          name: showroomName,
          storageId: storage.id,
          branchId: branch.id,
          isMainShowroom: true,
          organizationId: branch.organizationId,
          createdBy: actor.userId,
        }),
      );

      // Dedicated "Mặc định" location so every POS-visible product is sellable
      // from the showroom without manual shelf assignment; the resolver falls
      // back to it and users relocate to a real shelf later. Idempotent via the
      // partial unique index UQ_locations_default_per_storage.
      await manager
        .createQueryBuilder()
        .insert()
        .into(LocationEntity)
        .values({
          code: "DEFAULT",
          name: "Mặc định",
          storageId: storage.id,
          type: LocationType.SHELF,
          isActive: true,
          isDefault: true,
          organizationId: branch.organizationId,
          branchId: branch.id,
          createdBy: actor.userId,
        })
        .orIgnore()
        .execute();

      return branch;
    });

    if (isMainBranch) {
      await this.orgService.setMainBranch(actor.organizationId, saved.id);
      this.logger.log(
        `Main branch created: ${saved.id} for org ${actor.organizationId}`,
      );
    }

    // Best-effort: cash-side failure must not roll back branch creation.
    try {
      await this.branchCashProvisioning.ensureBranchCashFund(
        actor.organizationId,
        saved.id,
        saved.name,
        actor.userId,
      );
    } catch (err) {
      this.logger.error(
        `Failed to provision cash fund for branch ${saved.id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    return saved;
  }

  async findById(id: string, actor: ActorContext): Promise<BranchEntity> {
    const branch = await this.branchRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch ${id} not found`);
    }
    return branch;
  }

  async findMainBranch(actor: ActorContext): Promise<BranchEntity> {
    const branch = await this.branchRepo.findOne({
      where: { organizationId: actor.organizationId, isMainBranch: true },
    });
    if (!branch) {
      throw new NotFoundException(
        `No main branch found for organization ${actor.organizationId}`,
      );
    }
    return branch;
  }

  /**
   * Every branch picker in both apps is fed from here, so it defaults to the
   * operating ones. `includeInactive` is the deliberate escape hatch for the
   * screens that must still reach a retired store — anything that needs to
   * *reopen* one, or to resolve a name on an old document.
   *
   * Note the branch-management list does NOT come through here: it uses the
   * generic CRUD endpoint, where the status filter is a UI default the user can
   * clear to "Tất cả". Filtering there server-side would strand a suspended
   * store with no way back.
   */
  async list(
    query: PaginationQuery & { branchId?: string; includeInactive?: boolean },
    actor: ActorContext,
  ): Promise<PaginatedResponse<BranchEntity>> {
    const where: Record<string, unknown> = {
      organizationId: actor.organizationId,
    };
    if (!query.includeInactive) {
      where.status = BranchStatus.ACTIVE;
    }
    if (query.branchId) {
      where.parentBranchId = query.branchId;
    }

    const [data, total] = await this.branchRepo.findAndCount({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: query.sortBy
        ? { [query.sortBy]: query.sortOrder ?? "asc" }
        : { createdAt: "DESC" },
    });

    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * `status` is pulled out of the payload rather than assigned with the rest:
   * a plain `Object.assign` would let a PATCH move the branch anywhere in its
   * lifecycle with no rules applied at all.
   *
   * The transition is validated *before* anything is written, and the whole
   * PATCH lands in a single save. Renaming the head office while ticking
   * "Ngừng hoạt động" must not leave the rename committed behind a 400.
   *
   * A status equal to the current one is a no-op rather than an error — the
   * branch form posts every field on every save, so re-saving without touching
   * the checkbox must not 400. `activate()` and `suspend()` are the explicit
   * verbs and do reject a redundant call.
   */
  async update(
    id: string,
    dto: UpdateBranchDto,
    actor: ActorContext,
  ): Promise<BranchEntity> {
    const { status, ...rest } = dto;
    const branch = await this.findById(id, actor);
    const previousStatus = branch.status;
    const movesStatus = status !== undefined && status !== branch.status;

    if (movesStatus) {
      await this.assertMayChangeStatus(actor);
      this.assertTransitionAllowed(branch, status as BranchStatus);
      branch.status = status as BranchStatus;
    }

    Object.assign(branch, rest);
    const saved = await this.branchRepo.save(branch);

    if (movesStatus) {
      await this.invalidateStatusCache(actor.organizationId);
      this.logger.log(
        `Branch status changed via update: ${id} org=${actor.organizationId} actor=${actor.userId} ${previousStatus} -> ${saved.status}`,
      );
    }

    return saved;
  }

  /**
   * Retiring a store is a different act from editing one, and the two arrive on
   * the same payload. `PATCH /branches/:id` carries no permission decorator and
   * `PATCH /admin/entities/branches/records/:id` is gated only by
   * `branch.write` — which a Branch Manager holds while being deliberately
   * withheld `branch.archive` ("a branch manager runs a branch, they do not
   * retire one").
   *
   * This sits in the service rather than on either route because both routes
   * converge here: guarding one controller leaves the other open. The lifecycle
   * verbs call it too — their `@RequirePermission` decorator sits a layer
   * further from the write, so a future non-HTTP caller would slip past it.
   */
  private async assertMayChangeStatus(actor: ActorContext): Promise<void> {
    const allowed = await this.rbac.hasPermission(
      actor.userId,
      actor.organizationId,
      BRANCH_LIFECYCLE_PERMISSION,
    );
    if (!allowed) {
      throw new ForbiddenException(
        `Missing required permission: ${BRANCH_LIFECYCLE_PERMISSION}`,
      );
    }
  }

  /**
   * Every lifecycle rule, in one place, throwing before any write happens.
   *
   * ARCHIVED is refused on purpose: retiring a branch has its own sub-branch
   * checks and its own endpoint, and letting a PATCH reach it would be a way
   * around the permission that guards that endpoint.
   */
  private assertTransitionAllowed(
    branch: BranchEntity,
    target: BranchStatus,
  ): void {
    switch (target) {
      case BranchStatus.ARCHIVED:
        throw new BadRequestException(
          "Lưu trữ cửa hàng phải thực hiện qua chức năng lưu trữ riêng.",
        );

      case BranchStatus.SUSPENDED:
        // Checked before the status test so closing the head office reports
        // the real reason rather than "branch is not currently operating".
        if (branch.isMainBranch) {
          throw new BadRequestException(
            "Không thể ngừng hoạt động cửa hàng chính của tổ chức.",
          );
        }
        if (branch.status !== BranchStatus.ACTIVE) {
          throw new BadRequestException(
            "Cửa hàng không ở trạng thái đang hoạt động.",
          );
        }
        return;

      case BranchStatus.ACTIVE:
        if (branch.status === BranchStatus.ARCHIVED) {
          throw new BadRequestException(
            "Cửa hàng đã đóng vĩnh viễn, không thể mở lại.",
          );
        }
        if (branch.status === BranchStatus.ACTIVE) {
          throw new BadRequestException("Cửa hàng đang hoạt động.");
        }
        return;

      // Default-deny. An unknown target can only arrive from an unvalidated
      // body, and a fourth enum member added later must be opted into here
      // rather than becoming legal from every state by omission.
      default:
        throw new BadRequestException("Trạng thái cửa hàng không hợp lệ.");
    }
  }

  /**
   * The status column is already committed at this point. Redis being down is
   * not a reason to report failure for a change that did happen — the caller
   * would retry and hit "already suspended". The 30s TTL on the cached set is
   * the backstop, which is the whole reason it is 30s and not 300s.
   */
  private async invalidateStatusCache(organizationId: string): Promise<void> {
    try {
      await this.branchStatus.invalidate(organizationId);
    } catch (err) {
      this.logger.error(
        `Branch status cache invalidation failed for org ${organizationId} — falling back to the cache TTL`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  /**
   * What is still outstanding at a branch, for the confirmation dialog.
   *
   * Advisory by design: the product decision is to warn, never to block, so
   * everything here lands in `warnings`. `blockers` exists for the one rule
   * that genuinely refuses — the head office — and is a list so the next rule
   * does not change the response shape.
   *
   * The `status` literals below were read from `pg_enum` rather than guessed:
   * a wrong literal still runs, still returns 0, and the dialog would then
   * always claim nothing is outstanding.
   */
  async deactivationImpact(
    id: string,
    actor: ActorContext,
  ): Promise<BranchDeactivationImpactDto> {
    const branch = await this.findById(id, actor);
    const org = actor.organizationId;

    const counts = await Promise.all([
      // No `::text` on any column below: these tables store organization_id and
      // branch_id as varchar, so the parameters compare directly. Casting the
      // column would make the (organization_id, branch_id) btree unusable and
      // seq-scan stock_balances every time the checkbox is ticked.
      this.countRows(
        "stock_balances",
        "organization_id = $1 AND branch_id = $2 AND COALESCE(quantity, 0) <> 0",
        [org, id],
      ),
      this.countRows(
        "transfer_orders",
        `organization_id = $1
         AND (branch_id = $2 OR source_branch_id = $2 OR destination_branch_id = $2)
         AND status IN ('DRAFT', 'IN_PROGRESS')`,
        [org, id],
      ),
      this.countRows(
        "pos_sessions",
        `organization_id = $1 AND branch_id = $2
         AND status IN ('OPEN', 'ACTIVE_SALES', 'CLOSING')`,
        [org, id],
      ),
      this.countRows(
        "receivables",
        `organization_id = $1 AND branch_id = $2
         AND status IN ('POSTED', 'PARTIALLY_SETTLED')`,
        [org, id],
      ),
      // Employees who would be left with no branch at all once this one goes.
      // This table is the exception: its columns really are uuid, so the cast
      // goes on the parameter rather than the column.
      this.countRows(
        "user_branch_assignments a",
        `a.organization_id = $1::uuid AND a.branch_id = $2::uuid
         AND NOT EXISTS (
           SELECT 1 FROM user_branch_assignments o
           WHERE o.user_id = a.user_id
             AND o.organization_id = a.organization_id
             AND o.branch_id <> a.branch_id
         )`,
        [org, id],
      ),
    ]);

    const labels = [
      ["stock_balances", "dòng tồn kho"],
      ["transfer_orders_open", "lệnh điều chuyển chưa hoàn tất"],
      ["pos_sessions_open", "ca bán hàng chưa chốt"],
      ["receivables_open", "công nợ phải thu chưa tất toán"],
      ["users_only_here", "nhân viên chỉ thuộc cửa hàng này"],
    ] as const;

    return {
      branchId: branch.id,
      branchName: branch.name,
      isMainBranch: branch.isMainBranch,
      blockers: branch.isMainBranch
        ? [
            {
              code: "MAIN_BRANCH",
              message:
                "Không thể ngừng hoạt động cửa hàng chính của tổ chức.",
            },
          ]
        : [],
      // Zero-count rows are dropped so the dialog stays short and every line
      // it does show is something the user must actually weigh.
      warnings: labels
        .map(([code, label], i) => ({ code, label, count: counts[i] ?? 0 }))
        .filter((w) => w.count > 0),
    };
  }

  private async countRows(
    from: string,
    where: string,
    params: unknown[],
  ): Promise<number> {
    const rows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM ${from} WHERE ${where}`,
      params,
    );
    return Number(rows?.[0]?.count ?? 0);
  }

  async archive(id: string, actor: ActorContext): Promise<BranchEntity> {
    const branch = await this.findById(id, actor);
    await this.assertMayChangeStatus(actor);

    if (branch.status === BranchStatus.ARCHIVED) {
      throw new BadRequestException("Cửa hàng đã được lưu trữ.");
    }
    if (branch.status !== BranchStatus.SUSPENDED) {
      throw new BadRequestException(
        "Phải ngừng hoạt động cửa hàng trước khi lưu trữ.",
      );
    }

    const activeSubBranches = await this.branchRepo.count({
      where: {
        parentBranchId: id,
        organizationId: actor.organizationId,
        status: BranchStatus.ACTIVE,
      },
    });
    if (activeSubBranches > 0) {
      throw new BadRequestException(
        "Không thể lưu trữ cửa hàng còn cửa hàng con đang hoạt động.",
      );
    }

    const suspendedSubBranches = await this.branchRepo.count({
      where: {
        parentBranchId: id,
        organizationId: actor.organizationId,
        status: BranchStatus.SUSPENDED,
      },
    });
    if (suspendedSubBranches > 0) {
      throw new BadRequestException(
        "Không thể lưu trữ cửa hàng còn cửa hàng con đã ngừng hoạt động.",
      );
    }

    branch.status = BranchStatus.ARCHIVED;
    const saved = await this.branchRepo.save(branch);
    await this.invalidateStatusCache(actor.organizationId);
    return saved;
  }

  async suspend(id: string, actor: ActorContext): Promise<BranchEntity> {
    const branch = await this.findById(id, actor);
    await this.assertMayChangeStatus(actor);
    this.assertTransitionAllowed(branch, BranchStatus.SUSPENDED);

    branch.status = BranchStatus.SUSPENDED;
    const saved = await this.branchRepo.save(branch);
    await this.invalidateStatusCache(actor.organizationId);
    this.logger.log(
      `Branch suspended: ${id} org=${actor.organizationId} actor=${actor.userId} ACTIVE -> SUSPENDED`,
    );
    return saved;
  }

  async activate(id: string, actor: ActorContext): Promise<BranchEntity> {
    const branch = await this.findById(id, actor);
    await this.assertMayChangeStatus(actor);
    this.assertTransitionAllowed(branch, BranchStatus.ACTIVE);

    branch.status = BranchStatus.ACTIVE;
    const saved = await this.branchRepo.save(branch);
    await this.invalidateStatusCache(actor.organizationId);
    this.logger.log(
      `Branch activated: ${id} org=${actor.organizationId} actor=${actor.userId} SUSPENDED -> ACTIVE`,
    );
    return saved;
  }

  async assignUser(
    branchId: string,
    userId: string,
    actor: ActorContext,
  ): Promise<UserBranchAssignmentEntity> {
    await this.findById(branchId, actor);

    const existing = await this.assignmentRepo.findOne({
      where: { userId, branchId },
    });
    if (existing) {
      throw new ConflictException(
        `User ${userId} is already assigned to branch ${branchId}`,
      );
    }

    const assignment = this.assignmentRepo.create({
      userId,
      branchId,
      organizationId: actor.organizationId,
      assignedBy: actor.userId,
    });

    return this.assignmentRepo.save(assignment);
  }

  async unassignUser(
    branchId: string,
    userId: string,
    actor: ActorContext,
  ): Promise<void> {
    await this.findById(branchId, actor);

    const assignment = await this.assignmentRepo.findOne({
      where: { userId, branchId, organizationId: actor.organizationId },
    });
    if (!assignment) {
      throw new NotFoundException(
        `Assignment not found for user ${userId} in branch ${branchId}`,
      );
    }

    await this.assignmentRepo.remove(assignment);
  }

  async getUserBranches(
    userId: string,
    actor: ActorContext,
  ): Promise<UserBranchAssignmentEntity[]> {
    return this.assignmentRepo.find({
      where: { userId, organizationId: actor.organizationId },
    });
  }

  async listMyBranches(actor: ActorContext): Promise<BranchEntity[]> {
    const assignments = await this.assignmentRepo.find({
      where: { userId: actor.userId, organizationId: actor.organizationId },
      select: ['branchId'],
    });

    if (!assignments.length) return [];

    // Feeds the backoffice header selector and the POS branch list, so a
    // retired store must not appear — the JWT already excludes it, and this
    // endpoint has to agree or the two disagree on screen.
    return this.branchRepo.find({
      where: assignments.map((a) => ({
        id: a.branchId,
        organizationId: actor.organizationId,
        status: BranchStatus.ACTIVE,
      })),
      order: { createdAt: 'ASC' },
    });
  }
}
