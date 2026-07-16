import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, DataSource, EntityManager, Not, Repository } from "typeorm";
import {
  DepositMovementSource,
  DepositMovementType,
  DepositTransferStatus,
  DocumentType,
  ReconStatus,
} from "@erp/shared-interfaces";
import { ActorContext } from "../../../../common/decorators/actor-context.decorator";
import { DocumentNumberingService } from "../../../document-numbering/document-numbering.service";
import { DepositService } from "../../deposit/deposit.service";
import { DepositAccountEntity } from "../../deposit/deposit-account.entity";
import { DepositMovementEntity } from "../../deposit/deposit-movement.entity";
import { DepositPeriodGuardService } from "../../deposit-period-lock/deposit-period-guard.service";
import { SupplierDepositPaymentSagaService } from "../supplier-deposit-payment/supplier-deposit-payment-saga.service";
import {
  BankPaymentPurpose,
  BankPaymentReferenceType,
  BankVoucherPartnerType,
  BankVoucherStatus,
} from "../enums";
import { PartnerResolverService } from "../../cash-vouchers/shared/partner-resolver.service";
import { CashVoucherPartnerType } from "../../cash-vouchers/enums";
import { AccountResolverService } from "../../payment-accounts/account-resolver.service";
import { AccountingDefaultAccountRole } from "../../payment-accounts/enums";
import { BankPaymentEntity } from "./bank-payment.entity";
import { BankPaymentLineEntity } from "./bank-payment-line.entity";
import { CreateBankPaymentDto } from "./dto/create-bank-payment.dto";
import { UpdateBankPaymentDto } from "./dto/update-bank-payment.dto";
import { BankPaymentLineDto } from "./dto/bank-payment-line.dto";
import {
  QueryBankPaymentDto,
  BankPaymentSource,
} from "./dto/query-bank-payment.dto";

export interface BankPaymentCreateAndPostArgs {
  purpose: BankPaymentPurpose;
  depositAccountId: string;
  contraAccountId: string;
  amount: number;
  actor: ActorContext;
  docDate?: string;
  referenceType?: BankPaymentReferenceType;
  referenceId?: string;
  partnerType?: BankVoucherPartnerType;
  partnerId?: string;
  partnerName?: string;
  partnerAddress?: string;
  payeeName?: string;
  paidBy?: string;
  reference?: string;
  affectExpense?: boolean;
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
  /**
   * GĐ4 (inter-branch transfer) — overrides the movement's `source` (default
   * MANUAL) and carries the D2 idempotency grain (`source_ref_id` = referenceId,
   * `source_ref_line_id`) plus the transfer-pair link, all threaded straight to
   * {@link DepositService.recordMovement}.
   */
  source?: DepositMovementSource;
  sourceRefLineId?: string;
  transferPairId?: string;
  transferStatus?: DepositTransferStatus;
}

export interface BankPaymentCreateForMovementArgs extends BankPaymentCreateAndPostArgs {
  depositMovementId: string;
  journalEntryId: string;
}

export interface ReverseBankPaymentResult {
  original: BankPaymentEntity;
  reversal: BankPaymentEntity;
}

/**
 * Contra (offsetting) GL account role per payment purpose. A manually-created
 * payment posts DR contra / CR deposit, where the contra account is resolved from
 * this role via {@link AccountResolverService}. Fund-move purposes (CASH_TRANSFER
 * / INTER_BRANCH_OUT) normally supply an explicit contra override; the mapped role
 * is only the fallback default.
 */
const PAYMENT_PURPOSE_TO_ROLE: Record<
  BankPaymentPurpose,
  AccountingDefaultAccountRole
> = {
  [BankPaymentPurpose.SUPPLIER_PAYMENT]: AccountingDefaultAccountRole.PAYABLE,
  [BankPaymentPurpose.PURCHASE]: AccountingDefaultAccountRole.PAYABLE,
  [BankPaymentPurpose.EXPENSE]: AccountingDefaultAccountRole.EXPENSE,
  [BankPaymentPurpose.CASH_TRANSFER]: AccountingDefaultAccountRole.EXPENSE,
  [BankPaymentPurpose.INTER_BRANCH_OUT]: AccountingDefaultAccountRole.EXPENSE,
  [BankPaymentPurpose.REFUND]: AccountingDefaultAccountRole.REVENUE,
  [BankPaymentPurpose.BANK_FEE]: AccountingDefaultAccountRole.EXPENSE,
  [BankPaymentPurpose.OTHER]: AccountingDefaultAccountRole.EXPENSE,
};

/**
 * Fund-move purposes are not expenses (they move money between funds/branches),
 * so affect_expense is forced false regardless of client input — BR-CHI-05.
 */
const FUND_MOVE_PURPOSES: ReadonlySet<BankPaymentPurpose> = new Set([
  BankPaymentPurpose.CASH_TRANSFER,
  BankPaymentPurpose.INTER_BRANCH_OUT,
]);

@Injectable()
export class BankPaymentsService {
  private readonly logger = new Logger(BankPaymentsService.name);

  constructor(
    @InjectRepository(BankPaymentEntity)
    private readonly paymentRepo: Repository<BankPaymentEntity>,
    @InjectRepository(BankPaymentLineEntity)
    private readonly lineRepo: Repository<BankPaymentLineEntity>,
    private readonly dataSource: DataSource,
    private readonly depositService: DepositService,
    private readonly docNumbering: DocumentNumberingService,
    private readonly partnerResolver: PartnerResolverService,
    private readonly accountResolver: AccountResolverService,
    private readonly periodGuard: DepositPeriodGuardService,
    @Inject(forwardRef(() => SupplierDepositPaymentSagaService))
    private readonly supplierDepositPaymentSaga: SupplierDepositPaymentSagaService,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD (DRAFT lifecycle)
  // ---------------------------------------------------------------------------

  /**
   * Create a manual bank payment and post it to the deposit fund immediately (no
   * DRAFT stage). The contra account is resolved server-side from the voucher
   * purpose (DR contra / CR deposit); an explicit `contraAccountId` is honoured
   * only as an override (e.g. a fund move). Movement + journal entry + POSTED
   * voucher are written atomically; insufficient balance fails the whole create
   * (BR-CHI-01). Corrections are made via {@link reverse}, not edits.
   *
   * BR-CHI-03 (approval limit) is intentionally not gated here (OQ-08): a payment
   * posts directly. The approval_status / approved_by / approved_at columns are
   * left as the seam for a future gate.
   */
  async create(
    dto: CreateBankPaymentDto,
    actor: ActorContext,
  ): Promise<BankPaymentEntity> {
    this.assertTotalMatchesLines(dto.totalAmount, dto.lines);
    const purpose = dto.purpose ?? BankPaymentPurpose.OTHER;

    return this.dataSource.transaction(async (manager) => {
      await this.assertDepositAccount(
        manager,
        dto.depositAccountId,
        actor.organizationId,
      );
      const partner = await this.resolvePartner(
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
          depositAccountId: dto.depositAccountId,
          contraAccountId,
          amount: dto.totalAmount,
          actor,
          docDate: dto.docDate,
          referenceType: BankPaymentReferenceType.MANUAL,
          partnerType: dto.partnerType,
          partnerId: dto.partnerId,
          partnerName: partner?.name ?? undefined,
          partnerAddress: partner?.address ?? undefined,
          payeeName: dto.payeeName,
          paidBy: dto.paidBy,
          reference: dto.reference,
          affectExpense: this.resolveAffectExpense(purpose, dto.affectExpense),
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
    dto: UpdateBankPaymentDto,
    actor: ActorContext,
  ): Promise<BankPaymentEntity> {
    return this.dataSource.transaction(async (manager) => {
      const payment = await this.loadForWrite(
        manager,
        id,
        actor.organizationId,
      );
      if (payment.status !== BankVoucherStatus.DRAFT) {
        throw new BadRequestException(
          "Only DRAFT bank payments can be updated",
        );
      }

      if (dto.partnerType !== undefined || dto.partnerId !== undefined) {
        await this.resolvePartner(
          manager,
          dto.partnerType ?? payment.partnerType,
          dto.partnerId ?? payment.partnerId,
          actor.organizationId,
        );
      }

      const purpose = dto.purpose ?? payment.purpose;
      Object.assign(payment, {
        depositAccountId: dto.depositAccountId ?? payment.depositAccountId,
        docDate: dto.docDate ?? payment.docDate,
        purpose,
        partnerType: dto.partnerType ?? payment.partnerType,
        partnerId: dto.partnerId ?? payment.partnerId,
        payeeName: dto.payeeName ?? payment.payeeName,
        reason: dto.reason ?? payment.reason,
        paidBy: dto.paidBy ?? payment.paidBy,
        reference: dto.reference ?? payment.reference,
        // BR-CHI-05: fund moves are never expenses, coerced server-side.
        affectExpense: this.resolveAffectExpense(
          purpose,
          dto.affectExpense ?? payment.affectExpense,
        ),
        contraAccountId: dto.contraAccountId ?? payment.contraAccountId,
        attachmentIds: dto.attachmentIds ?? payment.attachmentIds,
      });

      if (dto.lines) {
        await this.syncLines(manager, payment.id, actor, dto.lines);
      }

      const lines = await manager.find(BankPaymentLineEntity, {
        where: { bankPaymentId: payment.id },
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
    if (payment.status !== BankVoucherStatus.DRAFT) {
      throw new BadRequestException("Only DRAFT bank payments can be deleted");
    }
    await this.paymentRepo.softDelete(payment.id);
  }

  // ---------------------------------------------------------------------------
  // post / reverse
  // ---------------------------------------------------------------------------

  async post(id: string, actor: ActorContext): Promise<BankPaymentEntity> {
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager
        .createQueryBuilder(BankPaymentEntity, "p")
        .setLock("pessimistic_write")
        .where("p.id = :id", { id })
        .andWhere("p.organizationId = :org", { org: actor.organizationId })
        .getOne();
      if (!payment) {
        throw new NotFoundException(`Bank payment ${id} not found`);
      }
      if (payment.status !== BankVoucherStatus.DRAFT) {
        throw new BadRequestException(
          `Bank payment ${id} is not in DRAFT status`,
        );
      }

      const lines = await manager.find(BankPaymentLineEntity, {
        where: { bankPaymentId: payment.id },
      });
      const lineSum = this.sum(lines.map((l) => Number(l.amount)));
      if (Math.abs(Number(payment.totalAmount) - lineSum) > 0.001) {
        throw new BadRequestException(
          `total_amount (${payment.totalAmount}) must equal sum of line amounts (${lineSum})`,
        );
      }

      const partner = await this.resolvePartner(
        manager,
        payment.partnerType,
        payment.partnerId,
        actor.organizationId,
      );

      // BR-LOCK-01
      await this.periodGuard.assertNotLocked(
        actor.branchId!,
        payment.docDate,
        manager,
      );

      const documentNumber = await this.docNumbering.generate(
        DocumentType.BANK_PAYMENT,
        actor.branchId,
        actor,
      );

      // WITHDRAWAL: insufficient balance throws 400 before any UPDATE (BR-CHI-01).
      const { movement, journalEntryId } =
        await this.depositService.recordMovement(
          {
            depositAccountId: payment.depositAccountId,
            type: DepositMovementType.WITHDRAWAL,
            amount: Number(payment.totalAmount),
            contraAccountId: payment.contraAccountId,
            source: DepositMovementSource.MANUAL,
            docDate: payment.docDate,
            documentNumber,
          },
          actor,
          manager,
        );

      payment.status = BankVoucherStatus.POSTED;
      payment.documentNumber = documentNumber;
      payment.depositMovementId = movement.id;
      payment.journalEntryId = journalEntryId;
      payment.postedAt = new Date();
      payment.postedBy = actor.userId;
      if (partner) {
        payment.partnerNameSnapshot = partner.name ?? undefined;
        payment.partnerAddressSnapshot = partner.address ?? undefined;
      }
      await manager.save(payment);

      this.logger.log(
        `Posted bank payment ${documentNumber} (id=${payment.id}, amount=${payment.totalAmount})`,
      );
      return this.getByIdInTx(manager, payment.id, actor.organizationId);
    });
  }

  /**
   * Reverse a POSTED payment. Takes an optional `manager` so GĐ4's transfer
   * cancel can run the reversal inside the same transaction as the
   * `deposit_transfer` status update (mirrors {@link createAndPostInternal}).
   */
  async reverse(
    id: string,
    reason: string,
    actor: ActorContext,
    manager?: EntityManager,
  ): Promise<ReverseBankPaymentResult> {
    const run = (m: EntityManager) => this.reverseInTx(id, reason, actor, m);
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  private async reverseInTx(
    id: string,
    reason: string,
    actor: ActorContext,
    manager: EntityManager,
  ): Promise<ReverseBankPaymentResult> {
    const original = await manager
      .createQueryBuilder(BankPaymentEntity, "p")
      .setLock("pessimistic_write")
      .where("p.id = :id", { id })
      .andWhere("p.organizationId = :org", { org: actor.organizationId })
      .getOne();
    if (!original) {
      throw new NotFoundException(`Bank payment ${id} not found`);
    }
    if (original.status !== BankVoucherStatus.POSTED) {
      throw new BadRequestException(
        `Bank payment ${id} is not in POSTED status`,
      );
    }
    if (original.reversedByVoucherId) {
      throw new BadRequestException(
        `Bank payment ${id} has already been reversed`,
      );
    }
    // BR-BUY-04: a payment whose deposit movement has already been bank-
    // reconciled cannot be reversed.
    if (original.depositMovementId) {
      const movement = await manager.findOne(DepositMovementEntity, {
        where: { id: original.depositMovementId },
      });
      if (movement && movement.reconStatus !== ReconStatus.CHUA) {
        throw new BadRequestException(
          `Bank payment ${id} cannot be reversed: its deposit movement has already been reconciled`,
        );
      }
    }

    const originalLines = await manager.find(BankPaymentLineEntity, {
      where: { bankPaymentId: original.id },
      order: { lineOrder: "ASC" },
    });

    const documentNumber = await this.docNumbering.generate(
      DocumentType.BANK_PAYMENT,
      actor.branchId,
      actor,
    );

    // The opposite movement (DEPOSIT) restores the balance and posts the
    // reversing journal entry (DR deposit / CR contra). Balance increases, so no
    // insufficient-balance check is needed.
    const { movement, journalEntryId } =
      await this.depositService.recordMovement(
        {
          depositAccountId: original.depositAccountId,
          type: DepositMovementType.DEPOSIT,
          amount: Number(original.totalAmount),
          contraAccountId: original.contraAccountId,
          source: DepositMovementSource.MANUAL,
          docDate: this.today(),
          documentNumber,
        },
        actor,
        manager,
      );

    const reversal = manager.create(BankPaymentEntity, {
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      documentNumber,
      depositAccountId: original.depositAccountId,
      docDate: this.today(),
      status: BankVoucherStatus.POSTED,
      purpose: original.purpose,
      partnerType: original.partnerType,
      partnerId: original.partnerId,
      partnerNameSnapshot: original.partnerNameSnapshot,
      partnerAddressSnapshot: original.partnerAddressSnapshot,
      payeeName: original.payeeName,
      reason: original.reason,
      paidBy: original.paidBy,
      reference: original.reference,
      affectExpense: original.affectExpense,
      referenceType: BankPaymentReferenceType.REVERSAL,
      referenceId: original.id,
      contraAccountId: original.contraAccountId,
      totalAmount: Number(original.totalAmount),
      depositMovementId: movement.id,
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

    original.status = BankVoucherStatus.REVERSED;
    original.reversedByVoucherId = savedReversal.id;
    await manager.save(original);

    // BR-BUY-04: restore the payable if this payment funded a
    // supplier-deposit-payment saga.
    await this.supplierDepositPaymentSaga.compensate(original.id, manager);

    this.logger.log(
      `Reversed bank payment ${original.documentNumber} → ${documentNumber}`,
    );

    return {
      original: await this.getByIdInTx(
        manager,
        original.id,
        actor.organizationId,
      ),
      reversal: await this.getByIdInTx(
        manager,
        savedReversal.id,
        actor.organizationId,
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // Internal methods (GĐ4 inter-branch + reuse)
  // ---------------------------------------------------------------------------

  async createAndPostInternal(
    args: BankPaymentCreateAndPostArgs,
    manager?: EntityManager,
  ): Promise<{
    voucherId: string;
    voucherNumber: string;
    depositMovementId: string;
    journalEntryId: string;
  }> {
    const run = (m: EntityManager) => this.createAndPostInternalInTx(args, m);
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  /**
   * Create a DRAFT voucher only — no movement, no journal entry, no balance
   * change (BR-REC-03: a reconciliation-adjustment proposal for an accountant
   * to review and post separately via {@link post}).
   */
  async createDraftInternal(
    args: BankPaymentCreateAndPostArgs,
    manager?: EntityManager,
  ): Promise<{ voucherId: string }> {
    const run = async (m: EntityManager) => {
      const { actor } = args;
      const lines =
        args.lines && args.lines.length > 0
          ? args.lines
          : [
              {
                description: args.description ?? "Bank payment",
                amount: args.amount,
                categoryId: args.categoryId,
              },
            ];
      const voucher = m.create(BankPaymentEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        depositAccountId: args.depositAccountId,
        docDate: args.docDate ?? this.today(),
        status: BankVoucherStatus.DRAFT,
        purpose: args.purpose,
        partnerType: args.partnerType,
        partnerId: args.partnerId,
        partnerNameSnapshot: args.partnerName,
        partnerAddressSnapshot: args.partnerAddress,
        payeeName: args.payeeName,
        paidBy: args.paidBy,
        reference: args.reference,
        affectExpense: this.resolveAffectExpense(
          args.purpose,
          args.affectExpense,
        ),
        attachmentIds: args.attachmentIds ?? [],
        reason: args.reason,
        referenceType: args.referenceType,
        referenceId: args.referenceId,
        contraAccountId: args.contraAccountId,
        totalAmount: args.amount,
      });
      const saved = await m.save(voucher);
      await this.insertLines(m, saved.id, actor, lines);
      return { voucherId: saved.id };
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  private async createAndPostInternalInTx(
    args: BankPaymentCreateAndPostArgs,
    manager: EntityManager,
  ): Promise<{
    voucherId: string;
    voucherNumber: string;
    depositMovementId: string;
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
        voucherNumber: existing.documentNumber ?? "",
        depositMovementId: existing.depositMovementId ?? "",
        journalEntryId: existing.journalEntryId ?? "",
      };
    }

    // BR-LOCK-01: docDate falling in a locked period blocks the post.
    await this.periodGuard.assertNotLocked(
      actor.branchId!,
      args.docDate ?? this.today(),
      manager,
    );

    const documentNumber = await this.docNumbering.generate(
      DocumentType.BANK_PAYMENT,
      actor.branchId,
      actor,
    );

    // WITHDRAWAL — insufficient balance throws 400, rolling back the caller TX.
    const { movement, journalEntryId } =
      await this.depositService.recordMovement(
        {
          depositAccountId: args.depositAccountId,
          type: DepositMovementType.WITHDRAWAL,
          amount: args.amount,
          contraAccountId: args.contraAccountId,
          source: args.source ?? DepositMovementSource.MANUAL,
          sourceRefId: args.referenceId,
          sourceRefLineId: args.sourceRefLineId,
          transferPairId: args.transferPairId,
          transferStatus: args.transferStatus,
          docDate: args.docDate ?? this.today(),
          documentNumber,
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
      depositMovementId: movement.id,
      journalEntryId,
    };
  }

  async createVoucherForMovement(
    args: BankPaymentCreateForMovementArgs,
    manager?: EntityManager,
  ): Promise<{ voucherId: string; voucherNumber: string }> {
    const run = async (m: EntityManager) => {
      const existing = await this.findByReference(
        m,
        args.referenceType,
        args.referenceId,
        args.actor.organizationId,
      );
      if (existing) {
        return {
          voucherId: existing.id,
          voucherNumber: existing.documentNumber ?? "",
        };
      }
      const documentNumber = await this.docNumbering.generate(
        DocumentType.BANK_PAYMENT,
        args.actor.branchId,
        args.actor,
      );
      const voucher = await this.insertPostedVoucher(
        m,
        args,
        documentNumber,
        args.depositMovementId,
        args.journalEntryId,
      );
      return { voucherId: voucher.id, voucherNumber: documentNumber };
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  private async insertPostedVoucher(
    manager: EntityManager,
    args: BankPaymentCreateAndPostArgs,
    documentNumber: string,
    depositMovementId: string,
    journalEntryId: string,
  ): Promise<BankPaymentEntity> {
    const { actor } = args;
    const lines =
      args.lines && args.lines.length > 0
        ? args.lines
        : [
            {
              description: args.description ?? "Bank payment",
              amount: args.amount,
              categoryId: args.categoryId,
            },
          ];

    const voucher = manager.create(BankPaymentEntity, {
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      documentNumber,
      depositAccountId: args.depositAccountId,
      docDate: args.docDate ?? this.today(),
      status: BankVoucherStatus.POSTED,
      purpose: args.purpose,
      partnerType: args.partnerType,
      partnerId: args.partnerId,
      partnerNameSnapshot: args.partnerName,
      partnerAddressSnapshot: args.partnerAddress,
      payeeName: args.payeeName,
      paidBy: args.paidBy,
      reference: args.reference,
      affectExpense: this.resolveAffectExpense(
        args.purpose,
        args.affectExpense,
      ),
      attachmentIds: args.attachmentIds ?? [],
      reason: args.reason,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      contraAccountId: args.contraAccountId,
      totalAmount: args.amount,
      depositMovementId,
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
    query: QueryBankPaymentDto,
    actor: ActorContext,
  ): Promise<{
    data: BankPaymentEntity[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb = this.paymentRepo
      .createQueryBuilder("p")
      .where("p.organizationId = :org", { org: actor.organizationId });

    if (query.status)
      qb.andWhere("p.status = :status", { status: query.status });
    if (query.purpose)
      qb.andWhere("p.purpose = :purpose", { purpose: query.purpose });
    if (query.depositAccountId)
      qb.andWhere("p.depositAccountId = :depositAccountId", {
        depositAccountId: query.depositAccountId,
      });
    else if (actor.branchId)
      qb.andWhere("p.branchId = :branchId", { branchId: actor.branchId });
    if (query.partnerId)
      qb.andWhere("p.partnerId = :partnerId", { partnerId: query.partnerId });
    if (query.dateFrom)
      qb.andWhere("p.docDate >= :dateFrom", { dateFrom: query.dateFrom });
    if (query.dateTo)
      qb.andWhere("p.docDate <= :dateTo", { dateTo: query.dateTo });
    if (query.search) {
      qb.andWhere(
        new Brackets((w) => {
          w.where("p.documentNumber ILIKE :s", { s: `%${query.search}%` })
            .orWhere("p.payeeName ILIKE :s", { s: `%${query.search}%` })
            .orWhere("p.reason ILIKE :s", { s: `%${query.search}%` });
        }),
      );
    }
    this.applySourceFilter(qb, query.source);

    qb.orderBy("p.docDate", "DESC")
      .addOrderBy("p.createdAt", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize };
  }

  async getById(id: string, actor: ActorContext): Promise<BankPaymentEntity> {
    return this.getByIdInTx(this.dataSource.manager, id, actor.organizationId);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve the polymorphic partner snapshot. The bank and cash partner-type enums
   * share identical string values; the shared resolver is typed against the cash
   * enum, so the type is bridged here in one place.
   */
  private resolvePartner(
    manager: EntityManager,
    partnerType: BankVoucherPartnerType | undefined,
    partnerId: string | undefined,
    organizationId: string,
  ) {
    return this.partnerResolver.resolve(
      manager,
      partnerType as unknown as CashVoucherPartnerType,
      partnerId,
      organizationId,
    );
  }

  /** BR-CHI-05: fund moves are never expenses. */
  private resolveAffectExpense(
    purpose: BankPaymentPurpose,
    requested?: boolean,
  ): boolean {
    if (FUND_MOVE_PURPOSES.has(purpose)) return false;
    return requested ?? false;
  }

  private applySourceFilter(
    qb: ReturnType<Repository<BankPaymentEntity>["createQueryBuilder"]>,
    source?: BankPaymentSource,
  ): void {
    if (!source) return;
    if (source === BankPaymentSource.GOODS_RECEIPT) {
      qb.andWhere("p.referenceType = :rt", {
        rt: BankPaymentReferenceType.GOODS_RECEIPT,
      });
    } else if (source === BankPaymentSource.EXPENSE) {
      qb.andWhere("p.referenceType = :rt", {
        rt: BankPaymentReferenceType.EXPENSE,
      });
    } else if (source === BankPaymentSource.TRANSFER) {
      qb.andWhere("p.referenceType = :rt", {
        rt: BankPaymentReferenceType.TRANSFER,
      });
    } else {
      qb.andWhere(
        new Brackets((w) => {
          w.where("p.referenceType IS NULL").orWhere("p.referenceType = :rt", {
            rt: BankPaymentReferenceType.MANUAL,
          });
        }),
      );
    }
  }

  private async getByIdInTx(
    manager: EntityManager,
    id: string,
    organizationId: string,
  ): Promise<BankPaymentEntity> {
    const payment = await manager.findOne(BankPaymentEntity, {
      where: { id, organizationId },
      relations: ["lines"],
      order: { lines: { lineOrder: "ASC" } },
    });
    if (!payment) {
      throw new NotFoundException(`Bank payment ${id} not found`);
    }
    return payment;
  }

  private async findByReference(
    manager: EntityManager,
    referenceType: BankPaymentReferenceType | undefined,
    referenceId: string | undefined,
    organizationId: string,
  ): Promise<BankPaymentEntity | null> {
    if (!referenceType || !referenceId) return null;
    return manager.findOne(BankPaymentEntity, {
      where: {
        organizationId,
        referenceType,
        referenceId,
        status: Not(BankVoucherStatus.REVERSED),
      },
    });
  }

  private async loadForWrite(
    manager: EntityManager,
    id: string,
    organizationId: string,
  ): Promise<BankPaymentEntity> {
    const payment = await manager.findOne(BankPaymentEntity, {
      where: { id, organizationId },
    });
    if (!payment) {
      throw new NotFoundException(`Bank payment ${id} not found`);
    }
    return payment;
  }

  private async assertDepositAccount(
    manager: EntityManager,
    depositAccountId: string,
    organizationId: string,
  ): Promise<void> {
    const account = await manager.findOne(DepositAccountEntity, {
      where: { id: depositAccountId, organizationId },
    });
    if (!account) {
      throw new NotFoundException(
        `Deposit account ${depositAccountId} not found`,
      );
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
      manager.create(BankPaymentLineEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        bankPaymentId: paymentId,
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
    lines: BankPaymentLineDto[],
  ): Promise<void> {
    const existing = await manager.find(BankPaymentLineEntity, {
      where: { bankPaymentId: paymentId },
    });
    const keepIds = new Set(lines.filter((l) => l.id).map((l) => l.id));
    const toDelete = existing.filter((e) => !keepIds.has(e.id));
    if (toDelete.length > 0) {
      await manager.delete(
        BankPaymentLineEntity,
        toDelete.map((e) => e.id),
      );
    }

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      if (line.id) {
        await manager.update(BankPaymentLineEntity, line.id, {
          lineOrder: idx,
          description: line.description,
          categoryId: line.categoryId ?? undefined,
          amount: line.amount,
          referenceNote: line.referenceNote ?? undefined,
        });
      } else {
        await manager.save(
          manager.create(BankPaymentLineEntity, {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            createdBy: actor.userId,
            bankPaymentId: paymentId,
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
