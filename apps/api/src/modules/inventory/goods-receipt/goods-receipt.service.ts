import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  DocumentType,
  DomainEventType,
  GoodsReceiptPurpose,
  GoodsReceiptStatus,
  JournalSource,
  PaginatedResponse,
  PaginationQuery,
  StockMovementType,
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  RecordMovementParams,
  StockLedgerService,
} from '../ledger/stock-ledger.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { EventPublisher } from '../../events/event-publisher.service';
import { CashService } from '../../accounting/cash/cash.service';
import { CashFundResolverService } from '../../accounting/cash/cash-fund-resolver.service';
import { CashMovementType } from '../../accounting/cash/cash-movement.entity';
import { JournalService } from '../../accounting/journal/journal.service';
import { OutboxService } from '../../events/outbox/outbox.service';
import { buildCashVoucherNeededEvent } from '../../events/outbox/deterministic-event';
import {
  GoodsReceiptEntity,
  GoodsReceiptPaymentMethod,
} from './goods-receipt.entity';
import { GoodsReceiptLineEntity } from './goods-receipt-line.entity';
import {
  SupplierDebtEntity,
  SupplierDebtDocumentType,
  SupplierDebtStatus,
} from '../supplier-debt/supplier-debt.entity';
import { CreateGoodsReceiptDto, GoodsReceiptLineDto } from './dto/create-goods-receipt.dto';
import { UpdateGoodsReceiptDto } from './dto/update-goods-receipt.dto';

export interface GoodsReceiptQuery extends PaginationQuery {
  status?: GoodsReceiptStatus;
  purpose?: GoodsReceiptPurpose;
  organizationId: string;
  branchId?: string;
}

@Injectable()
export class GoodsReceiptService {
  private readonly logger = new Logger(GoodsReceiptService.name);

  constructor(
    @InjectRepository(GoodsReceiptEntity)
    private readonly receiptRepo: Repository<GoodsReceiptEntity>,
    @InjectRepository(GoodsReceiptLineEntity)
    private readonly lineRepo: Repository<GoodsReceiptLineEntity>,
    private readonly dataSource: DataSource,
    private readonly stockLedger: StockLedgerService,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly cashService: CashService,
    private readonly cashFundResolver: CashFundResolverService,
    private readonly journalService: JournalService,
    private readonly outboxService: OutboxService,
    private readonly eventPublisher: EventPublisher,
  ) {}

  // ─── Create (DRAFT) ───────────────────────────────────────────────────────

  async create(dto: CreateGoodsReceiptDto, actor: ActorContext): Promise<GoodsReceiptEntity> {
    this.validateBusinessRules(dto);
    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.GOODS_RECEIPT,
      actor.branchId,
      actor,
    );

    const receipt = this.receiptRepo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      documentNumber,
      status: GoodsReceiptStatus.DRAFT,
      purpose: dto.purpose,
      providerId: dto.providerId,
      deliveredBy: dto.deliveredBy,
      reason: dto.reason,
      description: dto.description,
      referenceId: dto.referenceId,
      referenceType: dto.referenceType,
      sourceBranchId: dto.sourceBranchId,
      receivedAt: new Date(dto.receivedAt),
      locationId: dto.locationId,
      paymentMethod: dto.paymentMethod,
      cashAccountId: dto.cashAccountId,
      attachmentIds: dto.attachmentIds ?? [],
      references: dto.references ?? [],
      lines: dto.lines.map((l) =>
        this.makeLine(l, actor.organizationId, actor.branchId, actor.userId),
      ),
    });

    const saved = await this.receiptRepo.save(receipt);
    this.logger.log(
      `Goods receipt ${saved.id} created as DRAFT ${documentNumber} by ${actor.userId}`,
    );
    return this.findOrFail(saved.id, actor.organizationId);
  }

  // ─── Create + Post (single user action — clone MISA) ──────────────────────
  //
  // The HTTP create endpoint must yield a POSTED phiếu (number assigned, stock
  // ledger written) so it shows up in reports immediately. We persist the DRAFT
  // then post it; if posting fails we hard-delete the just-created DRAFT (its
  // lines cascade) so no orphan phiếu is left behind — atomic from the user's
  // point of view. The standalone post() endpoint is untouched.

  async createAndPost(
    dto: CreateGoodsReceiptDto,
    actor: ActorContext,
  ): Promise<GoodsReceiptEntity> {
    const draft = await this.create(dto, actor);
    try {
      return await this.post(draft.id, actor);
    } catch (err) {
      // Roll back the orphan DRAFT (lines FK has onDelete: CASCADE) so a failed
      // post leaves nothing persisted.
      await this.receiptRepo.delete({ id: draft.id, organizationId: actor.organizationId });
      this.logger.warn(
        `Goods receipt ${draft.id} create+post failed; orphan DRAFT removed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      if (
        err instanceof BadRequestException ||
        err instanceof ConflictException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      throw new BadRequestException(
        'Không thể nhập kho. Vui lòng thử lại.',
      );
    }
  }

  // ─── Update (only DRAFT) ──────────────────────────────────────────────────

  async update(
    id: string,
    dto: UpdateGoodsReceiptDto,
    actor: ActorContext,
  ): Promise<GoodsReceiptEntity> {
    const receipt = await this.findOrFail(id, actor.organizationId);
    if (receipt.status !== GoodsReceiptStatus.DRAFT) {
      throw new ConflictException(
        `Chỉ có thể sửa phiếu ở trạng thái DRAFT (hiện tại: ${receipt.status})`,
      );
    }

    if (dto.purpose !== undefined) receipt.purpose = dto.purpose;
    if (dto.providerId !== undefined) receipt.providerId = dto.providerId;
    if (dto.deliveredBy !== undefined) receipt.deliveredBy = dto.deliveredBy;
    if (dto.reason !== undefined) receipt.reason = dto.reason;
    if (dto.description !== undefined) receipt.description = dto.description;
    if (dto.referenceId !== undefined) receipt.referenceId = dto.referenceId;
    if (dto.referenceType !== undefined) receipt.referenceType = dto.referenceType;
    if (dto.sourceBranchId !== undefined) receipt.sourceBranchId = dto.sourceBranchId;
    if (dto.receivedAt !== undefined) receipt.receivedAt = new Date(dto.receivedAt);
    if (dto.locationId !== undefined) receipt.locationId = dto.locationId;
    if (dto.attachmentIds !== undefined) receipt.attachmentIds = dto.attachmentIds;

    // Re-validate combined state
    this.validateBusinessRules({
      ...receipt,
      purpose: receipt.purpose,
      providerId: receipt.providerId,
      referenceId: receipt.referenceId,
      referenceType: receipt.referenceType,
      lines: dto.lines ?? (receipt.lines as unknown as GoodsReceiptLineDto[]),
    } as unknown as CreateGoodsReceiptDto);

    if (dto.lines) {
      await this.lineRepo.delete({ goodsReceiptId: receipt.id });
      receipt.lines = dto.lines.map((l) =>
        this.makeLine(l, receipt.organizationId, receipt.branchId, actor.userId),
      );
    }

    const saved = await this.receiptRepo.save(receipt);
    this.logger.log(`Goods receipt ${id} updated (DRAFT) by ${actor.userId}`);
    return this.findOrFail(saved.id, actor.organizationId);
  }

  // ─── Soft cancel (DRAFT only) ─────────────────────────────────────────────

  async cancel(id: string, actor: ActorContext): Promise<void> {
    const receipt = await this.findOrFail(id, actor.organizationId);
    if (
      receipt.status === GoodsReceiptStatus.CANCELLED ||
      receipt.status === GoodsReceiptStatus.REVERSED
    ) {
      throw new ConflictException(
        `Phiếu đã ${receipt.status === GoodsReceiptStatus.CANCELLED ? 'huỷ' : 'đảo bút'}, không thể xoá lại`,
      );
    }

    if (receipt.status === GoodsReceiptStatus.POSTED) {
      const branchId = receipt.branchId ?? actor.branchId;
      if (!branchId) {
        throw new BadRequestException(
          'Không xác định được chi nhánh để đảo bút tồn kho',
        );
      }
      await this.dataSource.transaction(async (manager) => {
        const reversals: RecordMovementParams[] = receipt.lines.map((line) => ({
          itemId: line.itemId,
          locationId: line.locationId,
          branchId,
          organizationId: receipt.organizationId,
          movementType: StockMovementType.ADJUSTMENT_DECREASE,
          quantity: -Number(line.quantity),
          referenceType: 'GOODS_RECEIPT',
          referenceId: receipt.id,
          notes: `Huỷ phiếu nhập kho ${receipt.documentNumber ?? receipt.id}`,
          actorContext: actor,
          unitCost: Number(line.unitPrice),
        }));
        await this.stockLedger.recordBatchMovements(reversals);

        // Void the supplier-debt ledger row (nợ NCC) for a CREDIT receipt.
        // Refuse if it has already received any payment (partially settled).
        if (receipt.paymentMethod === GoodsReceiptPaymentMethod.CREDIT) {
          const debtRows = await manager.query(
            `SELECT id FROM supplier_debts WHERE goods_receipt_id = $1 AND organization_id = $2`,
            [receipt.id, receipt.organizationId],
          );
          if (debtRows.length > 0) {
            const paid = await manager.query(
              `SELECT 1 FROM supplier_debt_payments WHERE debt_id = $1 LIMIT 1`,
              [debtRows[0].id],
            );
            if (paid.length > 0) {
              throw new ConflictException(
                'Không thể huỷ phiếu nhập: công nợ NCC đã có thanh toán',
              );
            }
            await manager.delete(SupplierDebtEntity, debtRows[0].id);
          }
        }
      });
    }

    receipt.status = GoodsReceiptStatus.CANCELLED;
    await this.receiptRepo.save(receipt);
    await this.receiptRepo.softDelete(receipt.id);
    this.logger.log(`Goods receipt ${id} cancelled by ${actor.userId}`);
  }

  // ─── Post (DRAFT → POSTED, atomic) ────────────────────────────────────────

  async post(id: string, actor: ActorContext): Promise<GoodsReceiptEntity> {
    const receipt = await this.findOrFail(id, actor.organizationId);
    if (receipt.status !== GoodsReceiptStatus.DRAFT) {
      throw new ConflictException(
        `Chỉ có thể duyệt phiếu DRAFT (hiện tại: ${receipt.status})`,
      );
    }
    if (!receipt.lines || receipt.lines.length === 0) {
      throw new BadRequestException('Phiếu nhập kho không có dòng hàng');
    }

    const branchId = receipt.branchId ?? actor.branchId;
    if (!branchId) {
      throw new BadRequestException('Không xác định được chi nhánh để hạch toán tồn kho');
    }

    // documentNumber is now assigned at create-time. Reuse it on post so the
    // identifier stays stable across the DRAFT → POSTED transition. Fall back
    // to generating one only if the receipt somehow predates that change.
    const documentNumber =
      receipt.documentNumber ??
      (await this.documentNumberingService.generate(
        DocumentType.GOODS_RECEIPT,
        receipt.branchId,
        actor,
      ));

    const movementType =
      receipt.purpose === GoodsReceiptPurpose.TRANSFER_IN
        ? StockMovementType.TRANSFER_IN
        : StockMovementType.PURCHASE_RECEIPT;

    const total = receipt.lines.reduce(
      (sum, l) => sum + Number(l.quantity) * Number(l.unitPrice),
      0,
    );
    const isCash = receipt.paymentMethod === GoodsReceiptPaymentMethod.CASH;

    await this.dataSource.transaction(async (manager) => {
      let journalEntryId: string | undefined;
      let cashMovementId: string | undefined;
      let cashContraAccountId: string | undefined;
      let resolvedCashAccountId: string | undefined;

      if (isCash) {
        // One cash fund per branch: default to the branch fund (or validate an
        // explicitly supplied fund). DR inventory (TK 156) / CR cash via
        // recordMovement — atomic with the stock posting; insufficient balance
        // throws 400 and rolls back.
        resolvedCashAccountId = await this.cashFundResolver.resolveOrDefault(
          receipt.organizationId,
          branchId,
          receipt.cashAccountId,
          manager,
        );
        const inventoryAccountId = await this.resolveAccountId(
          manager,
          receipt.organizationId,
          '156',
        );
        cashContraAccountId = inventoryAccountId;
        const res = await this.cashService.recordMovement(
          {
            cashAccountId: resolvedCashAccountId,
            type: CashMovementType.WITHDRAWAL,
            amount: total,
            contraAccountId: inventoryAccountId,
            reference: documentNumber,
            notes: `Goods receipt ${documentNumber}`,
          },
          actor,
          manager,
        );
        journalEntryId = res.journalEntryId;
        cashMovementId = res.movement.id;
      } else if (receipt.paymentMethod === GoodsReceiptPaymentMethod.CREDIT) {
        // CREDIT: DR inventory (156) / CR payable (331), no cash movement.
        if (!receipt.providerId) {
          throw new BadRequestException(
            'Phiếu nhập kho công nợ phải có nhà cung cấp',
          );
        }
        const inventoryAccountId = await this.resolveAccountId(
          manager,
          receipt.organizationId,
          '156',
        );
        const payableAccountId = await this.resolveAccountId(
          manager,
          receipt.organizationId,
          '331',
        );
        const entry = await this.journalService.post(
          {
            source: JournalSource.MANUAL,
            sourceReferenceId: receipt.id,
            description: `Goods receipt ${documentNumber} (credit)`,
            lines: [
              {
                accountId: inventoryAccountId,
                debitAmount: total,
                creditAmount: 0,
                description: 'Inventory (debit)',
                lineOrder: 1,
              },
              {
                accountId: payableAccountId,
                debitAmount: 0,
                creditAmount: total,
                description: 'Payable (credit)',
                lineOrder: 2,
              },
            ],
          },
          actor,
          manager,
        );
        journalEntryId = entry.id;

        // Track the amount owed to the supplier (nợ NCC). One ledger row per
        // receipt (unique goods_receipt_id makes a re-post idempotent).
        await manager.save(
          manager.create(SupplierDebtEntity, {
            organizationId: receipt.organizationId,
            branchId,
            createdBy: actor.userId,
            referenceCode: documentNumber,
            goodsReceiptId: receipt.id,
            supplierId: receipt.providerId,
            documentType: SupplierDebtDocumentType.GOODS_RECEIPT,
            originalAmount: total,
            paidAmount: 0,
            remainingAmount: total,
            issuedAt: new Date(receipt.receivedAt ?? Date.now())
              .toISOString()
              .slice(0, 10),
            status: SupplierDebtStatus.OPEN,
          }),
        );
      }

      await manager.update(GoodsReceiptEntity, receipt.id, {
        status: GoodsReceiptStatus.POSTED,
        documentNumber,
        postedAt: new Date(),
        postedBy: actor.userId,
        ...(journalEntryId ? { journalEntryId } : {}),
      });

      const movements: RecordMovementParams[] = receipt.lines.map((line) => ({
        itemId: line.itemId,
        locationId: line.locationId,
        branchId,
        organizationId: receipt.organizationId,
        movementType,
        quantity: Number(line.quantity),
        referenceType: 'GOODS_RECEIPT',
        referenceId: receipt.id,
        notes: `Phiếu nhập kho ${documentNumber}`,
        actorContext: actor,
        unitCost: Number(line.unitPrice),
      }));
      await this.stockLedger.recordBatchMovements(movements);

      if (isCash && cashMovementId && journalEntryId) {
        await this.outboxService.enqueue(
          manager,
          ERP_TOPICS.CASH_VOUCHER_NEEDED_GOODS_RECEIPT,
          buildCashVoucherNeededEvent({
            sourceType: 'GOODS_RECEIPT',
            sourceId: receipt.id,
            sourceDocumentNumber: documentNumber,
            amount: total,
            cashAccountId: resolvedCashAccountId!,
            contraAccountId: cashContraAccountId!,
            cashMovementId,
            journalEntryId,
            partnerType: receipt.providerId ? 'SUPPLIER' : 'OTHER',
            partnerId: receipt.providerId,
            description: `Goods receipt ${documentNumber}`,
            categoryCode: 'CHI_MUA_HANG',
            organizationId: receipt.organizationId,
            branchId,
            actorId: actor.userId,
          }),
        );
      }
    });

    await this.eventPublisher.publish(ERP_TOPICS.GOODS_RECEIPT_POSTED, {
      eventId: randomUUID(),
      eventType: DomainEventType.GOODS_RECEIPT_POSTED,
      timestamp: new Date().toISOString(),
      organizationId: receipt.organizationId,
      branchId,
      correlationId: randomUUID(),
      payload: {
        receiptId: receipt.id,
        documentNumber,
        purpose: receipt.purpose,
        providerId: receipt.providerId,
        totalAmount: receipt.lines.reduce(
          (sum, l) => sum + Number(l.quantity) * Number(l.unitPrice),
          0,
        ),
        lineCount: receipt.lines.length,
        postedAt: new Date().toISOString(),
        postedBy: actor.userId,
      },
    });

    this.logger.log(`Goods receipt ${id} posted as ${documentNumber} by ${actor.userId}`);
    return this.findOrFail(id, actor.organizationId);
  }

  /** Resolve an account id by code within an org (for inventory/payable contra). */
  private async resolveAccountId(
    manager: import('typeorm').EntityManager,
    organizationId: string,
    code: string,
  ): Promise<string> {
    const rows = await manager.query(
      `SELECT "id" FROM "accounts" WHERE "organization_id" = $1 AND "code" = $2 AND "is_active" = true LIMIT 1`,
      [organizationId, code],
    );
    if (!rows || rows.length === 0) {
      throw new BadRequestException(
        `Account ${code} is not configured in the chart of accounts`,
      );
    }
    return rows[0].id;
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async getById(id: string, organizationId: string): Promise<GoodsReceiptEntity> {
    return this.findOrFail(id, organizationId);
  }

  async list(query: GoodsReceiptQuery): Promise<PaginatedResponse<GoodsReceiptEntity>> {
    const where: Record<string, unknown> = { organizationId: query.organizationId };
    if (query.status) where.status = query.status;
    if (query.purpose) where.purpose = query.purpose;
    if (query.branchId) where.branchId = query.branchId;

    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));

    const [data, total] = await this.receiptRepo.findAndCount({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: query.sortBy
        ? { [query.sortBy]: query.sortOrder ?? 'asc' }
        : { receivedAt: 'DESC' },
    });

    return { data, total, page, pageSize };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async findOrFail(id: string, organizationId: string): Promise<GoodsReceiptEntity> {
    const receipt = await this.receiptRepo.findOne({ where: { id, organizationId } });
    if (!receipt) throw new NotFoundException(`Phiếu nhập kho ${id} không tìm thấy`);
    return receipt;
  }

  private validateBusinessRules(dto: CreateGoodsReceiptDto): void {
    if (dto.purpose === GoodsReceiptPurpose.OTHER && !dto.providerId) {
      throw new BadRequestException('Cần chọn đối tượng (NCC) khi mục đích là "Khác"');
    }
    if (dto.purpose === GoodsReceiptPurpose.TRANSFER_IN) {
      // referenceId / referenceType strictly required per design doc when a transfer doc exists;
      // we relax this to "warn-but-allow" while stock-transfer module isn't wired to UI.
      if (!dto.sourceBranchId && !dto.referenceId) {
        throw new BadRequestException(
          'Phiếu điều chuyển cần chi nhánh nguồn hoặc tham chiếu phiếu điều chuyển',
        );
      }
    }
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Phiếu phải có ít nhất một dòng hàng');
    }
    for (const line of dto.lines) {
      if (Number(line.quantity) <= 0) {
        throw new BadRequestException('Số lượng phải lớn hơn 0');
      }
      if (Number(line.unitPrice) < 0) {
        throw new BadRequestException('Đơn giá không được âm');
      }
    }
  }

  private makeLine(
    src: GoodsReceiptLineDto,
    organizationId: string,
    branchId: string | undefined,
    createdBy: string,
  ): GoodsReceiptLineEntity {
    const line = new GoodsReceiptLineEntity();
    line.organizationId = organizationId;
    line.branchId = branchId;
    line.createdBy = createdBy;
    line.itemId = src.itemId;
    line.locationId = src.locationId;
    line.binId = src.binId;
    line.uomCode = src.uomCode;
    line.quantity = String(src.quantity);
    line.unitPrice = String(src.unitPrice);
    line.lineTotal = (Number(src.quantity) * Number(src.unitPrice)).toFixed(2);
    line.note = src.note;
    return line;
  }
}
