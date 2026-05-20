import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, FindOptionsWhere, Repository } from 'typeorm';
import {
  DocumentType,
  GoodsIssuePurpose,
  GoodsIssueStatus,
  GoodsReceiptPurpose,
  GoodsReceiptStatus,
  PaginatedResponse,
  PaginationQuery,
  StockMovementType,
  StockTakeStatus,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { GoodsIssueEntity } from '../goods-issue/goods-issue.entity';
import { GoodsIssueLineEntity } from '../goods-issue/goods-issue-line.entity';
import { GoodsReceiptEntity } from '../goods-receipt/goods-receipt.entity';
import { GoodsReceiptLineEntity } from '../goods-receipt/goods-receipt-line.entity';
import { LocationEntity } from '../location/location.entity';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import {
  RecordMovementParams,
  StockLedgerService,
} from '../ledger/stock-ledger.service';
import { StockTakeEntity } from './stock-take.entity';
import { StockTakeLineEntity } from './stock-take-line.entity';

export interface CreateStockTakeDto {
  storageId?: string;
  locationId?: string;
  /** Planned cutoff date (YYYY-MM-DD). */
  plannedDate?: string;
  purpose?: string;
  notes?: string;
  conclusion?: string;
  /** Optional ISO datetime — combined "Ngày + Giờ kiểm kê". Defaults to now() on server. */
  countedAt?: string;
  /**
   * Optional initial lines. The form dialog batches the user's row edits here
   * so creation is atomic — no DB row exists until the user clicks Lưu.
   */
  lines?: CreateStockTakeLinePayload[];
}

export interface CreateStockTakeLinePayload {
  itemId: string;
  /** If omitted, server picks the location holding the largest balance for this item. */
  locationId?: string;
  countedQty?: number | null;
  reason?: string;
}

export interface UpdateStockTakeHeaderDto {
  purpose?: string;
  notes?: string;
  conclusion?: string;
  /** ISO datetime — combined "Ngày + Giờ kiểm kê". */
  countedAt?: string;
}

export interface UpdateLineCountDto {
  countedQty?: number | null;
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
  /** Filter on createdAt ≥ fromDate (inclusive, YYYY-MM-DD). */
  fromDate?: string;
  /** Filter on createdAt ≤ toDate (inclusive, YYYY-MM-DD). */
  toDate?: string;
}

@Injectable()
export class StockTakeService {
  private readonly logger = new Logger(StockTakeService.name);

  constructor(
    @InjectRepository(StockTakeEntity)
    private readonly stRepo: Repository<StockTakeEntity>,
    @InjectRepository(StockTakeLineEntity)
    private readonly lineRepo: Repository<StockTakeLineEntity>,
    @InjectRepository(StockBalanceEntity)
    private readonly balanceRepo: Repository<StockBalanceEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    @InjectRepository(GoodsReceiptEntity)
    private readonly receiptRepo: Repository<GoodsReceiptEntity>,
    @InjectRepository(GoodsIssueEntity)
    private readonly issueRepo: Repository<GoodsIssueEntity>,
    private readonly dataSource: DataSource,
    private readonly stockLedger: StockLedgerService,
    private readonly documentNumbering: DocumentNumberingService,
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
    if (!dto.storageId && !dto.locationId) {
      throw new BadRequestException(
        'Cần chọn kho hoặc vị trí để khởi tạo phiếu kiểm kê',
      );
    }

    const documentNumber = await this.documentNumbering.generate(
      DocumentType.STOCK_TAKE,
      actor.branchId,
      actor,
    );

    const lines: StockTakeLineEntity[] = [];
    for (const lineDto of dto.lines ?? []) {
      const resolved = await this.resolveLineLocation(
        actor.organizationId,
        lineDto.itemId,
        lineDto.locationId,
        dto.storageId,
        dto.locationId,
      );
      const line = this.buildLine(
        actor,
        lineDto.itemId,
        resolved.locationId,
        resolved.expectedQty,
      );
      if (lineDto.countedQty != null) {
        line.countedQty = String(lineDto.countedQty);
      }
      if (lineDto.reason !== undefined) line.reason = lineDto.reason;
      lines.push(line);
    }

    const now = new Date();
    const st = this.stRepo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      documentNumber,
      status: StockTakeStatus.DRAFT,
      storageId: dto.storageId,
      locationId: dto.locationId,
      purpose: dto.purpose,
      plannedDate: dto.plannedDate,
      countedAt: dto.countedAt ? new Date(dto.countedAt) : now,
      snapshotAt: now,
      notes: dto.notes,
      conclusion: dto.conclusion,
      lines,
    });

    const saved = await this.stRepo.save(st);
    this.logger.log(
      `Stock-take ${saved.id} (${documentNumber}) created with ${lines.length} line(s)`,
    );
    return this.findOrFail(saved.id, actor.organizationId);
  }

  /** Update header fields while still DRAFT. */
  async updateHeader(
    id: string,
    dto: UpdateStockTakeHeaderDto,
    actor: ActorContext,
  ): Promise<StockTakeEntity> {
    const st = await this.findOrFail(id, actor.organizationId);
    this.assertDraft(st);

    if (dto.purpose !== undefined) st.purpose = dto.purpose;
    if (dto.notes !== undefined) st.notes = dto.notes;
    if (dto.conclusion !== undefined) st.conclusion = dto.conclusion;
    if (dto.countedAt !== undefined) st.countedAt = new Date(dto.countedAt);

    await this.stRepo.save(st);
    return this.findOrFail(id, actor.organizationId);
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
    const st = await this.findOrFail(id, actor.organizationId);
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
    line.stockTakeId = st.id;
    const saved = await this.lineRepo.save(line);
    return this.lineRepo.findOne({ where: { id: saved.id } }) as Promise<
      StockTakeLineEntity
    >;
  }

  /**
   * Resolve (locationId, expectedQty) for a single line. Shared by create()
   * (batched lines) and addLine() (incremental). When the caller specifies a
   * location we trust it; otherwise we pick the location with the largest
   * balance for the item, falling back to the first active location of the
   * storage so the line still has a valid FK (expectedQty = 0).
   */
  private async resolveLineLocation(
    organizationId: string,
    itemId: string,
    explicitLocationId: string | undefined,
    storageId: string | undefined,
    scopeLocationId: string | undefined,
  ): Promise<{ locationId: string; expectedQty: number }> {
    if (explicitLocationId) {
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
      return { locationId: found.locationId, expectedQty: Number(found.quantity) };
    }

    if (scopeLocationId) {
      return { locationId: scopeLocationId, expectedQty: 0 };
    }
    if (storageId) {
      const firstLoc = await this.locationRepo.findOne({
        where: { organizationId, storageId, isActive: true },
        order: { code: 'ASC' },
      });
      if (!firstLoc) {
        throw new BadRequestException(
          'Kho được chọn chưa có vị trí — tạo vị trí trước khi kiểm kê',
        );
      }
      return { locationId: firstLoc.id, expectedQty: 0 };
    }
    throw new BadRequestException('Không xác định được vị trí cho dòng');
  }

  async removeLine(
    id: string,
    lineId: string,
    actor: ActorContext,
  ): Promise<void> {
    const st = await this.findOrFail(id, actor.organizationId);
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
    const st = await this.findOrFail(stockTakeId, actor.organizationId);
    this.assertDraft(st);
    const line = st.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException(`Dòng ${lineId} không tìm thấy`);

    if (dto.countedQty !== undefined) {
      line.countedQty = dto.countedQty == null ? null : String(dto.countedQty);
    }
    if (dto.note !== undefined) line.note = dto.note;
    if (dto.reason !== undefined) line.reason = dto.reason;
    return this.lineRepo.save(line);
  }

  async cancel(id: string, actor: ActorContext): Promise<void> {
    const st = await this.findOrFail(id, actor.organizationId);
    if (st.status !== StockTakeStatus.DRAFT) {
      throw new ConflictException('Chỉ huỷ được phiếu DRAFT');
    }
    st.status = StockTakeStatus.CANCELLED;
    await this.stRepo.save(st);
    await this.stRepo.softDelete(st.id);
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
    const st = await this.findOrFail(id, actor.organizationId);
    this.assertDraft(st);
    if (!st.lines || st.lines.length === 0) {
      throw new BadRequestException('Phiếu kiểm kê không có dòng');
    }

    const branchId = st.branchId ?? actor.branchId;
    if (!branchId) {
      throw new BadRequestException(
        'Không xác định được chi nhánh để hạch toán điều chỉnh',
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

      if (positives.length > 0) {
        const receipt = await this.createGeneratedReceipt(
          manager,
          actor,
          branchId,
          st,
          positives,
          `Kiểm kê ${stockTakeRef} — thừa kho`,
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
          `Kiểm kê ${stockTakeRef} — thiếu kho`,
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
        referenceType: 'STOCK_TAKE',
        referenceId: st.id,
        notes: `Kiểm kê ${stockTakeRef}`,
        actorContext: actor,
      }));
      await this.stockLedger.recordBatchMovements(movements);
    });

    this.logger.log(
      `Stock-take ${id} processed: receipt=${generatedReceiptId ?? '-'} issue=${generatedIssueId ?? '-'}`,
    );
    return this.findOrFail(id, actor.organizationId);
  }

  async getById(id: string, organizationId: string): Promise<StockTakeEntity> {
    return this.findOrFail(id, organizationId);
  }

  async list(
    query: StockTakeQuery,
  ): Promise<PaginatedResponse<StockTakeEntity>> {
    const where: FindOptionsWhere<StockTakeEntity> = {
      organizationId: query.organizationId,
    };
    if (query.status) where.status = query.status;
    if (query.fromDate || query.toDate) {
      const from = query.fromDate
        ? new Date(`${query.fromDate}T00:00:00.000Z`)
        : new Date('1970-01-01T00:00:00.000Z');
      const to = query.toDate
        ? new Date(`${query.toDate}T23:59:59.999Z`)
        : new Date('2999-12-31T23:59:59.999Z');
      where.createdAt = Between(from, to);
    }

    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));

    const [data, total] = await this.stRepo.findAndCount({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { createdAt: 'DESC' },
    });

    return { data, total, page, pageSize };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private assertDraft(st: StockTakeEntity): void {
    if (st.status !== StockTakeStatus.DRAFT) {
      throw new ConflictException('Chỉ thao tác được khi phiếu kiểm kê đang ở DRAFT');
    }
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
    return line;
  }

  private async findItemBalanceInScope(
    organizationId: string,
    itemId: string,
    storageId?: string,
    locationId?: string,
  ): Promise<StockBalanceEntity | null> {
    const qb = this.balanceRepo
      .createQueryBuilder('sb')
      .innerJoin('locations', 'loc', 'loc.id = sb.location_id')
      .where('sb.organization_id = :orgId', { orgId: organizationId })
      .andWhere('sb.item_id = :itemId', { itemId })
      .orderBy('sb.quantity', 'DESC');

    if (locationId) {
      qb.andWhere('sb.location_id = :locId', { locId: locationId });
    } else if (storageId) {
      qb.andWhere('loc.storage_id = :sid', { sid: storageId });
    }
    return qb.getOne();
  }

  private async createGeneratedReceipt(
    manager: import('typeorm').EntityManager,
    actor: ActorContext,
    branchId: string,
    st: StockTakeEntity,
    positives: Array<{ line: StockTakeLineEntity; variance: number }>,
    reason: string,
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
      purpose: GoodsReceiptPurpose.OTHER,
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
      line.uomCode = 'Cái';
      line.quantity = String(p.variance);
      line.unitPrice = '0';
      line.lineTotal = '0.00';
      line.note = p.line.reason ?? undefined;
      return line;
    });
    await manager.save(lines);
    return savedReceipt;
  }

  private async createGeneratedIssue(
    manager: import('typeorm').EntityManager,
    actor: ActorContext,
    branchId: string,
    st: StockTakeEntity,
    negatives: Array<{ line: StockTakeLineEntity; variance: number }>,
    reason: string,
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
      purpose: GoodsIssuePurpose.OTHER,
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
      line.quantity = Math.abs(n.variance);
      line.unitPrice = '0';
      line.lineTotal = '0.00';
      line.notes = n.line.reason ?? undefined;
      return line;
    });
    await manager.save(lines);
    return savedIssue;
  }

  private async findOrFail(
    id: string,
    organizationId: string,
  ): Promise<StockTakeEntity> {
    const st = await this.stRepo.findOne({ where: { id, organizationId } });
    if (!st) throw new NotFoundException(`Phiếu kiểm kê ${id} không tìm thấy`);
    return st;
  }
}
