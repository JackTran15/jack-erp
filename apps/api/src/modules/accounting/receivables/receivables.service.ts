import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  ReceivableStatus,
  JournalSource,
  DocumentType,
  ScopingPolicy,
  DeletionPolicy,
  CrudEntityConfig,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { JournalService } from '../journal/journal.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { CashService } from '../cash/cash.service';
import { CashFundResolverService } from '../cash/cash-fund-resolver.service';
import { CashMovementType } from '../cash/cash-movement.entity';
import { CashReceiptsService } from '../cash-vouchers/cash-receipts/cash-receipts.service';
import { CashVoucherCategoryResolverService } from '../cash-vouchers/shared/category-resolver.service';
import {
  CashReceiptPurpose,
  CashReceiptReferenceType,
  CashVoucherPartnerType,
} from '../cash-vouchers/enums';
import { ReceivableEntity } from './receivable.entity';
import { ReceivableSettlementEntity } from './receivable-settlement.entity';
import {
  CreateReceivableDto,
  CollectReceivableDto,
  WriteOffReceivableDto,
} from './dto';
import { BaseCrudService } from '../../crud/base-crud.service';

/** dto.method values treated as physical cash → route through the till + Phiếu Thu. */
const CASH_METHOD = 'CASH';

export const RECEIVABLE_SERVICE_TOKEN = 'ReceivableService';

const WRITE_OFF_PERMISSION = 'accounting.receivables.write-off';

@Injectable()
export class ReceivablesService extends BaseCrudService<
  ReceivableEntity,
  CreateReceivableDto,
  Record<string, never>
> {
  protected readonly entityConfig: CrudEntityConfig = RECEIVABLE_ENTITY_CONFIG;

  constructor(
    @InjectRepository(ReceivableEntity)
    protected readonly repository: Repository<ReceivableEntity>,
    @InjectRepository(ReceivableSettlementEntity)
    private readonly settlementRepo: Repository<ReceivableSettlementEntity>,
    protected readonly dataSource: DataSource,
    private readonly journalService: JournalService,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly cashService: CashService,
    private readonly cashFundResolver: CashFundResolverService,
    private readonly cashReceiptsService: CashReceiptsService,
    private readonly categoryResolver: CashVoucherCategoryResolverService,
  ) {
    super(dataSource);
  }

  protected override async beforeCreate(
    payload: CreateReceivableDto,
    _actor: ActorContext,
  ): Promise<CreateReceivableDto> {
    if (!payload.currency) {
      (payload as any).currency = 'USD';
    }
    (payload as any).status = ReceivableStatus.DRAFT;
    return payload;
  }

  async post(id: string, actor: ActorContext): Promise<ReceivableEntity> {
    const receivable = await this.getById(id, actor);

    if (receivable.status !== ReceivableStatus.DRAFT) {
      throw new BadRequestException(
        `Receivable ${id} must be in DRAFT status to post (current: ${receivable.status})`,
      );
    }

    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.RECEIVABLE,
      actor.branchId,
      actor,
    );

    const now = new Date();

    return this.dataSource.transaction(async (manager) => {
      receivable.documentNumber = documentNumber;
      receivable.status = ReceivableStatus.POSTED;
      receivable.postedAt = now;
      receivable.postedBy = actor.userId;

      const saved = await manager.save(receivable);

      await this.journalService.post(
        {
          source: JournalSource.SALE,
          sourceReferenceId: saved.id,
          description: `Receivable posted: ${documentNumber}`,
          lines: [
            {
              accountId: receivable.accountId,
              debitAmount: Number(receivable.amount),
              creditAmount: 0,
              description: 'Debit receivable',
              lineOrder: 1,
            },
            {
              accountId: receivable.accountId,
              debitAmount: 0,
              creditAmount: Number(receivable.amount),
              description: 'Credit revenue',
              lineOrder: 2,
            },
          ],
        },
        actor,
      );

      return saved;
    });
  }

  async collect(
    id: string,
    dto: CollectReceivableDto,
    actor: ActorContext,
  ): Promise<ReceivableEntity> {
    const receivable = await this.repository.findOne({
      where: { id, organizationId: actor.organizationId },
      relations: ['settlements'],
    });

    if (!receivable) {
      throw new NotFoundException(`Receivable ${id} not found`);
    }

    if (
      receivable.status !== ReceivableStatus.POSTED &&
      receivable.status !== ReceivableStatus.PARTIALLY_SETTLED
    ) {
      throw new BadRequestException(
        `Receivable ${id} must be POSTED or PARTIALLY_SETTLED to collect (current: ${receivable.status})`,
      );
    }

    const remaining =
      Number(receivable.amount) - Number(receivable.settledAmount);
    if (Number(dto.amount) > remaining + 0.001) {
      throw new BadRequestException(
        `Collection amount (${dto.amount}) exceeds remaining balance (${remaining})`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const settlement = manager.create(ReceivableSettlementEntity, {
        receivableId: receivable.id,
        amount: dto.amount,
        settlementDate:
          dto.settlementDate ?? new Date().toISOString().slice(0, 10),
        method: dto.method,
        reference: dto.reference,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
      });

      await manager.save(settlement);

      receivable.settledAmount =
        Number(receivable.settledAmount) + Number(dto.amount);

      const newRemaining =
        Number(receivable.amount) - receivable.settledAmount;
      receivable.status =
        Math.abs(newRemaining) < 0.01
          ? ReceivableStatus.SETTLED
          : ReceivableStatus.PARTIALLY_SETTLED;

      const saved = await manager.save(receivable);

      const isCash = (dto.method ?? '').trim().toUpperCase() === CASH_METHOD;
      if (isCash) {
        // Cash collection: credit the branch till + issue a Phiếu Thu.
        // recordMovement posts DR cash / CR receivable account, updates the
        // balance and creates the JE — replacing the standalone journal entry.
        const cashAccountId = await this.cashFundResolver.resolveOrDefault(
          actor.organizationId,
          actor.branchId,
          undefined,
          manager,
        );
        const { movement, journalEntryId } =
          await this.cashService.recordMovement(
            {
              cashAccountId,
              type: CashMovementType.DEPOSIT,
              amount: Number(dto.amount),
              contraAccountId: receivable.accountId,
              reference: `RECV-${settlement.id}`,
              notes: `Receivable collection ${receivable.documentNumber ?? receivable.id}`,
            },
            actor,
            manager,
          );
        const categoryId = await this.categoryResolver.resolveId(
          actor.organizationId,
          'THU_NO_KH',
        );
        await this.cashReceiptsService.createVoucherForMovement(
          {
            cashMovementId: movement.id,
            journalEntryId,
            purpose: CashReceiptPurpose.OTHER,
            cashAccountId,
            contraAccountId: receivable.accountId,
            amount: Number(dto.amount),
            referenceType: CashReceiptReferenceType.RECEIVABLE,
            referenceId: settlement.id,
            partnerType: CashVoucherPartnerType.CUSTOMER,
            partnerId: receivable.customerId,
            description: `Thu phải thu ${receivable.documentNumber ?? ''}`.trim(),
            categoryId,
            actor,
          },
          manager,
        );
      } else {
        // Non-cash (bank transfer, cheque, …): journal entry only.
        await this.journalService.post(
          {
            source: JournalSource.SALE,
            sourceReferenceId: receivable.id,
            description: `Receivable collection: ${receivable.documentNumber} — ${dto.method}`,
            lines: [
              {
                accountId: receivable.accountId,
                debitAmount: Number(dto.amount),
                creditAmount: 0,
                description: 'Debit cash/bank',
                lineOrder: 1,
              },
              {
                accountId: receivable.accountId,
                debitAmount: 0,
                creditAmount: Number(dto.amount),
                description: 'Credit receivable',
                lineOrder: 2,
              },
            ],
          },
          actor,
        );
      }

      return saved;
    });
  }

  async writeOff(
    id: string,
    dto: WriteOffReceivableDto,
    actor: ActorContext,
  ): Promise<ReceivableEntity> {
    if (!actor.roles.includes(WRITE_OFF_PERMISSION)) {
      throw new ForbiddenException(
        'Write-off requires elevated permission: ' + WRITE_OFF_PERMISSION,
      );
    }

    const receivable = await this.repository.findOne({
      where: { id, organizationId: actor.organizationId },
    });

    if (!receivable) {
      throw new NotFoundException(`Receivable ${id} not found`);
    }

    if (
      receivable.status !== ReceivableStatus.POSTED &&
      receivable.status !== ReceivableStatus.PARTIALLY_SETTLED
    ) {
      throw new BadRequestException(
        `Receivable ${id} must be POSTED or PARTIALLY_SETTLED to write off (current: ${receivable.status})`,
      );
    }

    const remaining =
      Number(receivable.amount) - Number(receivable.settledAmount);

    return this.dataSource.transaction(async (manager) => {
      receivable.status = ReceivableStatus.WRITTEN_OFF;
      receivable.writeOffReason = dto.reason;

      const saved = await manager.save(receivable);

      await this.journalService.post(
        {
          source: JournalSource.MANUAL,
          sourceReferenceId: receivable.id,
          description: `Receivable write-off: ${receivable.documentNumber} — ${dto.reason}`,
          lines: [
            {
              accountId: receivable.accountId,
              debitAmount: remaining,
              creditAmount: 0,
              description: 'Debit bad debt expense',
              lineOrder: 1,
            },
            {
              accountId: receivable.accountId,
              debitAmount: 0,
              creditAmount: remaining,
              description: 'Credit receivable',
              lineOrder: 2,
            },
          ],
        },
        actor,
      );

      return saved;
    });
  }

  async void(id: string, actor: ActorContext): Promise<ReceivableEntity> {
    const receivable = await this.repository.findOne({
      where: { id, organizationId: actor.organizationId },
      relations: ['settlements'],
    });

    if (!receivable) {
      throw new NotFoundException(`Receivable ${id} not found`);
    }

    if (receivable.status !== ReceivableStatus.DRAFT) {
      throw new BadRequestException(
        `Receivable ${id} can only be voided from DRAFT status (current: ${receivable.status})`,
      );
    }

    if (receivable.settlements?.length > 0) {
      throw new BadRequestException(
        `Receivable ${id} cannot be voided — settlements exist`,
      );
    }

    receivable.status = ReceivableStatus.VOIDED;
    return this.repository.save(receivable);
  }
}

export const RECEIVABLE_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'receivables',
  displayName: 'Receivable',
  apiResource: 'receivables',
  idField: 'id',
  fields: [
    { key: 'documentNumber', label: 'Document #', type: 'string' },
    {
      key: 'customerId',
      label: 'Customer',
      type: 'relation',
      required: true,
      relationEntity: 'customers',
    },
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
      enumValues: Object.values(ReceivableStatus),
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
  searchableFields: ['documentNumber'],
  filterDefinitions: [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: Object.values(ReceivableStatus).map((s) => ({
        label: s,
        value: s,
      })),
    },
    { key: 'dueDate', label: 'Due Date', type: 'date-range' },
  ],
  permissions: {
    create: 'accounting.receivables.create',
    read: 'accounting.receivables.read',
    update: 'accounting.receivables.update',
    delete: 'accounting.receivables.delete',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.DISABLED,
};
