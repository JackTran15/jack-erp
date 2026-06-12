import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, IsNull, Repository } from "typeorm";
import {
  DocumentType,
  GoodsIssuePurpose,
  GoodsIssueReferenceType,
  GoodsIssueStatus,
  GoodsReceiptPurpose,
  GoodsReceiptReferenceType,
  GoodsReceiptStatus,
  PaginatedResponse,
  PaginationQuery,
  StockMovementType,
  StockTakeStatus,
} from "@erp/shared-interfaces";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { DocumentNumberingService } from "../../document-numbering/document-numbering.service";
import { GoodsIssueEntity } from "../goods-issue/goods-issue.entity";
import { GoodsIssueLineEntity } from "../goods-issue/goods-issue-line.entity";
import { GoodsReceiptEntity } from "../goods-receipt/goods-receipt.entity";
import { GoodsReceiptLineEntity } from "../goods-receipt/goods-receipt-line.entity";
import { LocationEntity } from "../location/location.entity";
import { StorageEntity } from "../location/storage.entity";
import { ItemEntity } from "../location/item.entity";
import { ItemCostSnapshotService } from "../location/item-cost-snapshot.service";
import { StockBalanceEntity } from "../ledger/stock-balance.entity";
import {
  RecordMovementParams,
  StockLedgerService,
} from "../ledger/stock-ledger.service";
import { StockTakeEntity } from "./stock-take.entity";
import { StockTakeLineEntity } from "./stock-take-line.entity";
import { StockTakeMemberEntity } from "./stock-take-member.entity";

export interface CreateStockTakeDto {
  storageId?: string;
  locationId?: string;
  /** Planned cutoff date (YYYY-MM-DD). */
  plannedDate?: string;
  purpose?: string;
  notes?: string;
  conclusion?: string;
  countByValue?: boolean;
  /** Optional ISO datetime — combined "Ngày + Giờ kiểm kê". Defaults to now() on server. */
  countedAt?: string;
  /**
   * Optional initial lines. The form dialog batches the user's row edits here
   * so creation is atomic — no DB row exists until the user clicks Lưu.
   */
  lines?: CreateStockTakeLinePayload[];
  members?: StockTakeMemberPayload[];
  mergeSourceIds?: string[];
}

export interface CreateStockTakeLinePayload {
  itemId: string;
  /** If omitted, server picks the location holding the largest balance for this item. */
  locationId?: string;
  countedQty?: number | null;
  countedValue?: number | null;
  reason?: string;
}

export interface StockTakeMemberPayload {
  fullName: string;
  title?: string | null;
  representative?: string | null;
}

export interface UpdateStockTakeHeaderDto {
  purpose?: string;
  notes?: string;
  conclusion?: string;
  countByValue?: boolean;
  /** ISO datetime — combined "Ngày + Giờ kiểm kê". */
  countedAt?: string;
}

export interface UpdateLineCountDto {
  locationId?: string;
  countedQty?: number | null;
  countedValue?: number | null;
  note?: string;
  reason?: string;
}

export interface AddLineDto {
  itemId: string;
  /** Optional — if omitted, server picks the first stock-balance row in the storage for this item. */
  locationId?: string;
}

export interface StockTakeQuery extends PaginationQuery {
  status?: StockTakeStatus;
  organizationId: string;
  branchId?: string;
  /** Filter on createdAt ≥ fromDate (inclusive, YYYY-MM-DD). */
  fromDate?: string;
  /** Filter on createdAt ≤ toDate (inclusive, YYYY-MM-DD). */
  toDate?: string;
  documentNumber?: string;
  storage?: string;
  purpose?: string;
  mergeStatus?: "MERGED" | "UNMERGED";
}

export interface StockTakeMergePreview {
  storageId?: string;
  plannedDate?: string;
  countedAt: string;
  purpose: string;
  conclusion?: string;
  countByValue: boolean;
  mergeSourceIds: string[];
  lines: StockTakeLineEntity[];
  members: StockTakeMemberPayload[];
}

interface StockTakeWorkbookSource {
  documentNumber?: string;
  plannedDate?: string;
  countedAt?: Date;
  purpose?: string;
  conclusion?: string;
  countByValue: boolean;
  storageName?: string;
  useCurrentDateInHeader?: boolean;
  lines: StockTakeLineEntity[];
  members: StockTakeMemberEntity[];
}

@Injectable()
export class StockTakeService {
  private readonly logger = new Logger(StockTakeService.name);

  constructor(
    @InjectRepository(StockTakeEntity)
    private readonly stRepo: Repository<StockTakeEntity>,
    @InjectRepository(StockTakeLineEntity)
    private readonly lineRepo: Repository<StockTakeLineEntity>,
    @InjectRepository(StockTakeMemberEntity)
    private readonly memberRepo: Repository<StockTakeMemberEntity>,
    @InjectRepository(StockBalanceEntity)
    private readonly balanceRepo: Repository<StockBalanceEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    @InjectRepository(StorageEntity)
    private readonly storageRepo: Repository<StorageEntity>,
    @InjectRepository(GoodsReceiptEntity)
    private readonly receiptRepo: Repository<GoodsReceiptEntity>,
    @InjectRepository(GoodsIssueEntity)
    private readonly issueRepo: Repository<GoodsIssueEntity>,
    private readonly dataSource: DataSource,
    private readonly stockLedger: StockLedgerService,
    private readonly documentNumbering: DocumentNumberingService,
    private readonly itemCostSnapshotService: ItemCostSnapshotService,
  ) {}

  /**
   * Create a new stock-take session. Generates the KK document number, then
   * persists whichever lines the client batched up (the form
   * dialog defers all DB writes until the user clicks Lưu, so this method
   * must accept the full line set in one go). When no lines are passed, the
   * stock-take is created empty and the user adds rows individually via
   * addLine() afterwards.
   */
  async create(
    dto: CreateStockTakeDto,
    actor: ActorContext,
  ): Promise<StockTakeEntity> {
    const mergeSources = dto.mergeSourceIds?.length
      ? await this.loadMergeSources(
          dto.mergeSourceIds,
          actor.organizationId,
          actor.branchId,
        )
      : [];
    const storageId = mergeSources[0]?.storageId ?? dto.storageId;
    const mergedLocationIds = new Set(
      mergeSources.map((source) => source.locationId).filter(Boolean),
    );
    const locationId = mergeSources.length
      ? mergedLocationIds.size === 1
        ? mergeSources[0].locationId
        : undefined
      : dto.locationId;
    const countByValue = mergeSources[0]?.countByValue ?? dto.countByValue;
    const mergedStatus = mergeSources[0]?.status ?? StockTakeStatus.DRAFT;

    if (!storageId && !locationId) {
      throw new BadRequestException(
        "Cần chọn kho hoặc vị trí để khởi tạo phiếu kiểm kê",
      );
    }

    const documentNumber = await this.documentNumbering.generate(
      DocumentType.STOCK_TAKE,
      actor.branchId,
      actor,
    );

    const itemCostByItemId = await this.itemCostSnapshotService.snapshotCosts(
      actor.organizationId,
      [...new Set((dto.lines ?? []).map((line) => line.itemId))],
    );
    const lines: StockTakeLineEntity[] = [];
    for (const lineDto of dto.lines ?? []) {
      const resolved = await this.resolveLineLocation(
        actor.organizationId,
        lineDto.itemId,
        lineDto.locationId,
        storageId,
        locationId,
      );
      const line = this.buildLine(
        actor,
        lineDto.itemId,
        resolved.locationId,
        resolved.expectedQty,
      );
      line.expectedValue = String(
        resolved.expectedQty * (itemCostByItemId.get(lineDto.itemId) ?? 0),
      );
      if (lineDto.countedQty != null) {
        line.countedQty = String(lineDto.countedQty);
      }
      if (lineDto.countedValue != null) {
        line.countedValue = String(lineDto.countedValue);
      }
      if (lineDto.reason !== undefined) line.reason = lineDto.reason;
      lines.push(line);
    }

    const members = (dto.members ?? [])
      .filter((member) => member.fullName?.trim())
      .map((member, index) =>
        this.memberRepo.create({
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          createdBy: actor.userId,
          fullName: member.fullName.trim(),
          title: member.title ?? null,
          representative: member.representative ?? null,
          sortOrder: index,
        }),
      );

    const now = new Date();
    const st = this.stRepo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      documentNumber,
      status: mergedStatus,
      storageId,
      locationId,
      purpose: dto.purpose,
      countByValue: countByValue ?? false,
      plannedDate: dto.plannedDate,
      countedAt: dto.countedAt ? new Date(dto.countedAt) : now,
      snapshotAt: now,
      notes: dto.notes,
      conclusion: dto.conclusion,
      lines,
      members,
      mergeSourceIds: mergeSources.length
        ? mergeSources.map((source) => source.id)
        : null,
      postedAt: mergedStatus === StockTakeStatus.POSTED ? now : undefined,
      postedBy:
        mergedStatus === StockTakeStatus.POSTED ? actor.userId : undefined,
    });

    const saved = mergeSources.length
      ? await this.dataSource.transaction(async (manager) => {
          const savedMerged = await manager.save(StockTakeEntity, st);
          const result = await manager.update(
            StockTakeEntity,
            {
              id: In(mergeSources.map((source) => source.id)),
              organizationId: actor.organizationId,
              status: mergedStatus,
              mergedIntoId: IsNull(),
            },
            { mergedIntoId: savedMerged.id, mergedAt: now },
          );
          if (result.affected !== mergeSources.length) {
            throw new ConflictException(
              "Một hoặc nhiều phiếu nguồn đã thay đổi, vui lòng gộp lại",
            );
          }
          return savedMerged;
        })
      : await this.stRepo.save(st);
    this.logger.log(
      `Stock-take ${saved.id} (${documentNumber}) created with ${lines.length} line(s)`,
    );
    return this.findOrFail(saved.id, actor.organizationId, actor.branchId);
  }

  async previewMerge(
    sourceIds: string[],
    actor: ActorContext,
  ): Promise<StockTakeMergePreview> {
    const sources = await this.loadMergeSources(
      sourceIds,
      actor.organizationId,
      actor.branchId,
    );
    const first = sources[0];
    const lineMap = new Map<string, StockTakeLineEntity>();
    const itemCostByItemId = await this.itemCostSnapshotService.snapshotCosts(
      actor.organizationId,
      [
        ...new Set(
          sources.flatMap((source) =>
            (source.lines ?? []).map((line) => line.itemId),
          ),
        ),
      ],
    );

    for (const source of sources) {
      for (const sourceLine of source.lines ?? []) {
        const key = `${sourceLine.itemId}:${sourceLine.locationId}`;
        const existing = lineMap.get(key);
        if (existing) {
          existing.countedQty = String(
            Number(existing.countedQty ?? 0) +
              Number(sourceLine.countedQty ?? 0),
          );
          existing.countedValue = String(
            Number(existing.countedValue ?? 0) +
              Number(sourceLine.countedValue ?? 0),
          );
          existing.reason = this.joinUniqueText([
            existing.reason,
            sourceLine.reason,
          ]);
          continue;
        }

        const resolved = await this.resolveLineLocation(
          actor.organizationId,
          sourceLine.itemId,
          sourceLine.locationId,
          first.storageId,
          first.locationId,
        );
        const line = this.buildLine(
          actor,
          sourceLine.itemId,
          resolved.locationId,
          resolved.expectedQty,
        );
        line.expectedValue = String(
          resolved.expectedQty * (itemCostByItemId.get(sourceLine.itemId) ?? 0),
        );
        line.item = sourceLine.item;
        line.location = sourceLine.location;
        line.countedQty = String(Number(sourceLine.countedQty ?? 0));
        line.countedValue = String(Number(sourceLine.countedValue ?? 0));
        line.reason = sourceLine.reason;
        lineMap.set(key, line);
      }
    }

    const memberMap = new Map<string, StockTakeMemberPayload>();
    for (const member of sources.flatMap((source) => source.members ?? [])) {
      const key = [
        member.fullName.trim().toLowerCase(),
        member.title?.trim().toLowerCase() ?? "",
        member.representative?.trim().toLowerCase() ?? "",
      ].join("|");
      if (!memberMap.has(key)) {
        memberMap.set(key, {
          fullName: member.fullName,
          title: member.title,
          representative: member.representative,
        });
      }
    }

    return {
      storageId: first.storageId,
      plannedDate: sources
        .map((source) => source.plannedDate)
        .filter((date): date is string => !!date)
        .sort()
        .at(-1),
      countedAt: new Date().toISOString(),
      purpose: `Gộp phiếu ${sources
        .map((source) => source.documentNumber ?? source.id.slice(0, 8))
        .join(", ")}`,
      conclusion: this.joinUniqueText(
        sources.map((source) => source.conclusion),
      ),
      countByValue: first.countByValue,
      mergeSourceIds: sources.map((source) => source.id),
      lines: [...lineMap.values()],
      members: [...memberMap.values()],
    };
  }

  /** Update header fields while still DRAFT. */
  async updateHeader(
    id: string,
    dto: UpdateStockTakeHeaderDto,
    actor: ActorContext,
  ): Promise<StockTakeEntity> {
    const st = await this.findOrFail(id, actor.organizationId, actor.branchId);
    this.assertDraft(st);

    if (dto.purpose !== undefined) st.purpose = dto.purpose;
    if (dto.notes !== undefined) st.notes = dto.notes;
    if (dto.conclusion !== undefined) st.conclusion = dto.conclusion;
    if (dto.countByValue !== undefined) st.countByValue = dto.countByValue;
    if (dto.countedAt !== undefined) st.countedAt = new Date(dto.countedAt);

    await this.stRepo.save(st);
    return this.findOrFail(id, actor.organizationId, actor.branchId);
  }

  /**
   * Add one line. Server looks up current stock_balance for the (item, location)
   * to seed expectedQty. If locationId is not provided, picks the first balance
   * row for this item within the stock-take's storage scope.
   */
  async addLine(
    id: string,
    dto: AddLineDto,
    actor: ActorContext,
  ): Promise<StockTakeLineEntity> {
    const st = await this.findOrFail(id, actor.organizationId, actor.branchId);
    this.assertDraft(st);

    const resolved = await this.resolveLineLocation(
      actor.organizationId,
      dto.itemId,
      dto.locationId,
      st.storageId,
      st.locationId,
    );

    const line = this.buildLine(
      actor,
      dto.itemId,
      resolved.locationId,
      resolved.expectedQty,
    );
    const itemCost = await this.itemCostSnapshotService.snapshotOne(
      actor.organizationId,
      dto.itemId,
    );
    line.expectedValue = String(resolved.expectedQty * itemCost);
    line.stockTakeId = st.id;
    const saved = await this.lineRepo.save(line);
    return this.lineRepo.findOne({
      where: { id: saved.id },
    }) as Promise<StockTakeLineEntity>;
  }

  /**
   * Resolve (locationId, expectedQty) for a single line. Shared by create()
   * (batched lines) and addLine() (incremental). When the caller specifies a
   * location we validate it against the stock-take scope; otherwise we pick
   * the location with the largest balance for the item, falling back to the
   * first active location of the storage so the line still has a valid FK.
   */
  private async resolveLineLocation(
    organizationId: string,
    itemId: string,
    explicitLocationId: string | undefined,
    storageId: string | undefined,
    scopeLocationId: string | undefined,
  ): Promise<{ locationId: string; expectedQty: number }> {
    if (explicitLocationId) {
      const location = await this.locationRepo.findOne({
        where: {
          id: explicitLocationId,
          organizationId,
          isActive: true,
          ...(storageId ? { storageId } : {}),
        },
      });
      if (!location || (scopeLocationId && location.id !== scopeLocationId)) {
        throw new BadRequestException(
          "Vị trí được chọn không thuộc phạm vi kiểm kê",
        );
      }
      const bal = await this.balanceRepo.findOne({
        where: {
          organizationId,
          itemId,
          locationId: explicitLocationId,
        },
      });
      return {
        locationId: explicitLocationId,
        expectedQty: bal ? Number(bal.quantity) : 0,
      };
    }

    const found = await this.findItemBalanceInScope(
      organizationId,
      itemId,
      storageId,
      scopeLocationId,
    );
    if (found) {
      return {
        locationId: found.locationId,
        expectedQty: Number(found.quantity),
      };
    }

    if (scopeLocationId) {
      return { locationId: scopeLocationId, expectedQty: 0 };
    }
    if (storageId) {
      const firstLoc = await this.locationRepo.findOne({
        where: { organizationId, storageId, isActive: true },
        order: { code: "ASC" },
      });
      if (!firstLoc) {
        throw new BadRequestException(
          "Kho được chọn chưa có vị trí — tạo vị trí trước khi kiểm kê",
        );
      }
      return { locationId: firstLoc.id, expectedQty: 0 };
    }
    throw new BadRequestException("Không xác định được vị trí cho dòng");
  }

  async removeLine(
    id: string,
    lineId: string,
    actor: ActorContext,
  ): Promise<void> {
    const st = await this.findOrFail(id, actor.organizationId, actor.branchId);
    this.assertDraft(st);
    const line = st.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException(`Dòng ${lineId} không tìm thấy`);
    await this.lineRepo.delete(lineId);
  }

  async updateLineCount(
    stockTakeId: string,
    lineId: string,
    dto: UpdateLineCountDto,
    actor: ActorContext,
  ): Promise<StockTakeLineEntity> {
    const st = await this.findOrFail(stockTakeId, actor.organizationId, actor.branchId);
    this.assertDraft(st);
    const line = st.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException(`Dòng ${lineId} không tìm thấy`);

    if (dto.locationId !== undefined && dto.locationId !== line.locationId) {
      const resolved = await this.resolveLineLocation(
        actor.organizationId,
        line.itemId,
        dto.locationId,
        st.storageId,
        st.locationId,
      );
      const itemCost = await this.itemCostSnapshotService.snapshotOne(
        actor.organizationId,
        line.itemId,
      );
      line.locationId = resolved.locationId;
      line.expectedQty = String(resolved.expectedQty);
      line.expectedValue = String(resolved.expectedQty * itemCost);
    }
    if (dto.countedQty !== undefined) {
      line.countedQty = dto.countedQty == null ? null : String(dto.countedQty);
    }
    if (dto.countedValue !== undefined) {
      line.countedValue =
        dto.countedValue == null ? null : String(dto.countedValue);
    }
    if (dto.note !== undefined) line.note = dto.note;
    if (dto.reason !== undefined) line.reason = dto.reason;
    return this.lineRepo.save(line);
  }

  async cancel(id: string, actor: ActorContext): Promise<void> {
    const st = await this.findOrFail(id, actor.organizationId, actor.branchId);
    this.assertDraft(st);
    st.status = StockTakeStatus.CANCELLED;
    await this.stRepo.save(st);
    await this.stRepo.softDelete(st.id);
  }

  async replaceMembers(
    stockTakeId: string,
    members: StockTakeMemberPayload[],
    actor: ActorContext,
  ): Promise<StockTakeEntity> {
    const st = await this.findOrFail(stockTakeId, actor.organizationId, actor.branchId);
    this.assertDraft(st);
    await this.memberRepo.delete({ stockTakeId });
    const rows = members
      .filter((member) => member.fullName?.trim())
      .map((member, index) =>
        this.memberRepo.create({
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          createdBy: actor.userId,
          stockTakeId,
          fullName: member.fullName.trim(),
          title: member.title ?? null,
          representative: member.representative ?? null,
          sortOrder: index,
        }),
      );
    if (rows.length) await this.memberRepo.save(rows);
    return this.findOrFail(stockTakeId, actor.organizationId, actor.branchId);
  }

  /**
   * "Xử lý" — process the stock-take. For every line with a variance:
   *   - positive variances are aggregated into one POSTED goods-receipt
   *   - negative variances are aggregated into one POSTED goods-issue
   * Both documents carry the stock-take's documentNumber in their reason field
   * so they remain discoverable from the Nhập kho / Xuất kho lists.
   * Stock balances are updated via the ledger as part of the same transaction.
   */
  async process(id: string, actor: ActorContext): Promise<StockTakeEntity> {
    const st = await this.findOrFail(id, actor.organizationId, actor.branchId);
    this.assertDraft(st);
    if (!st.lines || st.lines.length === 0) {
      throw new BadRequestException("Phiếu kiểm kê không có dòng");
    }

    const branchId = st.branchId ?? actor.branchId;
    if (!branchId) {
      throw new BadRequestException(
        "Không xác định được chi nhánh để hạch toán điều chỉnh",
      );
    }

    type Variance = {
      line: StockTakeLineEntity;
      variance: number;
      itemId: string;
      locationId: string;
    };

    const variances: Variance[] = st.lines
      .filter((l) => l.countedQty != null)
      .map((l) => ({
        line: l,
        variance: Number(l.countedQty) - Number(l.expectedQty),
        itemId: l.itemId,
        locationId: l.locationId,
      }))
      .filter((v) => v.variance !== 0);

    const positives = variances.filter((v) => v.variance > 0);
    const negatives = variances.filter((v) => v.variance < 0);

    let generatedReceiptId: string | undefined;
    let generatedIssueId: string | undefined;

    await this.dataSource.transaction(async (manager) => {
      const stockTakeRef = st.documentNumber ?? st.id.slice(0, 8);
      const description = `Xử lý chênh lệch theo phiếu kiểm kê số ${stockTakeRef}`;

      // Snapshot purchase price per item ONCE — used both for the generated
      // receipt/issue line values (MISA values the adjustment document at cost)
      // and the ledger movement unit_cost. Computed before creating the docs.
      const itemIds = Array.from(new Set(variances.map((v) => v.itemId)));
      const itemCostByItemId = await this.itemCostSnapshotService.snapshotCosts(
        st.organizationId,
        itemIds,
      );

      const items = await manager.find(ItemEntity, {
        where: { id: In(itemIds), organizationId: st.organizationId },
      });
      const itemUnitByItemId = new Map(items.map((i) => [i.id, i.unit]));

      if (positives.length > 0) {
        const receipt = await this.createGeneratedReceipt(
          manager,
          actor,
          branchId,
          st,
          positives,
          description,
          itemCostByItemId,
          itemUnitByItemId,
        );
        generatedReceiptId = receipt.id;
      }

      if (negatives.length > 0) {
        const issue = await this.createGeneratedIssue(
          manager,
          actor,
          branchId,
          st,
          negatives,
          description,
          itemCostByItemId,
        );
        generatedIssueId = issue.id;
      }

      await manager.update(StockTakeEntity, st.id, {
        status: StockTakeStatus.POSTED,
        postedAt: new Date(),
        postedBy: actor.userId,
        generatedReceiptId,
        generatedIssueId,
      });

      // Post stock movements LAST so any failure rolls back the receipt/issue
      // headers above as well.
      const movements: RecordMovementParams[] = variances.map((v) => ({
        itemId: v.itemId,
        locationId: v.locationId,
        branchId,
        organizationId: st.organizationId,
        movementType:
          v.variance > 0
            ? StockMovementType.ADJUSTMENT_INCREASE
            : StockMovementType.ADJUSTMENT_DECREASE,
        quantity: v.variance,
        referenceType: "STOCK_TAKE",
        referenceId: st.id,
        notes: description,
        actorContext: actor,
        unitCost: itemCostByItemId.get(v.itemId) ?? 0,
      }));
      await this.stockLedger.recordBatchMovements(movements);
    });

    this.logger.log(
      `Stock-take ${id} processed: receipt=${generatedReceiptId ?? "-"} issue=${generatedIssueId ?? "-"}`,
    );
    return this.findOrFail(id, actor.organizationId, actor.branchId);
  }

  async getById(id: string, actor: ActorContext): Promise<StockTakeEntity> {
    return this.findOrFail(id, actor.organizationId, actor.branchId);
  }

  async exportExcelBuffer(id: string, actor: ActorContext): Promise<Buffer> {
    const st = await this.findOrFail(id, actor.organizationId, actor.branchId);
    const storage = st.storageId
      ? await this.storageRepo.findOne({
          where: { id: st.storageId, organizationId: actor.organizationId },
        })
      : null;
    return this.buildWorkbookBuffer({
      documentNumber: st.documentNumber,
      plannedDate: st.plannedDate,
      countedAt: st.countedAt,
      purpose: st.purpose,
      conclusion: st.conclusion,
      countByValue: !!st.countByValue,
      storageName:
        storage?.name ?? st.lines?.[0]?.location?.storage?.name ?? "",
      useCurrentDateInHeader: true,
      lines: st.lines ?? [],
      members: st.members ?? [],
    });
  }

  /**
   * Sinh file mẫu nhập khẩu kiểm kê theo đúng layout MISA (không gửi file gốc của MISA).
   * Header 2 tầng, gợi ý nhập (data validation) từng cột y MISA, dữ liệu nhập từ dòng 9.
   * `countByValue=false` → ẩn nhóm cột "Giá trị" (M:O) giống bản tải mặc định của MISA.
   */
  async buildImportTemplateBuffer(countByValue: boolean): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Jack ERP";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Danh sách hàng hóa kiểm kê");

    // Toàn sheet dùng Times New Roman như MISA; đặt style mặc định cho cột để
    // dữ liệu người dùng nhập sau cũng đúng font (đồng thời ô info có style cụ thể,
    // tránh cảnh báo "number stored as text" của Excel trên ô không định dạng).
    const FONT = "Times New Roman";
    const baseStyle = { font: { name: FONT, size: 11 } } as const;
    const col = (width: number, hidden = false) => ({
      width,
      hidden,
      style: baseStyle,
    });
    sheet.columns = [
      col(16), // A Mã SKU
      col(16), // B Mã vạch
      col(28), // C Tên hàng hóa
      col(12), // D Đơn vị tính
      col(14), // E Vị trí
      col(12), // F Số lô
      col(14), // G Hạn sử dụng
      col(16), // H Serial/IMEI
      col(16), // I Nhóm hàng hóa
      col(12), // J Số lượng - Theo sổ
      col(12), // K Số lượng - Kiểm kê
      col(12), // L Số lượng - Chênh lệch
      col(14, !countByValue), // M Giá trị - Theo sổ
      col(14, !countByValue), // N Giá trị - Kiểm kê
      col(14, !countByValue), // O Giá trị - Chênh lệch
      col(22), // P Nguyên nhân
    ];

    // Khối thông tin đầu trang (chỉ để hiển thị, parser bỏ qua).
    const a1 = sheet.getCell("A1");
    a1.value = "Tên cửa hàng";
    a1.font = { bold: true, italic: true, name: FONT, size: 11 };
    const a2 = sheet.getCell("A2");
    a2.value = "Địa chỉ: ";
    a2.font = { bold: true, name: FONT, size: 11 };
    const title = sheet.getCell("A3");
    title.value = "DANH SÁCH HÀNG HÓA KIỂM KÊ";
    title.font = { bold: true, size: 14, name: FONT };
    title.alignment = { horizontal: "center", vertical: "middle" };
    sheet.mergeCells("A3:P3");
    const b4 = sheet.getCell("B4");
    b4.value = "Kho kiểm kê: ";
    b4.font = { bold: true, name: FONT, size: 11 };
    const b5 = sheet.getCell("B5");
    b5.value = "Kiểm kê đến ngày: ";
    b5.font = { bold: true, name: FONT, size: 11 };

    const HEADER_ROW = 7;
    const SUB_ROW = 8;
    const mainHeaders: Record<string, string> = {
      A: "Mã SKU (*)",
      B: "Mã vạch (*)",
      C: "Tên hàng hóa",
      D: "Đơn vị tính",
      E: "Vị trí",
      F: "Số lô",
      G: "Hạn sử dụng",
      H: "Serial/IMEI",
      I: "Nhóm hàng hóa",
      J: "Số lượng",
      M: "Giá trị",
      P: "Nguyên nhân",
    };
    // Dấu (*) bắt buộc tô đỏ như MISA; phần còn lại in đậm đen.
    const headerValue = (
      label: string,
    ): string | ExcelJS.CellRichTextValue => {
      const idx = label.indexOf(" (*)");
      if (idx < 0) return label;
      return {
        richText: [
          { text: label.slice(0, idx + 1), font: { bold: true, name: FONT } },
          {
            text: "(*)",
            font: { bold: true, name: FONT, color: { argb: "FFFF0000" } },
          },
        ],
      };
    };
    for (const [col, label] of Object.entries(mainHeaders)) {
      sheet.getCell(`${col}${HEADER_ROW}`).value = headerValue(label);
    }

    const subHeaders: Record<string, string> = {
      J: "Theo sổ",
      K: "Kiểm kê (*)",
      L: "Chênh lệch",
      M: "Theo sổ",
      N: "Kiểm kê (*)",
      O: "Chênh lệch",
    };
    for (const [col, label] of Object.entries(subHeaders)) {
      sheet.getCell(`${col}${SUB_ROW}`).value = headerValue(label);
    }

    // Gộp dọc cho cột header 1 tầng; gộp ngang cho nhóm Số lượng / Giá trị.
    for (const col of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "P"]) {
      sheet.mergeCells(`${col}${HEADER_ROW}:${col}${SUB_ROW}`);
    }
    sheet.mergeCells(`J${HEADER_ROW}:L${HEADER_ROW}`);
    sheet.mergeCells(`M${HEADER_ROW}:O${HEADER_ROW}`);

    for (const rowNum of [HEADER_ROW, SUB_ROW]) {
      const row = sheet.getRow(rowNum);
      for (let c = 1; c <= 16; c++) {
        const cell = row.getCell(c);
        cell.font = { bold: true, name: FONT };
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFCE4D6" },
        };
        cell.border = {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        };
      }
    }

    // Khối hướng dẫn luôn hiển thị (nền vàng).
    // Đặt ở dòng 6 (trên header) nên parser bỏ qua nhờ khớp header theo startsWith("ma sku").
    sheet.mergeCells("A6:I6");
    const noteFont = { size: 9, name: FONT } as const;
    const guide = sheet.getCell("A6");
    guide.value = {
      richText: [
        { text: "Shop:", font: { bold: true, ...noteFont } },
        { text: "\n", font: noteFont },
        { text: "Không bắt buộc ", font: { bold: true, ...noteFont } },
        { text: "nhập đồng thời cột ", font: noteFont },
        { text: "Mã vạch", font: { bold: true, ...noteFont } },
        { text: " và cột ", font: noteFont },
        { text: "Mã SKU", font: { bold: true, ...noteFont } },
        {
          text:
            ".\n+ Bỏ trống cột Mã SKU nếu nhập cột Mã vạch\n" +
            "+ Bỏ trống cột Mã vạch nếu nhập cột Mã SKU\n" +
            "Nếu muốn nhập hàng hóa quản lý theo lô, Serial/IMEI, vui lòng chọn từ cột E đến cột G, nhấn chuột phải, chọn Unhide",
          font: noteFont,
        },
      ],
    };
    guide.alignment = { horizontal: "left", vertical: "top", wrapText: true };
    sheet.getRow(6).height = 90;
    // Nền vàng + viền cho cả vùng merge (ExcelJS cần set từng ô).
    for (let c = 1; c <= 9; c++) {
      const cell = sheet.getRow(6).getCell(c);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFFFCC" },
      };
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" },
      };
    }

    // Tô xám vùng dữ liệu của các cột chương trình không nhập khẩu (chỉ hiển thị),
    // giống MISA: Tên hàng hóa(C), Nhóm hàng hóa(I), Theo sổ + Chênh lệch của
    // Số lượng(J,L) và Giá trị(M,O).
    const DATA_START = 9;
    const DATA_END = 1001;
    const GRAY_COLS = [3, 9, 10, 12, 13, 15];
    for (let r = DATA_START; r <= DATA_END; r++) {
      for (const c of GRAY_COLS) {
        sheet.getRow(r).getCell(c).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFD9D9D9" },
        };
      }
    }

    // Gợi ý nhập từng cột (data validation input message) — nguyên văn từ mẫu MISA.
    const prompts: Array<{ range: string; title?: string; prompt: string }> = [
      {
        range: "A7:A1001",
        title: "Mã SKU",
        prompt:
          "Mã SKU phải tồn tại ở danh mục hàng hóa trên chương trình.\nBỏ trống cột này nếu nhập khẩu theo Mã vạch.",
      },
      {
        range: "B7:B1001",
        title: "Mã vạch",
        prompt:
          "Mã vạch của hàng hóa trong danh mục.\nBỏ trống cột này nếu nhập khẩu theo Mã SKU.",
      },
      {
        range: "C7:C1001",
        title: "Tên hàng hóa",
        prompt: "Chương trình không nhập khẩu tên hàng hóa.",
      },
      {
        range: "D7:D65536",
        title: "Đơn vị tính kiểm kê",
        prompt:
          "Nhập đơn vị tính kiểm kê.\nNếu để trống, chương trình sẽ lấy đơn vị tính cơ bản.",
      },
      {
        range: "E7:E65536",
        title: "Vị trí",
        prompt:
          "Nhập mã vị trí của hàng hóa. Nếu để trống thì chương trình mặc định là không có vị trí.",
      },
      { range: "F7:F65536", prompt: "Nhập số lô hàng hóa" },
      {
        range: "G7:G65536",
        prompt:
          "Nhập hạn sử dụng của hàng hóa trong lô\nNếu hàng hóa đã ghi nhận trong lô và có hạn sử dụng thì không cần nhập trường này",
      },
      {
        range: "H7:H65536",
        prompt:
          'Nhập Serial/IMEI tương ứng với số lượng hàng hóa\nMỗi Serial/IMEI cách nhau bởi dấu phẩy ","\nVD: 353013093418952, 256892453125465',
      },
      {
        range: "I7:I65536",
        title: "Nhóm hàng hóa",
        prompt: "Chương trình không nhập khẩu nhóm hàng hóa",
      },
      {
        range: "J8:J65536",
        title: "Số lượng theo sổ",
        prompt: "Chương trình không nhập khẩu số lượng theo sổ.",
      },
      {
        range: "K8:K1001",
        title: "Số lượng kiểm kê",
        prompt:
          "Nhập số lượng kiểm kê thực tế của hàng hóa.\nKhông được nhập số âm. Nếu bỏ trống thì phần mềm sẽ nhập số 0",
      },
      {
        range: "L8:L65536",
        title: "Số lượng chênh lệch",
        prompt:
          "Chương trình không nhập khẩu số lượng chênh lệch và sẽ tự động tính toán.",
      },
      {
        range: "M8:M65536",
        title: "Giá trị theo sổ",
        prompt: "Chương trình không nhập khẩu giá trị theo sổ.",
      },
      {
        range: "N8:N65536",
        title: "Giá trị kiểm kê",
        prompt:
          "Nhập giá trị kiểm kê thực tế của hàng hóa.\nKhông được nhập số âm. Nếu bỏ trống thì phần mềm sẽ nhập giá trị = 0",
      },
      {
        range: "O8:O65536",
        title: "Giá trị chênh lệch",
        prompt:
          "Chương trình không nhập khẩu giá trị chênh lệch và sẽ tự động tính toán.",
      },
      {
        range: "P7:P65536",
        prompt:
          "Điền nguyên nhân chênh lệch số lượng kiểm kê và số theo sổ (nếu có).",
      },
    ];
    // `dataValidations` tồn tại runtime nhưng thiếu trong typings của exceljs.
    const dataValidations = (
      sheet as unknown as {
        dataValidations: { add(range: string, validation: unknown): void };
      }
    ).dataValidations;
    for (const { range, title, prompt } of prompts) {
      // Bỏ `type` để giữ allowBlank và chỉ hiện gợi ý nhập (giống MISA), không ràng buộc giá trị.
      dataValidations.add(range, {
        allowBlank: true,
        showInputMessage: true,
        promptTitle: title,
        prompt,
      });
      const firstCell = range.split(":")[0];
      sheet.getCell(firstCell).note = {
        texts: [{ text: prompt, font: { name: FONT, size: 10 } }],
      };
    }

    for (let row = DATA_START; row <= DATA_END; row++) {
      sheet.getCell(`G${row}`).numFmt = "dd/mm/yyyy";
      for (const column of ["J", "K", "L"]) {
        sheet.getCell(`${column}${row}`).numFmt = "#,##0.###";
      }
      for (const column of ["M", "N", "O"]) {
        sheet.getCell(`${column}${row}`).numFmt = "#,##0.00";
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async buildWorkbookBuffer(
    source: StockTakeWorkbookSource,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Jack ERP";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Phiếu kiểm kê kho", {
      views: [{ showGridLines: true }],
    });
    const valueMode = source.countByValue;
    const lastCol = valueMode ? 13 : 10;
    const lastColLetter = valueMode ? "M" : "J";

    sheet.columns = valueMode
      ? [
          { width: 6 },
          { width: 18 },
          { width: 24 },
          { width: 14 },
          { width: 18 },
          { width: 14 },
          { width: 14 },
          { width: 14 },
          { width: 14 },
          { width: 14 },
          { width: 14 },
          { width: 18 },
          { width: 18 },
        ]
      : [
          { width: 6 },
          { width: 18 },
          { width: 24 },
          { width: 14 },
          { width: 18 },
          { width: 16 },
          { width: 16 },
          { width: 16 },
          { width: 18 },
          { width: 18 },
        ];

    const plannedDate = this.formatDate(source.plannedDate);
    const countedDate = this.formatDate(source.countedAt);
    const countedTime = this.formatTime(source.countedAt);
    const documentNumber = source.documentNumber ?? "";
    const storageName = source.storageName ?? "";

    sheet.mergeCells(`A1:${lastColLetter}1`);
    const headerDate =
      source.countedAt ??
      (source.useCurrentDateInHeader ? new Date() : undefined);
    sheet.getCell("A1").value = headerDate
      ? `Ngày ${this.formatLongVietnameseDate(headerDate)}`
      : "Ngày.......tháng.......năm..........";
    sheet.getCell("A1").alignment = { horizontal: "center" };
    sheet.getCell("A1").font = { bold: true, italic: true };

    sheet.mergeCells(`A2:${lastColLetter}2`);
    sheet.getCell("A2").value = `Số: ${documentNumber}`;
    sheet.getCell("A2").alignment = { horizontal: "center" };
    sheet.getCell("A2").font = { bold: true };

    const infoRows = [
      [`Kho kiểm kê: ${storageName}`],
      [`Kiểm kê đến ngày: ${plannedDate}`],
      [
        `Ngày giờ kiểm kê: ${countedTime ? `${countedTime} - ` : ""}${countedDate}`,
      ],
      [`Mục đích: ${source.purpose ?? ""}`],
    ];
    infoRows.forEach((values, index) => {
      const rowNo = 3 + index;
      sheet.mergeCells(rowNo, 2, rowNo, 4);
      sheet.getCell(rowNo, 2).value = values[0];
      sheet.getCell(rowNo, 2).font = { bold: true };
    });

    sheet.getCell("A8").value = "I. Danh sách hàng hóa kiểm kê";
    sheet.getCell("A8").font = { bold: true };

    sheet.mergeCells("A9:A10");
    sheet.mergeCells("B9:B10");
    sheet.mergeCells("C9:C10");
    sheet.mergeCells("D9:D10");
    sheet.mergeCells("E9:E10");
    sheet.mergeCells("F9:H9");
    if (valueMode) {
      sheet.mergeCells("I9:K9");
      sheet.mergeCells("L9:L10");
      sheet.mergeCells("M9:M10");
    } else {
      sheet.mergeCells("I9:I10");
      sheet.mergeCells("J9:J10");
    }
    const headerValues: Array<[string, string | number]> = [
      ["A9", "STT"],
      ["B9", "Mã SKU"],
      ["C9", "Tên hàng hóa"],
      ["D9", "ĐVT"],
      ["E9", "Vị trí"],
      ["F9", "Số lượng"],
      ["F10", "Theo sổ"],
      ["G10", "Kiểm kê"],
      ["H10", "Chênh lệch"],
      ...(valueMode
        ? ([
            ["I9", "Giá trị"],
            ["I10", "Theo sổ"],
            ["J10", "Kiểm kê"],
            ["K10", "Chênh lệch"],
            ["L9", "Nguyên nhân"],
            ["M9", "Xử lý"],
          ] as Array<[string, string | number]>)
        : ([
            ["I9", "Nguyên nhân"],
            ["J9", "Xử lý"],
          ] as Array<[string, string | number]>)),
    ];
    headerValues.forEach(([cell, value]) => {
      sheet.getCell(cell).value = value;
    });

    const lines = source.lines;
    let expectedTotal = 0;
    let countedTotal = 0;
    let expectedValueTotal = 0;
    let countedValueTotal = 0;
    lines.forEach((line, index) => {
      const expected = Number(line.expectedQty || 0);
      const counted = line.countedQty == null ? 0 : Number(line.countedQty);
      const variance = counted - expected;
      const expectedValue = Number(line.expectedValue || 0);
      const countedValue =
        line.countedValue == null ? 0 : Number(line.countedValue);
      const valueVariance = countedValue - expectedValue;
      expectedTotal += expected;
      countedTotal += counted;
      expectedValueTotal += expectedValue;
      countedValueTotal += countedValue;
      const row = sheet.getRow(11 + index);
      const rowValues = valueMode
        ? [
            index + 1,
            line.item?.code ?? "",
            line.item?.name ?? "",
            line.item?.unit ?? "",
            line.location?.code ?? "",
            expected,
            counted,
            variance,
            expectedValue,
            countedValue,
            valueVariance,
            line.reason ?? "",
            variance > 0 ? "Nhập kho" : variance < 0 ? "Xuất kho" : "",
          ]
        : [
            index + 1,
            line.item?.code ?? "",
            line.item?.name ?? "",
            line.item?.unit ?? "",
            line.location?.code ?? "",
            expected,
            counted,
            variance,
            line.reason ?? "",
            variance > 0 ? "Nhập kho" : variance < 0 ? "Xuất kho" : "",
          ];
      rowValues.forEach((value, valueIndex) => {
        row.getCell(valueIndex + 1).value = value;
      });
      for (const column of [6, 7, 8]) row.getCell(column).numFmt = "#,##0.###";
      if (valueMode) {
        for (const column of [9, 10, 11]) row.getCell(column).numFmt = "#,##0.00";
      }
    });

    const totalRowNo = 11 + lines.length;
    sheet.mergeCells(totalRowNo, 1, totalRowNo, 5);
    sheet.getCell(totalRowNo, 1).value = "Tổng";
    sheet.getCell(totalRowNo, 1).alignment = { horizontal: "right" };
    sheet.getCell(totalRowNo, 6).value = expectedTotal;
    sheet.getCell(totalRowNo, 7).value = countedTotal;
    sheet.getCell(totalRowNo, 8).value = countedTotal - expectedTotal;
    if (valueMode) {
      sheet.getCell(totalRowNo, 9).value = expectedValueTotal;
      sheet.getCell(totalRowNo, 10).value = countedValueTotal;
      sheet.getCell(totalRowNo, 11).value =
        countedValueTotal - expectedValueTotal;
    }

    const memberTitleRow = totalRowNo + 2;
    sheet.getCell(memberTitleRow, 1).value =
      "II. Các thành viên tham gia kiểm kê";
    sheet.getCell(memberTitleRow, 1).font = { bold: true };
    const memberHeaderRow = memberTitleRow + 1;
    sheet.getRow(memberHeaderRow).values = [
      "STT",
      "Họ tên",
      "",
      "Chức danh",
      "",
      "Đại diện",
      "",
      "Ký tên",
    ];
    sheet.mergeCells(memberHeaderRow, 2, memberHeaderRow, 3);
    sheet.mergeCells(memberHeaderRow, 4, memberHeaderRow, 5);
    sheet.mergeCells(memberHeaderRow, 6, memberHeaderRow, 7);
    sheet.mergeCells(memberHeaderRow, 8, memberHeaderRow, 9);

    const members = source.members;
    const memberRowCount = Math.max(members.length, 3);
    for (let index = 0; index < memberRowCount; index += 1) {
      const member = members[index];
      const row = sheet.getRow(memberHeaderRow + 1 + index);
      row.getCell(1).value = member ? index + 1 : "";
      row.getCell(2).value = member?.fullName ?? "";
      row.getCell(4).value = member?.title ?? "";
      row.getCell(6).value = member?.representative ?? "";
    }

    const conclusionRow = memberHeaderRow + memberRowCount + 2;
    sheet.mergeCells(conclusionRow, 1, conclusionRow, lastCol);
    sheet.getCell(conclusionRow, 1).value =
      `Kết luận: ${source.conclusion ?? ""}`;
    sheet.getCell(conclusionRow, 1).font = { bold: true };

    const signDateRow = conclusionRow + 4;
    sheet.mergeCells(
      signDateRow,
      Math.max(7, lastCol - 3),
      signDateRow,
      lastCol,
    );
    sheet.getCell(signDateRow, Math.max(7, lastCol - 3)).value =
      "Ngày.......tháng.......năm..........";
    sheet.getCell(signDateRow, Math.max(7, lastCol - 3)).alignment = {
      horizontal: "center",
    };
    const signTitleRow = signDateRow + 1;
    const signNoteRow = signDateRow + 2;
    const signers = [
      { col: 1, title: "Người lập phiếu" },
      { col: 3, title: "Người nhận hàng" },
      { col: 5, title: "Thủ kho" },
      { col: 7, title: "Kế toán trưởng" },
      { col: 9, title: "Giám đốc" },
    ];
    signers.forEach(({ col, title }) => {
      sheet.mergeCells(signTitleRow, col, signTitleRow, col + 1);
      sheet.mergeCells(signNoteRow, col, signNoteRow, col + 1);
      sheet.getCell(signTitleRow, col).value = title;
      sheet.getCell(signTitleRow, col).alignment = { horizontal: "center" };
      sheet.getCell(signTitleRow, col).font = { bold: true };
      sheet.getCell(signNoteRow, col).value = "(Ký, họ tên)";
      sheet.getCell(signNoteRow, col).alignment = { horizontal: "center" };
      sheet.getCell(signNoteRow, col).font = { italic: true };
    });

    const borderedRanges = [
      { from: 9, to: totalRowNo },
      { from: memberHeaderRow, to: memberHeaderRow + memberRowCount },
    ];
    borderedRanges.forEach(({ from, to }) => {
      for (let rowNo = from; rowNo <= to; rowNo += 1) {
        for (let col = 1; col <= lastCol; col += 1) {
          const cell = sheet.getCell(rowNo, col);
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        }
      }
    });
    sheet.getRow(9).font = { bold: true };
    sheet.getRow(10).font = { bold: true };
    sheet.getRow(totalRowNo).font = { bold: true };
    sheet.getRow(totalRowNo).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE6E6E6" },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async list(
    query: StockTakeQuery,
  ): Promise<PaginatedResponse<StockTakeEntity>> {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));

    const qb = this.stRepo
      .createQueryBuilder("st")
      .leftJoin("storages", "storage", "storage.id = st.storage_id")
      .where("st.organization_id = :orgId", { orgId: query.organizationId });
    if (query.branchId) {
      qb.andWhere("st.branch_id = :branchId", { branchId: query.branchId });
    }
    if (query.status) {
      qb.andWhere("st.status = :status", { status: query.status });
    }
    if (query.fromDate) {
      qb.andWhere("st.created_at >= :fromDate", {
        fromDate: `${query.fromDate}T00:00:00.000Z`,
      });
    }
    if (query.toDate) {
      qb.andWhere("st.created_at <= :toDate", {
        toDate: `${query.toDate}T23:59:59.999Z`,
      });
    }
    if (query.documentNumber) {
      qb.andWhere("LOWER(st.document_number) LIKE :documentNumber", {
        documentNumber: `%${query.documentNumber.toLowerCase()}%`,
      });
    }
    if (query.storage) {
      qb.andWhere("LOWER(storage.name) LIKE :storage", {
        storage: `%${query.storage.toLowerCase()}%`,
      });
    }
    if (query.purpose) {
      qb.andWhere(
        "(LOWER(COALESCE(st.purpose, '')) LIKE :purpose OR LOWER(COALESCE(st.conclusion, '')) LIKE :purpose OR LOWER(COALESCE(st.notes, '')) LIKE :purpose)",
        { purpose: `%${query.purpose.toLowerCase()}%` },
      );
    }
    if (query.mergeStatus === "MERGED") {
      qb.andWhere("st.merged_into_id IS NOT NULL");
    } else if (query.mergeStatus === "UNMERGED") {
      qb.andWhere("st.merged_into_id IS NULL");
    }
    qb.orderBy("st.createdAt", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, pageSize };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private assertDraft(st: StockTakeEntity): void {
    if (st.status !== StockTakeStatus.DRAFT) {
      throw new ConflictException(
        "Chỉ thao tác được khi phiếu kiểm kê đang ở DRAFT",
      );
    }
    if (st.mergedIntoId) {
      throw new ConflictException(
        "Phiếu kiểm kê đã gộp không thể sửa, xoá hoặc xử lý",
      );
    }
  }

  private async loadMergeSources(
    sourceIds: string[],
    organizationId: string,
    branchId?: string,
  ): Promise<StockTakeEntity[]> {
    const uniqueIds = [...new Set(sourceIds)];
    if (uniqueIds.length < 2) {
      throw new BadRequestException("Cần chọn ít nhất 2 phiếu để gộp");
    }
    const sources = await this.stRepo.find({
      where: { id: In(uniqueIds), organizationId, ...(branchId ? { branchId } : {}) },
      order: { createdAt: "ASC" },
    });
    if (sources.length !== uniqueIds.length) {
      throw new NotFoundException("Không tìm thấy đầy đủ các phiếu cần gộp");
    }
    if (
      sources.some(
        (source) =>
          source.status === StockTakeStatus.CANCELLED || !!source.mergedIntoId,
      )
    ) {
      throw new ConflictException(
        "Không thể gộp phiếu đã huỷ hoặc phiếu đã gộp",
      );
    }
    const first = sources[0];
    if (sources.some((source) => source.status !== first.status)) {
      throw new BadRequestException("Các phiếu gộp phải cùng trạng thái xử lý");
    }
    if (
      sources.some(
        (source) =>
          source.storageId !== first.storageId ||
          source.branchId !== first.branchId,
      )
    ) {
      throw new BadRequestException("Các phiếu gộp phải cùng kho và chi nhánh");
    }
    if (sources.some((source) => source.countByValue !== first.countByValue)) {
      throw new BadRequestException(
        "Không thể gộp phiếu có chế độ kiểm kê khác nhau",
      );
    }
    return sources;
  }

  private joinUniqueText(values: Array<string | null | undefined>): string {
    return [
      ...new Set(values.map((value) => value?.trim()).filter(Boolean)),
    ].join("\n");
  }

  private buildLine(
    actor: ActorContext,
    itemId: string,
    locationId: string,
    expectedQty: number,
  ): StockTakeLineEntity {
    const line = new StockTakeLineEntity();
    line.organizationId = actor.organizationId;
    line.branchId = actor.branchId;
    line.createdBy = actor.userId;
    line.itemId = itemId;
    line.locationId = locationId;
    line.expectedQty = String(expectedQty);
    line.countedQty = null;
    line.expectedValue = "0";
    line.countedValue = null;
    return line;
  }

  private async findItemBalanceInScope(
    organizationId: string,
    itemId: string,
    storageId?: string,
    locationId?: string,
  ): Promise<StockBalanceEntity | null> {
    const qb = this.balanceRepo
      .createQueryBuilder("sb")
      .innerJoin("locations", "loc", "loc.id = sb.location_id")
      .where("sb.organization_id = :orgId", { orgId: organizationId })
      .andWhere("sb.item_id = :itemId", { itemId })
      .orderBy("sb.quantity", "DESC");

    if (locationId) {
      qb.andWhere("sb.location_id = :locId", { locId: locationId });
    } else if (storageId) {
      qb.andWhere("loc.storage_id = :sid", { sid: storageId });
    }
    return qb.getOne();
  }

  private async createGeneratedReceipt(
    manager: import("typeorm").EntityManager,
    actor: ActorContext,
    branchId: string,
    st: StockTakeEntity,
    positives: Array<{ line: StockTakeLineEntity; variance: number }>,
    reason: string,
    costByItemId: Map<string, number>,
    unitByItemId: Map<string, string>,
  ): Promise<GoodsReceiptEntity> {
    const documentNumber = await this.documentNumbering.generate(
      DocumentType.GOODS_RECEIPT,
      branchId,
      actor,
    );
    const headerLocationId = positives[0].line.locationId;

    const receipt = manager.create(GoodsReceiptEntity, {
      organizationId: st.organizationId,
      branchId,
      createdBy: actor.userId,
      documentNumber,
      status: GoodsReceiptStatus.POSTED,
      purpose: GoodsReceiptPurpose.STOCK_TAKE,
      referenceType: GoodsReceiptReferenceType.STOCK_TAKE,
      referenceId: st.id,
      reason,
      description: reason,
      receivedAt: new Date(),
      locationId: headerLocationId,
      attachmentIds: [],
      postedAt: new Date(),
      postedBy: actor.userId,
    });
    const savedReceipt = await manager.save(receipt);

    const lines: GoodsReceiptLineEntity[] = positives.map((p) => {
      const line = new GoodsReceiptLineEntity();
      line.organizationId = st.organizationId;
      line.branchId = branchId;
      line.createdBy = actor.userId;
      line.goodsReceiptId = savedReceipt.id;
      line.itemId = p.line.itemId;
      line.locationId = p.line.locationId;
      const cost = costByItemId.get(p.line.itemId) ?? 0;
      line.uomCode = unitByItemId.get(p.line.itemId) ?? "Cái";
      line.quantity = String(p.variance);
      line.unitPrice = cost.toFixed(2);
      line.lineTotal = (p.variance * cost).toFixed(2);
      line.note = p.line.reason ?? undefined;
      return line;
    });
    await manager.save(lines);
    return savedReceipt;
  }

  private async createGeneratedIssue(
    manager: import("typeorm").EntityManager,
    actor: ActorContext,
    branchId: string,
    st: StockTakeEntity,
    negatives: Array<{ line: StockTakeLineEntity; variance: number }>,
    reason: string,
    costByItemId: Map<string, number>,
  ): Promise<GoodsIssueEntity> {
    const documentNumber = await this.documentNumbering.generate(
      DocumentType.GOODS_ISSUE,
      branchId,
      actor,
    );
    const headerLocationId = negatives[0].line.locationId;

    const issue = manager.create(GoodsIssueEntity, {
      organizationId: st.organizationId,
      branchId,
      createdBy: actor.userId,
      documentNumber,
      locationId: headerLocationId,
      status: GoodsIssueStatus.POSTED,
      purpose: GoodsIssuePurpose.STOCK_TAKE,
      referenceType: GoodsIssueReferenceType.STOCK_TAKE,
      referenceId: st.id,
      reason,
      notes: reason,
      postedAt: new Date(),
      postedBy: actor.userId,
    });
    const savedIssue = await manager.save(issue);

    const lines: GoodsIssueLineEntity[] = negatives.map((n) => {
      const line = new GoodsIssueLineEntity();
      line.goodsIssueId = savedIssue.id;
      line.itemId = n.line.itemId;
      line.locationId = n.line.locationId ?? headerLocationId;
      const cost = costByItemId.get(n.line.itemId) ?? 0;
      const qty = Math.abs(n.variance);
      line.quantity = qty;
      line.unitPrice = cost.toFixed(2);
      line.lineTotal = (qty * cost).toFixed(2);
      line.notes = n.line.reason ?? undefined;
      return line;
    });
    await manager.save(lines);
    return savedIssue;
  }

  private async findOrFail(
    id: string,
    organizationId: string,
    branchId?: string,
  ): Promise<StockTakeEntity> {
    const st = await this.stRepo.findOne({
      where: { id, organizationId, ...(branchId ? { branchId } : {}) },
    });
    if (!st) throw new NotFoundException(`Phiếu kiểm kê ${id} không tìm thấy`);
    return st;
  }

  private formatDate(value: Date | string | null | undefined): string {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }

  private formatTime(value: Date | string | null | undefined): string {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  private formatLongVietnameseDate(value: Date | string): string {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
  }
}
