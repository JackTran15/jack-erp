import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, QueryFailedError, Repository } from "typeorm";
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from "@erp/shared-interfaces";
import { ActorContext } from "../../common/decorators/actor-context.decorator";
import { BaseCrudService } from "../crud/base-crud.service";
import { BranchService } from "./branch.service";
import { BranchEntity } from "./branch.entity";
import { CreateBranchDto } from "./dto/create-branch.dto";
import { UpdateBranchDto } from "./dto/update-branch.dto";

export const BRANCH_SERVICE_TOKEN = "BranchCrudService";

export const BRANCH_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: "branches",
  displayName: "Cửa hàng",
  apiResource: "branches",
  idField: "id",
  fields: [
    { key: "name", label: "Tên", type: "string", required: true },
    { key: "address", label: "Địa chỉ", type: "string" },
    { key: "phone", label: "Điện thoại", type: "string", hideInList: true },
    { key: "email", label: "Email", type: "string", hideInList: true },
    { key: "status", label: "Trạng thái", type: "string", readOnly: true },
  ],
  searchableFields: ["name", "address"],
  filterDefinitions: [],
  permissions: {
    create: "branch.write",
    read: "branch.read",
    update: "branch.write",
    delete: "branch.delete",
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.HARD,
};

@Injectable()
export class BranchCrudService extends BaseCrudService<
  BranchEntity,
  CreateBranchDto,
  UpdateBranchDto
> {
  protected readonly entityConfig: CrudEntityConfig = BRANCH_ENTITY_CONFIG;

  constructor(
    @InjectRepository(BranchEntity)
    protected readonly repository: Repository<BranchEntity>,
    protected readonly dataSource: DataSource,
    private readonly branchService: BranchService,
  ) {
    super(dataSource);
  }

  override async create(
    payload: CreateBranchDto,
    actor: ActorContext,
  ): Promise<BranchEntity> {
    await this.validateBusinessRules("create", payload, actor);
    const prepared = await this.beforeCreate(payload, actor);
    const saved = await this.branchService.create(prepared, actor);
    this.logger.log(
      `Created ${this.entityConfig.entityKey} id=${(saved as any).id}`,
    );
    return saved;
  }

  override async remove(id: string, actor: ActorContext): Promise<void> {
    try {
      const branch = await this.getById(id, actor);

      if (branch.isMainBranch) {
        throw new BadRequestException(
          "Không thể xoá cửa hàng chính của tổ chức.",
        );
      }

      await super.remove(id, actor);
    } catch (err) {
      if (this.isForeignKeyViolation(err)) {
        this.logger.error(
          `Failed to delete branch id=${id} organizationId=${actor.organizationId} userId=${actor.userId}: branch is referenced by related records`,
          err instanceof Error ? err.stack : undefined,
        );
        throw new BadRequestException(
          "Không thể xoá cửa hàng vì đã phát sinh dữ liệu liên quan. Vui lòng ngưng hoạt động hoặc lưu trữ cửa hàng thay vì xoá.",
        );
      }

      if (err instanceof BadRequestException) {
        this.logger.warn(
          `Rejected branch delete id=${id} organizationId=${actor.organizationId} userId=${actor.userId}: ${err.message}`,
        );
        throw err;
      }

      this.logger.error(
        `Failed to delete branch id=${id} organizationId=${actor.organizationId} userId=${actor.userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }

  private isForeignKeyViolation(err: unknown): boolean {
    if (!(err instanceof QueryFailedError)) return false;
    const code =
      (err as QueryFailedError & { code?: string }).code ??
      (err as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code;
    return code === "23503";
  }
}
