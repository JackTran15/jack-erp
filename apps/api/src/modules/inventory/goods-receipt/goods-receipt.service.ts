import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Not, Repository } from "typeorm";
import { randomUUID } from "crypto";
import {
  DocumentType,
  DomainEventType,
  GoodsReceiptPurpose,
  GoodsReceiptReferenceType,
  GoodsReceiptStatus,
  JournalSource,
  PaginatedResponse,
  PaginationQuery,
  StockMovementType,
  TransferOrderStatus,
  VoucherPrintPayload,
} from "@erp/shared-interfaces";
import { ERP_TOPICS } from "@erp/shared-kafka-client";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { RbacService } from '../../rbac/rbac.service';
import { assertReceiptPurposePermission } from './assert-purpose-permission';
import {
  RecordMovementParams,
  StockLedgerService,
} from "../ledger/stock-ledger.service";
import { DocumentNumberingService } from "../../document-numbering/document-numbering.service";
import { EventPublisher } from "../../events/event-publisher.service";
import { CashService } from "../../accounting/cash/cash.service";
import { CashFundResolverService } from "../../accounting/cash/cash-fund-resolver.service";
import { CashMovementType } from "../../accounting/cash/cash-movement.entity";
import { JournalService } from "../../accounting/journal/journal.service";
import { OutboxService } from "../../events/outbox/outbox.service";
import { buildCashVoucherNeededEvent } from "../../events/outbox/deterministic-event";
import {
  GoodsReceiptEntity,
  GoodsReceiptPaymentMethod,
} from "./goods-receipt.entity";
import { GoodsReceiptLineEntity } from "./goods-receipt-line.entity";
import {
  SupplierDebtEntity,
  SupplierDebtDocumentType,
  SupplierDebtStatus,
} from "../supplier-debt/supplier-debt.entity";
import {
  CreateGoodsReceiptDto,
  GoodsReceiptLineDto,
} from "./dto/create-goods-receipt.dto";
import { UpdateGoodsReceiptDto } from "./dto/update-goods-receipt.dto";
import { resolveDocCounterparty } from "../location/services/resolve-doc-counterparty.util";
import {
  attachCounterparties,
  attachPurchasingEmployees,
} from "../location/services/counterparty-name.util";
import {
  loadTransferCounterpartStoreName,
  loadVoucherBranch,
} from "../location/services/voucher-print-context.util";
import { mapGoodsReceiptToVoucherPayload } from "./goods-receipt-print.mapper";
import { UserEntity } from "../../auth/user.entity";
import { TransferOrderEntity } from "../transfer-order/transfer-order.entity";
import { TransferOrderService } from "../transfer-order/transfer-order.service";
import {
  computeVoucherDelta,
  VoucherLineSnapshot,
} from "../voucher-delta.util";
import { deterministicVoucherRevisionReferenceId } from "../voucher-revision-reference.util";
import { CashPaymentsService } from "../../accounting/cash-vouchers/cash-payments/cash-payments.service";
import { CashReceiptsService } from "../../accounting/cash-vouchers/cash-receipts/cash-receipts.service";
import {
  CashPaymentPurpose,
  CashPaymentReferenceType,
  CashReceiptPurpose,
  CashReceiptReferenceType,
  CashVoucherPartnerType,
} from "../../accounting/cash-vouchers/enums";

/** Both persisted lines and freshly built ones expose the fields the delta needs. */
function toLineSnapshot(line: {
  itemId: string;
  locationId: string;
  quantity: string | number;
  unitPrice: string | number;
}): VoucherLineSnapshot {
  return {
    itemId: line.itemId,
    locationId: line.locationId,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
  };
}

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
    private readonly cashPaymentsService: CashPaymentsService,
    private readonly cashReceiptsService: CashReceiptsService,
    @Inject(forwardRef(() => TransferOrderService))
    private readonly transferOrderService: TransferOrderService,
    private readonly rbacService: RbacService,
  ) {}

  // ─── Create (DRAFT) ───────────────────────────────────────────────────────

  async create(
    dto: CreateGoodsReceiptDto,
    actor: ActorContext,
  ): Promise<GoodsReceiptEntity> {
    this.validateBusinessRules(dto, actor.branchId);
    await assertReceiptPurposePermission(this.rbacService, actor, dto.purpose);
    await this.assertPurchasingEmployee(
      dto.purchasingEmployeeId,
      actor.organizationId,
    );
    const counterparty = await resolveDocCounterparty(
      this.dataSource.manager,
      dto,
      actor.organizationId,
    );
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
      providerId: counterparty.providerId,
      counterpartyKind: counterparty.counterpartyKind,
      counterpartyId: counterparty.counterpartyId,
      deliveredBy: dto.deliveredBy,
      purchasingEmployeeId: dto.purchasingEmployeeId ?? null,
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
      lines: dto.lines.map((l, index) =>
        this.makeLine(
          l,
          index + 1,
          actor.organizationId,
          actor.branchId,
          actor.userId,
        ),
      ),
    });

    const saved = await this.receiptRepo.save(receipt);
    this.logger.log(
      `Goods receipt ${saved.id} created as DRAFT ${documentNumber} by ${actor.userId}`,
    );
    return this.findOrFail(saved.id, actor.organizationId, actor.branchId);
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
      await this.receiptRepo.delete({
        id: draft.id,
        organizationId: actor.organizationId,
      });
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
      throw new BadRequestException("Không thể nhập kho. Vui lòng thử lại.");
    }
  }

  // ─── Update (DRAFT or POSTED) ─────────────────────────────────────────────
  //
  // A posted receipt is edited in place: its lines are overwritten and the stock
  // ledger receives one adjustment row per (item, location) pair that moved. The
  // ledger itself stays append-only — no posted row is ever updated or deleted.

  async update(
    id: string,
    dto: UpdateGoodsReceiptDto,
    actor: ActorContext,
    options: { cascadeTransferOrder?: boolean } = {},
  ): Promise<GoodsReceiptEntity> {
    const receipt = await this.findOrFail(
      id,
      actor.organizationId,
      actor.branchId,
    );
    if (
      receipt.status === GoodsReceiptStatus.CANCELLED ||
      receipt.status === GoodsReceiptStatus.REVERSED
    ) {
      throw new ConflictException(
        `A ${receipt.status.toLowerCase()} goods receipt can no longer be edited`,
      );
    }
    if (
      dto.paymentMethod !== undefined &&
      dto.paymentMethod !== receipt.paymentMethod
    ) {
      throw new BadRequestException(
        'The settlement method of a goods receipt cannot be changed; cancel it and create a new one',
      );
    }
    const wasPosted = receipt.status === GoodsReceiptStatus.POSTED;
    const branchId = receipt.branchId ?? actor.branchId;
    if (wasPosted && !branchId) {
      throw new BadRequestException(
        'Cannot resolve the branch to adjust stock for this goods receipt',
      );
    }

    if (dto.purpose !== undefined) receipt.purpose = dto.purpose;
    if (
      dto.counterpartyKind !== undefined ||
      dto.counterpartyId !== undefined
    ) {
      const counterparty = await resolveDocCounterparty(
        this.dataSource.manager,
        dto,
        actor.organizationId,
      );
      // providerId column is nullable; clear it for customer/employee đối tượng.
      receipt.providerId = (counterparty.providerId ?? null) as unknown as
        string | undefined;
      receipt.counterpartyKind = counterparty.counterpartyKind;
      receipt.counterpartyId = counterparty.counterpartyId;
    } else if (dto.providerId !== undefined) {
      receipt.providerId = dto.providerId;
    }
    if (dto.deliveredBy !== undefined) receipt.deliveredBy = dto.deliveredBy;
    if (dto.purchasingEmployeeId !== undefined) {
      await this.assertPurchasingEmployee(
        dto.purchasingEmployeeId,
        actor.organizationId,
      );
      receipt.purchasingEmployeeId = dto.purchasingEmployeeId ?? null;
    }
    if (dto.reason !== undefined) receipt.reason = dto.reason;
    if (dto.description !== undefined) receipt.description = dto.description;
    if (dto.referenceId !== undefined) receipt.referenceId = dto.referenceId;
    if (dto.referenceType !== undefined)
      receipt.referenceType = dto.referenceType;
    if (dto.sourceBranchId !== undefined)
      receipt.sourceBranchId = dto.sourceBranchId;
    if (dto.receivedAt !== undefined)
      receipt.receivedAt = new Date(dto.receivedAt);
    if (dto.locationId !== undefined) receipt.locationId = dto.locationId;
    if (dto.attachmentIds !== undefined)
      receipt.attachmentIds = dto.attachmentIds;

    // Re-validate combined state
    this.validateBusinessRules(
      {
        ...receipt,
        purpose: receipt.purpose,
        providerId: receipt.providerId,
        referenceId: receipt.referenceId,
        referenceType: receipt.referenceType,
        lines: dto.lines ?? (receipt.lines as unknown as GoodsReceiptLineDto[]),
      } as unknown as CreateGoodsReceiptDto,
      actor.branchId,
    );

    // Renumbered wholesale from the new array rather than preserving the old
    // ordinals: the update path below deletes every line and re-inserts, and
    // keeping old numbers would collide on the unique index the moment a line is
    // inserted into the middle.
    const nextLines = dto.lines
      ? dto.lines.map((l, index) =>
          this.makeLine(
            l,
            index + 1,
            receipt.organizationId,
            receipt.branchId,
            actor.userId,
          ),
        )
      : null;

    // What the books currently say against what the user just submitted. A draft
    // has nothing on the books yet, so it has nothing to adjust.
    const nextRevision = (receipt.revision ?? 0) + 1;
    const deltas =
      wasPosted && nextLines
        ? computeVoucherDelta(
            receipt.lines.map(toLineSnapshot),
            nextLines.map(toLineSnapshot),
          )
        : [];

    const movements: RecordMovementParams[] = deltas.map((d) => ({
      itemId: d.itemId,
      locationId: d.locationId,
      branchId: branchId!,
      organizationId: receipt.organizationId,
      movementType:
        (d.quantityDelta !== 0 ? d.quantityDelta : d.valueDelta) > 0
          ? StockMovementType.ADJUSTMENT_INCREASE
          : StockMovementType.ADJUSTMENT_DECREASE,
      quantity: d.quantityDelta,
      referenceType: 'GOODS_RECEIPT',
      referenceId: receipt.id,
      notes: `Adjustment for ${receipt.documentNumber ?? receipt.id} rev ${nextRevision}`,
      actorContext: actor,
      unitCost: d.unitCostForDelta,
      lineValue: d.valueDelta,
      // A revision must land even when the storage was deactivated afterwards.
      skipInactiveStorageGuard: true,
    }));

    // Total value delta drives the credit-side accounting below. `nextLines`
    // is null when the request did not touch `lines` — nothing moved in value.
    const totalBefore = receipt.lines.reduce(
      (sum, l) => sum + Number(l.quantity) * Number(l.unitPrice),
      0,
    );
    const totalAfter = nextLines
      ? nextLines.reduce(
          (sum, l) => sum + Number(l.quantity) * Number(l.unitPrice),
          0,
        )
      : totalBefore;
    const totalDelta = Number((totalAfter - totalBefore).toFixed(2));
    const isCredit =
      wasPosted &&
      receipt.paymentMethod === GoodsReceiptPaymentMethod.CREDIT &&
      totalDelta !== 0;
    if (isCredit && !receipt.providerId) {
      throw new BadRequestException(
        'Phiếu nhập kho công nợ phải có nhà cung cấp',
      );
    }
    const isCash =
      wasPosted &&
      receipt.paymentMethod === GoodsReceiptPaymentMethod.CASH &&
      totalDelta !== 0;

    const ledgerEntries = await this.dataSource.transaction(async (manager) => {
      // Lock the voucher row and re-read its state inside the transaction: two
      // concurrent edits would otherwise both diff against the same snapshot and
      // write their adjustments twice over.
      const [locked] = await manager.query(
        `SELECT status, revision FROM goods_receipts WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [receipt.id, receipt.organizationId],
      );
      if (!locked) {
        throw new NotFoundException(`Phiếu nhập kho ${id} không tìm thấy`);
      }
      if (
        locked.status === GoodsReceiptStatus.CANCELLED ||
        locked.status === GoodsReceiptStatus.REVERSED
      ) {
        throw new ConflictException(
          `A ${String(locked.status).toLowerCase()} goods receipt can no longer be edited`,
        );
      }
      if (Number(locked.revision ?? 0) !== (receipt.revision ?? 0)) {
        throw new ConflictException(
          'This goods receipt was modified by another request; reload it and try again',
        );
      }

      if (isCredit) {
        await this.applyCreditDelta(
          manager,
          receipt,
          totalDelta,
          totalAfter,
          nextRevision,
          actor,
        );
      }
      if (isCash) {
        await this.applyCashDelta(manager, receipt, totalDelta, nextRevision, actor);
      }

      const entries =
        movements.length > 0
          ? await this.stockLedger.recordBatchMovements(movements, manager)
          : [];

      if (nextLines) {
        await manager.delete(GoodsReceiptLineEntity, {
          goodsReceiptId: receipt.id,
        });
        await manager.save(
          GoodsReceiptLineEntity,
          nextLines.map((line) => {
            line.goodsReceiptId = receipt.id;
            return line;
          }),
        );
      }

      await manager.update(GoodsReceiptEntity, receipt.id, {
        purpose: receipt.purpose,
        // Already normalised above: null when the đối tượng is not a supplier,
        // undefined when the request did not touch it (TypeORM then skips it).
        providerId: receipt.providerId,
        counterpartyKind: receipt.counterpartyKind ?? null,
        counterpartyId: receipt.counterpartyId ?? null,
        deliveredBy: receipt.deliveredBy,
        purchasingEmployeeId: receipt.purchasingEmployeeId ?? null,
        reason: receipt.reason,
        description: receipt.description,
        referenceId: receipt.referenceId,
        referenceType: receipt.referenceType,
        sourceBranchId: receipt.sourceBranchId,
        receivedAt: receipt.receivedAt,
        locationId: receipt.locationId,
        attachmentIds: receipt.attachmentIds,
        ...(wasPosted ? { revision: nextRevision } : {}),
      });

      return entries;
    });

    await this.stockLedger.publishMovementEvents(ledgerEntries);

    this.logger.log(
      `Goods receipt ${id} updated (${receipt.status}) by ${actor.userId}: ` +
        `${deltas.length} ledger adjustment(s), rev ${wasPosted ? nextRevision : receipt.revision ?? 0}`,
    );

    // This receipt is the import leg of a transfer order — apply the same
    // delta to its export leg (ADR-07). `cascadeTransferOrder: false` is what
    // TransferOrderService.applyLegRevision itself passes when it calls back
    // in here, so the two legs don't ping-pong each other.
    if (
      options.cascadeTransferOrder !== false &&
      wasPosted &&
      deltas.length > 0 &&
      receipt.referenceType === GoodsReceiptReferenceType.STOCK_TRANSFER &&
      receipt.referenceId
    ) {
      await this.transferOrderService.applyLegRevision(
        receipt.referenceId,
        deltas.map((d) => ({ itemId: d.itemId, quantityDelta: d.quantityDelta })),
        actor,
        "import",
      );
    }

    return this.findOrFail(id, actor.organizationId, actor.branchId);
  }

  // ─── Cancel (delete = edit down to nothing, ADR-02) ───────────────────────
  //
  // Deleting a voucher is the same computation as editing it, with `after = []`:
  // the same delta engine reverses the stock ledger, and — for a credit receipt
  // — the same credit-side accounting brings the payable and the supplier debt
  // back to zero. See `update()`, which this mirrors.

  async cancel(id: string, actor: ActorContext): Promise<void> {
    const receipt = await this.findOrFail(
      id,
      actor.organizationId,
      actor.branchId,
    );
    if (
      receipt.status === GoodsReceiptStatus.CANCELLED ||
      receipt.status === GoodsReceiptStatus.REVERSED
    ) {
      throw new ConflictException(
        `Phiếu đã ${receipt.status === GoodsReceiptStatus.CANCELLED ? "huỷ" : "đảo bút"}, không thể xoá lại`,
      );
    }

    const wasPosted = receipt.status === GoodsReceiptStatus.POSTED;
    const branchId = receipt.branchId ?? actor.branchId;
    if (wasPosted && !branchId) {
      throw new BadRequestException(
        "Không xác định được chi nhánh để đảo bút tồn kho",
      );
    }

    const nextRevision = (receipt.revision ?? 0) + 1;
    const deltas = wasPosted
      ? computeVoucherDelta(receipt.lines.map(toLineSnapshot), [])
      : [];
    const movements: RecordMovementParams[] = deltas.map((d) => ({
      itemId: d.itemId,
      locationId: d.locationId,
      branchId: branchId!,
      organizationId: receipt.organizationId,
      movementType: StockMovementType.ADJUSTMENT_DECREASE,
      quantity: d.quantityDelta,
      referenceType: "GOODS_RECEIPT",
      referenceId: receipt.id,
      notes: `Huỷ phiếu nhập kho ${receipt.documentNumber ?? receipt.id}`,
      actorContext: actor,
      unitCost: d.unitCostForDelta,
      lineValue: d.valueDelta,
      // Đảo bút huỷ phiếu đã posted: cho phép kể cả khi kho đã ngừng hoạt động.
      skipInactiveStorageGuard: true,
    }));
    const totalBefore = receipt.lines.reduce(
      (sum, l) => sum + Number(l.quantity) * Number(l.unitPrice),
      0,
    );
    const isCredit =
      wasPosted &&
      receipt.paymentMethod === GoodsReceiptPaymentMethod.CREDIT &&
      totalBefore !== 0;
    const isCash =
      wasPosted &&
      receipt.paymentMethod === GoodsReceiptPaymentMethod.CASH &&
      totalBefore !== 0;

    const entries = await this.dataSource.transaction(async (manager) => {
      // Khoá row + đọc lại status mới nhất trong transaction để chặn 2 request
      // huỷ trùng nhau ghi đúp bút toán đảo (status trước đây chỉ được cập
      // nhật SAU khi ghi ledger + publish Kafka, để hở khoảng thời gian dài
      // cho request huỷ thứ 2 vẫn thấy status POSTED và lọt qua guard phía trên).
      const [locked] = await manager.query(
        `SELECT status, revision FROM goods_receipts WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [receipt.id, receipt.organizationId],
      );
      if (
        !locked ||
        locked.status === GoodsReceiptStatus.CANCELLED ||
        locked.status === GoodsReceiptStatus.REVERSED
      ) {
        throw new ConflictException(
          `Phiếu đã ${locked?.status === GoodsReceiptStatus.CANCELLED ? "huỷ" : "đảo bút"}, không thể xoá lại`,
        );
      }
      if (Number(locked.revision ?? 0) !== (receipt.revision ?? 0)) {
        throw new ConflictException(
          "This goods receipt was modified by another request; reload it and try again",
        );
      }

      if (isCredit) {
        await this.applyCreditDelta(
          manager,
          receipt,
          -totalBefore,
          0,
          nextRevision,
          actor,
        );
      }
      if (isCash) {
        await this.applyCashDelta(manager, receipt, -totalBefore, nextRevision, actor);
      }

      const reversalEntries =
        movements.length > 0
          ? await this.stockLedger.recordBatchMovements(movements, manager)
          : [];

      // Chuyển trạng thái CANCELLED ngay trong cùng transaction, trước khi
      // publish Kafka, để bất kỳ request huỷ trùng nào đang chờ lock cũng
      // thấy status đã đổi thay vì vẫn còn POSTED.
      await manager.update(GoodsReceiptEntity, receipt.id, {
        status: GoodsReceiptStatus.CANCELLED,
        ...(wasPosted ? { revision: nextRevision } : {}),
      });
      await manager.softDelete(GoodsReceiptEntity, receipt.id);

      return reversalEntries;
    });

    if (entries.length > 0) {
      await this.stockLedger.publishMovementEvents(entries);
    }

    if (
      receipt.referenceType === GoodsReceiptReferenceType.STOCK_TRANSFER &&
      receipt.referenceId
    ) {
      await this.receiptRepo.manager.update(
        TransferOrderEntity,
        {
          id: receipt.referenceId,
          organizationId: receipt.organizationId,
          importGoodsReceiptId: receipt.id,
        },
        {
          status: TransferOrderStatus.IN_PROGRESS,
          importGoodsReceiptId: null,
          completedAt: null,
          completedBy: null,
        },
      );
    }

    this.logger.log(`Goods receipt ${id} cancelled by ${actor.userId}`);
  }

  // ─── Post (DRAFT → POSTED, atomic) ────────────────────────────────────────

  async post(id: string, actor: ActorContext): Promise<GoodsReceiptEntity> {
    const receipt = await this.findOrFail(
      id,
      actor.organizationId,
      actor.branchId,
    );
    if (receipt.status !== GoodsReceiptStatus.DRAFT) {
      throw new ConflictException(
        `Chỉ có thể duyệt phiếu DRAFT (hiện tại: ${receipt.status})`,
      );
    }
    if (!receipt.lines || receipt.lines.length === 0) {
      throw new BadRequestException("Phiếu nhập kho không có dòng hàng");
    }

    const branchId = receipt.branchId ?? actor.branchId;
    if (!branchId) {
      throw new BadRequestException(
        "Không xác định được chi nhánh để hạch toán tồn kho",
      );
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

    const ledgerEntries = await this.dataSource.transaction(async (manager) => {
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
          "156",
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
            "Phiếu nhập kho công nợ phải có nhà cung cấp",
          );
        }
        const inventoryAccountId = await this.resolveAccountId(
          manager,
          receipt.organizationId,
          "156",
        );
        const payableAccountId = await this.resolveAccountId(
          manager,
          receipt.organizationId,
          "331",
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
                description: "Inventory (debit)",
                lineOrder: 1,
              },
              {
                accountId: payableAccountId,
                debitAmount: 0,
                creditAmount: total,
                description: "Payable (credit)",
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
        referenceType: "GOODS_RECEIPT",
        referenceId: receipt.id,
        notes: `Phiếu nhập kho ${documentNumber}`,
        actorContext: actor,
        unitCost: Number(line.unitPrice),
      }));
      const savedLedgerEntries = await this.stockLedger.recordBatchMovements(
        movements,
        manager,
      );

      if (isCash && cashMovementId && journalEntryId) {
        await this.outboxService.enqueue(
          manager,
          ERP_TOPICS.CASH_VOUCHER_NEEDED_GOODS_RECEIPT,
          buildCashVoucherNeededEvent({
            sourceType: "GOODS_RECEIPT",
            sourceId: receipt.id,
            sourceDocumentNumber: documentNumber,
            amount: total,
            cashAccountId: resolvedCashAccountId!,
            contraAccountId: cashContraAccountId!,
            cashMovementId,
            journalEntryId,
            partnerType: receipt.providerId ? "SUPPLIER" : "OTHER",
            partnerId: receipt.providerId,
            description: `Goods receipt ${documentNumber}`,
            categoryCode: "CHI_MUA_HANG",
            organizationId: receipt.organizationId,
            branchId,
            actorId: actor.userId,
          }),
        );
      }
      return savedLedgerEntries;
    });
    await this.stockLedger.publishMovementEvents(ledgerEntries);

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

    this.logger.log(
      `Goods receipt ${id} posted as ${documentNumber} by ${actor.userId}`,
    );
    return this.findOrFail(id, actor.organizationId, actor.branchId);
  }

  /**
   * Posts the DR156/CR331 (or reverse) journal adjustment for a credit receipt's
   * value delta, and updates its `supplier_debts` row to match the new total.
   *
   * `paidAmount` is left untouched — this only ever changes what is owed, never
   * what has actually been paid. A receipt edited below what the supplier has
   * already been paid leaves `remainingAmount` negative (status OVERPAID, A-03);
   * no refund voucher is generated for that automatically.
   */
  private async applyCreditDelta(
    manager: import("typeorm").EntityManager,
    receipt: GoodsReceiptEntity,
    totalDelta: number,
    totalAfter: number,
    revision: number,
    actor: ActorContext,
  ): Promise<void> {
    const inventoryAccountId = await this.resolveAccountId(
      manager,
      receipt.organizationId,
      "156",
    );
    const payableAccountId = await this.resolveAccountId(
      manager,
      receipt.organizationId,
      "331",
    );
    const magnitude = Math.abs(totalDelta);
    const increased = totalDelta > 0;
    await this.journalService.post(
      {
        source: JournalSource.MANUAL,
        sourceReferenceId: receipt.id,
        description: `Adjustment for ${receipt.documentNumber ?? receipt.id} rev ${revision} (credit)`,
        lines: [
          {
            accountId: increased ? inventoryAccountId : payableAccountId,
            debitAmount: magnitude,
            creditAmount: 0,
            description: increased ? "Inventory (debit)" : "Payable (debit)",
            lineOrder: 1,
          },
          {
            accountId: increased ? payableAccountId : inventoryAccountId,
            debitAmount: 0,
            creditAmount: magnitude,
            description: increased ? "Payable (credit)" : "Inventory (credit)",
            lineOrder: 2,
          },
        ],
      },
      actor,
      manager,
    );

    const [debt] = await manager.query(
      `SELECT id, paid_amount FROM supplier_debts WHERE goods_receipt_id = $1 AND organization_id = $2`,
      [receipt.id, receipt.organizationId],
    );
    if (!debt) {
      // Predates the credit path, or the debt row was somehow dropped — create
      // it fresh rather than leave the receipt's edit unaccounted for.
      await manager.save(
        manager.create(SupplierDebtEntity, {
          organizationId: receipt.organizationId,
          branchId: receipt.branchId,
          createdBy: actor.userId,
          referenceCode: receipt.documentNumber ?? receipt.id,
          goodsReceiptId: receipt.id,
          supplierId: receipt.providerId!,
          documentType: SupplierDebtDocumentType.GOODS_RECEIPT,
          originalAmount: totalAfter,
          paidAmount: 0,
          remainingAmount: totalAfter,
          issuedAt: new Date(receipt.receivedAt ?? Date.now())
            .toISOString()
            .slice(0, 10),
          status: totalAfter > 0 ? SupplierDebtStatus.OPEN : SupplierDebtStatus.PAID,
        }),
      );
      return;
    }

    const paidAmount = Number(debt.paid_amount);
    const remainingAmount = Number((totalAfter - paidAmount).toFixed(2));
    if (totalAfter === 0 && remainingAmount === 0) {
      // Receipt edited or cancelled down to nothing, and nothing was ever paid
      // against it — drop the row rather than leave a closed, zero-value debt.
      await manager.delete(SupplierDebtEntity, debt.id);
      return;
    }
    const status =
      remainingAmount < 0
        ? SupplierDebtStatus.OVERPAID
        : remainingAmount === 0
          ? SupplierDebtStatus.PAID
          : SupplierDebtStatus.OPEN;
    await manager.update(SupplierDebtEntity, debt.id, {
      originalAmount: totalAfter,
      remainingAmount,
      status,
    });
  }

  /**
   * Posts the cash-side adjustment for a cash receipt's value delta: a Phiếu
   * chi bổ sung (additional payment out) when the total went up, a Phiếu thu
   * hoàn (refund receipt) when it went down. Goes through the treasury
   * module's own `createAndPostInternal` — never `CashService.recordMovement`
   * directly — so the cash movement, its journal entry and its voucher stay
   * owned by exactly one writer each way (ADR-05).
   *
   * `referenceId` is a synthetic id keyed off `(receipt.id, revision)`, not the
   * receipt's own id: the receipt's first posting already occupies
   * `(GOODS_RECEIPT, receipt.id)` in the dedupe index that
   * `createAndPostInternal` checks, and every edit after that needs its own
   * slot (ADR-06 / `deterministicVoucherRevisionReferenceId`).
   */
  private async applyCashDelta(
    manager: import("typeorm").EntityManager,
    receipt: GoodsReceiptEntity,
    totalDelta: number,
    revision: number,
    actor: ActorContext,
  ): Promise<void> {
    const inventoryAccountId = await this.resolveAccountId(
      manager,
      receipt.organizationId,
      "156",
    );
    const cashAccountId = await this.cashFundResolver.resolveOrDefault(
      receipt.organizationId,
      receipt.branchId!,
      receipt.cashAccountId,
      manager,
    );
    const referenceId = deterministicVoucherRevisionReferenceId(
      receipt.id,
      revision,
    );
    const description = `Adjustment for ${receipt.documentNumber ?? receipt.id} rev ${revision}`;
    const partnerType = receipt.providerId
      ? CashVoucherPartnerType.SUPPLIER
      : undefined;

    if (totalDelta > 0) {
      // Receipt got more expensive: pay the extra out of the fund.
      await this.cashPaymentsService.createAndPostInternal(
        {
          purpose: CashPaymentPurpose.PURCHASE,
          cashAccountId,
          contraAccountId: inventoryAccountId,
          amount: totalDelta,
          actor,
          referenceType: CashPaymentReferenceType.GOODS_RECEIPT,
          referenceId,
          partnerType,
          partnerId: receipt.providerId,
          description,
          reason: description,
        },
        manager,
      );
    } else {
      // Receipt got cheaper (or was cancelled): refund the difference into
      // the fund.
      await this.cashReceiptsService.createAndPostInternal(
        {
          purpose: CashReceiptPurpose.OTHER,
          cashAccountId,
          contraAccountId: inventoryAccountId,
          amount: -totalDelta,
          actor,
          referenceType: CashReceiptReferenceType.MANUAL,
          referenceId,
          partnerType,
          partnerId: receipt.providerId,
          description,
          reason: description,
        },
        manager,
      );
    }
  }

  /** Resolve an account id by code within an org (for inventory/payable contra). */
  private async resolveAccountId(
    manager: import("typeorm").EntityManager,
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

  /**
   * `opts.includeLines: false` returns the header alone (ADR-03) — the view dialog
   * pages its lines through {@link getLines}. Default stays `true` so every
   * existing caller, the edit dialog included, is untouched.
   */
  async getById(
    id: string,
    actor: ActorContext,
    opts: { includeLines?: boolean } = {},
  ): Promise<GoodsReceiptEntity> {
    const receipt = await this.findOrFail(
      id,
      actor.organizationId,
      actor.branchId,
      opts.includeLines ?? true,
    );
    await attachCounterparties(
      this.receiptRepo.manager,
      [receipt],
      actor.organizationId,
    );
    await attachPurchasingEmployees(
      this.receiptRepo.manager,
      [receipt],
      actor.organizationId,
    );
    return receipt;
  }

  
  /** Print/export payload for one receipt (T-03-02, UOW-08) — reuses `getById`'s 404. */
  async getPrintPayload(
    id: string,
    actor: ActorContext,
  ): Promise<VoucherPrintPayload> {
    return this.buildPrintPayload(await this.getById(id, actor), actor.organizationId);
  }

  /**
   * Print/export payload for a receipt the caller already resolved AND scope-checked.
   * Split out of {@link getPrintPayload} for the cross-branch transfer view: the
   * exporting (source) branch resolves the destination branch's NK through the
   * transfer order (org-scoped), so it cannot go through the branch-scoped `getById`.
   */
  async buildPrintPayload(
    receipt: GoodsReceiptEntity,
    organizationId: string,
  ): Promise<VoucherPrintPayload> {
    const [branch, transferSourceStoreName] = await Promise.all([
      loadVoucherBranch(this.receiptRepo.manager, receipt.branchId, organizationId),
      loadTransferCounterpartStoreName(
        this.receiptRepo.manager,
        "receipt",
        receipt.id,
        organizationId,
      ),
    ]);
    return mapGoodsReceiptToVoucherPayload(receipt, branch, transferSourceStoreName);
  }

  /** Validate a purchasing-employee reference (users.id) belongs to the org. */
  private async assertPurchasingEmployee(
    purchasingEmployeeId: string | undefined,
    organizationId: string,
  ): Promise<void> {
    if (!purchasingEmployeeId) return;
    const user = await this.receiptRepo.manager.findOne(UserEntity, {
      where: { id: purchasingEmployeeId, organizationId, isActive: true },
    });
    if (!user) {
      throw new BadRequestException(
        "Purchasing employee not found in organization",
      );
    }
  }

  async list(
    query: GoodsReceiptQuery,
  ): Promise<PaginatedResponse<GoodsReceiptEntity>> {
    const where: Record<string, unknown> = {
      organizationId: query.organizationId,
    };
    if (query.status) {
      where.status = query.status;
    } else {
      where.status = Not(
        In([GoodsReceiptStatus.CANCELLED, GoodsReceiptStatus.REVERSED]),
      );
    }
    if (query.purpose) where.purpose = query.purpose;
    if (query.branchId) where.branchId = query.branchId;

    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));

    const [data, total] = await this.receiptRepo.findAndCount({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: query.sortBy
        ? { [query.sortBy]: query.sortOrder ?? "asc" }
        : { receivedAt: "DESC" },
    });

    return { data, total, page, pageSize };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async findOrFail(
    id: string,
    organizationId: string,
    branchId?: string,
    includeLines = true,
  ): Promise<GoodsReceiptEntity> {
    const receipt = await this.receiptRepo.findOne({
      where: { id, organizationId, ...(branchId ? { branchId } : {}) },
      // `loadEagerRelations` is all-or-nothing, so skipping `lines` means naming
      // the header relations back. Keep this list in step with the eager
      // relations on GoodsReceiptEntity.
      ...(includeLines
        ? {}
        : {
            loadEagerRelations: false,
            relations: { provider: true, location: true },
          }),
    });
    if (!receipt)
      throw new NotFoundException(`Phiếu nhập kho ${id} không tìm thấy`);
    return receipt;
  }

  private validateBusinessRules(
    dto: CreateGoodsReceiptDto,
    currentBranchId?: string,
  ): void {
    if (
      dto.purpose === GoodsReceiptPurpose.PURCHASE &&
      !dto.providerId &&
      !dto.counterpartyId
    ) {
      throw new BadRequestException("Phiếu nhập hàng mua phải có nhà cung cấp");
    }
    if (
      dto.purpose === GoodsReceiptPurpose.PURCHASE &&
      dto.counterpartyKind &&
      dto.counterpartyKind !== "supplier"
    ) {
      throw new BadRequestException(
        "Phiếu nhập hàng mua chỉ được chọn nhà cung cấp",
      );
    }
    if (dto.purpose === GoodsReceiptPurpose.TRANSFER_IN) {
      if (currentBranchId && dto.sourceBranchId === currentBranchId) {
        throw new BadRequestException(
          "Cửa hàng nguồn phải khác cửa hàng hiện tại",
        );
      }
      // referenceId / referenceType strictly required per design doc when a transfer doc exists;
      // we relax this to "warn-but-allow" while stock-transfer module isn't wired to UI.
      if (!dto.sourceBranchId && !dto.referenceId) {
        throw new BadRequestException(
          "Phiếu điều chuyển cần chi nhánh nguồn hoặc tham chiếu phiếu điều chuyển",
        );
      }
    }
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException("Phiếu phải có ít nhất một dòng hàng");
    }
    for (const line of dto.lines) {
      if (Number(line.quantity) <= 0) {
        throw new BadRequestException("Số lượng phải lớn hơn 0");
      }
      if (Number(line.unitPrice) < 0) {
        throw new BadRequestException("Đơn giá không được âm");
      }
    }
  }

  /**
   * `lineNo` is the 1-based index in the submitted array — that array is the
   * order the user sees on the grid, which is what "the order it was typed"
   * means (ADR-05).
   */
  private makeLine(
    src: GoodsReceiptLineDto,
    lineNo: number,
    organizationId: string,
    branchId: string | undefined,
    createdBy: string,
  ): GoodsReceiptLineEntity {
    const line = new GoodsReceiptLineEntity();
    line.lineNo = lineNo;
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
