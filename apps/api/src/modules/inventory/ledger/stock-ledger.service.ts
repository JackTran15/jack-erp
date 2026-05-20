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
import { ProductStorageLocationService } from '../product/product-storage-location.service';
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
    private readonly pslService: ProductStorageLocationService,
  ) {}

  async recordMovement(
    params: RecordMovementParams,
  ): Promise<StockLedgerEntryEntity> {
    await this.pslService.validateAndAssignByLocation(
      params.itemId,
      params.locationId,
      params.actorContext,
    );

    const entry = await this.dataSource.transaction(async (manager) => {
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
      });
      const savedEntry = await manager.save(StockLedgerEntryEntity, ledgerEntry);

      await this.upsertBalance(manager, params);

      return savedEntry;
    });

    await this.publishMovementEvent(entry);

    return entry;
  }

  async recordBatchMovements(
    movements: RecordMovementParams[],
  ): Promise<StockLedgerEntryEntity[]> {
    if (movements.length === 0) return [];

    for (const params of movements) {
      await this.pslService.validateAndAssignByLocation(
        params.itemId,
        params.locationId,
        params.actorContext,
      );
    }

    const entries = await this.dataSource.transaction(async (manager) => {
      const savedEntries: StockLedgerEntryEntity[] = [];
      const now = new Date();

      for (const params of movements) {
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
        });
        const savedEntry = await manager.save(StockLedgerEntryEntity, ledgerEntry);
        savedEntries.push(savedEntry);

        await this.upsertBalance(manager, params);
      }

      return savedEntries;
    });

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

    await this.eventPublisher.publishBatch(eventMessages);

    return entries;
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
      qb.andWhere('sb.branch_id = :branchId', { branchId: query.branchId });
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
    if (query.search && query.search.trim()) {
      const q = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere('(LOWER(item.code) LIKE :q OR LOWER(item.name) LIKE :q)', {
        q,
      });
    }
    if (query.belowMin) {
      qb.andWhere('th.min_qty IS NOT NULL AND sb.quantity < th.min_qty');
    }

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
      'sb.branch_id AS "branchId"',
      'sb.item_id AS "itemId"',
      'sb.location_id AS "locationId"',
      'sb.quantity AS quantity',
      'sb.last_movement_at AS "lastMovementAt"',
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

    const sortBy = (query.sortBy ?? 'lastMovementAt') as string;
    const sortMap: Record<string, string> = {
      itemCode: 'item.code',
      itemName: 'item.name',
      quantity: 'sb.quantity',
      lastMovementAt: 'sb.last_movement_at',
      locationName: 'loc.name',
      storageName: 'storage.name',
    };
    const sortExpr = sortMap[sortBy] ?? 'sb.last_movement_at';
    qb.orderBy(sortExpr, (query.sortOrder ?? 'desc').toUpperCase() as 'ASC' | 'DESC');

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
        { quantity: newQuantity, lastMovementAt: new Date() },
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
