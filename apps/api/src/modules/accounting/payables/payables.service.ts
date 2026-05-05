import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  PayableStatus,
  JournalSource,
  DocumentType,
  ScopingPolicy,
  DeletionPolicy,
  CrudEntityConfig,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { JournalService } from '../journal/journal.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { PayableEntity } from './payable.entity';
import { PayableSettlementEntity } from './payable-settlement.entity';
import { CreatePayableDto, SettlePayableDto } from './dto';
import { BaseCrudService } from '../../crud/base-crud.service';

export const PAYABLE_SERVICE_TOKEN = 'PayableService';

@Injectable()
export class PayablesService extends BaseCrudService<
  PayableEntity,
  CreatePayableDto,
  Record<string, never>
> {
  protected readonly entityConfig: CrudEntityConfig = PAYABLE_ENTITY_CONFIG;

  constructor(
    @InjectRepository(PayableEntity)
    protected readonly repository: Repository<PayableEntity>,
    @InjectRepository(PayableSettlementEntity)
    private readonly settlementRepo: Repository<PayableSettlementEntity>,
    protected readonly dataSource: DataSource,
    private readonly journalService: JournalService,
    private readonly documentNumberingService: DocumentNumberingService,
  ) {
    super(dataSource);
  }

  protected override async beforeCreate(
    payload: CreatePayableDto,
    _actor: ActorContext,
  ): Promise<CreatePayableDto> {
    if (!payload.currency) {
      (payload as any).currency = 'USD';
    }
    (payload as any).status = PayableStatus.DRAFT;
    return payload;
  }

  async post(id: string, actor: ActorContext): Promise<PayableEntity> {
    const payable = await this.getById(id, actor);

    if (payable.status !== PayableStatus.DRAFT) {
      throw new BadRequestException(
        `Payable ${id} must be in DRAFT status to post (current: ${payable.status})`,
      );
    }

    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.PAYABLE,
      actor.branchId,
      actor,
    );

    const now = new Date();

    return this.dataSource.transaction(async (manager) => {
      payable.documentNumber = documentNumber;
      payable.status = PayableStatus.POSTED;
      payable.postedAt = now;
      payable.postedBy = actor.userId;

      const saved = await manager.save(payable);

      await this.journalService.post(
        {
          source: JournalSource.EXPENSE,
          sourceReferenceId: saved.id,
          description: `Payable posted: ${documentNumber} — ${payable.vendorName}`,
          lines: [
            {
              accountId: payable.accountId,
              debitAmount: Number(payable.amount),
              creditAmount: 0,
              lineOrder: 1,
            },
            {
              accountId: payable.accountId,
              debitAmount: 0,
              creditAmount: Number(payable.amount),
              lineOrder: 2,
            },
          ],
        },
        actor,
      );

      return saved;
    });
  }

  async settle(
    id: string,
    dto: SettlePayableDto,
    actor: ActorContext,
  ): Promise<PayableEntity> {
    const payable = await this.repository.findOne({
      where: { id, organizationId: actor.organizationId },
      relations: ['settlements'],
    });

    if (!payable) {
      throw new NotFoundException(`Payable ${id} not found`);
    }

    if (
      payable.status !== PayableStatus.POSTED &&
      payable.status !== PayableStatus.PARTIALLY_SETTLED
    ) {
      throw new BadRequestException(
        `Payable ${id} must be POSTED or PARTIALLY_SETTLED to settle (current: ${payable.status})`,
      );
    }

    const remaining = Number(payable.amount) - Number(payable.settledAmount);
    if (Number(dto.amount) > remaining + 0.001) {
      throw new BadRequestException(
        `Settlement amount (${dto.amount}) exceeds remaining balance (${remaining})`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const settlement = manager.create(PayableSettlementEntity, {
        payableId: payable.id,
        amount: dto.amount,
        settlementDate: dto.settlementDate ?? new Date().toISOString().slice(0, 10),
        method: dto.method,
        reference: dto.reference,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
      });

      await manager.save(settlement);

      payable.settledAmount = Number(payable.settledAmount) + Number(dto.amount);

      const newRemaining = Number(payable.amount) - payable.settledAmount;
      payable.status =
        Math.abs(newRemaining) < 0.01
          ? PayableStatus.SETTLED
          : PayableStatus.PARTIALLY_SETTLED;

      const saved = await manager.save(payable);

      await this.journalService.post(
        {
          source: JournalSource.EXPENSE,
          sourceReferenceId: payable.id,
          description: `Payable settlement: ${payable.documentNumber} — ${dto.method}`,
          lines: [
            {
              accountId: payable.accountId,
              debitAmount: Number(dto.amount),
              creditAmount: 0,
              description: 'Debit payable (reduce liability)',
              lineOrder: 1,
            },
            {
              accountId: payable.accountId,
              debitAmount: 0,
              creditAmount: Number(dto.amount),
              description: 'Credit cash',
              lineOrder: 2,
            },
          ],
        },
        actor,
      );

      return saved;
    });
  }

  async void(id: string, actor: ActorContext): Promise<PayableEntity> {
    const payable = await this.repository.findOne({
      where: { id, organizationId: actor.organizationId },
      relations: ['settlements'],
    });

    if (!payable) {
      throw new NotFoundException(`Payable ${id} not found`);
    }

    if (payable.status !== PayableStatus.DRAFT) {
      throw new BadRequestException(
        `Payable ${id} can only be voided from DRAFT status (current: ${payable.status})`,
      );
    }

    if (payable.settlements?.length > 0) {
      throw new BadRequestException(
        `Payable ${id} cannot be voided — settlements exist`,
      );
    }

    payable.status = PayableStatus.VOIDED;
    return this.repository.save(payable);
  }
}

export const PAYABLE_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'payables',
  displayName: 'Payable',
  apiResource: 'payables',
  idField: 'id',
  fields: [
    { key: 'documentNumber', label: 'Document #', type: 'string' },
    { key: 'vendorName', label: 'Vendor', type: 'string', required: true },
    {
      key: 'amount',
      label: 'Amount',
      type: 'number',
      numberFormat: 'money',
      required: true,
    },
    { key: 'currency', label: 'Currency', type: 'string' },
    { key: 'dueDate', label: 'Due Date', type: 'date', required: true },
    {
      key: 'status',
      label: 'Status',
      type: 'enum',
      enumValues: Object.values(PayableStatus),
    },
    {
      key: 'accountId',
      label: 'Account',
      type: 'relation',
      required: true,
      relationEntity: 'accounts',
    },
    {
      key: 'settledAmount',
      label: 'Settled Amount',
      type: 'number',
      numberFormat: 'money',
    },
  ],
  searchableFields: ['vendorName', 'documentNumber'],
  filterDefinitions: [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: Object.values(PayableStatus).map((s) => ({
        label: s,
        value: s,
      })),
    },
    { key: 'dueDate', label: 'Due Date', type: 'date-range' },
  ],
  permissions: {
    create: 'accounting.payables.create',
    read: 'accounting.payables.read',
    update: 'accounting.payables.update',
    delete: 'accounting.payables.delete',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.DISABLED,
};
