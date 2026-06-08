import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
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
}
