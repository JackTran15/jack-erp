import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import {
  DocCounterpartyKind,
  GoodsIssuePurpose,
  GoodsIssueReferenceType,
  GoodsIssueStatus,
  StockMovementType,
  DocumentType,
  PaginatedResponse,
  PaginationQuery,
  VoucherPrintPayload,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StockLedgerService, RecordMovementParams } from '../ledger/stock-ledger.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { IssueReasonEntity } from '../issue-reason/issue-reason.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { resolveDocCounterparty } from '../location/services/resolve-doc-counterparty.util';
import { attachCounterparties } from '../location/services/counterparty-name.util';
import {
  loadTransferCounterpartStoreName,
  loadVoucherBranch,
} from '../location/services/voucher-print-context.util';
import { mapGoodsIssueToVoucherPayload } from './goods-issue-print.mapper';
import { TransferOrderService } from '../transfer-order/transfer-order.service';
import { RbacService } from '../../rbac/rbac.service';
import { GoodsIssueEntity } from './goods-issue.entity';
import { GoodsIssueLineEntity } from './goods-issue-line.entity';
import { assertPurposePermission } from './assert-purpose-permission';
import {
  computeVoucherDelta,
  VoucherLineSnapshot,
} from '../voucher-delta.util';

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

export interface CreateGoodsIssueDto {
  locationId: string;
  providerId?: string;
  /** Đối tượng kind (supplier | employee). When set, the counterparty is
   * validated and routed through the warehouse-document resolver. */
  counterpartyKind?: DocCounterpartyKind;
  counterpartyId?: string;
  purpose?: GoodsIssuePurpose;
  reasonId?: string;
  targetBranchId?: string;
  reason?: string; // optional override / legacy
  /** Source document id (e.g. the transfer order this issue was created from). */
  referenceId?: string;
  /** Source document type — see GoodsIssueReferenceType. */
  referenceType?: GoodsIssueReferenceType;
  notes?: string;
  /** Free-text deliverer name (Người giao). */
  deliverer?: string;
  /** FE-supplied reference codes shown as Tham chiếu. */
  references?: string[];
  /** User-entered issue date+time (ISO); falls back to createdAt when omitted. */
  occurredAt?: string;
  lines: {
    itemId: string;
    locationId?: string;
    quantity: number;
    unitPrice?: number;
    notes?: string;
  }[];
}

/**
 * Fields an edit may touch. Deliberately narrower than {@link CreateGoodsIssueDto}:
 * no `purpose`, no `targetBranchId` — changing either changes what kind of
 * document this is, which is a cancel-and-recreate, not an edit (A-11).
 */
export interface UpdateGoodsIssueDto {
  locationId?: string;
  providerId?: string;
  counterpartyKind?: DocCounterpartyKind;
  counterpartyId?: string;
  reasonId?: string;
  reason?: string;
  notes?: string;
  deliverer?: string;
  references?: string[];
  occurredAt?: string;
  lines?: {
    itemId: string;
    locationId?: string;
    quantity: number;
    unitPrice?: number;
    notes?: string;
  }[];
}

export interface GoodsIssueQuery extends PaginationQuery {
  status?: GoodsIssueStatus;
  organizationId: string;
  branchId?: string;
}

export interface GoodsIssueLinesPage {
  items: GoodsIssueLineEntity[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  total: number;
}

const VALID_TRANSITIONS: Record<GoodsIssueStatus, GoodsIssueStatus[]> = {
  [GoodsIssueStatus.DRAFT]: [GoodsIssueStatus.POSTED, GoodsIssueStatus.CANCELLED],
  [GoodsIssueStatus.APPROVED]: [GoodsIssueStatus.POSTED, GoodsIssueStatus.CANCELLED],
  [GoodsIssueStatus.POSTED]: [],
  [GoodsIssueStatus.CANCELLED]: [],
};

@Injectable()
export class GoodsIssueService {
  private readonly logger = new Logger(GoodsIssueService.name);

  constructor(
    @InjectRepository(GoodsIssueEntity)
    private readonly giRepo: Repository<GoodsIssueEntity>,
    @InjectRepository(IssueReasonEntity)
    private readonly reasonRepo: Repository<IssueReasonEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    private readonly dataSource: DataSource,
    private readonly ledgerService: StockLedgerService,
    private readonly documentNumberingService: DocumentNumberingService,
    @Inject(forwardRef(() => TransferOrderService))
    private readonly transferOrderService: TransferOrderService,
    private readonly rbac: RbacService,
  ) {}

  async create(dto: CreateGoodsIssueDto, actor: ActorContext): Promise<GoodsIssueEntity> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Phiếu xuất hàng phải có ít nhất một dòng hàng');
    }

    for (const line of dto.lines) {
      if (line.quantity <= 0) {
        throw new BadRequestException('Số lượng xuất phải lớn hơn 0');
      }
    }

    const purpose = dto.purpose ?? GoodsIssuePurpose.OTHER;
    // Body-based defense-in-depth behind the FE filter: gate OTHER/DISPOSAL
    // behind their dedicated permission keys. Covers both the v2 CQRS handler
    // and the legacy createAndPost path, which both funnel through create().
    await assertPurposePermission(this.rbac, actor, purpose);
    const { reasonText, reasonId, targetBranchId } = await this.resolveReasonContext(
      purpose,
      dto,
      actor,
    );

    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.GOODS_ISSUE,
      actor.branchId,
      actor,
    );

    const counterparty = await resolveDocCounterparty(
      this.dataSource.manager,
      dto,
      actor.organizationId,
    );

    const gi = this.giRepo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      documentNumber,
      locationId: dto.locationId,
      providerId: counterparty.providerId,
      counterpartyKind: counterparty.counterpartyKind,
      counterpartyId: counterparty.counterpartyId,
      purpose,
      reason: reasonText,
      reasonId,
      targetBranchId,
      referenceId: dto.referenceId,
      referenceType: dto.referenceType,
      notes: dto.notes,
      deliverer: dto.deliverer ?? null,
      references: dto.references ?? [],
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : null,
      status: GoodsIssueStatus.DRAFT,
      lines: dto.lines.map((l) => {
        const line = new GoodsIssueLineEntity();
        line.itemId = l.itemId;
        // Honor a per-line source location (used by transfer export where each
        // line can be pulled from a different warehouse); fall back to header.
        line.locationId = l.locationId ?? dto.locationId;
        line.quantity = l.quantity;

        const unitPrice = Number(l.unitPrice ?? 0);
        const qty = Number(l.quantity);
        line.unitPrice = unitPrice.toFixed(2);
        line.lineTotal = (qty * unitPrice).toFixed(2);
        line.notes = l.notes;
        return line;
      }),
    });

    const saved = await this.giRepo.save(gi);
    this.logger.log(
      `Goods issue ${saved.id} created as DRAFT ${documentNumber} (purpose=${purpose})`,
    );
    return saved;
  }

  /**
   * Create + post in one atomic action: persist the
   * DRAFT, then immediately post it (writes the stock ledger and flips status
   * to POSTED). If posting fails — e.g. the ledger write rejects — the just
   * created DRAFT is hard-deleted (its lines cascade away) so no orphan is
   * left behind. End state is either POSTED (number + ledger) or nothing.
   */
  async createAndPost(
    dto: CreateGoodsIssueDto,
    actor: ActorContext,
  ): Promise<GoodsIssueEntity> {
    const draft = await this.create(dto, actor);
    try {
      return await this.post(draft.id, actor);
    } catch (err) {
      // Roll back the orphan DRAFT so the failed "Lưu" persists nothing.
      // onDelete: CASCADE on goods_issue_lines removes the lines with it.
      await this.giRepo.delete({ id: draft.id, organizationId: actor.organizationId });
      this.logger.warn(
        `createAndPost rolled back draft ${draft.id}: ${(err as Error).message}`,
      );
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException(
        'Không thể xuất kho phiếu này. Vui lòng kiểm tra tồn kho và thử lại.',
      );
    }
  }

  /**
   * Cost basis for each line, in the order they were given.
   *
   * A price the caller supplied wins outright — on a goods issue the line's unit
   * price *is* the cost that reaches the stock ledger (ADR-01), matching what
   * GoodsReceiptService and StockTransferService already do. Blank (`<= 0`) means
   * "the caller has no opinion", not "free", so those lines fall back to the
   * item's instant weighted-average cost at this branch.
   *
   * The average is looked up once per item and only for items that actually have
   * a blank line, so an issue priced end to end touches the ledger not at all.
   */
  private async resolveLinePrices(
    lines: { itemId: string; unitPrice?: string | number | null }[],
    organizationId: string,
    branchId: string,
  ): Promise<number[]> {
    const averageByItemId = new Map<string, number>();
    for (const line of lines) {
      if (Number(line.unitPrice ?? 0) > 0) continue;
      if (averageByItemId.has(line.itemId)) continue;
      const average = await this.ledgerService.getInstantAverageCost(
        line.itemId,
        organizationId,
        branchId,
      );
      averageByItemId.set(line.itemId, average.unitCost);
    }
    return lines.map((line) => {
      const supplied = Number(line.unitPrice ?? 0);
      return supplied > 0 ? supplied : (averageByItemId.get(line.itemId) ?? 0);
    });
  }

  async post(id: string, actor: ActorContext): Promise<GoodsIssueEntity> {
    const gi = await this.findOrFail(id, actor.organizationId, actor.branchId);
    this.validateTransition(gi.status, GoodsIssueStatus.POSTED);

    const documentNumber =
      gi.documentNumber ??
      (await this.documentNumberingService.generate(
        DocumentType.GOODS_ISSUE,
        gi.branchId,
        actor,
      ));

    const branchId = gi.branchId ?? actor.branchId;
    if (!branchId) {
      throw new BadRequestException('Không xác định được chi nhánh để xuất hàng');
    }

    // A line's own unit price is its cost basis; the average is only consulted for
    // lines that left the price blank. Resolving per line — rather than per item, as
    // this used to — is what lets one issue carry the same item at two prices.
    const priceByLine = await this.resolveLinePrices(
      gi.lines,
      gi.organizationId,
      branchId,
    );

    const entries = await this.dataSource.transaction(async (manager) => {
      const movements: RecordMovementParams[] = gi.lines.map((line, index) => ({
        itemId: line.itemId,
        locationId: line.locationId,
        branchId,
        organizationId: gi.organizationId,
        movementType: StockMovementType.GOODS_ISSUE,
        quantity: -line.quantity,
        referenceType: 'GOODS_ISSUE',
        referenceId: gi.id,
        notes: `Xuất hàng: ${documentNumber}`,
        actorContext: actor,
        unitCost: priceByLine[index],
      }));

      // Only lines that fell back need writing: a line that carried a price is
      // already correct from create(), and rewriting it would be a no-op UPDATE.
      for (const [index, line] of gi.lines.entries()) {
        if (Number(line.unitPrice) > 0) continue;
        const unitCost = priceByLine[index];
        await manager.update(
          GoodsIssueLineEntity,
          { id: line.id },
          {
            unitPrice: unitCost.toFixed(2),
            lineTotal: (Number(line.quantity) * unitCost).toFixed(2),
          },
        );
      }

      const savedEntries = await this.ledgerService.recordBatchMovements(
        movements,
        manager,
      );

      await manager.update(GoodsIssueEntity, id, {
        status: GoodsIssueStatus.POSTED,
        documentNumber,
        postedBy: actor.userId,
        postedAt: new Date(),
      });
      return savedEntries;
    });
    await this.ledgerService.publishMovementEvents(entries);

    this.logger.log(`Goods issue ${id} posted as ${documentNumber}`);
    return this.findOrFail(id, actor.organizationId, actor.branchId);
  }

  // ─── Update (DRAFT or POSTED) ─────────────────────────────────────────────
  //
  // Same shape as GoodsReceiptService.update(): a posted issue is edited in
  // place, and the delta engine writes one stock-ledger adjustment per (item,
  // location) pair that moved. Sign is flipped from the receipt side — a goods
  // issue stores its lines positive but its ledger movements negative, so a
  // positive line-quantity delta (more issued) becomes a *more negative*
  // ledger movement. Goods issues carry no accounting in this feature's scope,
  // so there is no credit/cash branch here.

  async update(
    id: string,
    dto: UpdateGoodsIssueDto,
    actor: ActorContext,
    options: { cascadeTransferOrder?: boolean } = {},
  ): Promise<GoodsIssueEntity> {
    const gi = await this.findOrFail(id, actor.organizationId, actor.branchId);
    if (gi.status === GoodsIssueStatus.CANCELLED) {
      throw new ConflictException('A cancelled goods issue can no longer be edited');
    }
    // Editing a posted transfer-out cascades into the destination's goods
    // receipt via applyLegRevision — so once that receipt exists, the edit would
    // rewrite a document another branch has already posted. Deletion was already
    // blocked at this point; editing was not. Same condition as the cascade
    // below, so internal callers passing cascadeTransferOrder: false are unaffected.
    if (
      options.cascadeTransferOrder !== false &&
      gi.referenceType === GoodsIssueReferenceType.TRANSFER_ORDER &&
      gi.referenceId
    ) {
      await this.transferOrderService.assertExportIssueCanBeEdited(
        gi.referenceId,
        actor,
      );
    }
    const wasPosted = gi.status === GoodsIssueStatus.POSTED;
    const branchId = gi.branchId ?? actor.branchId;
    if (wasPosted && !branchId) {
      throw new BadRequestException(
        'Không xác định được chi nhánh để điều chỉnh tồn kho',
      );
    }

    if (dto.locationId !== undefined) gi.locationId = dto.locationId;
    if (dto.counterpartyKind !== undefined || dto.counterpartyId !== undefined) {
      const counterparty = await resolveDocCounterparty(
        this.dataSource.manager,
        dto,
        actor.organizationId,
      );
      // providerId is nullable; clear it for a customer/employee đối tượng.
      gi.providerId = (counterparty.providerId ?? null) as unknown as
        string | undefined;
      gi.counterpartyKind = counterparty.counterpartyKind;
      gi.counterpartyId = counterparty.counterpartyId;
    } else if (dto.providerId !== undefined) {
      gi.providerId = dto.providerId;
    }
    if (dto.reasonId !== undefined) {
      // Only OTHER/DISPOSAL carry a user-chosen reason; TRANSFER_OUT's reason
      // is derived from the (unchangeable) target branch, SALE's from the POS
      // flow. `create()`'s resolveReasonContext handles the same split.
      if (
        gi.purpose === GoodsIssuePurpose.OTHER ||
        gi.purpose === GoodsIssuePurpose.DISPOSAL
      ) {
        const reasonEntity = await this.reasonRepo.findOne({
          where: { id: dto.reasonId, organizationId: actor.organizationId },
        });
        if (!reasonEntity) {
          throw new BadRequestException(
            `Lý do xuất kho ${dto.reasonId} không tồn tại`,
          );
        }
        gi.reasonId = reasonEntity.id;
        gi.reason = reasonEntity.name;
      } else {
        throw new BadRequestException(
          `Không thể đổi lý do cho phiếu xuất mục đích ${gi.purpose}`,
        );
      }
    } else if (dto.reason !== undefined) {
      gi.reason = dto.reason;
    }
    if (dto.notes !== undefined) gi.notes = dto.notes;
    if (dto.deliverer !== undefined) gi.deliverer = dto.deliverer;
    if (dto.references !== undefined) gi.references = dto.references;
    if (dto.occurredAt !== undefined) gi.occurredAt = new Date(dto.occurredAt);

    // A line's submitted price is its cost basis (ADR-01), exactly as on post().
    // Blank lines are resolved to the moving average *before* the delta is
    // computed, so computeVoucherDelta compares real money on both sides — feed
    // it the old placeholder 0 and every value delta comes out wrong.
    // Without a branch there is no ledger to average over — the lookup would
    // match zero rows and quietly return the catalog price. A draft in that
    // state keeps whatever it was sent; post() resolves it once the branch is known.
    const nextPrices = dto.lines
      ? branchId
        ? await this.resolveLinePrices(dto.lines, gi.organizationId, branchId)
        : dto.lines.map((l) => Number(l.unitPrice ?? 0))
      : [];
    const nextLines = dto.lines
      ? dto.lines.map((l, index) => {
          const line = new GoodsIssueLineEntity();
          line.itemId = l.itemId;
          line.locationId = l.locationId ?? gi.locationId;
          line.quantity = l.quantity;
          const unitPrice = nextPrices[index];
          line.unitPrice = unitPrice.toFixed(2);
          line.lineTotal = (Number(l.quantity) * unitPrice).toFixed(2);
          line.notes = l.notes;
          return line;
        })
      : null;

    const nextRevision = (gi.revision ?? 0) + 1;
    // Both sides carry the voucher's real prices (ADR-01), so the delta's own
    // valueDelta / unitCostForDelta are the numbers to post — no second cost
    // rule on top. This is the same shape GoodsReceiptService.update() uses;
    // only the ledger sign differs, because an issue moves stock the other way.
    const deltas =
      wasPosted && nextLines
        ? computeVoucherDelta(
            gi.lines.map(toLineSnapshot),
            nextLines.map(toLineSnapshot),
          )
        : [];

    const movements: RecordMovementParams[] = deltas.map((d) => {
      // The delta is in the line's own (positive) direction; the ledger for a
      // goods issue stores the opposite sign.
      const ledgerQuantityDelta = -d.quantityDelta;
      const ledgerValueDelta = -d.valueDelta;
      return {
        itemId: d.itemId,
        locationId: d.locationId,
        branchId: branchId!,
        organizationId: gi.organizationId,
        movementType:
          (ledgerQuantityDelta !== 0 ? ledgerQuantityDelta : ledgerValueDelta) > 0
            ? StockMovementType.ADJUSTMENT_INCREASE
            : StockMovementType.ADJUSTMENT_DECREASE,
        quantity: ledgerQuantityDelta,
        referenceType: 'GOODS_ISSUE',
        referenceId: gi.id,
        notes: `Adjustment for ${gi.documentNumber ?? gi.id} rev ${nextRevision}`,
        actorContext: actor,
        unitCost: d.unitCostForDelta,
        lineValue: ledgerValueDelta,
        // A revision must land even when the storage was deactivated afterwards.
        skipInactiveStorageGuard: true,
      };
    });

    // `nextLines` is saved exactly as submitted — no re-pricing pass.
    //
    // There used to be one, because cost was server-assigned and a line could end
    // up straddling two cost bases, leaving Σ line_value out of step with the
    // voucher. Both loops that repaired that are gone, and INV-2 now holds by
    // construction: every ledger row for this voucher is written at the voucher's
    // own prices, so Σ line_value = Σ (quantity × unit price) at post, and each
    // revision adds exactly (value after − value before). Nothing left to repair.
    //
    // Deleting the re-pricing pass is also what lets one item appear twice at two
    // prices: it keyed lines by (item, location) and handed every line sharing a
    // key the same number.

    const ledgerEntries = await this.dataSource.transaction(async (manager) => {
      // Lock the voucher row and re-read its state inside the transaction — see
      // GoodsReceiptService.update() for why this has to happen before writing.
      const [locked] = await manager.query(
        `SELECT status, revision FROM goods_issues WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [gi.id, gi.organizationId],
      );
      if (!locked) {
        throw new NotFoundException(`Phiếu xuất hàng ${id} không tìm thấy`);
      }
      if (locked.status === GoodsIssueStatus.CANCELLED) {
        throw new ConflictException('A cancelled goods issue can no longer be edited');
      }
      if (Number(locked.revision ?? 0) !== (gi.revision ?? 0)) {
        throw new ConflictException(
          'This goods issue was modified by another request; reload it and try again',
        );
      }

      const entries =
        movements.length > 0
          ? await this.ledgerService.recordBatchMovements(movements, manager)
          : [];

      if (nextLines) {
        await manager.delete(GoodsIssueLineEntity, { goodsIssueId: gi.id });
        await manager.save(
          GoodsIssueLineEntity,
          nextLines.map((line) => {
            line.goodsIssueId = gi.id;
            return line;
          }),
        );
      }

      await manager.update(GoodsIssueEntity, gi.id, {
        locationId: gi.locationId,
        providerId: gi.providerId,
        counterpartyKind: gi.counterpartyKind ?? null,
        counterpartyId: gi.counterpartyId ?? null,
        reason: gi.reason,
        // Already normalised above: only ever set to a resolved reason's id, or
        // left as whatever the loaded entity had.
        reasonId: gi.reasonId,
        notes: gi.notes,
        deliverer: gi.deliverer,
        references: gi.references,
        occurredAt: gi.occurredAt,
        ...(wasPosted ? { revision: nextRevision } : {}),
      });

      return entries;
    });

    await this.ledgerService.publishMovementEvents(ledgerEntries);

    this.logger.log(
      `Goods issue ${id} updated (${gi.status}) by ${actor.userId}: ` +
        `${deltas.length} ledger adjustment(s), rev ${wasPosted ? nextRevision : gi.revision ?? 0}`,
    );

    // This issue is the export leg of a transfer order — apply the same delta
    // to its import leg (ADR-07). `cascadeTransferOrder: false` is what
    // TransferOrderService.applyLegRevision itself passes when it calls back
    // in here, so the two legs don't ping-pong each other.
    if (
      options.cascadeTransferOrder !== false &&
      wasPosted &&
      deltas.length > 0 &&
      gi.referenceType === GoodsIssueReferenceType.TRANSFER_ORDER &&
      gi.referenceId
    ) {
      await this.transferOrderService.applyLegRevision(
        gi.referenceId,
        deltas.map((d) => ({ itemId: d.itemId, quantityDelta: d.quantityDelta })),
        actor,
        'export',
      );
    }

    return this.findOrFail(id, actor.organizationId, actor.branchId);
  }

  // Cancel is an edit down to nothing (ADR-02): the same delta engine that
  // powers update() reverses every line via computeVoucherDelta(before, []),
  // and a row lock — missing before this ticket — keeps two concurrent
  // cancels of the same issue from both reversing the stock.
  async cancel(
    id: string,
    actor: ActorContext,
    options: { cascadeTransferOrder?: boolean } = {},
  ): Promise<GoodsIssueEntity> {
    const gi = await this.findOrFail(id, actor.organizationId, actor.branchId);

    if (gi.status === GoodsIssueStatus.CANCELLED) {
      throw new ConflictException('Phiếu đã huỷ, không thể xoá lại');
    }

    if (
      options.cascadeTransferOrder !== false &&
      gi.referenceType === GoodsIssueReferenceType.TRANSFER_ORDER &&
      gi.referenceId
    ) {
      await this.transferOrderService.assertExportIssueCanBeCancelled(
        gi.referenceId,
        actor,
      );
    }

    const wasPosted = gi.status === GoodsIssueStatus.POSTED;
    const branchId = gi.branchId ?? actor.branchId;
    if (wasPosted && !branchId) {
      throw new BadRequestException(
        'Không xác định được chi nhánh để đảo bút tồn kho',
      );
    }

    const nextRevision = (gi.revision ?? 0) + 1;
    const deltas = wasPosted
      ? computeVoucherDelta(gi.lines.map(toLineSnapshot), [])
      : [];
    const movements: RecordMovementParams[] = deltas.map((d) => {
      const ledgerQuantityDelta = -d.quantityDelta;
      const ledgerValueDelta = -d.valueDelta;
      return {
        itemId: d.itemId,
        locationId: d.locationId,
        branchId: branchId!,
        organizationId: gi.organizationId,
        movementType: StockMovementType.ADJUSTMENT_INCREASE,
        quantity: ledgerQuantityDelta,
        referenceType: 'GOODS_ISSUE',
        referenceId: gi.id,
        notes: `Huỷ phiếu xuất kho ${gi.documentNumber ?? gi.id}`,
        actorContext: actor,
        // Full reversal is always the "issued less" direction — reverse at
        // the cost this issue actually posted at (T-04-02), not a fresh
        // average.
        unitCost: d.unitCostForDelta,
        lineValue: ledgerValueDelta,
        // Đảo bút huỷ phiếu đã posted: cho phép kể cả khi kho đã ngừng hoạt động.
        skipInactiveStorageGuard: true,
      };
    });

    const entries = await this.dataSource.transaction(async (manager) => {
      // Khoá row + đọc lại status/revision trong transaction để chặn 2 request
      // huỷ trùng nhau ghi đúp bút toán đảo.
      const [locked] = await manager.query(
        `SELECT status, revision FROM goods_issues WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [gi.id, gi.organizationId],
      );
      if (!locked || locked.status === GoodsIssueStatus.CANCELLED) {
        throw new ConflictException('Phiếu đã huỷ, không thể xoá lại');
      }
      if (Number(locked.revision ?? 0) !== (gi.revision ?? 0)) {
        throw new ConflictException(
          'This goods issue was modified by another request; reload it and try again',
        );
      }

      const reversalEntries =
        movements.length > 0
          ? await this.ledgerService.recordBatchMovements(movements, manager)
          : [];

      await manager.update(GoodsIssueEntity, gi.id, {
        status: GoodsIssueStatus.CANCELLED,
        ...(wasPosted ? { revision: nextRevision } : {}),
      });

      return reversalEntries;
    });
    await this.ledgerService.publishMovementEvents(entries);

    this.logger.log(`Goods issue ${id} cancelled by ${actor.userId}`);
    const saved = await this.findOrFail(id, actor.organizationId, actor.branchId);

    // When this issue is the export leg of a transfer order, deleting it must
    // also roll back the transfer: reverse the destination goods receipt (if the
    // order was already imported) and soft-delete the order. Skip when the
    // transfer-order cancel path drives the reversal itself, to avoid a loop.
    if (
      options.cascadeTransferOrder !== false &&
      gi.referenceType === GoodsIssueReferenceType.TRANSFER_ORDER &&
      gi.referenceId
    ) {
      await this.transferOrderService.cancelFromExportIssue(
        gi.referenceId,
        actor,
      );
    }

    return saved;
  }

  async getById(id: string, actor: ActorContext): Promise<GoodsIssueEntity> {
    const gi = await this.findOrFail(id, actor.organizationId, actor.branchId);
    await attachCounterparties(this.giRepo.manager, [gi], actor.organizationId);
    // The detail route is what the list page reads its selected row from (the
    // list row is deliberately treated as stale), so the freeze marker has to
    // be here too — otherwise the toolbar re-enables Sửa/Xóa on a document
    // update() will refuse.
    gi.transferImported = await this.isTransferImported(gi, actor);
    return gi;
  }

  /**
   * True when this is a transfer-out leg whose destination has already
   * confirmed import — the state that freezes the document. Mirrors the guard
   * in {@link update}; false for anything that is not a transfer leg.
   */
  private async isTransferImported(
    gi: GoodsIssueEntity,
    actor: ActorContext,
  ): Promise<boolean> {
    if (
      gi.referenceType !== GoodsIssueReferenceType.TRANSFER_ORDER ||
      !gi.referenceId
    ) {
      return false;
    }
    return this.transferOrderService.hasImportReceipt(
      gi.referenceId,
      actor.organizationId,
    );
  }

  /**
   * Paginated lines for one issue (T-02-02) — the existence/scope check is a
   * deliberately lean `findOne` with `loadEagerRelations: false`, NOT
   * `findOrFail`, so it doesn't pull the issue's eager `lines` just to prove
   * the issue exists and is in scope.
   *
   * Ordered by `id ASC`: `GoodsIssueLineEntity` has no `createdAt` column
   * (unlike its GR/TO counterparts), so `id` is the stable, deterministic
   * ordering infinite-scroll accumulation needs.
   */
  async getLines(
    id: string,
    actor: ActorContext,
    page: number,
    pageSize: number,
  ): Promise<GoodsIssueLinesPage> {
    const exists = await this.giRepo.findOne({
      where: {
        id,
        organizationId: actor.organizationId,
        ...(actor.branchId ? { branchId: actor.branchId } : {}),
      },
      loadEagerRelations: false,
    });
    if (!exists) throw new NotFoundException(`Phiếu xuất hàng ${id} không tìm thấy`);

    const [items, total] = await this.giRepo.manager.findAndCount(GoodsIssueLineEntity, {
      where: { goodsIssueId: id },
      order: { id: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { items, page, pageSize, hasMore: page * pageSize < total, total };
  }

  /** Print/export payload for one issue (T-03-02, UOW-08) — reuses `getById`'s 404. */
  async getPrintPayload(
    id: string,
    actor: ActorContext,
  ): Promise<VoucherPrintPayload> {
    return this.buildPrintPayload(await this.getById(id, actor), actor.organizationId);
  }

  /**
   * Print/export payload for an issue the caller already resolved AND scope-checked.
   * Split out of {@link getPrintPayload} for the cross-branch transfer view: the
   * destination branch resolves the source branch's XK through the transfer order
   * (org-scoped), so it cannot go through the branch-scoped `getById`.
   */
  async buildPrintPayload(
    issue: GoodsIssueEntity,
    organizationId: string,
  ): Promise<VoucherPrintPayload> {
    const [branch, transferDestinationStoreName] = await Promise.all([
      loadVoucherBranch(this.giRepo.manager, issue.branchId, organizationId),
      loadTransferCounterpartStoreName(
        this.giRepo.manager,
        'issue',
        issue.id,
        organizationId,
      ),
    ]);
    return mapGoodsIssueToVoucherPayload(issue, branch, transferDestinationStoreName);
  }

  async list(query: GoodsIssueQuery): Promise<PaginatedResponse<GoodsIssueEntity>> {
    const where: Record<string, unknown> = { organizationId: query.organizationId };
    if (query.status) {
      where.status = query.status;
    } else {
      // GoodsIssueEntity has no soft-delete column, so we hide cancelled rows
      // here. Callers wanting the full set can filter explicitly by status.
      where.status = Not(GoodsIssueStatus.CANCELLED);
    }
    if (query.branchId) where.branchId = query.branchId;

    const [data, total] = await this.giRepo.findAndCount({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: query.sortBy ? { [query.sortBy]: query.sortOrder ?? 'asc' } : { createdAt: 'DESC' },
    });

    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  // ─── Private helpers ──────────────────────────────────────────────

  private async resolveReasonContext(
    purpose: GoodsIssuePurpose,
    dto: CreateGoodsIssueDto,
    actor: ActorContext,
  ): Promise<{ reasonText: string; reasonId?: string; targetBranchId?: string }> {
    switch (purpose) {
      case GoodsIssuePurpose.OTHER:
      case GoodsIssuePurpose.DISPOSAL: {
        if (dto.reasonId) {
          const reason = await this.reasonRepo.findOne({
            where: { id: dto.reasonId, organizationId: actor.organizationId },
          });
          if (!reason) {
            throw new BadRequestException(`Lý do xuất kho ${dto.reasonId} không tồn tại`);
          }
          return { reasonText: reason.name, reasonId: reason.id };
        }
        const fallback =
          purpose === GoodsIssuePurpose.DISPOSAL ? 'Xuất huỷ' : 'Xuất khác';
        return { reasonText: dto.reason ?? fallback };
      }
      case GoodsIssuePurpose.TRANSFER_OUT: {
        if (!dto.targetBranchId) {
          throw new BadRequestException(
            'Vui lòng chọn cửa hàng đích để điều chuyển',
          );
        }
        if (actor.branchId && dto.targetBranchId === actor.branchId) {
          throw new BadRequestException(
            'Cửa hàng đích phải khác cửa hàng hiện tại',
          );
        }
        const branch = await this.branchRepo.findOne({
          where: { id: dto.targetBranchId, organizationId: actor.organizationId },
        });
        if (!branch) {
          throw new BadRequestException(
            `Chi nhánh ${dto.targetBranchId} không tồn tại`,
          );
        }
        return {
          reasonText: `Điều chuyển đến cửa hàng ${branch.name}`,
          targetBranchId: branch.id,
        };
      }
      case GoodsIssuePurpose.SALE: {
        // POS flow — preserves any reason text passed in
        return { reasonText: dto.reason ?? 'Bán hàng' };
      }
      default:
        return { reasonText: dto.reason ?? 'Khác' };
    }
  }

  private async findOrFail(
    id: string,
    organizationId: string,
    branchId?: string,
  ): Promise<GoodsIssueEntity> {
    const gi = await this.giRepo.findOne({
      where: { id, organizationId, ...(branchId ? { branchId } : {}) },
    });
    if (!gi) throw new NotFoundException(`Phiếu xuất hàng ${id} không tìm thấy`);
    return gi;
  }

  private validateTransition(current: GoodsIssueStatus, target: GoodsIssueStatus): void {
    if (!VALID_TRANSITIONS[current].includes(target)) {
      throw new BadRequestException(
        `Không thể chuyển từ trạng thái ${current} sang ${target}`,
      );
    }
  }
}
