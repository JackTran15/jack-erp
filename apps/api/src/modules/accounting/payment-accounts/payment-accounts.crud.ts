import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import {
  ScopingPolicy,
  DeletionPolicy,
  CrudEntityConfig,
  PaginatedResponse,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { PaginationQueryDto } from '../../crud/dto/pagination-query.dto';
import { BaseCrudService, CrudOperation } from '../../crud/base-crud.service';
import { BranchEntity } from '../../branch/branch.entity';
import { AccountEntity } from '../coa/account.entity';
import { DepositAccountEntity } from '../deposit/deposit-account.entity';
import { PaymentAccountEntity } from './payment-account.entity';
import { PaymentAccountMethod } from './enums';
import { CreatePaymentAccountDto, UpdatePaymentAccountDto } from './dto/payment-account.dto';

export const PAYMENT_ACCOUNT_SERVICE_TOKEN = 'PaymentAccountService';

/**
 * Admin CRUD for `payment_accounts` (POS payment-method → receiving account
 * mapping). The existing `/payment-accounts` controller stays read-only
 * (POS checkout picker, scoped to the caller's branch); this registers the
 * same entity on the generic CRUD platform under a distinct route
 * (`/admin/entities/payment-accounts/records`) purely for admin management —
 * org-scoped (not branch-scoped) so an admin can see and edit both the
 * org-wide default and every branch's override in one screen.
 */
@Injectable()
export class PaymentAccountsCrudService extends BaseCrudService<
  PaymentAccountEntity,
  CreatePaymentAccountDto,
  UpdatePaymentAccountDto
> {
  protected readonly entityConfig: CrudEntityConfig = PAYMENT_ACCOUNT_ENTITY_CONFIG;

  constructor(
    @InjectRepository(PaymentAccountEntity)
    protected readonly repository: Repository<PaymentAccountEntity>,
    @InjectRepository(DepositAccountEntity)
    private readonly depositAccountRepo: Repository<DepositAccountEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    @InjectRepository(AccountEntity)
    private readonly accountRepo: Repository<AccountEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }

  /**
   * Inline a human label for each FK so the admin grid shows names instead of
   * raw UUIDs.
   *
   * Done here rather than via `configureListQuery` + `leftJoinAndSelect` (the
   * usual CRUD recipe) because `payment_accounts.branch_id` is `varchar` while
   * `branches.id` is `uuid` — a TypeORM relation join would emit
   * `branch.id = entity.branch_id` and Postgres rejects `uuid = varchar`. The
   * other hook, `transformListResults`, is synchronous and so cannot do the
   * lookups either.
   *
   * One batched query per lookup table per page (never per row).
   */
  override async list(
    query: PaginationQueryDto,
    filters: Record<string, any>,
    actor: ActorContext,
  ): Promise<PaginatedResponse<PaymentAccountEntity>> {
    const page = await super.list(query, filters, actor);
    const rows = page.data;
    if (rows.length === 0) return page;

    const ids = <T,>(values: (T | null | undefined)[]): T[] => [
      ...new Set(values.filter((v): v is T => Boolean(v))),
    ];
    const branchIds = ids(rows.map((r) => r.branchId));
    const depositIds = ids(rows.map((r) => r.depositAccountId));
    const accountIds = ids(rows.map((r) => r.accountId));

    const [branches, deposits, accounts] = await Promise.all([
      branchIds.length
        ? this.branchRepo.find({ where: { id: In(branchIds) } })
        : Promise.resolve([]),
      depositIds.length
        ? this.depositAccountRepo.find({ where: { id: In(depositIds) } })
        : Promise.resolve([]),
      accountIds.length
        ? this.accountRepo.find({ where: { id: In(accountIds) } })
        : Promise.resolve([]),
    ]);

    const branchById = new Map(branches.map((b) => [b.id, b]));
    const depositById = new Map(deposits.map((d) => [d.id, d]));
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const data = rows.map((r) => {
      const branch = r.branchId ? branchById.get(r.branchId) : undefined;
      const deposit = r.depositAccountId ? depositById.get(r.depositAccountId) : undefined;
      const account = accountById.get(r.accountId);
      return {
        ...r,
        // '—' rather than '' so an org-wide mapping (branchId NULL) reads as
        // deliberate instead of looking like missing data.
        branchName: branch?.name ?? '—',
        depositAccountName: deposit
          ? deposit.accountNo
            ? `${deposit.name} (${deposit.accountNo})`
            : deposit.name
          : '—',
        accountName: account ? `${account.code} - ${account.name}` : '—',
      };
    }) as PaymentAccountEntity[];

    return { ...page, data };
  }

  /**
   * Non-cash methods must name a deposit fund (that is what disambiguates
   * which fund a payment resolves to — see `DepositRoutingService`); cash
   * must have a direct COA since it has no deposit fund concept. When a
   * deposit fund is named, its branch must match this mapping's own branch —
   * an org-wide (branch_id NULL) mapping can never point at one specific
   * branch's fund, since every other branch would then wrongly resolve there
   * too.
   */
  protected override async validateBusinessRules(
    operation: CrudOperation,
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<void> {
    if (operation === 'delete') return;

    if (operation === 'create') {
      if (
        payload.paymentMethod &&
        payload.paymentMethod !== PaymentAccountMethod.CASH &&
        !payload.depositAccountId
      ) {
        throw new BadRequestException(
          'depositAccountId is required for non-cash payment methods',
        );
      }
      if (payload.paymentMethod === PaymentAccountMethod.CASH && !payload.accountId) {
        throw new BadRequestException('accountId is required for the cash payment method');
      }
    }

    if (payload.depositAccountId) {
      const deposit = await this.depositAccountRepo.findOne({
        where: { id: payload.depositAccountId, organizationId: actor.organizationId },
      });
      if (!deposit) {
        throw new BadRequestException(`Deposit account ${payload.depositAccountId} not found`);
      }
      if (payload.branchId !== undefined && payload.branchId !== deposit.branchId) {
        throw new BadRequestException(
          `A payment account linked to a deposit fund must set branchId to that fund's own branch (${deposit.branchId})`,
        );
      }
    }
  }

  protected override async beforeCreate(
    payload: CreatePaymentAccountDto,
    actor: ActorContext,
  ): Promise<CreatePaymentAccountDto> {
    return this.syncAccountId(payload, actor);
  }

  protected override async beforeUpdate(
    _id: string,
    payload: UpdatePaymentAccountDto,
    actor: ActorContext,
  ): Promise<UpdatePaymentAccountDto> {
    return this.syncAccountId(payload, actor);
  }

  /** accountId (COA) always mirrors the linked deposit fund's own COA — never chosen independently. */
  private async syncAccountId<T extends { depositAccountId?: string; accountId?: string }>(
    payload: T,
    actor: ActorContext,
  ): Promise<T> {
    if (!payload.depositAccountId) return payload;
    const deposit = await this.depositAccountRepo.findOne({
      where: { id: payload.depositAccountId, organizationId: actor.organizationId },
    });
    if (!deposit) {
      throw new BadRequestException(`Deposit account ${payload.depositAccountId} not found`);
    }
    return { ...payload, accountId: deposit.accountId };
  }
}

export const PAYMENT_ACCOUNT_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'payment-accounts',
  displayName: 'Tài khoản thanh toán',
  apiResource: 'payment-accounts',
  idField: 'id',
  fields: [
    {
      key: 'paymentMethod',
      label: 'Phương thức',
      type: 'enum',
      required: true,
      enumValues: Object.values(PaymentAccountMethod),
    },
    // ── Display-only labels (list) ──
    { key: 'branchName', label: 'Chi nhánh', type: 'string', readOnly: true },
    { key: 'depositAccountName', label: 'Tài khoản tiền gửi', type: 'string', readOnly: true },
    { key: 'accountName', label: 'Tài khoản kế toán nhận tiền', type: 'string', readOnly: true },
    // ── Form-only pickers (the raw FKs) ──
    {
      key: 'branchId',
      label: 'Chi nhánh (bắt buộc nếu có Tài khoản tiền gửi; để trống chỉ hợp lệ cho Tiền mặt)',
      type: 'relation',
      relationEntity: 'branches',
      hideInList: true,
    },
    {
      key: 'depositAccountId',
      label: 'Tài khoản tiền gửi (bắt buộc — trừ Tiền mặt)',
      type: 'relation',
      relationEntity: 'deposit-accounts',
      hideInList: true,
    },
    {
      key: 'accountId',
      label: 'Tài khoản kế toán nhận tiền (dùng cho Tiền mặt; tự lấy theo Tài khoản tiền gửi nếu đã chọn ở trên)',
      type: 'relation',
      relationEntity: 'accounts',
      required: true,
      hideInList: true,
    },
    { key: 'label', label: 'Nhãn hiển thị', type: 'string' },
    { key: 'isActive', label: 'Hoạt động', type: 'boolean' },
    { key: 'sortOrder', label: 'Thứ tự', type: 'number' },
  ],
  searchableFields: ['label'],
  filterDefinitions: [
    {
      key: 'paymentMethod',
      label: 'Phương thức',
      type: 'select',
      options: Object.values(PaymentAccountMethod).map((m) => ({ label: m, value: m })),
    },
    { key: 'isActive', label: 'Hoạt động', type: 'boolean' },
  ],
  permissions: {
    create: 'accounting.payment_account.create',
    read: 'accounting.payment_account.read',
    update: 'accounting.payment_account.update',
    delete: 'accounting.payment_account.delete',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.SOFT,
};
