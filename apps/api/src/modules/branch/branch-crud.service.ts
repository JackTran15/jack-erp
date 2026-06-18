import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, QueryFailedError, Repository } from "typeorm";
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

interface BranchDeleteDependency {
  table: string;
  label: string;
  where: string;
}

const BRANCH_HAS_DATA_MESSAGE =
  "Cửa hàng đã có phát sinh dữ liệu liên quan, không thể xoá.";

const BRANCH_DELETE_OPERATIONAL_DEPENDENCIES: BranchDeleteDependency[] = [
  {
    table: "branches",
    label: "cửa hàng con",
    where: "organization_id::text = $2 AND parent_branch_id::text = $1",
  },
  {
    table: "items",
    label: "hàng hoá",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "products",
    label: "sản phẩm",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "inventory_providers",
    label: "nhà cung cấp",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "customers",
    label: "khách hàng",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "stock_balances",
    label: "tồn kho",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "stock_ledger_entries",
    label: "sổ kho",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "item_storage_locations",
    label: "xếp vị trí hàng hoá",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "item_stock_thresholds",
    label: "định mức tồn kho",
    where:
      "organization_id::text = $2 AND location_id IN (SELECT id FROM locations WHERE branch_id::text = $1)",
  },
  {
    table: "invoices",
    label: "doanh thu/hoá đơn",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "goods_receipts",
    label: "phiếu nhập",
    where:
      "organization_id::text = $2 AND (branch_id::text = $1 OR source_branch_id::text = $1)",
  },
  {
    table: "goods_issues",
    label: "phiếu xuất",
    where:
      "organization_id::text = $2 AND (branch_id::text = $1 OR target_branch_id::text = $1)",
  },
  {
    table: "purchase_orders",
    label: "phiếu đặt hàng",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "stock_transfers",
    label: "điều chuyển kho",
    where:
      "organization_id::text = $2 AND (branch_id::text = $1 OR source_branch_id::text = $1 OR destination_branch_id::text = $1)",
  },
  {
    table: "transfer_orders",
    label: "lệnh điều chuyển",
    where:
      "organization_id::text = $2 AND (branch_id::text = $1 OR source_branch_id::text = $1 OR destination_branch_id::text = $1)",
  },
  {
    table: "stock_takes",
    label: "kiểm kê",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "stock_adjustments",
    label: "điều chỉnh kho",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "cash_accounts",
    label: "số dư quỹ tiền mặt",
    where:
      "organization_id::text = $2 AND branch_id::text = $1 AND COALESCE(balance, 0) <> 0",
  },
  {
    table: "cash_movements",
    label: "phát sinh quỹ tiền mặt",
    where:
      "organization_id::text = $2 AND (branch_id::text = $1 OR cash_account_id IN (SELECT id FROM cash_accounts WHERE branch_id::text = $1))",
  },
  {
    table: "cash_receipts",
    label: "phiếu thu",
    where:
      "organization_id::text = $2 AND (branch_id::text = $1 OR cash_account_id IN (SELECT id FROM cash_accounts WHERE branch_id::text = $1))",
  },
  {
    table: "cash_payments",
    label: "phiếu chi",
    where:
      "organization_id::text = $2 AND (branch_id::text = $1 OR cash_account_id IN (SELECT id FROM cash_accounts WHERE branch_id::text = $1))",
  },
  {
    table: "cash_counts",
    label: "kiểm quỹ",
    where:
      "organization_id::text = $2 AND (branch_id::text = $1 OR cash_account_id IN (SELECT id FROM cash_accounts WHERE branch_id::text = $1))",
  },
  {
    table: "expenses",
    label: "chi phí",
    where:
      "organization_id::text = $2 AND (branch_id::text = $1 OR cash_account_id IN (SELECT id FROM cash_accounts WHERE branch_id::text = $1))",
  },
  {
    table: "journal_entries",
    label: "bút toán kế toán",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "receivables",
    label: "công nợ phải thu",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "payables",
    label: "công nợ phải trả",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "supplier_debts",
    label: "công nợ nhà cung cấp",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "customer_credits",
    label: "công nợ/điểm khách hàng",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "membership_cards",
    label: "thẻ thành viên",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "point_history",
    label: "lịch sử điểm",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "pos_sessions",
    label: "ca bán hàng",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "pos_sales",
    label: "doanh thu POS cũ",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "temp_warehouse_sessions",
    label: "kho tạm",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
];

const BRANCH_DELETE_CLEANUP_DEPENDENCIES: BranchDeleteDependency[] = [
  {
    table: "storage_manager_assignments",
    label: "quản lý kho",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "salesman_assignments",
    label: "nhân viên bán hàng",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "sales_manager_assignments",
    label: "quản lý bán hàng",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "user_branch_assignments",
    label: "user được gán cửa hàng",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "payment_accounts",
    label: "cấu hình tài khoản thanh toán",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "accounting_default_account",
    label: "cấu hình tài khoản mặc định",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "document_number_counters",
    label: "bộ đếm chứng từ",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "cash_accounts",
    label: "quỹ tiền mặt chi nhánh",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "locations",
    label: "vị trí kho",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "showrooms",
    label: "showroom",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "storages",
    label: "kho",
    where: "organization_id::text = $2 AND branch_id::text = $1",
  },
  {
    table: "branches",
    label: "cửa hàng",
    where: "organization_id::text = $2 AND id::text = $1",
  },
];

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

      await this.dataSource.transaction(async (manager) => {
        const blockingDependency = await this.findBlockingDependency(
          manager,
          id,
          actor,
        );
        if (blockingDependency) {
          throw new BadRequestException(BRANCH_HAS_DATA_MESSAGE);
        }

        await this.deleteBranchBootstrapData(manager, id, actor);
      });

      this.logger.log(`Deleted branches id=${id} (hard, bootstrap cleanup)`);
    } catch (err) {
      if (this.isForeignKeyViolation(err)) {
        this.logger.error(
          `Failed to delete branch id=${id} organizationId=${actor.organizationId} userId=${actor.userId}: branch is referenced by related records`,
          err instanceof Error ? err.stack : undefined,
        );
        throw new BadRequestException(BRANCH_HAS_DATA_MESSAGE);
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

  private async findBlockingDependency(
    manager: EntityManager,
    branchId: string,
    actor: ActorContext,
  ): Promise<BranchDeleteDependency | null> {
    for (const dependency of BRANCH_DELETE_OPERATIONAL_DEPENDENCIES) {
      const count = await this.countDependencyRows(
        manager,
        dependency,
        branchId,
        actor,
      );
      if (count > 0) return dependency;
    }
    return null;
  }

  private async deleteBranchBootstrapData(
    manager: EntityManager,
    branchId: string,
    actor: ActorContext,
  ): Promise<void> {
    for (const dependency of BRANCH_DELETE_CLEANUP_DEPENDENCIES) {
      await this.deleteDependencyRows(manager, dependency, branchId, actor);
    }
  }

  private async countDependencyRows(
    manager: EntityManager,
    dependency: BranchDeleteDependency,
    branchId: string,
    actor: ActorContext,
  ): Promise<number> {
    if (!(await this.tableExists(manager, dependency.table))) return 0;
    const rows = (await manager.query(
      `SELECT COUNT(*)::int AS count FROM ${dependency.table} WHERE ${dependency.where}`,
      [branchId, actor.organizationId],
    )) as Array<{ count?: number | string }>;
    return Number(rows[0]?.count ?? 0);
  }

  private async deleteDependencyRows(
    manager: EntityManager,
    dependency: BranchDeleteDependency,
    branchId: string,
    actor: ActorContext,
  ): Promise<void> {
    if (!(await this.tableExists(manager, dependency.table))) return;
    await manager.query(
      `DELETE FROM ${dependency.table} WHERE ${dependency.where}`,
      [branchId, actor.organizationId],
    );
  }

  private async tableExists(
    manager: EntityManager,
    table: string,
  ): Promise<boolean> {
    const rows = (await manager.query("SELECT to_regclass($1) AS name", [
      table,
    ])) as Array<{ name?: string | null }>;
    return Boolean(rows[0]?.name);
  }

  private isForeignKeyViolation(err: unknown): boolean {
    return this.findDatabaseErrorCode(err) === "23503";
  }

  private findDatabaseErrorCode(err: unknown): string | undefined {
    if (!err || typeof err !== "object") return undefined;

    const code =
      (err as QueryFailedError & { code?: unknown }).code ??
      (err as QueryFailedError & { driverError?: { code?: unknown } })
        .driverError?.code;
    if (typeof code === "string") return code;

    const cause = (err as { cause?: unknown }).cause;
    if (cause && cause !== err) return this.findDatabaseErrorCode(cause);

    return undefined;
  }
}
