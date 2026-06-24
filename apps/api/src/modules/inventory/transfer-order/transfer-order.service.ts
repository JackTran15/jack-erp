import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  Between,
  DataSource,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from "typeorm";
import {
  DocumentType,
  ExportTransferOrderLine,
  ExportTransferOrderRequest,
  ImportTransferOrderLine,
  GoodsIssuePurpose,
  GoodsIssueReferenceType,
  GoodsReceiptPurpose,
  GoodsReceiptReferenceType,
  ImportableTransferOrderListItem,
  IssuableTransferOrderListItem,
  PaginatedResponse,
  PaginationQuery,
  TransferOrderStatus,
} from "@erp/shared-interfaces";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { DocumentNumberingService } from "../../document-numbering/document-numbering.service";
import { BranchEntity } from "../../branch/branch.entity";
import { GoodsIssueService } from "../goods-issue/goods-issue.service";
import { GoodsReceiptService } from "../goods-receipt/goods-receipt.service";
import { LocationEntity } from "../location/location.entity";
import { StockBalanceEntity } from "../ledger/stock-balance.entity";
import { GoodsIssueEntity } from "../goods-issue/goods-issue.entity";
import { StorageEntity } from "../location/storage.entity";
import { TransferOrderEntity } from "./transfer-order.entity";
import { TransferOrderLineEntity } from "./transfer-order-line.entity";

export interface TransferOrderLineInput {
  itemId: string;
  requestedQty: number;
  // Source warehouse to pull this line from. The destination warehouse is
  // chosen once at import time, not per line.
  sourceStorageId?: string;
  note?: string;
}

export interface ConfirmImportDto {
  /** Per-line received Kho/Vị trí from the form; when present, used instead of derive. */
  lines?: ImportTransferOrderLine[];
  /** Destination warehouse (Kho nhận) — fallback when `lines` is omitted. */
  destinationStorageId?: string;
  /** Đối tượng (counterparty provider) carried onto the spawned receipt. */
  providerId?: string;
  /** Người giao (free-text deliverer name). */
  deliverer?: string;
  /** Tham chiếu — FE-supplied reference codes. */
  references?: string[];
  /** User-entered receive date+time (ISO); falls back to now when omitted. */
  occurredAt?: string;
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

export interface CreateAndConfirmTransferExportDto {
  locationId: string;
  targetBranchId: string;
  providerId?: string;
  reason?: string;
  notes?: string;
  deliverer?: string;
  references?: string[];
  occurredAt?: string;
  lines: {
    itemId: string;
    locationId?: string;
    quantity: number;
    unitPrice?: number;
    notes?: string;
  }[];
}

export interface UpdateTransferOrderDto {
  status?: TransferOrderStatus;
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
  branchId?: string;
}

@Injectable()
export class TransferOrderService {
  private readonly logger = new Logger(TransferOrderService.name);

  constructor(
    @InjectRepository(TransferOrderEntity)
    private readonly toRepo: Repository<TransferOrderEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    @InjectRepository(StockBalanceEntity)
    private readonly balanceRepo: Repository<StockBalanceEntity>,
    @InjectRepository(GoodsIssueEntity)
    private readonly giRepo: Repository<GoodsIssueEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    @InjectRepository(StorageEntity)
    private readonly storageRepo: Repository<StorageEntity>,
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
    if (!actor.branchId) {
      throw new BadRequestException(
        "Cần chọn cửa hàng hiện tại để lập lệnh điều chuyển",
      );
    }
    if (dto.destinationBranchId === actor.branchId) {
      throw new BadRequestException(
        "Cửa hàng đích phải khác cửa hàng hiện tại",
      );
    }

    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.TRANSFER_ORDER,
      actor.branchId,
      actor,
    );

    const lines = dto.lines.map((l) => this.makeLine(l, actor));
    await this.fillSourceLocations(
      lines,
      dto.sourceStorageId,
      actor.organizationId,
    );

    const to = this.toRepo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      documentNumber,
      status: TransferOrderStatus.DRAFT,
      sourceBranchId: actor.branchId,
      destinationBranchId: dto.destinationBranchId,
      sourceStorageId: dto.sourceStorageId,
      destinationStorageId: dto.destinationStorageId,
      requestedDate: dto.requestedDate,
      notes: dto.notes,
      attachmentIds: dto.attachmentIds ?? [],
      lines,
    });

    const saved = await this.toRepo.save(to);
    this.logger.log(
      `Transfer order ${saved.id} created as DRAFT ${documentNumber}`,
    );
    return this.findOrFail(saved.id, actor.organizationId);
  }

  async createAndConfirmExport(
    dto: CreateAndConfirmTransferExportDto,
    actor: ActorContext,
  ): Promise<TransferOrderEntity> {
    if (!dto.targetBranchId) {
      throw new BadRequestException("Cần chọn cửa hàng nhận hàng điều chuyển");
    }

    const sourceLocations = await Promise.all(
      dto.lines.map(async (line) => {
        const locationId = line.locationId ?? dto.locationId;
        const location = await this.locationRepo.findOne({
          where: { id: locationId, organizationId: actor.organizationId },
        });
        if (!location?.storageId) {
          throw new BadRequestException(
            `Không xác định được kho nguồn của vị trí ${locationId}`,
          );
        }
        return { line, locationId, storageId: location.storageId };
      }),
    );

    const order = await this.create(
      {
        sourceBranchId: actor.branchId!,
        destinationBranchId: dto.targetBranchId,
        sourceStorageId: sourceLocations[0]?.storageId,
        requestedDate: dto.occurredAt?.slice(0, 10),
        notes: dto.notes ?? dto.reason,
        lines: sourceLocations.map(({ line, storageId }) => ({
          itemId: line.itemId,
          requestedQty: Number(line.quantity),
          sourceStorageId: storageId,
          note: line.notes,
        })),
      },
      actor,
    );

    return this.confirmExport(order.id, actor, {
      reason: dto.reason,
      notes: dto.notes,
      providerId: dto.providerId,
      deliverer: dto.deliverer,
      references: dto.references,
      occurredAt: dto.occurredAt,
      lines: sourceLocations.map(({ line, locationId }) => ({
        itemId: line.itemId,
        locationId,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice ?? 0),
        notes: line.notes,
      })),
    });
  }

  // ─── Read ───────────────────────────────────────────────────────────────────

  async getById(id: string, actor: ActorContext): Promise<TransferOrderEntity> {
    const to = await this.findOrFail(id, actor.organizationId);
    this.assertParticipantBranch(to, actor);
    await this.attachSourceLocations(to, actor.organizationId);
    return to;
  }

  /**
   * Export goods-issue (XK) of a transfer, resolved org-scoped so the importing
   * (destination) branch can view the source branch's issue document. The
   * branch-scoped goods-issue GET would 404 here — the issue belongs to the
   * source branch.
   */
  async getExportGoodsIssue(
    id: string,
    actor: ActorContext,
  ): Promise<GoodsIssueEntity> {
    const to = await this.findOrFail(id, actor.organizationId);
    this.assertParticipantBranch(to, actor);
    if (!to.exportGoodsIssueId) {
      throw new NotFoundException(
        `Lệnh điều chuyển ${id} chưa có phiếu xuất kho`,
      );
    }
    const gi = await this.giRepo.findOne({
      where: {
        id: to.exportGoodsIssueId,
        organizationId: actor.organizationId,
      },
    });
    if (!gi) {
      throw new NotFoundException(
        `Không tìm thấy phiếu xuất kho của lệnh điều chuyển ${id}`,
      );
    }
    return gi;
  }

  /**
   * Fill in each line's display bin (Vị trí) for the goods-issue form. The bin
   * is persisted on the line (source_location_id, resolved from stock at create
   * time); here we just resolve its human code. Legacy lines created before the
   * column existed have a null bin — fall back to live stock resolution so they
   * still render. Batched location-code lookup; per-line fallback only on null.
   */
  private async attachSourceLocations(
    to: TransferOrderEntity,
    organizationId: string,
  ): Promise<void> {
    const lines = to.lines ?? [];

    const locationIds = [
      ...new Set(
        lines
          .map((l) => l.sourceLocationId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const locations = locationIds.length
      ? await this.locationRepo.find({
          where: { id: In(locationIds), organizationId },
        })
      : [];
    const codeByLocId = new Map(locations.map((loc) => [loc.id, loc.code]));

    for (const l of lines) {
      if (l.sourceLocationId) {
        l.sourceLocationCode = codeByLocId.get(l.sourceLocationId) ?? null;
        continue;
      }
      // Legacy line (pre-column): resolve from current stock.
      const storageId = l.sourceStorageId ?? to.sourceStorageId;
      const locId = storageId
        ? await this.resolveSourceLocation(l.itemId, storageId, organizationId)
        : null;
      l.sourceLocationId = locId;
      l.sourceLocationCode = locId
        ? ((
            await this.locationRepo.findOne({
              where: { id: locId, organizationId },
            })
          )?.code ?? null)
        : null;
    }
  }

  /**
   * Resolve the source bin to issue from: the location holding the most stock of
   * the item within the given storage. Null when the item has no stock there.
   */
  private async resolveSourceLocation(
    itemId: string,
    storageId: string,
    organizationId: string,
  ): Promise<string | null> {
    const sb = await this.balanceRepo
      .createQueryBuilder("sb")
      .innerJoin("locations", "loc", "loc.id = sb.location_id")
      .where("sb.item_id = :itemId AND loc.storage_id = :storageId", {
        itemId,
        storageId,
      })
      .andWhere("sb.organization_id = :organizationId", { organizationId })
      .andWhere("sb.quantity > 0")
      .orderBy("sb.quantity", "DESC")
      .getOne();
    return sb?.locationId ?? null;
  }

  /** Resolve + assign each line's persisted source bin from current stock. */
  private async fillSourceLocations(
    lines: TransferOrderLineEntity[],
    headerStorageId: string | undefined,
    organizationId: string,
  ): Promise<void> {
    for (const l of lines) {
      const storageId = l.sourceStorageId ?? headerStorageId;
      l.sourceLocationId = storageId
        ? await this.resolveSourceLocation(l.itemId, storageId, organizationId)
        : null;
    }
  }

  /** Load a voucher by its code, org-scoped so either branch can find it. */
  async getByCode(
    documentNumber: string,
    actor: ActorContext,
  ): Promise<TransferOrderEntity> {
    const to = await this.toRepo.findOne({
      where: { documentNumber, organizationId: actor.organizationId },
    });
    if (!to) {
      throw new NotFoundException(`Transfer order ${documentNumber} not found`);
    }
    this.assertParticipantBranch(to, actor);
    return to;
  }

  async list(
    query: TransferOrderQuery,
  ): Promise<PaginatedResponse<TransferOrderEntity>> {
    const baseWhere: Record<string, unknown> = {
      organizationId: query.organizationId,
    };
    if (query.status) baseWhere.status = query.status;
    const where = query.branchId
      ? { ...baseWhere, sourceBranchId: query.branchId }
      : baseWhere;

    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));

    const [data, total] = await this.toRepo.findAndCount({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { createdAt: "DESC" },
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
      order: { createdAt: "DESC" },
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
      documentNumber: o.documentNumber ?? "",
      requestedDate:
        (o.requestedDate as string | undefined) ??
        (o.createdAt ? o.createdAt.toISOString() : null),
      notes: o.notes ?? null,
      destinationBranchId: o.destinationBranchId,
      destinationBranchName: nameById.get(o.destinationBranchId) ?? "",
      status: o.status,
    }));
  }

  /**
   * Transfer orders the actor's active branch (as destination) can import.
   * MISA allows the source form to mark a transfer order "Hoàn thành" before
   * the destination creates its stock receipt, so both PROGRESS and
   * COMPLETED-without-import-reference are importable here.
   */
  async listImportable(
    params: { from?: string; to?: string; includeCompleted?: boolean },
    actor: ActorContext,
  ): Promise<ImportableTransferOrderListItem[]> {
    const where: Record<string, unknown> = {
      organizationId: actor.organizationId,
      destinationBranchId: actor.branchId,
      status: In([
        TransferOrderStatus.IN_PROGRESS,
        TransferOrderStatus.COMPLETED,
      ]),
      ...(params.includeCompleted ? {} : { importGoodsReceiptId: IsNull() }),
    };
    const createdAtRange = this.buildDateRange(params.from, params.to);
    if (createdAtRange) where.createdAt = createdAtRange;

    const orders = await this.toRepo.find({
      where,
      order: { createdAt: "DESC" },
    });

    const srcIds = [
      ...new Set(orders.map((o) => o.sourceBranchId).filter(Boolean)),
    ];
    const branches = srcIds.length
      ? await this.branchRepo.find({
          where: { id: In(srcIds), organizationId: actor.organizationId },
        })
      : [];
    const branchName = new Map(branches.map((b) => [b.id, b.name]));

    // Resolve the export goods-issue (XK) number + total per order, in memory.
    const giIds = [
      ...new Set(
        orders
          .map((o) => o.exportGoodsIssueId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const issues = giIds.length
      ? await this.giRepo.find({
          where: { id: In(giIds), organizationId: actor.organizationId },
        })
      : [];
    const giById = new Map(
      issues.map((gi) => [
        gi.id,
        {
          documentNumber: gi.documentNumber ?? null,
          counterpartyName: gi.counterparty?.name ?? gi.provider?.name ?? null,
          total: (gi.lines ?? []).reduce(
            (sum, l) => sum + Number(l.lineTotal ?? 0),
            0,
          ),
          lines: (gi.lines ?? []).map((line) => ({
            itemId: line.itemId,
            itemCode: line.item?.code ?? "",
            itemName: line.item?.name ?? "",
            unit: line.item?.unit ?? "",
            storageName: line.location?.storage?.name ?? null,
            locationCode: line.location?.code ?? null,
            quantity: Number(line.quantity ?? 0),
            unitPrice: Number(line.unitPrice ?? 0),
            lineTotal: Number(line.lineTotal ?? 0),
            notes: line.notes ?? null,
          })),
        },
      ]),
    );

    return orders.map((o) => {
      const gi = o.exportGoodsIssueId ? giById.get(o.exportGoodsIssueId) : null;
      return {
        id: o.id,
        documentNumber: o.documentNumber ?? "",
        requestedDate:
          (o.requestedDate as string | undefined) ??
          (o.createdAt ? o.createdAt.toISOString() : null),
        notes: o.notes ?? null,
        sourceBranchId: o.sourceBranchId,
        sourceBranchName: branchName.get(o.sourceBranchId) ?? "",
        exportGoodsIssueId: o.exportGoodsIssueId ?? null,
        importGoodsReceiptId: o.importGoodsReceiptId ?? null,
        exportGoodsIssueDocumentNumber: gi?.documentNumber ?? null,
        counterpartyName: gi?.counterpartyName ?? null,
        totalAmount:
          gi?.total ??
          (o.lines ?? []).reduce(
            (sum, line) =>
              sum +
              Number(line.requestedQty ?? 0) *
                Number(line.item?.purchasePrice ?? 0),
            0,
          ),
        lines: (o.lines ?? []).map((line) => {
          const issueLine = gi?.lines.find(
            (candidate) => candidate.itemId === line.itemId,
          );
          const fallbackQuantity = Number(line.requestedQty ?? 0);
          const fallbackUnitPrice = Number(line.item?.purchasePrice ?? 0);
          return {
            id: line.id,
            itemId: line.itemId,
            itemCode: issueLine?.itemCode ?? line.item?.code ?? "",
            itemName: issueLine?.itemName ?? line.item?.name ?? "",
            unit: issueLine?.unit ?? line.item?.unit ?? "",
            storageName: issueLine?.storageName ?? null,
            locationCode: issueLine?.locationCode ?? null,
            quantity: issueLine?.quantity ?? fallbackQuantity,
            unitPrice: issueLine?.unitPrice ?? fallbackUnitPrice,
            lineTotal:
              issueLine?.lineTotal ?? fallbackQuantity * fallbackUnitPrice,
            notes: issueLine?.notes ?? line.note ?? null,
          };
        }),
        status: o.status,
      };
    });
  }

  // ─── Update (DRAFT: full + start; IN_PROGRESS: notes + attachments only) ─────

  async update(
    id: string,
    dto: UpdateTransferOrderDto,
    actor: ActorContext,
  ): Promise<TransferOrderEntity> {
    const to = await this.findOrFail(id, actor.organizationId);
    this.assertParticipantBranch(to, actor);
    const isSourceBranch = actor.branchId === to.sourceBranchId;
    const isStatusOnlyCompletion =
      dto.status === TransferOrderStatus.COMPLETED &&
      Object.entries(dto).every(
        ([key, value]) => key === "status" || value === undefined,
      );

    if (to.status === TransferOrderStatus.COMPLETED && isStatusOnlyCompletion) {
      return this.completeOrderImmediately(to, actor);
    }

    if (!isSourceBranch) {
      const nextStatus = dto.status;
      const statusOnly =
        (nextStatus === TransferOrderStatus.IN_PROGRESS ||
          nextStatus === TransferOrderStatus.COMPLETED) &&
        Object.entries(dto).every(
          ([key, value]) => key === "status" || value === undefined,
        );
      const canDestinationChangeStatus =
        to.status === TransferOrderStatus.DRAFT ||
        to.status === TransferOrderStatus.IN_PROGRESS;
      if (!canDestinationChangeStatus || !statusOnly) {
        throw new ForbiddenException(
          "Cửa hàng đích chỉ được cập nhật trạng thái lệnh điều chuyển",
        );
      }
      if (nextStatus === TransferOrderStatus.COMPLETED) {
        return this.completeOrderImmediately(to, actor);
      }
      to.status = nextStatus;
      await this.toRepo.save(to);
      return this.findOrFail(id, actor.organizationId);
    }

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
          "Only description and attachments can be edited once the transfer is in progress",
        );
      }
      if (
        dto.status !== undefined &&
        dto.status !== TransferOrderStatus.IN_PROGRESS &&
        dto.status !== TransferOrderStatus.COMPLETED
      ) {
        throw new BadRequestException(
          "Trạng thái lệnh điều chuyển không hợp lệ",
        );
      }
      if (dto.notes !== undefined) to.notes = dto.notes;
      if (dto.attachmentIds !== undefined) to.attachmentIds = dto.attachmentIds;
      if (dto.status === TransferOrderStatus.COMPLETED) {
        await this.toRepo.save(to);
        return this.completeOrderImmediately(to, actor);
      }
      if (dto.status !== undefined) to.status = dto.status;
      await this.toRepo.save(to);
      return this.findOrFail(id, actor.organizationId);
    }

    if (to.status !== TransferOrderStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot edit a transfer order in status ${to.status}`,
      );
    }

    if (dto.lines) this.validateLines(dto.lines);
    if (
      dto.status !== undefined &&
      dto.status !== TransferOrderStatus.DRAFT &&
      dto.status !== TransferOrderStatus.IN_PROGRESS &&
      dto.status !== TransferOrderStatus.COMPLETED
    ) {
      throw new BadRequestException("Trạng thái lệnh điều chuyển không hợp lệ");
    }
    if (
      dto.sourceBranchId !== undefined &&
      dto.sourceBranchId !== actor.branchId
    ) {
      throw new BadRequestException("Cửa hàng nguồn phải là cửa hàng hiện tại");
    }
    if (dto.destinationBranchId === actor.branchId) {
      throw new BadRequestException(
        "Cửa hàng đích phải khác cửa hàng hiện tại",
      );
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      if (dto.sourceBranchId !== undefined) to.sourceBranchId = actor.branchId!;
      if (dto.destinationBranchId !== undefined)
        to.destinationBranchId = dto.destinationBranchId;
      if (dto.sourceStorageId !== undefined)
        to.sourceStorageId = dto.sourceStorageId;
      if (dto.destinationStorageId !== undefined)
        to.destinationStorageId = dto.destinationStorageId;
      if (dto.requestedDate !== undefined) to.requestedDate = dto.requestedDate;
      if (dto.notes !== undefined) to.notes = dto.notes;
      if (dto.attachmentIds !== undefined) to.attachmentIds = dto.attachmentIds;
      if (
        dto.status !== undefined &&
        dto.status !== TransferOrderStatus.COMPLETED
      ) {
        to.status = dto.status;
      }

      if (dto.lines) {
        await manager.delete(TransferOrderLineEntity, {
          transferOrderId: to.id,
        });
        to.lines = dto.lines.map((l) => this.makeLine(l, actor));
        await this.fillSourceLocations(
          to.lines,
          to.sourceStorageId,
          actor.organizationId,
        );
      }

      await manager.save(to);
      return to;
    });
    if (dto.status === TransferOrderStatus.COMPLETED) {
      return this.completeOrderImmediately(saved, actor);
    }
    return this.findOrFail(saved.id, actor.organizationId);
  }

  // ─── Export (Store A): DRAFT → IN_PROGRESS, spawn GoodsIssue ─────────────────

  async confirmExport(
    id: string,
    actor: ActorContext,
    dto: ExportTransferOrderRequest = {},
  ): Promise<TransferOrderEntity> {
    const to = await this.findOrFail(id, actor.organizationId);
    if (to.status !== TransferOrderStatus.DRAFT) {
      throw new ConflictException("Transfer order is not in DRAFT state");
    }
    if (actor.branchId !== to.sourceBranchId) {
      throw new ForbiddenException(
        "Export must be confirmed from the source branch",
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
        // Carry the goods-issue form's header fields onto the spawned issue so
        // the export leg round-trips Đối tượng / Người giao / Tham chiếu / Ngày.
        providerId: dto.providerId,
        deliverer: dto.deliverer,
        references: dto.references,
        occurredAt: dto.occurredAt,
        lines,
      },
      actor,
    );

    try {
      await this.toRepo.update(
        { id: to.id, organizationId: actor.organizationId },
        {
          status: TransferOrderStatus.IN_PROGRESS,
          exportGoodsIssueId: goodsIssue.id,
          exportedAt: new Date(),
          exportedBy: actor.userId,
        },
      );
    } catch (error) {
      try {
        await this.goodsIssueService.cancel(goodsIssue.id, actor);
      } catch (rollbackError) {
        this.logger.error(
          `Could not reverse goods issue ${goodsIssue.id} after transfer order ${to.id} update failed`,
          rollbackError instanceof Error ? rollbackError.stack : undefined,
        );
      }
      throw error;
    }
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
    {
      itemId: string;
      locationId: string;
      quantity: number;
      unitPrice: number;
    }[]
  > {
    return Promise.all(
      to.lines.map(async (l) => ({
        itemId: l.itemId,
        locationId:
          l.sourceLocationId ??
          (await this.resolveLocation(
            l.sourceStorageId ?? to.sourceStorageId,
            actor.organizationId,
          )),
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
          "Line item is not part of the transfer order",
        );
      }
      if (Number(l.quantity) <= 0) {
        throw new BadRequestException("Line quantity must be greater than 0");
      }
      if (!l.locationId) {
        throw new BadRequestException(
          "A source location is required for every line",
        );
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

  /**
   * Use the goods-receipt form's per-line Kho/Vị trí for import. Every item must
   * belong to the transfer order; quantities positive; each line carries its own
   * destination bin. uomCode is resolved from the order line's item.
   */
  private buildImportLinesFromInput(
    inputLines: ImportTransferOrderLine[],
    to: TransferOrderEntity,
  ): {
    itemId: string;
    locationId: string;
    uomCode: string;
    quantity: number;
    unitPrice: number;
    note?: string;
  }[] {
    const byItem = new Map(to.lines.map((l) => [l.itemId, l]));
    return inputLines.map((l) => {
      const orderLine = byItem.get(l.itemId);
      if (!orderLine) {
        throw new BadRequestException(
          "Line item is not part of the transfer order",
        );
      }
      if (Number(l.quantity) <= 0) {
        throw new BadRequestException("Line quantity must be greater than 0");
      }
      if (!l.locationId) {
        throw new BadRequestException(
          "A destination location is required for every line",
        );
      }
      return {
        itemId: l.itemId,
        locationId: l.locationId,
        uomCode: orderLine.item?.unit ?? "CAI",
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice ?? orderLine.item?.purchasePrice ?? 0),
        note: l.note,
      };
    });
  }

  // ─── Import (Store B): importable order → COMPLETED + GoodsReceipt ──────────

  async confirmImport(
    id: string,
    actor: ActorContext,
    dto: ConfirmImportDto = {},
  ): Promise<TransferOrderEntity> {
    const to = await this.findOrFail(id, actor.organizationId);
    if (
      (to.status !== TransferOrderStatus.IN_PROGRESS &&
        to.status !== TransferOrderStatus.COMPLETED) ||
      to.importGoodsReceiptId
    ) {
      throw new ConflictException("Transfer order is not importable");
    }
    if (actor.branchId !== to.destinationBranchId) {
      throw new ForbiddenException(
        "Import must be confirmed from the destination branch",
      );
    }

    // When the goods-receipt form submits per-line Kho/Vị trí, receive into
    // those bins; otherwise derive every line into the destination storage's
    // default bin (legacy single-Kho path).
    let destStorageId = dto.destinationStorageId ?? to.destinationStorageId;
    let lines: {
      itemId: string;
      locationId: string;
      uomCode: string;
      quantity: number;
      unitPrice: number;
      note?: string;
    }[];
    if (dto.lines?.length) {
      lines = this.buildImportLinesFromInput(dto.lines, to);
      destStorageId = await this.validateDestinationLocations(
        lines.map((line) => line.locationId),
        actor,
        dto.destinationStorageId,
      );
    } else {
      if (!destStorageId) {
        throw new BadRequestException(
          "A destination warehouse is required to import",
        );
      }
      const destLocationId = await this.resolveLocation(
        destStorageId,
        actor.organizationId,
      );
      await this.validateDestinationLocations(
        [destLocationId],
        actor,
        destStorageId,
      );
      lines = to.lines.map((l) => ({
        itemId: l.itemId,
        locationId: destLocationId,
        uomCode: l.item?.unit ?? "CAI",
        quantity: Number(l.requestedQty),
        unitPrice: Number(l.item?.purchasePrice ?? 0),
      }));
    }

    // A transfer order may be moved to IN_PROGRESS directly from its edit form
    // so it appears in "Điều chuyển từ cửa hàng khác" and in pending-stock
    // reports before any ledger movement. When that path is used, materialize
    // the missing source issue immediately before the destination receipt so a
    // completed transfer always changes both outgoing and incoming stock.
    let generatedExportGoodsIssueId: string | undefined;
    const sourceActor: ActorContext = {
      ...actor,
      branchId: to.sourceBranchId,
    };
    if (!to.exportGoodsIssueId) {
      const exportLines = await this.deriveExportLines(to, sourceActor);
      const goodsIssue = await this.goodsIssueService.createAndPost(
        {
          locationId: exportLines[0].locationId,
          purpose: GoodsIssuePurpose.TRANSFER_OUT,
          targetBranchId: to.destinationBranchId,
          referenceType: GoodsIssueReferenceType.TRANSFER_ORDER,
          referenceId: to.id,
          reason: `Transfer order ${to.documentNumber}`,
          lines: exportLines,
        },
        sourceActor,
      );
      generatedExportGoodsIssueId = goodsIssue.id;
    }

    let goodsReceipt: { id: string };
    try {
      goodsReceipt = await this.goodsReceiptService.createAndPost(
        {
          purpose: GoodsReceiptPurpose.TRANSFER_IN,
          referenceType: GoodsReceiptReferenceType.STOCK_TRANSFER,
          referenceId: to.id,
          sourceBranchId: to.sourceBranchId,
          receivedAt: dto.occurredAt ?? new Date().toISOString(),
          locationId: lines[0].locationId,
          // Carry the goods-receipt form's header fields onto the spawned receipt
          // so the import leg round-trips Đối tượng / Người giao / Tham chiếu.
          providerId: dto.providerId,
          deliveredBy: dto.deliverer,
          references: dto.references,
          lines,
        },
        actor,
      );
    } catch (error) {
      if (generatedExportGoodsIssueId) {
        try {
          await this.goodsIssueService.cancel(
            generatedExportGoodsIssueId,
            sourceActor,
          );
        } catch (rollbackError) {
          this.logger.error(
            `Could not reverse auto-generated goods issue ${generatedExportGoodsIssueId} after transfer import ${to.id} failed`,
            rollbackError instanceof Error ? rollbackError.stack : undefined,
          );
        }
      }
      throw error;
    }

    await this.toRepo.update(
      { id: to.id, organizationId: actor.organizationId },
      {
        status: TransferOrderStatus.COMPLETED,
        exportGoodsIssueId:
          generatedExportGoodsIssueId ?? to.exportGoodsIssueId,
        importGoodsReceiptId: goodsReceipt.id,
        destinationStorageId: destStorageId ?? to.destinationStorageId,
        ...(generatedExportGoodsIssueId
          ? {
              exportedAt: new Date(),
              exportedBy: actor.userId,
            }
          : {}),
        completedAt: new Date(),
        completedBy: actor.userId,
      },
    );
    this.logger.log(
      `Transfer order ${to.id} completed (goods receipt ${goodsReceipt.id})`,
    );
    return this.findOrFail(to.id, actor.organizationId);
  }

  /**
   * MISA-style direct completion from the transfer-order form. Completing a
   * transfer is a material stock action, not just a status flag: it must post
   * the source goods issue and the destination goods receipt so Tổng hợp tồn kho
   * shows SL xuất / SL nhập immediately.
   */
  private async completeOrderImmediately(
    to: TransferOrderEntity,
    actor: ActorContext,
  ): Promise<TransferOrderEntity> {
    if (to.importGoodsReceiptId) {
      if (to.status !== TransferOrderStatus.COMPLETED) {
        await this.toRepo.update(
          { id: to.id, organizationId: actor.organizationId },
          { status: TransferOrderStatus.COMPLETED },
        );
      }
      return this.findOrFail(to.id, actor.organizationId);
    }

    if (!to.lines?.length) {
      throw new BadRequestException(
        "Lệnh điều chuyển phải có ít nhất một dòng hàng hóa",
      );
    }

    const sourceActor: ActorContext = {
      ...actor,
      branchId: to.sourceBranchId,
    };
    const destinationActor: ActorContext = {
      ...actor,
      branchId: to.destinationBranchId,
    };

    const destinationStorageId =
      to.destinationStorageId ??
      (await this.resolveDefaultDestinationStorageId(to, actor.organizationId));
    const destinationLocationId = await this.resolveLocation(
      destinationStorageId,
      actor.organizationId,
    );
    await this.validateDestinationLocations(
      [destinationLocationId],
      destinationActor,
      destinationStorageId,
    );

    let generatedExportGoodsIssueId: string | undefined;
    if (!to.exportGoodsIssueId) {
      const exportLines = await this.deriveExportLines(to, sourceActor);
      const goodsIssue = await this.goodsIssueService.createAndPost(
        {
          locationId: exportLines[0].locationId,
          purpose: GoodsIssuePurpose.TRANSFER_OUT,
          targetBranchId: to.destinationBranchId,
          referenceType: GoodsIssueReferenceType.TRANSFER_ORDER,
          referenceId: to.id,
          reason: `Transfer order ${to.documentNumber}`,
          notes: to.notes,
          lines: exportLines,
        },
        sourceActor,
      );
      generatedExportGoodsIssueId = goodsIssue.id;
    }

    let goodsReceipt: { id: string };
    try {
      goodsReceipt = await this.goodsReceiptService.createAndPost(
        {
          purpose: GoodsReceiptPurpose.TRANSFER_IN,
          referenceType: GoodsReceiptReferenceType.STOCK_TRANSFER,
          referenceId: to.id,
          sourceBranchId: to.sourceBranchId,
          receivedAt: new Date().toISOString(),
          locationId: destinationLocationId,
          references: to.documentNumber ? [to.documentNumber] : undefined,
          lines: to.lines.map((line) => ({
            itemId: line.itemId,
            locationId: destinationLocationId,
            uomCode: line.item?.unit ?? "CAI",
            quantity: Number(line.requestedQty),
            unitPrice: Number(line.item?.purchasePrice ?? 0),
            note: line.note,
          })),
        },
        destinationActor,
      );
    } catch (error) {
      if (generatedExportGoodsIssueId) {
        try {
          await this.goodsIssueService.cancel(
            generatedExportGoodsIssueId,
            sourceActor,
          );
        } catch (rollbackError) {
          this.logger.error(
            `Could not reverse auto-generated goods issue ${generatedExportGoodsIssueId} after direct transfer completion ${to.id} failed`,
            rollbackError instanceof Error ? rollbackError.stack : undefined,
          );
        }
      }
      throw error;
    }

    await this.toRepo.update(
      { id: to.id, organizationId: actor.organizationId },
      {
        status: TransferOrderStatus.COMPLETED,
        exportGoodsIssueId:
          generatedExportGoodsIssueId ?? to.exportGoodsIssueId,
        importGoodsReceiptId: goodsReceipt.id,
        destinationStorageId,
        ...(generatedExportGoodsIssueId
          ? {
              exportedAt: new Date(),
              exportedBy: actor.userId,
            }
          : {}),
        completedAt: new Date(),
        completedBy: actor.userId,
      },
    );

    this.logger.log(
      `Transfer order ${to.id} directly completed (goods receipt ${goodsReceipt.id})`,
    );
    return this.findOrFail(to.id, actor.organizationId);
  }

  private async resolveDefaultDestinationStorageId(
    to: TransferOrderEntity,
    organizationId: string,
  ): Promise<string> {
    const where = {
      organizationId,
      branchId: to.destinationBranchId,
    };
    const storage =
      (await this.storageRepo.findOne({
        where: { ...where, isDefaultReceiving: true },
      })) ??
      (await this.storageRepo.findOne({
        where: { ...where, isMainStorage: true },
      })) ??
      (await this.storageRepo.findOne({
        where,
        order: { createdAt: "ASC" },
      }));

    if (!storage) {
      throw new BadRequestException(
        "Cần thiết lập kho nhận cho cửa hàng đích trước khi hoàn thành lệnh điều chuyển",
      );
    }
    return storage.id;
  }

  // ─── Cancel (DRAFT: free; IN_PROGRESS: reverse export) ──────────────────────

  async cancel(id: string, actor: ActorContext): Promise<void> {
    const to = await this.findOrFail(id, actor.organizationId);
    this.assertSourceBranch(
      to,
      actor,
      "Chỉ cửa hàng nguồn được hủy lệnh điều chuyển",
    );
    if (
      to.status === TransferOrderStatus.COMPLETED ||
      to.status === TransferOrderStatus.CANCELLED
    ) {
      throw new ConflictException(
        "Cannot cancel a completed or already-cancelled transfer order",
      );
    }

    if (
      to.status === TransferOrderStatus.IN_PROGRESS &&
      to.exportGoodsIssueId
    ) {
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
        "Transfer order must have at least one line",
      );
    }
    for (const l of lines) {
      if (Number(l.requestedQty) <= 0) {
        throw new BadRequestException(
          "Requested quantity must be greater than 0",
        );
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
        "A source/destination warehouse is required for every line",
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

  private async validateDestinationLocations(
    locationIds: string[],
    actor: ActorContext,
    requestedStorageId?: string,
  ): Promise<string> {
    const uniqueIds = [...new Set(locationIds)];
    const locations = await this.locationRepo.find({
      where: {
        id: In(uniqueIds),
        organizationId: actor.organizationId,
      },
      relations: { storage: true },
    });
    const byId = new Map(locations.map((location) => [location.id, location]));

    for (const locationId of locationIds) {
      const location = byId.get(locationId);
      if (!location || location.isActive === false) {
        throw new BadRequestException(
          `Vị trí nhận ${locationId} không tồn tại hoặc đã ngừng sử dụng`,
        );
      }
      if (location.storage?.branchId !== actor.branchId) {
        throw new BadRequestException(
          "Mọi vị trí nhận phải thuộc chi nhánh hiện tại",
        );
      }
      if (requestedStorageId && location.storageId !== requestedStorageId) {
        throw new BadRequestException(
          "Vị trí nhận không thuộc kho nhận đã chọn",
        );
      }
    }

    return byId.get(locationIds[0])!.storageId;
  }

  /** Build a createdAt range operator from day-granularity from/to strings. */
  private buildDateRange(from?: string, to?: string) {
    const start = from ? new Date(from) : undefined;
    let end: Date | undefined;
    if (to) {
      end = new Date(to);
      if (!Number.isNaN(end.getTime())) end.setUTCHours(23, 59, 59, 999);
    }
    const validStart =
      start && !Number.isNaN(start.getTime()) ? start : undefined;
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

  private assertParticipantBranch(
    to: TransferOrderEntity,
    actor: ActorContext,
  ): void {
    if (
      !actor.branchId ||
      (to.sourceBranchId !== actor.branchId &&
        to.destinationBranchId !== actor.branchId)
    ) {
      throw new NotFoundException(`Transfer order ${to.id} not found`);
    }
  }

  private assertSourceBranch(
    to: TransferOrderEntity,
    actor: ActorContext,
    message: string,
  ): void {
    if (!actor.branchId || to.sourceBranchId !== actor.branchId) {
      throw new ForbiddenException(message);
    }
  }
}
