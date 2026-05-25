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
  CashReceiptPurpose,
  CashReceiptReferenceType,
  CashVoucherPartnerType,
  CashVoucherStatus,
} from '../enums';
import { PartnerResolverService } from '../shared/partner-resolver.service';
import { CashReceiptEntity } from './cash-receipt.entity';
import { CashReceiptLineEntity } from './cash-receipt-line.entity';
import { CreateCashReceiptDto } from './dto/create-cash-receipt.dto';
import { UpdateCashReceiptDto } from './dto/update-cash-receipt.dto';
import { CashReceiptLineDto } from './dto/cash-receipt-line.dto';
import { QueryCashReceiptDto, CashReceiptSource } from './dto/query-cash-receipt.dto';

/** Internal args for movement+JE+voucher atomic creation (POS / cash-count variance). */
export interface CashReceiptCreateAndPostArgs {
  purpose: CashReceiptPurpose;
  cashAccountId: string;
  contraAccountId: string;
  amount: number;
  actor: ActorContext;
  voucherDate?: string;
  referenceType?: CashReceiptReferenceType;
  referenceId?: string;
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  partnerName?: string;
  partnerAddress?: string;
  payerName?: string;
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

/** Internal args for voucher-only creation linking an existing movement + JE. */
export interface CashReceiptCreateForMovementArgs
  extends CashReceiptCreateAndPostArgs {
  cashMovementId: string;
  journalEntryId: string;
}

export interface ReverseResult {
  original: CashReceiptEntity;
  reversal: CashReceiptEntity;
}

/** Derived link back to the source document that auto-created the voucher. */
export interface SourceLink {
  sourceType: string;
  sourceId: string;
  sourceDocumentNumber: string | null;
}

@Injectable()
export class CashReceiptsService {
  private readonly logger = new Logger(CashReceiptsService.name);

  constructor(
    @InjectRepository(CashReceiptEntity)
    private readonly receiptRepo: Repository<CashReceiptEntity>,
    @InjectRepository(CashReceiptLineEntity)
    private readonly lineRepo: Repository<CashReceiptLineEntity>,
    private readonly dataSource: DataSource,
    private readonly cashService: CashService,
    private readonly docNumbering: DocumentNumberingService,
    private readonly partnerResolver: PartnerResolverService,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD (DRAFT lifecycle)
  // ---------------------------------------------------------------------------

  async create(
    dto: CreateCashReceiptDto,
    actor: ActorContext,
  ): Promise<CashReceiptEntity> {
    this.assertTotalMatchesLines(dto.totalAmount, dto.lines);

    return this.dataSource.transaction(async (manager) => {
      await this.assertCashAccount(manager, dto.cashAccountId, actor.organizationId);
      // Validate the polymorphic partner exists (snapshot is frozen at post).
      await this.partnerResolver.resolve(
        manager,
        dto.partnerType,
        dto.partnerId,
        actor.organizationId,
      );

      const receipt = manager.create(CashReceiptEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        documentNumber: dto.documentNumber ?? undefined,
        voucherDate: dto.voucherDate,
        status: CashVoucherStatus.DRAFT,
        purpose: dto.purpose ?? CashReceiptPurpose.OTHER,
        partnerType: dto.partnerType,
        partnerId: dto.partnerId,
        payerName: dto.payerName,
        reason: dto.reason,
        staffId: dto.staffId,
        cashAccountId: dto.cashAccountId,
        contraAccountId: dto.contraAccountId,
        totalAmount: dto.totalAmount,
        attachmentIds: dto.attachmentIds ?? [],
      });
      const saved = await manager.save(receipt);

      await this.insertLines(manager, saved.id, actor, dto.lines);
      return this.getByIdInTx(manager, saved.id, actor.organizationId);
    });
  }

  async update(
    id: string,
    dto: UpdateCashReceiptDto,
    actor: ActorContext,
  ): Promise<CashReceiptEntity> {
    return this.dataSource.transaction(async (manager) => {
      const receipt = await this.loadForWrite(manager, id, actor.organizationId);
      if (receipt.status !== CashVoucherStatus.DRAFT) {
        throw new BadRequestException(
          'Only DRAFT cash receipts can be updated',
        );
      }

      if (dto.partnerType !== undefined || dto.partnerId !== undefined) {
        await this.partnerResolver.resolve(
          manager,
          dto.partnerType ?? receipt.partnerType,
          dto.partnerId ?? receipt.partnerId,
          actor.organizationId,
        );
      }

      Object.assign(receipt, {
        voucherDate: dto.voucherDate ?? receipt.voucherDate,
        purpose: dto.purpose ?? receipt.purpose,
        partnerType: dto.partnerType ?? receipt.partnerType,
        partnerId: dto.partnerId ?? receipt.partnerId,
        payerName: dto.payerName ?? receipt.payerName,
        reason: dto.reason ?? receipt.reason,
        staffId: dto.staffId ?? receipt.staffId,
        cashAccountId: dto.cashAccountId ?? receipt.cashAccountId,
        contraAccountId: dto.contraAccountId ?? receipt.contraAccountId,
        attachmentIds: dto.attachmentIds ?? receipt.attachmentIds,
      });

      if (dto.lines) {
        await this.syncLines(manager, receipt.id, actor, dto.lines);
      }

      const lines = await manager.find(CashReceiptLineEntity, {
        where: { cashReceiptId: receipt.id },
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
    if (receipt.status !== CashVoucherStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT cash receipts can be deleted');
    }
    await this.receiptRepo.softDelete(receipt.id);
  }

  // ---------------------------------------------------------------------------
  // post / reverse
  // ---------------------------------------------------------------------------

  async post(id: string, actor: ActorContext): Promise<CashReceiptEntity> {
    return this.dataSource.transaction(async (manager) => {
      const receipt = await manager
        .createQueryBuilder(CashReceiptEntity, 'r')
        .setLock('pessimistic_write')
        .where('r.id = :id', { id })
        .andWhere('r.organizationId = :org', { org: actor.organizationId })
        .getOne();
      if (!receipt) {
        throw new NotFoundException(`Cash receipt ${id} not found`);
      }
      if (receipt.status !== CashVoucherStatus.DRAFT) {
        throw new BadRequestException(
          `Cash receipt ${id} is not in DRAFT status`,
        );
      }

      const lines = await manager.find(CashReceiptLineEntity, {
        where: { cashReceiptId: receipt.id },
      });
      const lineSum = this.sum(lines.map((l) => Number(l.amount)));
      if (Math.abs(Number(receipt.totalAmount) - lineSum) > 0.001) {
        throw new BadRequestException(
          `total_amount (${receipt.totalAmount}) must equal sum of line amounts (${lineSum})`,
        );
      }

      const partner = await this.partnerResolver.resolve(
        manager,
        receipt.partnerType,
        receipt.partnerId,
        actor.organizationId,
      );

      const documentNumber = await this.docNumbering.generate(
        DocumentType.CASH_RECEIPT,
        actor.branchId,
        actor,
      );

      const { movement, journalEntryId } = await this.cashService.recordMovement(
        {
          cashAccountId: receipt.cashAccountId,
          type: CashMovementType.DEPOSIT,
          amount: Number(receipt.totalAmount),
          contraAccountId: receipt.contraAccountId,
          reference: documentNumber,
          notes: receipt.reason,
        },
        actor,
        manager,
      );

      receipt.status = CashVoucherStatus.POSTED;
      receipt.documentNumber = documentNumber;
      receipt.cashMovementId = movement.id;
      receipt.journalEntryId = journalEntryId;
      receipt.postedAt = new Date();
      receipt.postedBy = actor.userId;
      if (partner) {
        receipt.partnerNameSnapshot = partner.name ?? undefined;
        receipt.partnerAddressSnapshot = partner.address ?? undefined;
      }
      await manager.save(receipt);

      this.logger.log(
        `Posted cash receipt ${documentNumber} (id=${receipt.id}, amount=${receipt.totalAmount})`,
      );
      return this.getByIdInTx(manager, receipt.id, actor.organizationId);
    });
  }

  async reverse(
    id: string,
    reason: string,
    actor: ActorContext,
  ): Promise<ReverseResult> {
    return this.dataSource.transaction(async (manager) => {
      const original = await manager
        .createQueryBuilder(CashReceiptEntity, 'r')
        .setLock('pessimistic_write')
        .where('r.id = :id', { id })
        .andWhere('r.organizationId = :org', { org: actor.organizationId })
        .getOne();
      if (!original) {
        throw new NotFoundException(`Cash receipt ${id} not found`);
      }
      if (original.status !== CashVoucherStatus.POSTED) {
        throw new BadRequestException(
          `Cash receipt ${id} is not in POSTED status`,
        );
      }
      if (original.reversedByVoucherId) {
        throw new BadRequestException(
          `Cash receipt ${id} has already been reversed`,
        );
      }

      const originalLines = await manager.find(CashReceiptLineEntity, {
        where: { cashReceiptId: original.id },
        order: { lineOrder: 'ASC' },
      });

      const documentNumber = await this.docNumbering.generate(
        DocumentType.CASH_RECEIPT,
        actor.branchId,
        actor,
      );

      // The opposite movement (WITHDRAWAL) restores the balance and posts the
      // reversing journal entry (DR contra / CR cash) — the exact swap of the
      // original DEPOSIT entry. Insufficient balance throws 400.
      const { movement, journalEntryId } = await this.cashService.recordMovement(
        {
          cashAccountId: original.cashAccountId,
          type: CashMovementType.WITHDRAWAL,
          amount: Number(original.totalAmount),
          contraAccountId: original.contraAccountId,
          reference: documentNumber,
          notes: `Reversal of ${original.documentNumber}: ${reason}`,
        },
        actor,
        manager,
      );

      const reversal = manager.create(CashReceiptEntity, {
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
        payerName: original.payerName,
        reason: original.reason,
        staffId: original.staffId,
        referenceType: CashReceiptReferenceType.REVERSAL,
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

      original.status = CashVoucherStatus.REVERSED;
      original.reversedByVoucherId = savedReversal.id;
      await manager.save(original);

      this.logger.log(
        `Reversed cash receipt ${original.documentNumber} → ${documentNumber}`,
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

  /**
   * Create movement + JE + POSTED voucher atomically. When `manager` is provided
   * everything runs in the caller's transaction (cash-count post). Returns the
   * created ids for linking by callers.
   */
  async createAndPostInternal(
    args: CashReceiptCreateAndPostArgs,
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
    args: CashReceiptCreateAndPostArgs,
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
      DocumentType.CASH_RECEIPT,
      actor.branchId,
      actor,
    );

    const { movement, journalEntryId } = await this.cashService.recordMovement(
      {
        cashAccountId: args.cashAccountId,
        type: CashMovementType.DEPOSIT,
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

  /**
   * Create a POSTED voucher document that links an already-created movement + JE.
   * Does NOT touch balance / movements / journal entries (Phase 2 A-revised flows).
   */
  async createVoucherForMovement(
    args: CashReceiptCreateForMovementArgs,
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
        DocumentType.CASH_RECEIPT,
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
    args: CashReceiptCreateAndPostArgs,
    documentNumber: string,
    cashMovementId: string,
    journalEntryId: string,
  ): Promise<CashReceiptEntity> {
    const { actor } = args;
    const lines =
      args.lines && args.lines.length > 0
        ? args.lines
        : [
            {
              description: args.description ?? 'Cash receipt',
              amount: args.amount,
              categoryId: args.categoryId,
            },
          ];

    const voucher = manager.create(CashReceiptEntity, {
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
      payerName: args.payerName,
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
    query: QueryCashReceiptDto,
    actor: ActorContext,
  ): Promise<{ data: CashReceiptEntity[]; total: number; page: number; pageSize: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb = this.receiptRepo
      .createQueryBuilder('r')
      .where('r.organizationId = :org', { org: actor.organizationId });

    if (query.status) qb.andWhere('r.status = :status', { status: query.status });
    if (query.purpose) qb.andWhere('r.purpose = :purpose', { purpose: query.purpose });
    if (query.cashAccountId)
      qb.andWhere('r.cashAccountId = :cashAccountId', {
        cashAccountId: query.cashAccountId,
      });
    else if (actor.branchId)
      // One cash fund per branch: default to branch-scoped vouchers.
      qb.andWhere('r.branchId = :branchId', { branchId: actor.branchId });
    if (query.partnerId)
      qb.andWhere('r.partnerId = :partnerId', { partnerId: query.partnerId });
    if (query.dateFrom)
      qb.andWhere('r.voucherDate >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo)
      qb.andWhere('r.voucherDate <= :dateTo', { dateTo: query.dateTo });
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

    qb.orderBy('r.voucherDate', 'DESC')
      .addOrderBy('r.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize };
  }

  async getById(
    id: string,
    actor: ActorContext,
  ): Promise<CashReceiptEntity & { sourceLink: SourceLink | null }> {
    const receipt = await this.getByIdInTx(
      this.dataSource.manager,
      id,
      actor.organizationId,
    );
    const sourceLink = await this.buildSourceLink(receipt, actor.organizationId);
    return Object.assign(receipt, { sourceLink });
  }

  private async buildSourceLink(
    receipt: CashReceiptEntity,
    organizationId: string,
  ): Promise<SourceLink | null> {
    const rt = receipt.referenceType;
    if (
      !rt ||
      !receipt.referenceId ||
      rt === CashReceiptReferenceType.REVERSAL ||
      rt === CashReceiptReferenceType.MANUAL
    ) {
      return null;
    }
    const map: Record<string, string> = {
      [CashReceiptReferenceType.INVOICE]: 'POS_SALE',
      [CashReceiptReferenceType.INVOICE_DEBT]: 'DEBT_COLLECTION',
      [CashReceiptReferenceType.RECEIVABLE]: 'RECEIVABLE',
    };
    let sourceDocumentNumber: string | null = null;
    if (rt === CashReceiptReferenceType.INVOICE) {
      const rows = await this.dataSource.query(
        `SELECT "code" FROM "invoices" WHERE "id" = $1 AND "organization_id" = $2 LIMIT 1`,
        [receipt.referenceId, organizationId],
      );
      sourceDocumentNumber = rows[0]?.code ?? null;
    }
    return {
      sourceType: map[rt] ?? rt,
      sourceId: receipt.referenceId,
      sourceDocumentNumber,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private applySourceFilter(
    qb: ReturnType<Repository<CashReceiptEntity>['createQueryBuilder']>,
    source?: CashReceiptSource,
  ): void {
    if (!source) return;
    if (source === CashReceiptSource.POS_SALE) {
      qb.andWhere('r.referenceType = :rt', {
        rt: CashReceiptReferenceType.INVOICE,
      });
    } else if (source === CashReceiptSource.DEBT_COLLECTION) {
      qb.andWhere('r.referenceType = :rt', {
        rt: CashReceiptReferenceType.INVOICE_DEBT,
      });
    } else {
      // MANUAL — no auto-source reference.
      qb.andWhere(
        new Brackets((w) => {
          w.where('r.referenceType IS NULL').orWhere('r.referenceType = :rt', {
            rt: CashReceiptReferenceType.MANUAL,
          });
        }),
      );
    }
  }

  private async getByIdInTx(
    manager: EntityManager,
    id: string,
    organizationId: string,
  ): Promise<CashReceiptEntity> {
    const receipt = await manager.findOne(CashReceiptEntity, {
      where: { id, organizationId },
      relations: ['lines'],
      order: { lines: { lineOrder: 'ASC' } },
    });
    if (!receipt) {
      throw new NotFoundException(`Cash receipt ${id} not found`);
    }
    return receipt;
  }

  private async findByReference(
    manager: EntityManager,
    referenceType: CashReceiptReferenceType | undefined,
    referenceId: string | undefined,
    organizationId: string,
  ): Promise<CashReceiptEntity | null> {
    if (!referenceType || !referenceId) return null;
    return manager.findOne(CashReceiptEntity, {
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
  ): Promise<CashReceiptEntity> {
    const receipt = await manager.findOne(CashReceiptEntity, {
      where: { id, organizationId },
    });
    if (!receipt) {
      throw new NotFoundException(`Cash receipt ${id} not found`);
    }
    return receipt;
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
      manager.create(CashReceiptLineEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        cashReceiptId: receiptId,
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
    lines: CashReceiptLineDto[],
  ): Promise<void> {
    const existing = await manager.find(CashReceiptLineEntity, {
      where: { cashReceiptId: receiptId },
    });
    const keepIds = new Set(lines.filter((l) => l.id).map((l) => l.id));
    const toDelete = existing.filter((e) => !keepIds.has(e.id));
    if (toDelete.length > 0) {
      await manager.delete(
        CashReceiptLineEntity,
        toDelete.map((e) => e.id),
      );
    }

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      if (line.id) {
        await manager.update(CashReceiptLineEntity, line.id, {
          lineOrder: idx,
          description: line.description,
          categoryId: line.categoryId ?? undefined,
          amount: line.amount,
          referenceNote: line.referenceNote ?? undefined,
        });
      } else {
        await manager.save(
          manager.create(CashReceiptLineEntity, {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            createdBy: actor.userId,
            cashReceiptId: receiptId,
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
