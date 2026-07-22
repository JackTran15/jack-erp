import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import {
  ScopingPolicy,
  DeletionPolicy,
  CrudEntityConfig,
  DepositAccountType,
  DepositAccountStatus,
  PaginatedResponse,
} from '@erp/shared-interfaces';
import { BaseCrudService } from '../../crud/base-crud.service';
import { PaginationQueryDto } from '../../crud/dto/pagination-query.dto';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { AccountEntity } from '../coa/account.entity';
import { BankEntity } from './bank.entity';
import { DepositAccountEntity } from './deposit-account.entity';
import { DepositMovementEntity } from './deposit-movement.entity';
import {
  CreateDepositAccountDto,
  UpdateDepositAccountDto,
} from './dto/deposit-account.dto';

export const DEPOSIT_ACCOUNT_SERVICE_TOKEN = 'DepositAccountService';

@Injectable()
export class DepositAccountsCrudService extends BaseCrudService<
  DepositAccountEntity,
  CreateDepositAccountDto,
  UpdateDepositAccountDto
> {
  protected readonly entityConfig: CrudEntityConfig = DEPOSIT_ACCOUNT_ENTITY_CONFIG;

  constructor(
    @InjectRepository(DepositAccountEntity)
    protected readonly repository: Repository<DepositAccountEntity>,
    @InjectRepository(BankEntity)
    private readonly bankRepo: Repository<BankEntity>,
    @InjectRepository(AccountEntity)
    private readonly accountRepo: Repository<AccountEntity>,
    @InjectRepository(DepositMovementEntity)
    private readonly movementRepo: Repository<DepositMovementEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }

  /** Initialize the real-time balance from the opening balance on create. */
  protected override async beforeCreate(
    payload: CreateDepositAccountDto,
    _actor: ActorContext,
  ): Promise<CreateDepositAccountDto> {
    return { ...payload, balance: payload.openingBalance };
  }

  /**
   * Inline the bank and COA labels so the admin grid shows names instead of raw
   * UUIDs. One batched query per lookup table per page, never per row.
   */
  override async list(
    query: PaginationQueryDto,
    filters: Record<string, any>,
    actor: ActorContext,
  ): Promise<PaginatedResponse<DepositAccountEntity>> {
    const page = await super.list(query, filters, actor);
    const rows = page.data;
    if (rows.length === 0) return page;

    const unique = <T,>(values: (T | null | undefined)[]): T[] => [
      ...new Set(values.filter((v): v is T => Boolean(v))),
    ];
    const bankIds = unique(rows.map((r) => r.bankId));
    const accountIds = unique(rows.map((r) => r.accountId));

    const [banks, accounts] = await Promise.all([
      bankIds.length
        ? this.bankRepo.find({ where: { id: In(bankIds) } })
        : Promise.resolve([]),
      accountIds.length
        ? this.accountRepo.find({ where: { id: In(accountIds) } })
        : Promise.resolve([]),
    ]);
    const bankById = new Map(banks.map((b) => [b.id, b]));
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const data = rows.map((row) => {
      const bank = row.bankId ? bankById.get(row.bankId) : undefined;
      const account = row.accountId ? accountById.get(row.accountId) : undefined;
      return {
        ...row,
        bankName: bank ? bank.name : '—',
        coaAccountName: account ? `${account.code} - ${account.name}` : '—',
      };
    }) as DepositAccountEntity[];

    return { ...page, data };
  }

  /**
   * A fund that has ever moved money owns ledger history — deleting it (even
   * softly) would strip the Sổ chi tiết tiền gửi of the account it scopes by.
   * Deactivate it via `status` instead.
   */
  protected override async beforeDelete(
    id: string,
    _actor: ActorContext,
  ): Promise<void> {
    const movements = await this.movementRepo.count({
      where: [{ depositAccountId: id }, { toAccountId: id }],
    });
    if (movements > 0) {
      throw new BadRequestException(
        `Deposit account ${id} cannot be deleted: it has ${movements} recorded movement(s). Set its status to INACTIVE instead.`,
      );
    }
  }
}

/** Display labels for the deposit-account enums on the admin grid and form. */
const DEPOSIT_ACCOUNT_TYPE_LABELS: Record<DepositAccountType, string> = {
  [DepositAccountType.BANK_ACCOUNT]: 'Tài khoản ngân hàng',
  [DepositAccountType.EWALLET]: 'Ví điện tử',
  [DepositAccountType.POS_MERCHANT]: 'Máy POS',
};

const DEPOSIT_ACCOUNT_STATUS_LABELS: Record<DepositAccountStatus, string> = {
  [DepositAccountStatus.ACTIVE]: 'Đang hoạt động',
  [DepositAccountStatus.INACTIVE]: 'Ngừng hoạt động',
};

export const DEPOSIT_ACCOUNT_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'deposit-accounts',
  displayName: 'Tài khoản tiền gửi',
  apiResource: 'deposit-accounts',
  idField: 'id',
  fields: [
    { key: 'code', label: 'Mã', type: 'string', required: true },
    { key: 'name', label: 'Tên tài khoản', type: 'string', required: true },
    { key: 'accountNo', label: 'Số tài khoản', type: 'string', required: true },
    { key: 'accountName', label: 'Chủ tài khoản', type: 'string', required: true },
    // Display-only labels inlined by `list()`; the raw FKs below are the form pickers.
    { key: 'bankName', label: 'Ngân hàng', type: 'string', readOnly: true },
    {
      key: 'bankId',
      label: 'Ngân hàng',
      type: 'relation',
      relationEntity: 'banks',
      required: true,
      hideInList: true,
    },
    {
      key: 'type',
      label: 'Loại',
      type: 'enum',
      required: true,
      enumValues: Object.values(DepositAccountType),
      enumLabels: DEPOSIT_ACCOUNT_TYPE_LABELS,
    },
    { key: 'bankBranch', label: 'Chi nhánh ngân hàng', type: 'string' },
    { key: 'mid', label: 'MID', type: 'string' },
    { key: 'tid', label: 'TID', type: 'string' },
    { key: 'coaAccountName', label: 'Tài khoản kế toán', type: 'string', readOnly: true },
    {
      key: 'accountId',
      label: 'Tài khoản kế toán',
      type: 'relation',
      relationEntity: 'accounts',
      required: true,
      hideInList: true,
    },
    {
      key: 'openingBalance',
      label: 'Số dư đầu kỳ',
      type: 'number',
      numberFormat: 'money',
      required: true,
    },
    {
      key: 'balance',
      label: 'Số dư hiện tại',
      type: 'number',
      numberFormat: 'money',
      readOnly: true,
    },
    { key: 'openingDate', label: 'Ngày bắt đầu', type: 'date', required: true },
    { key: 'allowNegative', label: 'Cho phép số dư âm', type: 'boolean' },
    {
      key: 'isDefault',
      label: 'Tài khoản mặc định của chi nhánh',
      type: 'boolean',
    },
    {
      key: 'status',
      label: 'Trạng thái',
      type: 'enum',
      enumValues: Object.values(DepositAccountStatus),
      enumLabels: DEPOSIT_ACCOUNT_STATUS_LABELS,
    },
  ],
  searchableFields: ['name', 'code', 'accountNo', 'accountName'],
  filterDefinitions: [
    {
      key: 'type',
      label: 'Loại',
      type: 'select',
      options: Object.values(DepositAccountType).map((t) => ({
        label: DEPOSIT_ACCOUNT_TYPE_LABELS[t],
        value: t,
      })),
    },
    {
      key: 'status',
      label: 'Trạng thái',
      type: 'select',
      options: Object.values(DepositAccountStatus).map((s) => ({
        label: DEPOSIT_ACCOUNT_STATUS_LABELS[s],
        value: s,
      })),
    },
  ],
  permissions: {
    create: 'accounting.deposit_account.create',
    read: 'accounting.deposit_account.read',
    update: 'accounting.deposit_account.update',
    delete: 'accounting.deposit_account.delete',
  },
  scopingPolicy: ScopingPolicy.BRANCH,
  deletionPolicy: DeletionPolicy.SOFT,
};
