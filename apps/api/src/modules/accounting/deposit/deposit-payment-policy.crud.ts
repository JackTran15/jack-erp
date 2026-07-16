import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  ScopingPolicy,
  DeletionPolicy,
  CrudEntityConfig,
  FeeBearer,
} from '@erp/shared-interfaces';
import { BaseCrudService } from '../../crud/base-crud.service';
import { DepositPaymentPolicyEntity } from './deposit-payment-policy.entity';
import {
  CreateDepositPaymentPolicyDto,
  UpdateDepositPaymentPolicyDto,
} from './dto/deposit-payment-policy.dto';

export const DEPOSIT_PAYMENT_POLICY_SERVICE_TOKEN = 'DepositPaymentPolicyService';

@Injectable()
export class DepositPaymentPolicyCrudService extends BaseCrudService<
  DepositPaymentPolicyEntity,
  CreateDepositPaymentPolicyDto,
  UpdateDepositPaymentPolicyDto
> {
  protected readonly entityConfig: CrudEntityConfig =
    DEPOSIT_PAYMENT_POLICY_ENTITY_CONFIG;

  constructor(
    @InjectRepository(DepositPaymentPolicyEntity)
    protected readonly repository: Repository<DepositPaymentPolicyEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }
}

export const DEPOSIT_PAYMENT_POLICY_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'deposit-payment-policy',
  displayName: 'Chính sách thanh toán tiền gửi',
  apiResource: 'deposit-payment-policy',
  idField: 'id',
  fields: [
    { key: 'paymentMethod', label: 'Phương thức', type: 'string', required: true },
    { key: 'cardType', label: 'Loại thẻ', type: 'string' },
    { key: 'depositAccountId', label: 'Tài khoản (override)', type: 'relation', relationEntity: 'deposit-accounts' },
    { key: 'feeRate', label: 'Tỷ lệ phí (%)', type: 'number' },
    {
      key: 'feeBearer',
      label: 'Bên chịu phí',
      type: 'enum',
      enumValues: Object.values(FeeBearer),
    },
    { key: 'settlementDays', label: 'Số ngày ghi có', type: 'number' },
    { key: 'effectiveFrom', label: 'Hiệu lực từ', type: 'date' },
    { key: 'effectiveTo', label: 'Hiệu lực đến', type: 'date' },
    { key: 'isActive', label: 'Hoạt động', type: 'boolean' },
  ],
  searchableFields: ['paymentMethod', 'cardType'],
  filterDefinitions: [
    { key: 'paymentMethod', label: 'Phương thức', type: 'text' },
    { key: 'isActive', label: 'Hoạt động', type: 'boolean' },
  ],
  permissions: {
    create: 'accounting.deposit_payment_policy.create',
    read: 'accounting.deposit_payment_policy.read',
    update: 'accounting.deposit_payment_policy.update',
    delete: 'accounting.deposit_payment_policy.delete',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.SOFT,
};
