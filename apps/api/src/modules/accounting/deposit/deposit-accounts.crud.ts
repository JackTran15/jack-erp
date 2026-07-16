import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  ScopingPolicy,
  DeletionPolicy,
  CrudEntityConfig,
  DepositAccountType,
  DepositAccountStatus,
} from '@erp/shared-interfaces';
import { BaseCrudService } from '../../crud/base-crud.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { DepositAccountEntity } from './deposit-account.entity';
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
}

export const DEPOSIT_ACCOUNT_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'deposit-accounts',
  displayName: 'Tài khoản tiền gửi',
  apiResource: 'deposit-accounts',
  idField: 'id',
  fields: [
    { key: 'name', label: 'Tên tài khoản', type: 'string', required: true },
    { key: 'code', label: 'Mã', type: 'string', required: true },
    { key: 'accountNo', label: 'Số tài khoản', type: 'string', required: true },
    { key: 'accountName', label: 'Chủ tài khoản', type: 'string', required: true },
    { key: 'bankId', label: 'Ngân hàng', type: 'relation', relationEntity: 'banks', required: true },
    {
      key: 'type',
      label: 'Loại',
      type: 'enum',
      required: true,
      enumValues: Object.values(DepositAccountType),
    },
    { key: 'bankBranch', label: 'Chi nhánh ngân hàng', type: 'string' },
    { key: 'mid', label: 'MID', type: 'string' },
    { key: 'tid', label: 'TID', type: 'string' },
    { key: 'accountId', label: 'Tài khoản kế toán', type: 'relation', relationEntity: 'accounts', required: true },
    { key: 'openingBalance', label: 'Số dư đầu kỳ', type: 'number', required: true },
    { key: 'openingDate', label: 'Ngày bắt đầu', type: 'date', required: true },
    { key: 'allowNegative', label: 'Cho phép âm', type: 'boolean' },
    { key: 'isDefault', label: 'Mặc định', type: 'boolean' },
    {
      key: 'status',
      label: 'Trạng thái',
      type: 'enum',
      enumValues: Object.values(DepositAccountStatus),
    },
  ],
  searchableFields: ['name', 'code', 'accountNo', 'accountName'],
  filterDefinitions: [
    {
      key: 'type',
      label: 'Loại',
      type: 'select',
      options: Object.values(DepositAccountType).map((t) => ({ label: t, value: t })),
    },
    {
      key: 'status',
      label: 'Trạng thái',
      type: 'select',
      options: Object.values(DepositAccountStatus).map((s) => ({ label: s, value: s })),
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
