import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Not, Repository } from 'typeorm';
import {
  DepositMovementSource,
  DepositMovementType,
  DepositTransferStatus,
  DocumentType,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { DepositService } from '../../deposit/deposit.service';
import { DepositAccountEntity } from '../../deposit/deposit-account.entity';
import { DepositPeriodGuardService } from '../../deposit-period-lock/deposit-period-guard.service';
import {
  BankReceiptPurpose,
  BankReceiptReferenceType,
  BankVoucherPartnerType,
  BankVoucherStatus,
} from '../enums';
import { PartnerResolverService } from '../../cash-vouchers/shared/partner-resolver.service';
import { CashVoucherPartnerType } from '../../cash-vouchers/enums';
import { AccountResolverService } from '../../payment-accounts/account-resolver.service';
import { AccountingDefaultAccountRole } from '../../payment-accounts/enums';
import { BankReceiptEntity } from './bank-receipt.entity';
import { BankReceiptLineEntity } from './bank-receipt-line.entity';
import { CreateBankReceiptDto } from './dto/create-bank-receipt.dto';
import { UpdateBankReceiptDto } from './dto/update-bank-receipt.dto';
import { BankReceiptLineDto } from './dto/bank-receipt-line.dto';
import { QueryBankReceiptDto, BankReceiptSource } from './dto/query-bank-receipt.dto';

/** Internal args for movement+JE+voucher atomic creation (GĐ4 / reuse). */
export interface BankReceiptCreateAndPostArgs {
  purpose: BankReceiptPurpose;
  depositAccountId: string;
  contraAccountId: string;
  amount: number;
  actor: ActorContext;
  docDate?: string;
  referenceType?: BankReceiptReferenceType;
  referenceId?: string;
  partnerType?: BankVoucherPartnerType;
  partnerId?: string;
  partnerName?: string;
  partnerAddress?: string;
  payerName?: string;
  collectedBy?: string;
  reference?: string;
  affectRevenue?: boolean;
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

/** Internal args for voucher-only creation linking an existing movement + JE. */
export interface BankReceiptCreateForMovementArgs
  extends BankReceiptCreateAndPostArgs {
  depositMovementId: string;
  journalEntryId: string;
}

export interface ReverseBankReceiptResult {
  original: BankReceiptEntity;
  reversal: BankReceiptEntity;
}

/**
 * Contra (offsetting) GL account role per receipt purpose. A manually-created
 * receipt posts DR deposit / CR contra, where the contra account is resolved from
 * this role via {@link AccountResolverService}. INTER_BRANCH_IN normally supplies
 * an explicit contra override (GĐ4); the mapped role is only the fallback default.
 */
const RECEIPT_PURPOSE_TO_ROLE: Record<
  BankReceiptPurpose,
  AccountingDefaultAccountRole
> = {
  [BankReceiptPurpose.OTHER]: AccountingDefaultAccountRole.OTHER_INCOME,
  [BankReceiptPurpose.OTHER_INCOME]: AccountingDefaultAccountRole.OTHER_INCOME,
  [BankReceiptPurpose.DEBT_COLLECTION]: AccountingDefaultAccountRole.RECEIVABLE,
  [BankReceiptPurpose.INTER_BRANCH_IN]: AccountingDefaultAccountRole.OTHER_INCOME,
};

@Injectable()
export class BankReceiptsService {
  private readonly logger = new Logger(BankReceiptsService.name);

  constructor(
    @InjectRepository(BankReceiptEntity)
    private readonly receiptRepo: Repository<BankReceiptEntity>,
    @InjectRepository(BankReceiptLineEntity)
    private readonly lineRepo: Repository<BankReceiptLineEntity>,
    private readonly dataSource: DataSource,
    private readonly depositService: DepositService,
    private readonly docNumbering: DocumentNumberingService,
    private readonly partnerResolver: PartnerResolverService,
    private readonly accountResolver: AccountResolverService,
    private readonly periodGuard: DepositPeriodGuardService,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD (DRAFT lifecycle)
  // ---------------------------------------------------------------------------

  /**
   * Create a manual bank receipt and post it to the deposit fund immediately (no
   * DRAFT stage). The contra account is resolved server-side from the voucher
   * purpose (DR deposit / CR contra); an explicit `contraAccountId` is honoured
   * only as an override. Movement + journal entry + POSTED voucher are written
   * atomically. Corrections are made via {@link reverse}, not edits.
   */
  async create(
    dto: CreateBankReceiptDto,
    actor: ActorContext,
  ): Promise<BankReceiptEntity> {
    this.assertTotalMatchesLines(dto.totalAmount, dto.lines);
    const purpose = dto.purpose ?? BankReceiptPurpose.OTHER;

    return this.dataSource.transaction(async (manager) => {
      await this.assertDepositAccount(
        manager,
        dto.depositAccountId,
        actor.organizationId,
      );
      // Validate the polymorphic partner exists and snapshot its name/address.
      const partner = await this.resolvePartner(
        manager,
        dto.partnerType,
        dto.partnerId,
        actor.organizationId,
      );
      const contraAccountId = await this.accountResolver.resolveContraAccount(
        RECEIPT_PURPOSE_TO_ROLE[purpose],
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
          referenceType: BankReceiptReferenceType.MANUAL,
          partnerType: dto.partnerType,
          partnerId: dto.partnerId,
          partnerName: partner?.name ?? undefined,
          partnerAddress: partner?.address ?? undefined,
          payerName: dto.payerName,
          collectedBy: dto.collectedBy,
          reference: dto.reference,
          affectRevenue: dto.affectRevenue ?? false,
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
    dto: UpdateBankReceiptDto,
    actor: ActorContext,
  ): Promise<BankReceiptEntity> {
    return this.dataSource.transaction(async (manager) => {
      const receipt = await this.loadForWrite(manager, id, actor.organizationId);
      if (receipt.status !== BankVoucherStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT bank receipts can be updated');
      }

      if (dto.partnerType !== undefined || dto.partnerId !== undefined) {
        await this.resolvePartner(
          manager,
          dto.partnerType ?? receipt.partnerType,
          dto.partnerId ?? receipt.partnerId,
          actor.organizationId,
        );
      }

      Object.assign(receipt, {
        depositAccountId: dto.depositAccountId ?? receipt.depositAccountId,
        docDate: dto.docDate ?? receipt.docDate,
        purpose: dto.purpose ?? receipt.purpose,
        partnerType: dto.partnerType ?? receipt.partnerType,
        partnerId: dto.partnerId ?? receipt.partnerId,
        payerName: dto.payerName ?? receipt.payerName,
        reason: dto.reason ?? receipt.reason,
        collectedBy: dto.collectedBy ?? receipt.collectedBy,
        reference: dto.reference ?? receipt.reference,
        affectRevenue: dto.affectRevenue ?? receipt.affectRevenue,
        contraAccountId: dto.contraAccountId ?? receipt.contraAccountId,
        attachmentIds: dto.attachmentIds ?? receipt.attachmentIds,
      });

      if (dto.lines) {
        await this.syncLines(manager, receipt.id, actor, dto.lines);
      }

      const lines = await manager.find(BankReceiptLineEntity, {
        where: { bankReceiptId: receipt.id },
      });
      const lineSum = this.sum(lines.map((l) => Number(l.amount)));
      const total = dto.totalAmount ?? lineSum;
      if (Math.abs(Number(total) - lineSum) > 0.001) {
        throw new BadRequestException(
          `total_amount (${total}) must equal sum of line amounts (${lineSum})`,
        );
      }
      receipt.totalAmount = total;

      await manager.save(receipt);
      return this.getByIdInTx(manager, receipt.id, actor.organizationId);
    });
  }

  async delete(id: string, actor: ActorContext): Promise<void> {
    const receipt = await this.loadForWrite(
      this.dataSource.manager,
      id,
      actor.organizationId,
    );
    if (receipt.status !== BankVoucherStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT bank receipts can be deleted');
    }
    await this.receiptRepo.softDelete(receipt.id);
  }

  // ---------------------------------------------------------------------------
  // post / reverse
  // ---------------------------------------------------------------------------

  async post(id: string, actor: ActorContext): Promise<BankReceiptEntity> {
    return this.dataSource.transaction(async (manager) => {
      const receipt = await manager
        .createQueryBuilder(BankReceiptEntity, 'r')
        .setLock('pessimistic_write')
        .where('r.id = :id', { id })
        .andWhere('r.organizationId = :org', { org: actor.organizationId })
        .getOne();
      if (!receipt) {
        throw new NotFoundException(`Bank receipt ${id} not found`);
      }
      if (receipt.status !== BankVoucherStatus.DRAFT) {
        throw new BadRequestException(`Bank receipt ${id} is not in DRAFT status`);
      }

      const lines = await manager.find(BankReceiptLineEntity, {
        where: { bankReceiptId: receipt.id },
      });
      const lineSum = this.sum(lines.map((l) => Number(l.amount)));
      if (Math.abs(Number(receipt.totalAmount) - lineSum) > 0.001) {
        throw new BadRequestException(
          `total_amount (${receipt.totalAmount}) must equal sum of line amounts (${lineSum})`,
        );
      }

      const partner = await this.resolvePartner(
        manager,
        receipt.partnerType,
        receipt.partnerId,
        actor.organizationId,
      );

      // BR-LOCK-01
      await this.periodGuard.assertNotLocked(actor.branchId!, receipt.docDate, manager);

      const documentNumber = await this.docNumbering.generate(
        DocumentType.BANK_RECEIPT,
        actor.branchId,
        actor,
      );

      const { movement, journalEntryId } =
        await this.depositService.recordMovement(
          {
            depositAccountId: receipt.depositAccountId,
            type: DepositMovementType.DEPOSIT,
            amount: Number(receipt.totalAmount),
            contraAccountId: receipt.contraAccountId,
            source: DepositMovementSource.MANUAL,
            docDate: receipt.docDate,
            documentNumber,
          },
          actor,
          manager,
        );

      receipt.status = BankVoucherStatus.POSTED;
      receipt.documentNumber = documentNumber;
      receipt.depositMovementId = movement.id;
      receipt.journalEntryId = journalEntryId;
      receipt.postedAt = new Date();
      receipt.postedBy = actor.userId;
      if (partner) {
        receipt.partnerNameSnapshot = partner.name ?? undefined;
        receipt.partnerAddressSnapshot = partner.address ?? undefined;
      }
      await manager.save(receipt);

      this.logger.log(
        `Posted bank receipt ${documentNumber} (id=${receipt.id}, amount=${receipt.totalAmount})`,
      );
      return this.getByIdInTx(manager, receipt.id, actor.organizationId);
    });
  }

  async reverse(
    id: string,
    reason: string,
    actor: ActorContext,
  ): Promise<ReverseBankReceiptResult> {
    return this.dataSource.transaction(async (manager) => {
      const original = await manager
        .createQueryBuilder(BankReceiptEntity, 'r')
        .setLock('pessimistic_write')
        .where('r.id = :id', { id })
        .andWhere('r.organizationId = :org', { org: actor.organizationId })
        .getOne();
      if (!original) {
        throw new NotFoundException(`Bank receipt ${id} not found`);
      }
      if (original.status !== BankVoucherStatus.POSTED) {
        throw new BadRequestException(`Bank receipt ${id} is not in POSTED status`);
      }
      if (original.reversedByVoucherId) {
        throw new BadRequestException(
          `Bank receipt ${id} has already been reversed`,
        );
      }

      const originalLines = await manager.find(BankReceiptLineEntity, {
        where: { bankReceiptId: original.id },
        order: { lineOrder: 'ASC' },
      });

      const documentNumber = await this.docNumbering.generate(
        DocumentType.BANK_RECEIPT,
        actor.branchId,
        actor,
      );

      // The opposite movement (WITHDRAWAL) restores the balance and posts the
      // reversing journal entry (DR contra / CR deposit) — the exact swap of the
      // original DEPOSIT entry. Insufficient balance throws 400.
      const { movement, journalEntryId } =
        await this.depositService.recordMovement(
          {
            depositAccountId: original.depositAccountId,
            type: DepositMovementType.WITHDRAWAL,
            amount: Number(original.totalAmount),
            contraAccountId: original.contraAccountId,
            source: DepositMovementSource.MANUAL,
            docDate: this.today(),
            documentNumber,
          },
          actor,
          manager,
        );

      const reversal = manager.create(BankReceiptEntity, {
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
        payerName: original.payerName,
        reason: original.reason,
        collectedBy: original.collectedBy,
        reference: original.reference,
        affectRevenue: original.affectRevenue,
        referenceType: BankReceiptReferenceType.REVERSAL,
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

      // Copy the original lines verbatim (amount > 0 — CHECK passes).
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

      this.logger.log(
        `Reversed bank receipt ${original.documentNumber} → ${documentNumber}`,
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
    });
  }

  // ---------------------------------------------------------------------------
  // Internal methods (GĐ4 inter-branch + reuse)
  // ---------------------------------------------------------------------------

  /**
   * Create movement + JE + POSTED voucher atomically. When `manager` is provided
   * everything runs in the caller's transaction. Returns the created ids for
   * linking by callers.
   */
  async createAndPostInternal(
    args: BankReceiptCreateAndPostArgs,
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

  private async createAndPostInternalInTx(
    args: BankReceiptCreateAndPostArgs,
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
        voucherNumber: existing.documentNumber ?? '',
        depositMovementId: existing.depositMovementId ?? '',
        journalEntryId: existing.journalEntryId ?? '',
      };
    }

    // BR-LOCK-01: docDate falling in a locked period blocks the post.
    await this.periodGuard.assertNotLocked(
      actor.branchId!,
      args.docDate ?? this.today(),
      manager,
    );

    const documentNumber = await this.docNumbering.generate(
      DocumentType.BANK_RECEIPT,
      actor.branchId,
      actor,
    );

    const { movement, journalEntryId } =
      await this.depositService.recordMovement(
        {
          depositAccountId: args.depositAccountId,
          type: DepositMovementType.DEPOSIT,
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

  /**
   * Create a POSTED voucher document that links an already-created movement + JE.
   * Does NOT touch balance / movements / journal entries (GĐ4 inter-branch flows).
   */
  async createVoucherForMovement(
    args: BankReceiptCreateForMovementArgs,
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
          voucherNumber: existing.documentNumber ?? '',
        };
      }
      const documentNumber = await this.docNumbering.generate(
        DocumentType.BANK_RECEIPT,
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
    args: BankReceiptCreateAndPostArgs,
    documentNumber: string,
    depositMovementId: string,
    journalEntryId: string,
  ): Promise<BankReceiptEntity> {
    const { actor } = args;
    const lines =
      args.lines && args.lines.length > 0
        ? args.lines
        : [
            {
              description: args.description ?? 'Bank receipt',
              amount: args.amount,
              categoryId: args.categoryId,
            },
          ];

    const voucher = manager.create(BankReceiptEntity, {
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
      payerName: args.payerName,
      collectedBy: args.collectedBy,
      reference: args.reference,
      affectRevenue: args.affectRevenue ?? false,
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
    query: QueryBankReceiptDto,
    actor: ActorContext,
  ): Promise<{
    data: BankReceiptEntity[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb = this.receiptRepo
      .createQueryBuilder('r')
      .where('r.organizationId = :org', { org: actor.organizationId });

    if (query.status) qb.andWhere('r.status = :status', { status: query.status });
    if (query.purpose)
      qb.andWhere('r.purpose = :purpose', { purpose: query.purpose });
    if (query.depositAccountId)
      qb.andWhere('r.depositAccountId = :depositAccountId', {
        depositAccountId: query.depositAccountId,
      });
    else if (actor.branchId)
      qb.andWhere('r.branchId = :branchId', { branchId: actor.branchId });
    if (query.partnerId)
      qb.andWhere('r.partnerId = :partnerId', { partnerId: query.partnerId });
    if (query.dateFrom)
      qb.andWhere('r.docDate >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo)
      qb.andWhere('r.docDate <= :dateTo', { dateTo: query.dateTo });
    if (query.search) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('r.documentNumber ILIKE :s', { s: `%${query.search}%` })
            .orWhere('r.payerName ILIKE :s', { s: `%${query.search}%` })
            .orWhere('r.reason ILIKE :s', { s: `%${query.search}%` });
        }),
      );
    }
    this.applySourceFilter(qb, query.source);

    qb.orderBy('r.docDate', 'DESC')
      .addOrderBy('r.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize };
  }

  async getById(id: string, actor: ActorContext): Promise<BankReceiptEntity> {
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

  private applySourceFilter(
    qb: ReturnType<Repository<BankReceiptEntity>['createQueryBuilder']>,
    source?: BankReceiptSource,
  ): void {
    if (!source) return;
    if (source === BankReceiptSource.DEBT_COLLECTION) {
      qb.andWhere('r.referenceType = :rt', {
        rt: BankReceiptReferenceType.INVOICE_DEBT,
      });
    } else if (source === BankReceiptSource.TRANSFER) {
      qb.andWhere('r.referenceType = :rt', {
        rt: BankReceiptReferenceType.TRANSFER,
      });
    } else {
      // MANUAL — no auto-source reference.
      qb.andWhere(
        new Brackets((w) => {
          w.where('r.referenceType IS NULL').orWhere('r.referenceType = :rt', {
            rt: BankReceiptReferenceType.MANUAL,
          });
        }),
      );
    }
  }

  private async getByIdInTx(
    manager: EntityManager,
    id: string,
    organizationId: string,
  ): Promise<BankReceiptEntity> {
    const receipt = await manager.findOne(BankReceiptEntity, {
      where: { id, organizationId },
      relations: ['lines'],
      order: { lines: { lineOrder: 'ASC' } },
    });
    if (!receipt) {
      throw new NotFoundException(`Bank receipt ${id} not found`);
    }
    return receipt;
  }

  private async findByReference(
    manager: EntityManager,
    referenceType: BankReceiptReferenceType | undefined,
    referenceId: string | undefined,
    organizationId: string,
  ): Promise<BankReceiptEntity | null> {
    if (!referenceType || !referenceId) return null;
    return manager.findOne(BankReceiptEntity, {
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
  ): Promise<BankReceiptEntity> {
    const receipt = await manager.findOne(BankReceiptEntity, {
      where: { id, organizationId },
    });
    if (!receipt) {
      throw new NotFoundException(`Bank receipt ${id} not found`);
    }
    return receipt;
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
      throw new NotFoundException(`Deposit account ${depositAccountId} not found`);
    }
  }

  private async insertLines(
    manager: EntityManager,
    receiptId: string,
    actor: ActorContext,
    lines: Array<{
      description: string;
      amount: number;
      categoryId?: string;
      referenceNote?: string;
    }>,
  ): Promise<void> {
    const entities = lines.map((line, idx) =>
      manager.create(BankReceiptLineEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        bankReceiptId: receiptId,
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
    receiptId: string,
    actor: ActorContext,
    lines: BankReceiptLineDto[],
  ): Promise<void> {
    const existing = await manager.find(BankReceiptLineEntity, {
      where: { bankReceiptId: receiptId },
    });
    const keepIds = new Set(lines.filter((l) => l.id).map((l) => l.id));
    const toDelete = existing.filter((e) => !keepIds.has(e.id));
    if (toDelete.length > 0) {
      await manager.delete(
        BankReceiptLineEntity,
        toDelete.map((e) => e.id),
      );
    }

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      if (line.id) {
        await manager.update(BankReceiptLineEntity, line.id, {
          lineOrder: idx,
          description: line.description,
          categoryId: line.categoryId ?? undefined,
          amount: line.amount,
          referenceNote: line.referenceNote ?? undefined,
        });
      } else {
        await manager.save(
          manager.create(BankReceiptLineEntity, {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            createdBy: actor.userId,
            bankReceiptId: receiptId,
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
