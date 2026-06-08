import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import {
  DocumentType,
  ExportTransferOrderLine,
  ExportTransferOrderRequest,
  GoodsIssuePurpose,
  GoodsIssueReferenceType,
  GoodsReceiptPurpose,
  GoodsReceiptReferenceType,
  IssuableTransferOrderListItem,
  PaginatedResponse,
  PaginationQuery,
  TransferOrderStatus,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { BranchEntity } from '../../branch/branch.entity';
import { GoodsIssueService } from '../goods-issue/goods-issue.service';
import { GoodsReceiptService } from '../goods-receipt/goods-receipt.service';
import { LocationEntity } from '../location/location.entity';
import { TransferOrderEntity } from './transfer-order.entity';
import { TransferOrderLineEntity } from './transfer-order-line.entity';

export interface TransferOrderLineInput {
  itemId: string;
  requestedQty: number;
  // Source warehouse to pull this line from. The destination warehouse is
  // chosen once at import time, not per line.
  sourceStorageId?: string;
  note?: string;
}

export interface ConfirmImportDto {
  /** Destination warehouse to receive all lines into; falls back to the header. */
  destinationStorageId?: string;
}

export interface CreateTransferOrderDto {
  sourceBranchId: string;
  destinationBranchId: string;
  sourceStorageId?: string;
  destinationStorageId?: string;
  requestedDate?: string;
  notes?: string;
  attachmentIds?: string[];
  lines: TransferOrderLineInput[];
}

export interface UpdateTransferOrderDto {
  sourceBranchId?: string;
  destinationBranchId?: string;
  sourceStorageId?: string;
  destinationStorageId?: string;
  requestedDate?: string;
  notes?: string;
  attachmentIds?: string[];
  lines?: TransferOrderLineInput[];
}

export interface TransferOrderQuery extends PaginationQuery {
  status?: TransferOrderStatus;
  organizationId: string;
}

@Injectable()
export class TransferOrderService {
  private readonly logger = new Logger(TransferOrderService.name);

  constructor(
    @InjectRepository(TransferOrderEntity)
    private readonly toRepo: Repository<TransferOrderEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    private readonly dataSource: DataSource,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly goodsIssueService: GoodsIssueService,
    private readonly goodsReceiptService: GoodsReceiptService,
  ) {}

  // ─── Create (DRAFT) ─────────────────────────────────────────────────────────

  async create(
    dto: CreateTransferOrderDto,
    actor: ActorContext,
  ): Promise<TransferOrderEntity> {
    this.validateLines(dto.lines);

    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.TRANSFER_ORDER,
      actor.branchId,
      actor,
    );

    const to = this.toRepo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      documentNumber,
      status: TransferOrderStatus.DRAFT,
      sourceBranchId: dto.sourceBranchId,
      destinationBranchId: dto.destinationBranchId,
      sourceStorageId: dto.sourceStorageId,
      destinationStorageId: dto.destinationStorageId,
      requestedDate: dto.requestedDate,
      notes: dto.notes,
      attachmentIds: dto.attachmentIds ?? [],
      lines: dto.lines.map((l) => this.makeLine(l, actor)),
    });

    const saved = await this.toRepo.save(to);
    this.logger.log(
      `Transfer order ${saved.id} created as DRAFT ${documentNumber}`,
    );
    return this.findOrFail(saved.id, actor.organizationId);
  }

  // ─── Read ───────────────────────────────────────────────────────────────────

  async getById(id: string, organizationId: string): Promise<TransferOrderEntity> {
    return this.findOrFail(id, organizationId);
  }

  /** Load a voucher by its code, org-scoped so either branch can find it. */
  async getByCode(
    documentNumber: string,
    organizationId: string,
  ): Promise<TransferOrderEntity> {
    const to = await this.toRepo.findOne({
      where: { documentNumber, organizationId },
    });
    if (!to) {
      throw new NotFoundException(
        `Transfer order ${documentNumber} not found`,
      );
    }
    return to;
  }

  async list(
    query: TransferOrderQuery,
  ): Promise<PaginatedResponse<TransferOrderEntity>> {
    const where: Record<string, unknown> = {
      organizationId: query.organizationId,
    };
    if (query.status) where.status = query.status;

    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));

    const [data, total] = await this.toRepo.findAndCount({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, pageSize };
  }

  /**
   * DRAFT transfer orders that the actor's active branch (as source) can issue
   * stock from — feeds the "Chọn lệnh điều chuyển" picker on the goods-issue
   * form. Org + source-branch + DRAFT scoped, optionally filtered by date.
   * Destination branch names are resolved and inlined into each row.
   */
  async listIssuable(
    params: { from?: string; to?: string },
    actor: ActorContext,
  ): Promise<IssuableTransferOrderListItem[]> {
    const where: Record<string, unknown> = {
      organizationId: actor.organizationId,
      sourceBranchId: actor.branchId,
      status: TransferOrderStatus.DRAFT,
    };
    const createdAtRange = this.buildDateRange(params.from, params.to);
    if (createdAtRange) where.createdAt = createdAtRange;

    const orders = await this.toRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });

    const destIds = [
      ...new Set(orders.map((o) => o.destinationBranchId).filter(Boolean)),
    ];
    const branches = destIds.length
      ? await this.branchRepo.find({
          where: { id: In(destIds), organizationId: actor.organizationId },
        })
      : [];
    const nameById = new Map(branches.map((b) => [b.id, b.name]));

    return orders.map((o) => ({
      id: o.id,
      documentNumber: o.documentNumber ?? '',
      requestedDate:
        (o.requestedDate as string | undefined) ??
        (o.createdAt ? o.createdAt.toISOString() : null),
      notes: o.notes ?? null,
      destinationBranchId: o.destinationBranchId,
      destinationBranchName: nameById.get(o.destinationBranchId) ?? '',
      status: o.status,
    }));
  }

  // ─── Update (DRAFT: full; IN_PROGRESS: notes + attachments only) ─────────────

  async update(
    id: string,
    dto: UpdateTransferOrderDto,
    actor: ActorContext,
  ): Promise<TransferOrderEntity> {
    const to = await this.findOrFail(id, actor.organizationId);

    if (to.status === TransferOrderStatus.IN_PROGRESS) {
      const touchesLocked =
        dto.sourceBranchId !== undefined ||
        dto.destinationBranchId !== undefined ||
        dto.sourceStorageId !== undefined ||
        dto.destinationStorageId !== undefined ||
        dto.requestedDate !== undefined ||
        dto.lines !== undefined;
      if (touchesLocked) {
        throw new BadRequestException(
          'Only description and attachments can be edited once the transfer is in progress',
        );
      }
      if (dto.notes !== undefined) to.notes = dto.notes;
      if (dto.attachmentIds !== undefined) to.attachmentIds = dto.attachmentIds;
      await this.toRepo.save(to);
      return this.findOrFail(id, actor.organizationId);
    }

    if (to.status !== TransferOrderStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot edit a transfer order in status ${to.status}`,
      );
    }

    if (dto.lines) this.validateLines(dto.lines);

    return this.dataSource.transaction(async (manager) => {
      if (dto.sourceBranchId !== undefined) to.sourceBranchId = dto.sourceBranchId;
      if (dto.destinationBranchId !== undefined)
        to.destinationBranchId = dto.destinationBranchId;
      if (dto.sourceStorageId !== undefined)
        to.sourceStorageId = dto.sourceStorageId;
      if (dto.destinationStorageId !== undefined)
        to.destinationStorageId = dto.destinationStorageId;
      if (dto.requestedDate !== undefined) to.requestedDate = dto.requestedDate;
      if (dto.notes !== undefined) to.notes = dto.notes;
      if (dto.attachmentIds !== undefined) to.attachmentIds = dto.attachmentIds;

      if (dto.lines) {
        await manager.delete(TransferOrderLineEntity, { transferOrderId: to.id });
        to.lines = dto.lines.map((l) => this.makeLine(l, actor));
      }

      await manager.save(to);
      return this.findOrFail(to.id, actor.organizationId);
    });
  }

  // ─── Export (Store A): DRAFT → IN_PROGRESS, spawn GoodsIssue ─────────────────

  async confirmExport(
    id: string,
    actor: ActorContext,
    dto: ExportTransferOrderRequest = {},
  ): Promise<TransferOrderEntity> {
    const to = await this.findOrFail(id, actor.organizationId);
    if (to.status !== TransferOrderStatus.DRAFT) {
      throw new ConflictException('Transfer order is not in DRAFT state');
    }
    if (actor.branchId !== to.sourceBranchId) {
      throw new ForbiddenException(
        'Export must be confirmed from the source branch',
      );
    }

    // When the goods-issue form submits its (possibly edited) lines, issue those;
    // otherwise derive lines from the transfer order (legacy export button path).
    const lines = dto.lines?.length
      ? this.buildExportLinesFromInput(dto.lines, to)
      : await this.deriveExportLines(to, actor);

    // Ledger allows negative balances — "xuất kho khống" is warned client-side,
    // never blocked here.
    const goodsIssue = await this.goodsIssueService.createAndPost(
      {
        locationId: lines[0].locationId,
        purpose: GoodsIssuePurpose.TRANSFER_OUT,
        targetBranchId: to.destinationBranchId,
        referenceType: GoodsIssueReferenceType.TRANSFER_ORDER,
        referenceId: to.id,
        reason: dto.reason ?? `Transfer order ${to.documentNumber}`,
        notes: dto.notes,
        lines,
      },
      actor,
    );

    await this.toRepo.update(
      { id: to.id, organizationId: actor.organizationId },
      {
        status: TransferOrderStatus.IN_PROGRESS,
        exportGoodsIssueId: goodsIssue.id,
        exportedAt: new Date(),
        exportedBy: actor.userId,
      },
    );
    this.logger.log(
      `Transfer order ${to.id} exported (goods issue ${goodsIssue.id})`,
    );
    return this.findOrFail(to.id, actor.organizationId);
  }

  /** Derive export lines from the transfer order, resolving per-line source storage. */
  private async deriveExportLines(
    to: TransferOrderEntity,
    actor: ActorContext,
  ): Promise<
    { itemId: string; locationId: string; quantity: number; unitPrice: number }[]
  > {
    return Promise.all(
      to.lines.map(async (l) => ({
        itemId: l.itemId,
        locationId: await this.resolveLocation(
          l.sourceStorageId ?? to.sourceStorageId,
          actor.organizationId,
        ),
        quantity: Number(l.requestedQty),
        unitPrice: Number(l.item?.purchasePrice ?? 0),
      })),
    );
  }

  /**
   * Use the form-submitted lines for export. Every item must belong to the
   * transfer order, quantities must be positive, and each line carries its own
   * resolved source location from the form.
   */
  private buildExportLinesFromInput(
    inputLines: ExportTransferOrderLine[],
    to: TransferOrderEntity,
  ): {
    itemId: string;
    locationId: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }[] {
    const allowed = new Set(to.lines.map((l) => l.itemId));
    return inputLines.map((l) => {
      if (!allowed.has(l.itemId)) {
        throw new BadRequestException(
          'Line item is not part of the transfer order',
        );
      }
      if (Number(l.quantity) <= 0) {
        throw new BadRequestException('Line quantity must be greater than 0');
      }
      if (!l.locationId) {
        throw new BadRequestException('A source location is required for every line');
      }
      return {
        itemId: l.itemId,
        locationId: l.locationId,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice ?? 0),
        notes: l.notes,
      };
    });
  }

  // ─── Import (Store B): IN_PROGRESS → COMPLETED, spawn GoodsReceipt ───────────

  async confirmImport(
    id: string,
    actor: ActorContext,
    dto: ConfirmImportDto = {},
  ): Promise<TransferOrderEntity> {
    const to = await this.findOrFail(id, actor.organizationId);
    if (to.status !== TransferOrderStatus.IN_PROGRESS) {
      throw new ConflictException('Transfer order is not IN_PROGRESS');
    }
    if (actor.branchId !== to.destinationBranchId) {
      throw new ForbiddenException(
        'Import must be confirmed from the destination branch',
      );
    }

    // The destination warehouse is chosen at import time (or pre-set on the
    // header); all lines are received into it.
    const destStorageId = dto.destinationStorageId ?? to.destinationStorageId;
    if (!destStorageId) {
      throw new BadRequestException(
        'A destination warehouse is required to import',
      );
    }
    const destLocationId = await this.resolveLocation(
      destStorageId,
      actor.organizationId,
    );

    const lines = to.lines.map((l) => ({
      itemId: l.itemId,
      locationId: destLocationId,
      uomCode: l.item?.unit ?? 'CAI',
      quantity: Number(l.requestedQty),
      unitPrice: Number(l.item?.purchasePrice ?? 0),
    }));

    const goodsReceipt = await this.goodsReceiptService.createAndPost(
      {
        purpose: GoodsReceiptPurpose.TRANSFER_IN,
        referenceType: GoodsReceiptReferenceType.STOCK_TRANSFER,
        referenceId: to.id,
        sourceBranchId: to.sourceBranchId,
        receivedAt: new Date().toISOString(),
        locationId: destLocationId,
        lines,
      },
      actor,
    );

    await this.toRepo.update(
      { id: to.id, organizationId: actor.organizationId },
      {
        status: TransferOrderStatus.COMPLETED,
        importGoodsReceiptId: goodsReceipt.id,
        destinationStorageId: destStorageId,
        completedAt: new Date(),
        completedBy: actor.userId,
      },
    );
    this.logger.log(
      `Transfer order ${to.id} completed (goods receipt ${goodsReceipt.id})`,
    );
    return this.findOrFail(to.id, actor.organizationId);
  }

  // ─── Cancel (DRAFT: free; IN_PROGRESS: reverse export) ──────────────────────

  async cancel(id: string, actor: ActorContext): Promise<void> {
    const to = await this.findOrFail(id, actor.organizationId);
    if (
      to.status === TransferOrderStatus.COMPLETED ||
      to.status === TransferOrderStatus.CANCELLED
    ) {
      throw new ConflictException(
        'Cannot cancel a completed or already-cancelled transfer order',
      );
    }

    if (to.status === TransferOrderStatus.IN_PROGRESS && to.exportGoodsIssueId) {
      // Reverse the export — GoodsIssue.cancel posts an ADJUSTMENT_INCREASE that
      // restores the source-branch stock.
      await this.goodsIssueService.cancel(to.exportGoodsIssueId, actor);
      to.cancelledAt = new Date();
      to.cancelledBy = actor.userId;
    }

    to.status = TransferOrderStatus.CANCELLED;
    await this.toRepo.save(to);
    await this.toRepo.softDelete(to.id);
    this.logger.log(`Transfer order ${id} cancelled`);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private makeLine(
    l: TransferOrderLineInput,
    actor: ActorContext,
  ): TransferOrderLineEntity {
    const line = new TransferOrderLineEntity();
    line.organizationId = actor.organizationId;
    line.branchId = actor.branchId;
    line.createdBy = actor.userId;
    line.itemId = l.itemId;
    line.requestedQty = String(l.requestedQty);
    line.sourceStorageId = l.sourceStorageId;
    line.note = l.note;
    return line;
  }

  private validateLines(lines: TransferOrderLineInput[] | undefined): void {
    if (!lines || lines.length === 0) {
      throw new BadRequestException(
        'Transfer order must have at least one line',
      );
    }
    for (const l of lines) {
      if (Number(l.requestedQty) <= 0) {
        throw new BadRequestException('Requested quantity must be greater than 0');
      }
    }
  }

  /** Resolve a storage (warehouse) to its default "unassigned" location for ledger posting. */
  private async resolveLocation(
    storageId: string | undefined,
    organizationId: string,
  ): Promise<string> {
    if (!storageId) {
      throw new BadRequestException(
        'A source/destination warehouse is required for every line',
      );
    }
    const location = await this.locationRepo.findOne({
      where: { storageId, isUnassigned: true, organizationId },
    });
    if (!location) {
      throw new BadRequestException(
        `Warehouse ${storageId} has no default (unassigned) location`,
      );
    }
    return location.id;
  }

  /** Build a createdAt range operator from day-granularity from/to strings. */
  private buildDateRange(from?: string, to?: string) {
    const start = from ? new Date(from) : undefined;
    let end: Date | undefined;
    if (to) {
      end = new Date(to);
      if (!Number.isNaN(end.getTime())) end.setUTCHours(23, 59, 59, 999);
    }
    const validStart = start && !Number.isNaN(start.getTime()) ? start : undefined;
    const validEnd = end && !Number.isNaN(end.getTime()) ? end : undefined;
    if (validStart && validEnd) return Between(validStart, validEnd);
    if (validStart) return MoreThanOrEqual(validStart);
    if (validEnd) return LessThanOrEqual(validEnd);
    return undefined;
  }

  private async findOrFail(
    id: string,
    organizationId: string,
  ): Promise<TransferOrderEntity> {
    const to = await this.toRepo.findOne({ where: { id, organizationId } });
    if (!to) throw new NotFoundException(`Transfer order ${id} not found`);
    return to;
  }
}
