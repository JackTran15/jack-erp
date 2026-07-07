import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
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
import { UserBranchAssignmentEntity } from "./user-branch-assignment.entity";
import { CreateBranchDto, UpdateBranchDto } from "./dto";
import { StorageEntity } from "../inventory/location/storage.entity";
import { ShowroomEntity } from "../inventory/location/showroom.entity";
import { LocationEntity } from "../inventory/location/location.entity";
import { LocationType } from "@erp/shared-interfaces";

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

  async list(
    query: PaginationQuery & { branchId?: string },
    actor: ActorContext,
  ): Promise<PaginatedResponse<BranchEntity>> {
    const where: Record<string, unknown> = {
      organizationId: actor.organizationId,
    };
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

  async update(
    id: string,
    dto: UpdateBranchDto,
    actor: ActorContext,
  ): Promise<BranchEntity> {
    const branch = await this.findById(id, actor);
    Object.assign(branch, dto);
    return this.branchRepo.save(branch);
  }

  async archive(id: string, actor: ActorContext): Promise<BranchEntity> {
    const branch = await this.findById(id, actor);

    if (branch.status === BranchStatus.ARCHIVED) {
      throw new BadRequestException("Branch is already archived");
    }
    if (branch.status !== BranchStatus.SUSPENDED) {
      throw new BadRequestException(
        "Branch must be suspended before archiving",
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
        "Cannot archive branch with active sub-branches",
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
        "Cannot archive branch with suspended sub-branches",
      );
    }

    branch.status = BranchStatus.ARCHIVED;
    return this.branchRepo.save(branch);
  }

  async suspend(id: string, actor: ActorContext): Promise<BranchEntity> {
    const branch = await this.findById(id, actor);

    if (branch.status !== BranchStatus.ACTIVE) {
      throw new BadRequestException("Only active branches can be suspended");
    }

    branch.status = BranchStatus.SUSPENDED;
    return this.branchRepo.save(branch);
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

    return this.branchRepo.find({
      where: assignments.map((a) => ({
        id: a.branchId,
        organizationId: actor.organizationId,
      })),
      order: { createdAt: 'ASC' },
    });
  }
}
