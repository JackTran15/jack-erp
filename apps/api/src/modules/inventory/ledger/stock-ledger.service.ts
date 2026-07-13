import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  StockMovementType,
  PaginatedResponse,
  PaginationQuery,
  DomainEventType,
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StockLedgerEntryEntity } from './stock-ledger-entry.entity';
import { StockBalanceEntity } from './stock-balance.entity';
import { ItemStorageLocationService } from '../product/item-storage-location.service';
import {
  type StringFilterMode,
  type NumericFilterOp,
} from './balance-filter.constants';

export interface RecordMovementParams {
  itemId: string;
  locationId: string;
  branchId: string;
  organizationId: string;
  movementType: StockMovementType;
  quantity: number;
  referenceType: string;
  referenceId: string;
  notes?: string;
  actorContext: ActorContext;
  skipLocationAssignment?: boolean;
  /**
   * Bỏ qua guard "kho đã ngừng hoạt động" cho movement này. Chỉ set true cho
   * reversal của chứng từ đã POSTED (huỷ/sửa) và các consumer POS bán/trả hàng —
   * những luồng đó phải chạy được kể cả khi kho bị ngừng hoạt động sau này.
   */
  skipInactiveStorageGuard?: boolean;
  /**
   * Cost snapshot at posting time (positive number). When provided, the ledger
   * entry will persist both `unit_cost` and a signed `line_value = quantity *
   * unit_cost` (positive=in, negative=out). Callers should derive this from
   * the source document's unit price (e.g. goods_receipt_lines.unitPrice) or
   * fall back to items.purchasePrice when the source has no price column.
   */
  unitCost?: number;
}

export interface LedgerQuery extends PaginationQuery {
  itemId?: string;
  locationId?: string;
  branchId?: string;
  fromDate?: string;
  toDate?: string;
  movementType?: StockMovementType;
  organizationId: string;
}

export interface BalanceQuery extends PaginationQuery {
  itemId?: string;
  locationId?: string;
  storageId?: string;
  branchId?: string;
  /** Partial match on item code or name (case-insensitive). */
  search?: string;
  /** Only return rows where quantity < minQty (threshold). */
  belowMin?: boolean;
  /** When true, only balances at the virtual "Chưa xếp" (unassigned) location. */
  unassigned?: boolean;
  /** Filter by item tracking status; omit to include both đang/ngừng theo dõi. */
  isActive?: boolean;
  /** Filter by location-level tracking (stock_balances.is_tracked); omit = tất cả. */
  isTracked?: boolean;
  organizationId: string;

  // Per-column string filters (server-side)
  locationCode?: string;
  locationCodeMode?: StringFilterMode;
  locationName?: string;
  locationNameMode?: StringFilterMode;
  itemCode?: string;
  itemCodeMode?: StringFilterMode;
  itemName?: string;
  itemNameMode?: StringFilterMode;
  categoryName?: string;
  categoryNameMode?: StringFilterMode;
  unit?: string;
  unitMode?: StringFilterMode;
  storageName?: string;
  storageNameMode?: StringFilterMode;
  // Numeric filter for quantity
  quantity?: number;
  quantityOp?: NumericFilterOp;
}

export interface StockBalanceSummaryRow {
  id: string;
  organizationId: string;
  branchId?: string;
  itemId: string;
  locationId: string;
  quantity: number;
  lastMovementAt?: Date | null;
  isTracked: boolean;
  item: {
    id: string;
    code: string;
    name: string;
    unit: string;
    isActive: boolean;
    isPosVisible: boolean;
    categoryName: string | null;
  };
  location: {
    id: string;
    code: string;
    name: string;
    storageId: string;
    storageName: string;
  };
  threshold: {
    minQty: number | null;
    maxQty: number | null;
  };
  belowMin: boolean;
}

export interface InstantAverageCost {
  itemId: string;
  branchId: string;
  quantity: number;
  inventoryValue: number;
  unitCost: number;
  source: 'LEDGER' | 'PURCHASE_PRICE_FALLBACK';
}

@Injectable()
export class StockLedgerService {
  private readonly logger = new Logger(StockLedgerService.name);

  constructor(
    @InjectRepository(StockLedgerEntryEntity)
    private readonly ledgerRepo: Repository<StockLedgerEntryEntity>,
    @InjectRepository(StockBalanceEntity)
    private readonly balanceRepo: Repository<StockBalanceEntity>,
    private readonly dataSource: DataSource,
    private readonly eventPublisher: EventPublisher,
    private readonly pslService: ItemStorageLocationService,
  ) {}

  async recordMovement(
    params: RecordMovementParams,
  ): Promise<StockLedgerEntryEntity> {
    if (!params.skipLocationAssignment) {
      await this.pslService.validateAndAssignByLocation(
        params.itemId,
        params.locationId,
        params.actorContext,
      );
    }

    const entry = await this.dataSource.transaction(async (manager) => {
      await this.assertStoragesActive(manager, [params]);
      const { unitCost, lineValue } = this.deriveCostFields(params);
      const ledgerEntry = manager.create(StockLedgerEntryEntity, {
        itemId: params.itemId,
        locationId: params.locationId,
        branchId: params.branchId,
        organizationId: params.organizationId,
        movementType: params.movementType,
        quantity: params.quantity,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        notes: params.notes,
        postedAt: new Date(),
        createdBy: params.actorContext.userId,
        unitCost,
        lineValue,
      });
      const savedEntry = await manager.save(StockLedgerEntryEntity, ledgerEntry);

      await this.upsertBalance(manager, params);

      return savedEntry;
    });

    await this.publishMovementEvent(entry);

    return entry;
  }

  async getInstantAverageCost(
    itemId: string,
    organizationId: string,
    branchId: string,
  ): Promise<InstantAverageCost> {
    const [row] = await this.ledgerRepo.query(
      `
        SELECT
          COALESCE(SUM(sle.quantity), 0)::numeric AS quantity,
          COALESCE(SUM(sle.line_value), 0)::numeric AS inventory_value,
          COUNT(*) FILTER (WHERE sle.line_value IS NULL)::int AS missing_value_count,
          COALESCE(i.purchase_price, 0)::numeric AS purchase_price
        FROM items i
        LEFT JOIN stock_ledger_entries sle
          ON sle.item_id = i.id
         AND sle.organization_id = i.organization_id
         AND sle.branch_id = $3
        WHERE i.id = $1
          AND i.organization_id = $2
        GROUP BY i.purchase_price
      `,
      [itemId, organizationId, branchId],
    );

    const quantity = Number(row?.quantity ?? 0);
    const inventoryValue = Number(row?.inventory_value ?? 0);
    const missingValueCount = Number(row?.missing_value_count ?? 0);
    const ledgerCost =
      quantity > 0 && missingValueCount === 0
        ? Number((inventoryValue / quantity).toFixed(2))
        : Number.NaN;
    const useLedger = Number.isFinite(ledgerCost);
    const unitCost = useLedger
      ? ledgerCost
      : Number(Number(row?.purchase_price ?? 0).toFixed(2));

    if (!useLedger) {
      this.logger.warn(
        `Average cost fallback: item=${itemId} branch=${branchId} quantity=${quantity} missingValues=${missingValueCount}`,
      );
    }

    return {
      itemId,
      branchId,
      quantity,
      inventoryValue,
      unitCost,
      source: useLedger ? 'LEDGER' : 'PURCHASE_PRICE_FALLBACK',
    };
  }

  /**
   * Records a batch of stock movements (ledger entries + balance upserts).
   *
   * When `manager` is supplied the writes run on the caller's transaction (so the
   * caller can hold a pessimistic lock across validation + posting) and event
   * publishing is the caller's responsibility — call {@link publishMovementEvents}
   * after the surrounding transaction commits. Without `manager` the method opens
   * its own transaction and publishes events itself (unchanged legacy behaviour).
   */
  async recordBatchMovements(
    movements: RecordMovementParams[],
    manager?: EntityManager,
  ): Promise<StockLedgerEntryEntity[]> {
    if (movements.length === 0) return [];

    for (const params of movements) {
      if (params.skipLocationAssignment) continue;
      await this.pslService.validateAndAssignByLocation(
        params.itemId,
        params.locationId,
        params.actorContext,
      );
    }

    const write = (m: EntityManager) => this.writeBatchMovements(m, movements);

    const entries = manager
      ? await write(manager)
      : await this.dataSource.transaction(write);

    // When a manager is provided the caller owns the transaction lifecycle and
    // must publish events post-commit; otherwise publish here as before.
    if (!manager) {
      await this.publishMovementEvents(entries);
    }

    return entries;
  }

  /** Publishes STOCK_MOVEMENT_POSTED for each entry. Call after the posting transaction commits. */
  async publishMovementEvents(
    entries: StockLedgerEntryEntity[],
  ): Promise<void> {
    if (entries.length === 0) return;

    const eventMessages = entries.map((entry) => ({
      topic: ERP_TOPICS.STOCK_MOVEMENT_POSTED,
      event: {
        eventId: uuidv4(),
        eventType: DomainEventType.STOCK_MOVEMENT_POSTED,
        timestamp: new Date().toISOString(),
        organizationId: entry.organizationId,
        branchId: entry.branchId,
        correlationId: entry.referenceId,
        payload: {
          ledgerEntryId: entry.id,
          itemId: entry.itemId,
          locationId: entry.locationId,
          movementType: entry.movementType,
          quantity: entry.quantity,
          referenceType: entry.referenceType,
          referenceId: entry.referenceId,
        },
      },
      key: entry.itemId,
    }));

    try {
      await this.eventPublisher.publishBatch(eventMessages);
    } catch (err) {
      this.logger.error(
        `Stock ledger committed (${entries.length} movement(s)) but event publish failed (non-fatal): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async getBalance(
    itemId: string,
    locationId: string,
    organizationId: string,
  ): Promise<StockBalanceEntity | null> {
    return this.balanceRepo.findOne({
      where: { itemId, locationId, organizationId },
    });
  }

  async getBalances(
    query: BalanceQuery,
  ): Promise<PaginatedResponse<StockBalanceSummaryRow>> {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize ?? 50)));

    const qb = this.balanceRepo
      .createQueryBuilder('sb')
      .innerJoin('items', 'item', 'item.id = sb.item_id')
      .innerJoin('locations', 'loc', 'loc.id = sb.location_id')
      .innerJoin('storages', 'storage', 'storage.id = loc.storage_id')
      .leftJoin(
        'inventory_item_categories',
        'cat',
        'cat.id = item.category_id',
      )
      .leftJoin(
        'item_stock_thresholds',
        'th',
        'th.item_id = sb.item_id AND th.location_id = sb.location_id',
      )
      .where('sb.organization_id = :organizationId', {
        organizationId: query.organizationId,
      });

    if (query.branchId) {
      // The physical storage is the authoritative branch owner. Historical
      // stock_balances.branch_id values may be stale after imports/migrations.
      qb.andWhere('storage.branch_id = :branchId', {
        branchId: query.branchId,
      });
    }
    if (query.itemId) {
      qb.andWhere('sb.item_id = :itemId', { itemId: query.itemId });
    }
    if (query.locationId) {
      qb.andWhere('sb.location_id = :locationId', {
        locationId: query.locationId,
      });
    }
    if (query.storageId) {
      qb.andWhere('loc.storage_id = :storageId', {
        storageId: query.storageId,
      });
    }
    if (query.unassigned) {
      qb.andWhere('loc.is_unassigned = true');
    }
    if (query.search && query.search.trim()) {
      const q = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere('(LOWER(item.code) LIKE :q OR LOWER(item.name) LIKE :q)', {
        q,
      });
    }
    if (query.belowMin) {
      qb.andWhere('th.min_qty IS NOT NULL AND sb.quantity < th.min_qty');
    }
    if (query.isActive !== undefined) {
      qb.andWhere('item.is_active = :isActive', { isActive: query.isActive });
    }
    if (query.isTracked !== undefined) {
      qb.andWhere('sb.is_tracked = :isTracked', { isTracked: query.isTracked });
    }
    // Kho đã ngừng hoạt động không hiển thị ở Chi tiết vị trí hàng hóa (giống
    // Tổng hợp tồn kho). Số liệu vẫn còn ở Báo cáo tồn kho (ledger).
    qb.andWhere('storage.is_active = true');

    // Inline closures over `qb` keep the queryBuilder mutation local and avoid
    // passing it as a parameter. If `getBalances` grows further, consider extracting
    // to a util file with an explicit `qb` parameter.
    const applyString = (
      column: string,
      value: string | undefined,
      mode: StringFilterMode = 'contains',
      paramKey: string,
    ) => {
      if (!value || !value.trim()) return;
      const v = value.trim();
      switch (mode) {
        case 'contains':
          qb.andWhere(`${column} ILIKE :${paramKey}`, { [paramKey]: `%${v}%` });
          break;
        case 'equals':
          qb.andWhere(`${column} = :${paramKey}`, { [paramKey]: v });
          break;
        case 'startsWith':
          qb.andWhere(`${column} ILIKE :${paramKey}`, { [paramKey]: `${v}%` });
          break;
        case 'endsWith':
          qb.andWhere(`${column} ILIKE :${paramKey}`, { [paramKey]: `%${v}` });
          break;
        case 'notContains':
          qb.andWhere(`${column} NOT ILIKE :${paramKey}`, { [paramKey]: `%${v}%` });
          break;
        default: {
          const _exhaustive: never = mode;
          throw new Error(`Unknown StringFilterMode: ${String(_exhaustive)}`);
        }
      }
    };

    const applyNumeric = (
      column: string,
      value: number | undefined,
      op: NumericFilterOp = 'eq',
      paramKey: string,
    ) => {
      if (value === undefined || value === null || Number.isNaN(value)) return;
      const opSql: Record<NumericFilterOp, string> = { eq: '=', lte: '<=', gte: '>=', lt: '<', gt: '>' };
      qb.andWhere(`${column} ${opSql[op]} :${paramKey}`, { [paramKey]: value });
    };

    applyString('loc.code', query.locationCode, query.locationCodeMode, 'locationCode');
    applyString('loc.name', query.locationName, query.locationNameMode, 'locationName');
    applyString('item.code', query.itemCode, query.itemCodeMode, 'itemCode');
    applyString('item.name', query.itemName, query.itemNameMode, 'itemName');
    applyString('cat.name', query.categoryName, query.categoryNameMode, 'categoryName');
    applyString('item.unit', query.unit, query.unitMode, 'unit');
    applyString('storage.name', query.storageName, query.storageNameMode, 'storageName');
    applyNumeric('sb.quantity', query.quantity, query.quantityOp, 'quantity');

    qb.select([
      'sb.id AS id',
      'sb.organization_id AS "organizationId"',
      'storage.branch_id AS "branchId"',
      'sb.item_id AS "itemId"',
      'sb.location_id AS "locationId"',
      'sb.quantity AS quantity',
      'sb.last_movement_at AS "lastMovementAt"',
      'sb.is_tracked AS "isTracked"',
      'item.code AS "itemCode"',
      'item.name AS "itemName"',
      'item.unit AS "itemUnit"',
      'item.is_active AS "itemIsActive"',
      'item.is_pos_visible AS "itemIsPosVisible"',
      'cat.name AS "categoryName"',
      'loc.code AS "locationCode"',
      'loc.name AS "locationName"',
      'loc.storage_id AS "storageId"',
      'storage.name AS "storageName"',
      'th.min_qty AS "minQty"',
      'th.max_qty AS "maxQty"',
    ]);

    const sortBy = (query.sortBy ?? 'locationCode') as string;
    const sortMap: Record<string, string> = {
      createdAt: 'sb.created_at',
      itemCode: 'item.code',
      itemName: 'item.name',
      quantity: 'sb.quantity',
      lastMovementAt: 'sb.last_movement_at',
      locationCode: 'loc.code',
      locationName: 'loc.name',
      storageName: 'storage.name',
    };
    const sortExpr = sortMap[sortBy] ?? 'loc.code';
    qb.orderBy(sortExpr, (query.sortOrder ?? 'asc').toUpperCase() as 'ASC' | 'DESC');
    if (sortBy === 'locationCode' && typeof qb.addOrderBy === 'function') {
      qb.addOrderBy('item.code', 'ASC');
    }

    qb.offset((page - 1) * pageSize).limit(pageSize);

    const [rows, total] = await Promise.all([
      qb.getRawMany<Record<string, unknown>>(),
      qb.getCount(),
    ]);

    const data: StockBalanceSummaryRow[] = rows.map((r) => {
      const quantity = Number(r.quantity);
      const minQty = r.minQty === null ? null : Number(r.minQty);
      const maxQty = r.maxQty === null ? null : Number(r.maxQty);
      return {
        id: String(r.id),
        organizationId: String(r.organizationId),
        branchId: r.branchId ? String(r.branchId) : undefined,
        itemId: String(r.itemId),
        locationId: String(r.locationId),
        quantity,
        lastMovementAt: r.lastMovementAt ? new Date(r.lastMovementAt as string) : null,
        isTracked: Boolean(r.isTracked),
        item: {
          id: String(r.itemId),
          code: String(r.itemCode),
          name: String(r.itemName),
          unit: String(r.itemUnit),
          isActive: Boolean(r.itemIsActive),
          isPosVisible: Boolean(r.itemIsPosVisible),
          categoryName: r.categoryName ? String(r.categoryName) : null,
        },
        location: {
          id: String(r.locationId),
          code: String(r.locationCode),
          name: String(r.locationName),
          storageId: String(r.storageId),
          storageName: String(r.storageName),
        },
        threshold: { minQty, maxQty },
        belowMin: minQty !== null && quantity < minQty,
      };
    });

    return { data, total, page, pageSize };
  }

  /**
   * Bulk toggle location-level tracking (`stock_balances.is_tracked`) for a set of
   * (item × location) pairs — "Ngừng theo dõi" / bật lại ở trang Chi tiết vị trí.
   * Does NOT touch item.is_active, so the item stays findable everywhere.
   * Rule: cặp thuộc kho Showroom (is_main_storage) không được ngừng theo dõi.
   */
  async setBalanceTracking(
    entries: Array<{ itemId: string; locationId: string }>,
    isTracked: boolean,
    actor: ActorContext,
  ): Promise<{ updated: number }> {
    if (!entries?.length) return { updated: 0 };
    const itemIds = entries.map((e) => e.itemId);
    const locationIds = entries.map((e) => e.locationId);

    if (!isTracked) {
      const inShowroom = await this.balanceRepo.manager.query<
        Array<{ code: string }>
      >(
        `SELECT DISTINCT i.code AS code
           FROM unnest($2::uuid[], $3::uuid[]) AS e(item_id, location_id)
           JOIN locations loc ON loc.id = e.location_id
           JOIN storages s    ON s.id = loc.storage_id
           JOIN items i       ON i.id = e.item_id
          WHERE loc.organization_id = $1
            AND s.is_main_storage = true
          ORDER BY i.code`,
        [actor.organizationId, itemIds, locationIds],
      );
      if (inShowroom.length) {
        const codes = inShowroom.slice(0, 5).map((r) => r.code).join(', ');
        const more = inShowroom.length > 5 ? '…' : '';
        throw new BadRequestException(
          `Không thể ngừng theo dõi vị trí thuộc kho Showroom (${codes}${more}).`,
        );
      }
    }

    const rows = await this.balanceRepo.manager.query<Array<{ id: string }>>(
      `UPDATE stock_balances sb
          SET is_tracked = $4
         FROM unnest($2::uuid[], $3::uuid[]) AS e(item_id, location_id)
        WHERE sb.organization_id = $1
          AND sb.item_id = e.item_id
          AND sb.location_id = e.location_id
          AND sb.is_tracked <> $4
      RETURNING sb.id`,
      [actor.organizationId, itemIds, locationIds, isTracked],
    );
    return { updated: rows.length };
  }

  async getLedgerEntries(
    query: LedgerQuery,
  ): Promise<PaginatedResponse<StockLedgerEntryEntity>> {
    const qb = this.ledgerRepo
      .createQueryBuilder('entry')
      .where('entry.organizationId = :organizationId', {
        organizationId: query.organizationId,
      });

    if (query.itemId) qb.andWhere('entry.itemId = :itemId', { itemId: query.itemId });
    if (query.locationId)
      qb.andWhere('entry.locationId = :locationId', { locationId: query.locationId });
    if (query.branchId)
      qb.andWhere('entry.branchId = :branchId', { branchId: query.branchId });
    if (query.movementType)
      qb.andWhere('entry.movementType = :movementType', {
        movementType: query.movementType,
      });
    if (query.fromDate)
      qb.andWhere('entry.postedAt >= :fromDate', { fromDate: query.fromDate });
    if (query.toDate)
      qb.andWhere('entry.postedAt <= :toDate', { toDate: query.toDate });

    qb.orderBy('entry.postedAt', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async reconstructBalance(
    itemId: string,
    locationId: string,
    organizationId: string,
  ): Promise<number> {
    const result = await this.ledgerRepo
      .createQueryBuilder('entry')
      .select('COALESCE(SUM(entry.quantity), 0)', 'total')
      .where('entry.organizationId = :organizationId', { organizationId })
      .andWhere('entry.itemId = :itemId', { itemId })
      .andWhere('entry.locationId = :locationId', { locationId })
      .getRawOne();

    return Number(result.total);
  }

  // ─── Private helpers ──────────────────────────────────────────────

  /**
   * Chặn phát sinh chuyển động kho vào vị trí thuộc kho đã ngừng hoạt động
   * (storage.is_active = false). Movement có skipInactiveStorageGuard = true
   * (reversal chứng từ đã posted, POS) được bỏ qua.
   */
  private async assertStoragesActive(
    manager: EntityManager,
    movements: RecordMovementParams[],
  ): Promise<void> {
    const locationIds = [
      ...new Set(
        movements
          .filter((m) => !m.skipInactiveStorageGuard)
          .map((m) => m.locationId),
      ),
    ];
    if (locationIds.length === 0) return;
    const rows = await manager.query<{ name: string }[]>(
      `SELECT DISTINCT s.name
         FROM locations loc
         JOIN storages s ON s.id = loc.storage_id
        WHERE loc.id = ANY($1::uuid[]) AND s.is_active = false`,
      [locationIds],
    );
    if (rows.length > 0) {
      const names = rows.map((r) => r.name).join(', ');
      throw new BadRequestException(
        `Không thể thao tác trên kho đã ngừng hoạt động: ${names}. Hãy kích hoạt lại kho trước khi nhập/xuất/chuyển.`,
      );
    }
  }

  private async writeBatchMovements(
    manager: EntityManager,
    movements: RecordMovementParams[],
  ): Promise<StockLedgerEntryEntity[]> {
    await this.assertStoragesActive(manager, movements);
    const savedEntries: StockLedgerEntryEntity[] = [];
    const now = new Date();

    for (const params of movements) {
      const { unitCost, lineValue } = this.deriveCostFields(params);
      const ledgerEntry = manager.create(StockLedgerEntryEntity, {
        itemId: params.itemId,
        locationId: params.locationId,
        branchId: params.branchId,
        organizationId: params.organizationId,
        movementType: params.movementType,
        quantity: params.quantity,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        notes: params.notes,
        postedAt: now,
        createdBy: params.actorContext.userId,
        unitCost,
        lineValue,
      });
      const savedEntry = await manager.save(StockLedgerEntryEntity, ledgerEntry);
      savedEntries.push(savedEntry);

      await this.upsertBalance(manager, params);
    }

    return savedEntries;
  }

  private deriveCostFields(
    params: RecordMovementParams,
  ): { unitCost?: number; lineValue?: number } {
    if (params.unitCost === undefined || params.unitCost === null) {
      return { unitCost: undefined, lineValue: undefined };
    }
    const cost = Math.abs(Number(params.unitCost));
    if (!Number.isFinite(cost)) {
      return { unitCost: undefined, lineValue: undefined };
    }
    const signedQty = Number(params.quantity);
    const lineValue = Number((signedQty * cost).toFixed(2));
    return { unitCost: cost, lineValue };
  }

  private async upsertBalance(
    manager: EntityManager,
    params: RecordMovementParams,
  ): Promise<void> {
    const existing = await manager.findOne(StockBalanceEntity, {
      where: {
        organizationId: params.organizationId,
        itemId: params.itemId,
        locationId: params.locationId,
      },
    });

    if (existing) {
      const newQuantity = Number(existing.quantity) + Number(params.quantity);

      if (newQuantity < 0) {
        this.logger.warn(
          `Negative balance detected: item=${params.itemId} location=${params.locationId} ` +
            `current=${existing.quantity} change=${params.quantity} result=${newQuantity}`,
        );
      }

      await manager.update(
        StockBalanceEntity,
        { id: existing.id },
        {
          quantity: newQuantity,
          lastMovementAt: new Date(),
          // Bất kỳ giao dịch nào chạm vào một vị trí đã ngừng theo dõi đều bật
          // lại "Đang theo dõi" (kể cả khi trừ hàng, ví dụ bán qua chuyển kho tạm).
          ...(existing.isTracked === false ? { isTracked: true } : {}),
        },
      );
    } else {
      if (Number(params.quantity) < 0) {
        this.logger.warn(
          `Negative initial balance: item=${params.itemId} location=${params.locationId} ` +
            `quantity=${params.quantity}`,
        );
      }

      const balance = manager.create(StockBalanceEntity, {
        itemId: params.itemId,
        locationId: params.locationId,
        branchId: params.branchId,
        organizationId: params.organizationId,
        quantity: Number(params.quantity),
        lastMovementAt: new Date(),
        createdBy: params.actorContext.userId,
      });
      await manager.save(StockBalanceEntity, balance);
    }
  }

  private async publishMovementEvent(
    entry: StockLedgerEntryEntity,
  ): Promise<void> {
    await this.eventPublisher.publish(
      ERP_TOPICS.STOCK_MOVEMENT_POSTED,
      {
        eventId: uuidv4(),
        eventType: DomainEventType.STOCK_MOVEMENT_POSTED,
        timestamp: new Date().toISOString(),
        organizationId: entry.organizationId,
        branchId: entry.branchId,
        correlationId: entry.referenceId,
        payload: {
          ledgerEntryId: entry.id,
          itemId: entry.itemId,
          locationId: entry.locationId,
          movementType: entry.movementType,
          quantity: entry.quantity,
          referenceType: entry.referenceType,
          referenceId: entry.referenceId,
        },
      },
      entry.itemId,
    );
  }
}
