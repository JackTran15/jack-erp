import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ScopingPolicy, DeletionPolicy, CrudEntityConfig } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BaseCrudService, CrudOperation } from '../../crud/base-crud.service';
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
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
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
    {
      key: 'branchId',
      label: 'Chi nhánh (bắt buộc nếu có Tài khoản tiền gửi; để trống chỉ hợp lệ cho Tiền mặt)',
      type: 'relation',
      relationEntity: 'branches',
    },
    {
      key: 'depositAccountId',
      label: 'Tài khoản tiền gửi (bắt buộc — trừ Tiền mặt)',
      type: 'relation',
      relationEntity: 'deposit-accounts',
    },
    {
      key: 'accountId',
      label: 'Tài khoản kế toán nhận tiền (dùng cho Tiền mặt; tự lấy theo Tài khoản tiền gửi nếu đã chọn ở trên)',
      type: 'relation',
      relationEntity: 'accounts',
      required: true,
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
