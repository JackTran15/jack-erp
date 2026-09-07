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
import { VoucherLinkKind } from '../../voucher-links/enums';
import {
  LinkedVoucher,
  VoucherLinksService,
} from '../../voucher-links/voucher-links.service';
import { PartnerResolverService } from '../shared/partner-resolver.service';
import { isFreeTextParty } from '../shared/voucher-party';
import {
  assertEditable,
  assertRevisionMatches,
} from '../shared/editable-voucher.util';
import { AccountResolverService } from '../../payment-accounts/account-resolver.service';
import { AccountingDefaultAccountRole } from '../../payment-accounts/enums';
import { CashPaymentEntity } from './cash-payment.entity';
import { CashPaymentLineEntity } from './cash-payment-line.entity';
import { CreateCashPaymentDto } from './dto/create-cash-payment.dto';
import { UpdateCashPaymentDto } from './dto/update-cash-payment.dto';
import { CashPaymentLineDto } from './dto/cash-payment-line.dto';
import { QueryCashPaymentDto, CashPaymentSource } from './dto/query-cash-payment.dto';
import { SupplierDebtPaymentSagaService } from '../supplier-debt-payment/supplier-debt-payment-saga.service';

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
  staffId?: string;
  attachmentIds?: string[];
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

/**
 * Contra (offsetting) GL account role per payment purpose. A manually-created
 * payment posts DR contra / CR cash, where the contra account is resolved from
 * this role via {@link AccountResolverService}.
 */
const PAYMENT_PURPOSE_TO_ROLE: Record<
  CashPaymentPurpose,
  AccountingDefaultAccountRole
> = {
  [CashPaymentPurpose.SUPPLIER_PAYMENT]: AccountingDefaultAccountRole.PAYABLE,
  [CashPaymentPurpose.PURCHASE]: AccountingDefaultAccountRole.PAYABLE,
  [CashPaymentPurpose.EXPENSE]: AccountingDefaultAccountRole.EXPENSE,
  [CashPaymentPurpose.SALARY]: AccountingDefaultAccountRole.EXPENSE,
  [CashPaymentPurpose.OTHER]: AccountingDefaultAccountRole.EXPENSE,
  [CashPaymentPurpose.REFUND]: AccountingDefaultAccountRole.REVENUE,
  // Fund moves always pass an explicit contra (TK 113 "Tiền đang chuyển"), so
  // these two are unreachable fallbacks kept only to satisfy the exhaustive map
  // — same as BankPaymentPurpose.CASH_TRANSFER/INTER_BRANCH_OUT.
  [CashPaymentPurpose.DEPOSIT_TRANSFER]: AccountingDefaultAccountRole.EXPENSE,
  [CashPaymentPurpose.INTER_BRANCH_OUT]: AccountingDefaultAccountRole.EXPENSE,
};

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
    private readonly accountResolver: AccountResolverService,
    private readonly supplierDebtPaymentSaga: SupplierDebtPaymentSagaService,
    private readonly voucherLinks: VoucherLinksService,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD (DRAFT lifecycle)
  // ---------------------------------------------------------------------------

  /**
   * Create a manual cash payment and post it to the ledger immediately (no DRAFT
   * stage). The contra account is resolved server-side from the voucher purpose
   * (DR contra / CR cash); an explicit `contraAccountId` is honoured only as an
   * override (e.g. a transfer destination). Movement + journal entry + POSTED
   * voucher are written atomically; insufficient balance fails the whole create.
   * Corrections are made via {@link reverse}, not edits.
   */
  async create(
    dto: CreateCashPaymentDto,
    actor: ActorContext,
  ): Promise<CashPaymentEntity> {
    this.assertTotalMatchesLines(dto.totalAmount, dto.lines);
    const purpose = dto.purpose ?? CashPaymentPurpose.OTHER;

    return this.dataSource.transaction(async (manager) => {
      await this.assertCashAccount(manager, dto.cashAccountId, actor.organizationId);
      // A hand-typed party has nothing to look up: its name IS the record, and
      // it carries no partner_id to dangle. Everything else is validated and
      // snapshotted from the catalogue row.
      const freeTextParty = isFreeTextParty(dto.partnerType);
      const partner = freeTextParty
        ? null
        : await this.partnerResolver.resolve(
            manager,
            dto.partnerType,
            dto.partnerId,
            actor.organizationId,
          );
      const contraAccountId = await this.accountResolver.resolveContraAccount(
        PAYMENT_PURPOSE_TO_ROLE[purpose],
        actor,
        dto.contraAccountId,
      );

      const { voucherId } = await this.createAndPostInternalInTx(
        {
          purpose,
          cashAccountId: dto.cashAccountId,
          contraAccountId,
          amount: dto.totalAmount,
          actor,
          voucherDate: dto.voucherDate,
          referenceType: CashPaymentReferenceType.MANUAL,
          partnerType: dto.partnerType,
          partnerId: freeTextParty ? undefined : dto.partnerId,
          partnerName: freeTextParty
            ? dto.partnerName?.trim() || undefined
            : (partner?.name ?? undefined),
          partnerAddress: freeTextParty ? undefined : (partner?.address ?? undefined),
          payeeName: dto.payeeName,
          staffId: dto.staffId,
          attachmentIds: dto.attachmentIds ?? [],
          reason: dto.reason,
          lines: dto.lines.map((l) => ({
            description: l.description,
            amount: l.amount,
            categoryId: l.categoryId,
            referenceNote: l.referenceNote,
          })),
        },
        manager,
      );

      return this.getByIdInTx(manager, voucherId, actor.organizationId);
    });
  }

  async update(
    id: string,
    dto: UpdateCashPaymentDto,
    actor: ActorContext,
  ): Promise<CashPaymentEntity> {
    return this.dataSource.transaction(async (manager) => {
      const payment = await this.lockForWrite(manager, id, actor.organizationId);
      assertEditable(payment, CashVoucherStatus.POSTED, 'Phiếu chi');
      assertRevisionMatches(payment, dto.revision, 'Phiếu chi');
      const amountBefore = Number(payment.totalAmount);

      // Recompute the party snapshot whenever any part of the party changed.
      // Switching between a hand-typed name and a catalogue row has to clear the
      // other shape completely: leaving a stale partner_name_snapshot behind
      // would show the old free-text name against a real customer, and leaving a
      // partner_id behind would point at a row the voucher no longer claims.
      const partyTouched =
        dto.partnerType !== undefined ||
        dto.partnerId !== undefined ||
        dto.partnerName !== undefined;
      const nextPartnerType = dto.partnerType ?? payment.partnerType;
      //
      // The cleared fields are `null`, never `undefined`: TypeORM's save() skips
      // undefined properties as "not provided", so undefined would leave the old
      // value in the column instead of clearing it.
      if (partyTouched) {
        if (isFreeTextParty(nextPartnerType)) {
          Object.assign(payment, {
            partnerType: nextPartnerType,
            partnerId: null,
            partnerNameSnapshot:
              (dto.partnerName ?? payment.partnerNameSnapshot)?.trim() || null,
            partnerAddressSnapshot: null,
          });
        } else {
          const nextPartnerId = dto.partnerId ?? payment.partnerId;
          const partner = await this.partnerResolver.resolve(
            manager,
            nextPartnerType,
            nextPartnerId,
            actor.organizationId,
          );
          Object.assign(payment, {
            partnerType: nextPartnerType ?? null,
            partnerId: nextPartnerId ?? null,
            partnerNameSnapshot: partner?.name ?? null,
            partnerAddressSnapshot: partner?.address ?? null,
          });
        }
      }

      Object.assign(payment, {
        voucherDate: dto.voucherDate ?? payment.voucherDate,
        purpose: dto.purpose ?? payment.purpose,
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

      // ADR-01, mirrored for the paying direction: a payment that grew takes
      // more cash OUT of the fund (WITHDRAWAL); one that shrank puts some back
      // (DEPOSIT). Exactly one movement, on this voucher, no second document.
      //
      // Growing a payment can exhaust the fund. That check is not re-implemented
      // here — recordMovement already refuses when the account forbids going
      // negative, and deferring to it keeps editing and creating a payment under
      // the same rule.
      const delta = Number(total) - amountBefore;
      await this.postAdjustment(manager, payment, delta, actor);

      payment.revision += 1;
      await manager.save(payment);
      this.logger.log(
        `Updated cash payment ${payment.documentNumber} (id=${payment.id}) rev ${payment.revision}, delta=${delta}, by=${actor.userId}`,
      );
      return this.getByIdInTx(manager, payment.id, actor.organizationId);
    });
  }

  /**
   * Delete a posted voucher.
   *
   * ADR-02: this is `update()` with `after = []` — the same delta engine, called
   * with the whole amount as the difference. Writing a separate reversal path
   * here is what let the warehouse side ship a `cancel()` that unwound stock but
   * forgot the accounting; sharing {@link postAdjustment} makes that class of bug
   * unreachable rather than merely unlikely.
   *
   * The row is soft-deleted and keeps `status = POSTED`: no `CANCELLED` enum
   * value is introduced, and `deleted_at` is what answers "is this still here".
   */
  async delete(id: string, actor: ActorContext): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const payment = await this.lockForWrite(manager, id, actor.organizationId);
      assertEditable(payment, CashVoucherStatus.POSTED, 'Phiếu chi');

      await this.postAdjustment(
        manager,
        payment,
        -Number(payment.totalAmount),
        actor,
      );

      payment.revision += 1;
      await manager.save(payment);
      await manager.softDelete(CashPaymentEntity, payment.id);
      this.logger.log(
        `Deleted cash payment ${payment.documentNumber} (id=${payment.id}) rev ${payment.revision}, reversed ${payment.totalAmount}, by=${actor.userId}`,
      );
    });
  }

  /**
   * Post the difference between what the voucher said before and what it says
   * now, as ONE compensating movement on this same voucher (ADR-01).
   *
   * Shared by {@link update} and {@link delete} so an edit and a deletion can never
   * drift apart. A zero delta writes nothing — editing only the wording must not
   * touch the ledger.
   */
  private async postAdjustment(
    manager: EntityManager,
    payment: CashPaymentEntity,
    delta: number,
    actor: ActorContext,
  ): Promise<void> {
    if (Math.abs(delta) <= 0.001) return;
    await this.cashService.recordMovement(
      {
        cashAccountId: payment.cashAccountId,
        type:
          delta > 0 ? CashMovementType.WITHDRAWAL : CashMovementType.DEPOSIT,
        amount: Math.abs(delta),
        contraAccountId: payment.contraAccountId,
        reference: payment.documentNumber,
        notes: `Adjustment for ${payment.documentNumber} rev ${payment.revision + 1}`,
      },
      actor,
      manager,
    );
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

  /**
   * `manager` lets a caller reverse inside its own transaction (the inter-branch
   * cash transfer cancels leg A and flips the transfer status atomically). Same
   * shape as BankPaymentsService.reverse.
   */
  async reverse(
    id: string,
    reason: string,
    actor: ActorContext,
    manager?: EntityManager,
  ): Promise<ReversePaymentResult> {
    const run = (m: EntityManager) => this.reverseInTx(id, reason, actor, m);
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  private async reverseInTx(
    id: string,
    reason: string,
    actor: ActorContext,
    manager: EntityManager,
  ): Promise<ReversePaymentResult> {
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

    // Compensating action for supplier-debt payments: reopen the settled
    // supplier debts. The saga lookup (by cash_payment_id) no-ops for ordinary
    // GOODS_RECEIPT cash purchases that have no payment saga.
    if (original.referenceType === CashPaymentReferenceType.GOODS_RECEIPT) {
      await this.supplierDebtPaymentSaga.compensate(original.id, manager);
    }

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
      staffId: args.staffId,
      attachmentIds: args.attachmentIds ?? [],
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
  ): Promise<
    CashPaymentEntity & {
      sourceLink: PaymentSourceLink | null;
      linkedVoucher: LinkedVoucher | null;
    }
  > {
    const payment = await this.getByIdInTx(
      this.dataSource.manager,
      id,
      actor.organizationId,
    );
    const sourceLink = await this.buildSourceLink(payment, actor.organizationId);
    // The receipt this payment refunded, when the voucher is one half of a pair.
    const linkedVoucher = await this.voucherLinks.findLinkedVoucher(
      VoucherLinkKind.CASH_PAYMENT,
      payment.id,
      actor.organizationId,
    );
    return Object.assign(payment, { sourceLink, linkedVoucher });
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

  /**
   * Re-read the voucher inside the caller's transaction holding a row lock, so
   * two concurrent edits serialise instead of both computing a delta from the
   * same starting amount and posting two compensating movements.
   */
  private async lockForWrite(
    manager: EntityManager,
    id: string,
    organizationId: string,
  ): Promise<CashPaymentEntity> {
    const payment = await manager
      .createQueryBuilder(CashPaymentEntity, 'p')
      .setLock('pessimistic_write')
      .where('p.id = :id', { id })
      .andWhere('p.organizationId = :organizationId', { organizationId })
      .getOne();
    if (!payment) {
      throw new NotFoundException(`Cash payment ${id} not found`);
    }
    return payment;
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
