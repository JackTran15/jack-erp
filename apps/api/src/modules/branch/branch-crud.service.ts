import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { DataSource, EntityManager, QueryFailedError, Repository } from "typeorm";
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from "@erp/shared-interfaces";
import { ActorContext } from "../../common/decorators/actor-context.decorator";
import { BaseCrudService } from "../crud/base-crud.service";
import { BranchService } from "./branch.service";
import { BranchStatusService } from "./branch-status.service";
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
    { key: "code", label: "Mã cửa hàng", type: "string" },
    { key: "address", label: "Địa chỉ", type: "string" },
    { key: "phone", label: "Điện thoại", type: "string", hideInList: true },
    { key: "email", label: "Email", type: "string", hideInList: true },
    { key: "status", label: "Trạng thái", type: "string", readOnly: true },
  ],
  searchableFields: ["name", "code", "address"],
  // Deliberately empty. The Cửa hàng screen is its own page now (ADR-08), so
  // nothing renders branches through the generic list — filter definitions and
  // Vietnamese enum labels here would be config nobody reads. What the platform
  // still serves for this entity is the delete path (BranchCrudService.remove,
  // with its dependency scan) and the payment-accounts.branchId relation picker.
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
    private readonly branchStatus: BranchStatusService,
  ) {
    super(dataSource);
  }

  override async create(
    payload: CreateBranchDto,
    actor: ActorContext,
  ): Promise<BranchEntity> {
    // Symmetry with update() is not cosmetic here. Leaving create unvalidated
    // lets it mint a row that violates the limits update() now enforces — an
    // over-length address saved once, and every later save from the branch
    // dialog 400s, because the dialog posts all editable fields back verbatim.
    // It also lets `id` survive into repo.create/repo.save, where a populated
    // primary key turns the insert into an update of somebody else's row.
    const validated = await this.toValidatedDto(CreateBranchDto, payload);
    await this.validateBusinessRules("create", validated, actor);
    const prepared = await this.beforeCreate(validated, actor);
    const saved = await this.branchService.create(prepared, actor);
    this.logger.log(
      `Created ${this.entityConfig.entityKey} id=${(saved as any).id}`,
    );
    return saved;
  }

  /**
   * The generic CRUD PATCH accepts an untyped body and `readOnly: true` on a
   * field is a UI hint with no server-side enforcement, so without this
   * override `PATCH /admin/entities/branches/records/:id {"status": ...}`
   * would reach `BaseCrudService.update` and write the lifecycle column with
   * no rules applied, no log line and — worst of all — no cache invalidation,
   * leaving `AuthGuard` serving a stale set. This is the path the branch
   * management screen actually drives, so it must land on the same code as
   * `PATCH /branches/:id`.
   */
  override async update(
    id: string,
    payload: UpdateBranchDto,
    actor: ActorContext,
  ): Promise<BranchEntity> {
    // This override replaces the base pipeline outright rather than extending
    // it, so nothing of `BaseCrudService.update` runs. Only two of its
    // behaviours were worth keeping and both are restored below: the
    // unique-index violation mapped to 409 instead of a 500, and the "Updated"
    // log line. Its other hooks are un-overridden no-ops here, and BranchEntity
    // has no `version` column so the optimistic-locking branch was dead code.
    const dto = await this.toValidatedDto(UpdateBranchDto, payload);
    try {
      const saved = await this.branchService.update(id, dto, actor);
      this.logger.log(`Updated ${this.entityConfig.entityKey} id=${id}`);
      return saved;
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException(
          "Tên hoặc mã cửa hàng đã tồn tại trong tổ chức.",
        );
      }
      throw err;
    }
  }

  /**
   * The generic CRUD controller declares `@Body() Record<string, any>`, so the
   * global ValidationPipe never runs and the raw body would reach
   * `Object.assign` inside BranchService.update — writing *any* BranchEntity
   * column, including ones absent from BRANCH_ENTITY_CONFIG.fields.
   *
   * That matters more here than anywhere else: `isMainBranch` is what the
   * suspend guard reads. Without this whitelist, `{"isMainBranch": false}`
   * followed by `{"status": "SUSPENDED"}` retires the head office, and
   * `{"organizationId": "..."}` moves the row into another tenant.
   *
   * `whitelist: true` drops every property with no validation decorator, which
   * is exactly the set of columns nobody is allowed to PATCH. Extra keys are
   * stripped rather than rejected because the shared record dialog posts
   * display-only fields alongside the editable ones.
   */
  private async toValidatedDto<T extends object>(
    Dto: new () => T,
    payload: unknown,
  ): Promise<T> {
    const dto = plainToInstance(Dto, this.blankToNull(payload));
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });
    if (errors.length) {
      // Joined into one string rather than passed as an array: the backoffice
      // reads `String(data.message)`, which renders an array as comma-jammed
      // text, and an array also leaves `err.message` as the generic
      // "Bad Request Exception" in logs.
      throw new BadRequestException(
        errors.flatMap((e) => Object.values(e.constraints ?? {})).join(" "),
      );
    }
    return dto;
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

      await this.invalidateStatusCache(actor.organizationId);
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

  /**
   * An emptied text input arrives as `""`, and `@IsOptional()` only skips
   * `null`/`undefined` — so `@IsEmail()` would reject a cleared email box and
   * turn "remove the branch's email" into a 400. Blank means "no value", and
   * these columns are all nullable, so `null` is both what the caller meant and
   * what the column should hold.
   *
   * `name` is excluded deliberately: it is required and NOT NULL, so a blank
   * name must keep failing `@MinLength(2)` rather than being nulled into a
   * database error. `BaseCrudService.normalizeBlankValues` does not cover any
   * of this — it only touches relation/date/number/enum fields, and branches
   * declares none.
   */
  private blankToNull(payload: unknown): Record<string, unknown> {
    const nullable = ["code", "address", "phone", "email"] as const;
    const out: Record<string, unknown> = { ...(payload as object) };
    for (const key of nullable) {
      if (typeof out[key] === "string" && (out[key] as string).trim() === "") {
        out[key] = null;
      }
    }
    return out;
  }

  /** Mirrors BranchService.invalidateStatusCache — the delete is already
   * committed, so Redis being down must not report failure for it. */
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

  private isUniqueViolation(err: unknown): boolean {
    return this.findDatabaseErrorCode(err) === "23505";
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
