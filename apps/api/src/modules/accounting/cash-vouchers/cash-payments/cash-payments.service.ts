import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Not, Repository } from 'typeorm';
import { DocumentType } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { CashService } from '../../cash/cash.service';
import { CashMovementType } from '../../cash/cash-movement.entity';
import { CashAccountEntity } from '../../cash/cash-account.entity';
import {
  CashPaymentPurpose,
  CashPaymentReferenceType,
  CashVoucherPartnerType,
  CashVoucherStatus,
} from '../enums';
import { PartnerResolverService } from '../shared/partner-resolver.service';
import { CashPaymentEntity } from './cash-payment.entity';
import { CashPaymentLineEntity } from './cash-payment-line.entity';
import { CreateCashPaymentDto } from './dto/create-cash-payment.dto';
import { UpdateCashPaymentDto } from './dto/update-cash-payment.dto';
import { CashPaymentLineDto } from './dto/cash-payment-line.dto';
import { QueryCashPaymentDto, CashPaymentSource } from './dto/query-cash-payment.dto';

export interface CashPaymentCreateAndPostArgs {
  purpose: CashPaymentPurpose;
  cashAccountId: string;
  contraAccountId: string;
  amount: number;
  actor: ActorContext;
  voucherDate?: string;
  referenceType?: CashPaymentReferenceType;
  referenceId?: string;
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  partnerName?: string;
  partnerAddress?: string;
  payeeName?: string;
  reason?: string;
  description?: string;
  categoryId?: string;
  lines?: Array<{
    description: string;
    amount: number;
    categoryId?: string;
    referenceNote?: string;
  }>;
}

export interface CashPaymentCreateForMovementArgs
  extends CashPaymentCreateAndPostArgs {
  cashMovementId: string;
  journalEntryId: string;
}

export interface ReversePaymentResult {
  original: CashPaymentEntity;
  reversal: CashPaymentEntity;
}

/** Derived link back to the source document that auto-created the voucher. */
export interface PaymentSourceLink {
  sourceType: string;
  sourceId: string;
  sourceDocumentNumber: string | null;
}

@Injectable()
export class CashPaymentsService {
  private readonly logger = new Logger(CashPaymentsService.name);

  constructor(
    @InjectRepository(CashPaymentEntity)
    private readonly paymentRepo: Repository<CashPaymentEntity>,
    @InjectRepository(CashPaymentLineEntity)
    private readonly lineRepo: Repository<CashPaymentLineEntity>,
    private readonly dataSource: DataSource,
    private readonly cashService: CashService,
    private readonly docNumbering: DocumentNumberingService,
    private readonly partnerResolver: PartnerResolverService,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD (DRAFT lifecycle)
  // ---------------------------------------------------------------------------

  async create(
    dto: CreateCashPaymentDto,
    actor: ActorContext,
  ): Promise<CashPaymentEntity> {
    this.assertTotalMatchesLines(dto.totalAmount, dto.lines);

    return this.dataSource.transaction(async (manager) => {
      await this.assertCashAccount(manager, dto.cashAccountId, actor.organizationId);
      await this.partnerResolver.resolve(
        manager,
        dto.partnerType,
        dto.partnerId,
        actor.organizationId,
      );

      const payment = manager.create(CashPaymentEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        voucherDate: dto.voucherDate,
        status: CashVoucherStatus.DRAFT,
        purpose: dto.purpose ?? CashPaymentPurpose.OTHER,
        partnerType: dto.partnerType,
        partnerId: dto.partnerId,
        payeeName: dto.payeeName,
        reason: dto.reason,
        staffId: dto.staffId,
        cashAccountId: dto.cashAccountId,
        contraAccountId: dto.contraAccountId,
        totalAmount: dto.totalAmount,
        attachmentIds: dto.attachmentIds ?? [],
      });
      const saved = await manager.save(payment);

      await this.insertLines(manager, saved.id, actor, dto.lines);
      return this.getByIdInTx(manager, saved.id, actor.organizationId);
    });
  }

  async update(
    id: string,
    dto: UpdateCashPaymentDto,
    actor: ActorContext,
  ): Promise<CashPaymentEntity> {
    return this.dataSource.transaction(async (manager) => {
      const payment = await this.loadForWrite(manager, id, actor.organizationId);
      if (payment.status !== CashVoucherStatus.DRAFT) {
        throw new BadRequestException(
          'Only DRAFT cash payments can be updated',
        );
      }

      if (dto.partnerType !== undefined || dto.partnerId !== undefined) {
        await this.partnerResolver.resolve(
          manager,
          dto.partnerType ?? payment.partnerType,
          dto.partnerId ?? payment.partnerId,
          actor.organizationId,
        );
      }

      Object.assign(payment, {
        voucherDate: dto.voucherDate ?? payment.voucherDate,
        purpose: dto.purpose ?? payment.purpose,
        partnerType: dto.partnerType ?? payment.partnerType,
        partnerId: dto.partnerId ?? payment.partnerId,
        payeeName: dto.payeeName ?? payment.payeeName,
        reason: dto.reason ?? payment.reason,
        staffId: dto.staffId ?? payment.staffId,
        cashAccountId: dto.cashAccountId ?? payment.cashAccountId,
        contraAccountId: dto.contraAccountId ?? payment.contraAccountId,
        attachmentIds: dto.attachmentIds ?? payment.attachmentIds,
      });

      if (dto.lines) {
        await this.syncLines(manager, payment.id, actor, dto.lines);
      }

      const lines = await manager.find(CashPaymentLineEntity, {
        where: { cashPaymentId: payment.id },
      });
      const lineSum = this.sum(lines.map((l) => Number(l.amount)));
      const total = dto.totalAmount ?? lineSum;
      if (Math.abs(Number(total) - lineSum) > 0.001) {
        throw new BadRequestException(
          `total_amount (${total}) must equal sum of line amounts (${lineSum})`,
        );
      }
      payment.totalAmount = total;

      await manager.save(payment);
      return this.getByIdInTx(manager, payment.id, actor.organizationId);
    });
  }

  async delete(id: string, actor: ActorContext): Promise<void> {
    const payment = await this.loadForWrite(
      this.dataSource.manager,
      id,
      actor.organizationId,
    );
    if (payment.status !== CashVoucherStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT cash payments can be deleted');
    }
    await this.paymentRepo.softDelete(payment.id);
  }

  // ---------------------------------------------------------------------------
  // post / reverse
  // ---------------------------------------------------------------------------

  async post(id: string, actor: ActorContext): Promise<CashPaymentEntity> {
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager
        .createQueryBuilder(CashPaymentEntity, 'p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id })
        .andWhere('p.organizationId = :org', { org: actor.organizationId })
        .getOne();
      if (!payment) {
        throw new NotFoundException(`Cash payment ${id} not found`);
      }
      if (payment.status !== CashVoucherStatus.DRAFT) {
        throw new BadRequestException(
          `Cash payment ${id} is not in DRAFT status`,
        );
      }

      const lines = await manager.find(CashPaymentLineEntity, {
        where: { cashPaymentId: payment.id },
      });
      const lineSum = this.sum(lines.map((l) => Number(l.amount)));
      if (Math.abs(Number(payment.totalAmount) - lineSum) > 0.001) {
        throw new BadRequestException(
          `total_amount (${payment.totalAmount}) must equal sum of line amounts (${lineSum})`,
        );
      }

      const partner = await this.partnerResolver.resolve(
        manager,
        payment.partnerType,
        payment.partnerId,
        actor.organizationId,
      );

      const documentNumber = await this.docNumbering.generate(
        DocumentType.CASH_PAYMENT,
        actor.branchId,
        actor,
      );

      // WITHDRAWAL: insufficient balance throws 400 before any UPDATE.
      const { movement, journalEntryId } = await this.cashService.recordMovement(
        {
          cashAccountId: payment.cashAccountId,
          type: CashMovementType.WITHDRAWAL,
          amount: Number(payment.totalAmount),
          contraAccountId: payment.contraAccountId,
          reference: documentNumber,
          notes: payment.reason,
        },
        actor,
        manager,
      );

      payment.status = CashVoucherStatus.POSTED;
      payment.documentNumber = documentNumber;
      payment.cashMovementId = movement.id;
      payment.journalEntryId = journalEntryId;
      payment.postedAt = new Date();
      payment.postedBy = actor.userId;
      if (partner) {
        payment.partnerNameSnapshot = partner.name ?? undefined;
        payment.partnerAddressSnapshot = partner.address ?? undefined;
      }
      await manager.save(payment);

      this.logger.log(
        `Posted cash payment ${documentNumber} (id=${payment.id}, amount=${payment.totalAmount})`,
      );
      return this.getByIdInTx(manager, payment.id, actor.organizationId);
    });
  }

  async reverse(
    id: string,
    reason: string,
    actor: ActorContext,
  ): Promise<ReversePaymentResult> {
    return this.dataSource.transaction(async (manager) => {
      const original = await manager
        .createQueryBuilder(CashPaymentEntity, 'p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id })
        .andWhere('p.organizationId = :org', { org: actor.organizationId })
        .getOne();
      if (!original) {
        throw new NotFoundException(`Cash payment ${id} not found`);
      }
      if (original.status !== CashVoucherStatus.POSTED) {
        throw new BadRequestException(
          `Cash payment ${id} is not in POSTED status`,
        );
      }
      if (original.reversedByVoucherId) {
        throw new BadRequestException(
          `Cash payment ${id} has already been reversed`,
        );
      }

      const originalLines = await manager.find(CashPaymentLineEntity, {
        where: { cashPaymentId: original.id },
        order: { lineOrder: 'ASC' },
      });

      const documentNumber = await this.docNumbering.generate(
        DocumentType.CASH_PAYMENT,
        actor.branchId,
        actor,
      );

      // The opposite movement (DEPOSIT) restores the balance and posts the
      // reversing journal entry (DR cash / CR contra). Balance increases, so no
      // insufficient-balance check is needed.
      const { movement, journalEntryId } = await this.cashService.recordMovement(
        {
          cashAccountId: original.cashAccountId,
          type: CashMovementType.DEPOSIT,
          amount: Number(original.totalAmount),
          contraAccountId: original.contraAccountId,
          reference: documentNumber,
          notes: `Reversal of ${original.documentNumber}: ${reason}`,
        },
        actor,
        manager,
      );

      const reversal = manager.create(CashPaymentEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        documentNumber,
        voucherDate: this.today(),
        status: CashVoucherStatus.POSTED,
        purpose: original.purpose,
        partnerType: original.partnerType,
        partnerId: original.partnerId,
        partnerNameSnapshot: original.partnerNameSnapshot,
        partnerAddressSnapshot: original.partnerAddressSnapshot,
        payeeName: original.payeeName,
        reason: original.reason,
        staffId: original.staffId,
        referenceType: CashPaymentReferenceType.REVERSAL,
        referenceId: original.id,
        cashAccountId: original.cashAccountId,
        contraAccountId: original.contraAccountId,
        totalAmount: Number(original.totalAmount),
        cashMovementId: movement.id,
        journalEntryId,
        reversesVoucherId: original.id,
        reversalReason: reason,
        postedAt: new Date(),
        postedBy: actor.userId,
      });
      const savedReversal = await manager.save(reversal);

      await this.insertLines(
        manager,
        savedReversal.id,
        actor,
        originalLines.map((l) => ({
          description: l.description,
          amount: Number(l.amount),
          categoryId: l.categoryId,
          referenceNote: l.referenceNote,
        })),
      );

      original.status = CashVoucherStatus.REVERSED;
      original.reversedByVoucherId = savedReversal.id;
      await manager.save(original);

      this.logger.log(
        `Reversed cash payment ${original.documentNumber} → ${documentNumber}`,
      );

      return {
        original: await this.getByIdInTx(manager, original.id, actor.organizationId),
        reversal: await this.getByIdInTx(
          manager,
          savedReversal.id,
          actor.organizationId,
        ),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Internal methods (cash-count variance + Phase 2 consumers)
  // ---------------------------------------------------------------------------

  async createAndPostInternal(
    args: CashPaymentCreateAndPostArgs,
    manager?: EntityManager,
  ): Promise<{
    voucherId: string;
    voucherNumber: string;
    cashMovementId: string;
    journalEntryId: string;
  }> {
    const run = (m: EntityManager) => this.createAndPostInternalInTx(args, m);
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  private async createAndPostInternalInTx(
    args: CashPaymentCreateAndPostArgs,
    manager: EntityManager,
  ): Promise<{
    voucherId: string;
    voucherNumber: string;
    cashMovementId: string;
    journalEntryId: string;
  }> {
    const { actor } = args;

    // Idempotent: if a non-reversed voucher already links this source reference,
    // return it without creating a second movement/JE/voucher.
    const existing = await this.findByReference(
      manager,
      args.referenceType,
      args.referenceId,
      actor.organizationId,
    );
    if (existing) {
      return {
        voucherId: existing.id,
        voucherNumber: existing.documentNumber ?? '',
        cashMovementId: existing.cashMovementId ?? '',
        journalEntryId: existing.journalEntryId ?? '',
      };
    }

    const documentNumber = await this.docNumbering.generate(
      DocumentType.CASH_PAYMENT,
      actor.branchId,
      actor,
    );

    // WITHDRAWAL — insufficient balance throws 400, rolling back the caller TX.
    const { movement, journalEntryId } = await this.cashService.recordMovement(
      {
        cashAccountId: args.cashAccountId,
        type: CashMovementType.WITHDRAWAL,
        amount: args.amount,
        contraAccountId: args.contraAccountId,
        reference: documentNumber,
        notes: args.reason ?? args.description,
      },
      actor,
      manager,
    );

    const voucher = await this.insertPostedVoucher(
      manager,
      args,
      documentNumber,
      movement.id,
      journalEntryId,
    );

    return {
      voucherId: voucher.id,
      voucherNumber: documentNumber,
      cashMovementId: movement.id,
      journalEntryId,
    };
  }

  async createVoucherForMovement(
    args: CashPaymentCreateForMovementArgs,
    manager?: EntityManager,
  ): Promise<{ voucherId: string; voucherNumber: string }> {
    const run = async (m: EntityManager) => {
      // Idempotent replay: a non-reversed voucher already linked to this source
      // reference is returned as-is (no second movement/JE/voucher).
      const existing = await this.findByReference(
        m,
        args.referenceType,
        args.referenceId,
        args.actor.organizationId,
      );
      if (existing) {
        return {
          voucherId: existing.id,
          voucherNumber: existing.documentNumber ?? '',
        };
      }
      const documentNumber = await this.docNumbering.generate(
        DocumentType.CASH_PAYMENT,
        args.actor.branchId,
        args.actor,
      );
      const voucher = await this.insertPostedVoucher(
        m,
        args,
        documentNumber,
        args.cashMovementId,
        args.journalEntryId,
      );
      return { voucherId: voucher.id, voucherNumber: documentNumber };
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  private async insertPostedVoucher(
    manager: EntityManager,
    args: CashPaymentCreateAndPostArgs,
    documentNumber: string,
    cashMovementId: string,
    journalEntryId: string,
  ): Promise<CashPaymentEntity> {
    const { actor } = args;
    const lines =
      args.lines && args.lines.length > 0
        ? args.lines
        : [
            {
              description: args.description ?? 'Cash payment',
              amount: args.amount,
              categoryId: args.categoryId,
            },
          ];

    const voucher = manager.create(CashPaymentEntity, {
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      documentNumber,
      voucherDate: args.voucherDate ?? this.today(),
      status: CashVoucherStatus.POSTED,
      purpose: args.purpose,
      partnerType: args.partnerType,
      partnerId: args.partnerId,
      partnerNameSnapshot: args.partnerName,
      partnerAddressSnapshot: args.partnerAddress,
      payeeName: args.payeeName,
      reason: args.reason,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      cashAccountId: args.cashAccountId,
      contraAccountId: args.contraAccountId,
      totalAmount: args.amount,
      cashMovementId,
      journalEntryId,
      postedAt: new Date(),
      postedBy: actor.userId,
    });
    const saved = await manager.save(voucher);
    await this.insertLines(manager, saved.id, actor, lines);
    return saved;
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async list(
    query: QueryCashPaymentDto,
    actor: ActorContext,
  ): Promise<{ data: CashPaymentEntity[]; total: number; page: number; pageSize: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .where('p.organizationId = :org', { org: actor.organizationId });

    if (query.status) qb.andWhere('p.status = :status', { status: query.status });
    if (query.purpose) qb.andWhere('p.purpose = :purpose', { purpose: query.purpose });
    if (query.cashAccountId)
      qb.andWhere('p.cashAccountId = :cashAccountId', {
        cashAccountId: query.cashAccountId,
      });
    else if (actor.branchId)
      // One cash fund per branch: default to branch-scoped vouchers.
      qb.andWhere('p.branchId = :branchId', { branchId: actor.branchId });
    if (query.partnerId)
      qb.andWhere('p.partnerId = :partnerId', { partnerId: query.partnerId });
    if (query.dateFrom)
      qb.andWhere('p.voucherDate >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo)
      qb.andWhere('p.voucherDate <= :dateTo', { dateTo: query.dateTo });
    if (query.search) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('p.documentNumber ILIKE :s', { s: `%${query.search}%` })
            .orWhere('p.payeeName ILIKE :s', { s: `%${query.search}%` })
            .orWhere('p.reason ILIKE :s', { s: `%${query.search}%` });
        }),
      );
    }
    this.applySourceFilter(qb, query.source);

    qb.orderBy('p.voucherDate', 'DESC')
      .addOrderBy('p.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize };
  }

  async getById(
    id: string,
    actor: ActorContext,
  ): Promise<CashPaymentEntity & { sourceLink: PaymentSourceLink | null }> {
    const payment = await this.getByIdInTx(
      this.dataSource.manager,
      id,
      actor.organizationId,
    );
    const sourceLink = await this.buildSourceLink(payment, actor.organizationId);
    return Object.assign(payment, { sourceLink });
  }

  private async buildSourceLink(
    payment: CashPaymentEntity,
    organizationId: string,
  ): Promise<PaymentSourceLink | null> {
    const rt = payment.referenceType;
    if (
      !rt ||
      !payment.referenceId ||
      rt === CashPaymentReferenceType.REVERSAL ||
      rt === CashPaymentReferenceType.MANUAL
    ) {
      return null;
    }
    let sourceDocumentNumber: string | null = null;
    if (rt === CashPaymentReferenceType.GOODS_RECEIPT) {
      const rows = await this.dataSource.query(
        `SELECT "document_number" FROM "goods_receipts" WHERE "id" = $1 AND "organization_id" = $2 LIMIT 1`,
        [payment.referenceId, organizationId],
      );
      sourceDocumentNumber = rows[0]?.document_number ?? null;
    }
    return {
      sourceType: rt,
      sourceId: payment.referenceId,
      sourceDocumentNumber,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private applySourceFilter(
    qb: ReturnType<Repository<CashPaymentEntity>['createQueryBuilder']>,
    source?: CashPaymentSource,
  ): void {
    if (!source) return;
    if (source === CashPaymentSource.GOODS_RECEIPT) {
      qb.andWhere('p.referenceType = :rt', {
        rt: CashPaymentReferenceType.GOODS_RECEIPT,
      });
    } else if (source === CashPaymentSource.EXPENSE) {
      qb.andWhere('p.referenceType = :rt', {
        rt: CashPaymentReferenceType.EXPENSE,
      });
    } else {
      qb.andWhere(
        new Brackets((w) => {
          w.where('p.referenceType IS NULL').orWhere('p.referenceType = :rt', {
            rt: CashPaymentReferenceType.MANUAL,
          });
        }),
      );
    }
  }

  private async getByIdInTx(
    manager: EntityManager,
    id: string,
    organizationId: string,
  ): Promise<CashPaymentEntity> {
    const payment = await manager.findOne(CashPaymentEntity, {
      where: { id, organizationId },
      relations: ['lines'],
      order: { lines: { lineOrder: 'ASC' } },
    });
    if (!payment) {
      throw new NotFoundException(`Cash payment ${id} not found`);
    }
    return payment;
  }

  private async findByReference(
    manager: EntityManager,
    referenceType: CashPaymentReferenceType | undefined,
    referenceId: string | undefined,
    organizationId: string,
  ): Promise<CashPaymentEntity | null> {
    if (!referenceType || !referenceId) return null;
    return manager.findOne(CashPaymentEntity, {
      where: {
        organizationId,
        referenceType,
        referenceId,
        status: Not(CashVoucherStatus.REVERSED),
      },
    });
  }

  private async loadForWrite(
    manager: EntityManager,
    id: string,
    organizationId: string,
  ): Promise<CashPaymentEntity> {
    const payment = await manager.findOne(CashPaymentEntity, {
      where: { id, organizationId },
    });
    if (!payment) {
      throw new NotFoundException(`Cash payment ${id} not found`);
    }
    return payment;
  }

  private async assertCashAccount(
    manager: EntityManager,
    cashAccountId: string,
    organizationId: string,
  ): Promise<void> {
    const account = await manager.findOne(CashAccountEntity, {
      where: { id: cashAccountId, organizationId },
    });
    if (!account) {
      throw new NotFoundException(`Cash account ${cashAccountId} not found`);
    }
  }

  private async insertLines(
    manager: EntityManager,
    paymentId: string,
    actor: ActorContext,
    lines: Array<{
      description: string;
      amount: number;
      categoryId?: string;
      referenceNote?: string;
    }>,
  ): Promise<void> {
    const entities = lines.map((line, idx) =>
      manager.create(CashPaymentLineEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        cashPaymentId: paymentId,
        lineOrder: idx,
        description: line.description,
        categoryId: line.categoryId,
        amount: line.amount,
        referenceNote: line.referenceNote,
      }),
    );
    await manager.save(entities);
  }

  private async syncLines(
    manager: EntityManager,
    paymentId: string,
    actor: ActorContext,
    lines: CashPaymentLineDto[],
  ): Promise<void> {
    const existing = await manager.find(CashPaymentLineEntity, {
      where: { cashPaymentId: paymentId },
    });
    const keepIds = new Set(lines.filter((l) => l.id).map((l) => l.id));
    const toDelete = existing.filter((e) => !keepIds.has(e.id));
    if (toDelete.length > 0) {
      await manager.delete(
        CashPaymentLineEntity,
        toDelete.map((e) => e.id),
      );
    }

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      if (line.id) {
        await manager.update(CashPaymentLineEntity, line.id, {
          lineOrder: idx,
          description: line.description,
          categoryId: line.categoryId ?? undefined,
          amount: line.amount,
          referenceNote: line.referenceNote ?? undefined,
        });
      } else {
        await manager.save(
          manager.create(CashPaymentLineEntity, {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            createdBy: actor.userId,
            cashPaymentId: paymentId,
            lineOrder: idx,
            description: line.description,
            categoryId: line.categoryId,
            amount: line.amount,
            referenceNote: line.referenceNote,
          }),
        );
      }
    }
  }

  private assertTotalMatchesLines(
    total: number,
    lines: Array<{ amount: number }>,
  ): void {
    const lineSum = this.sum(lines.map((l) => Number(l.amount)));
    if (Math.abs(Number(total) - lineSum) > 0.001) {
      throw new BadRequestException(
        `total_amount (${total}) must equal sum of line amounts (${lineSum})`,
      );
    }
  }

  private sum(values: number[]): number {
    return values.reduce((acc, v) => acc + Number(v), 0);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
