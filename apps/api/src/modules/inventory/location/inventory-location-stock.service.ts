import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  Equal,
  FindOptionsOrder,
  FindOptionsWhere,
  ILike,
  In,
  LessThan,
  MoreThan,
  Repository,
} from 'typeorm';
import {
  StockByLocationItem,
  StockByLocationLocationRef,
  StockByLocationProvider,
  StockByLocationResponse,
  StockStateFilter,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { ItemStorageLocationService } from '../product/item-storage-location.service';
import {
  IntraWarehouseMoveLine,
  StockTransferService,
} from '../transfer/stock-transfer.service';
import { ItemBarcodeEntity } from './item-barcode.entity';
import { ItemEntity } from './item.entity';
import { ItemProviderEntity } from './item-provider.entity';
import { ItemStockThresholdEntity } from './item-stock-threshold.entity';
import { LocationEntity } from './location.entity';
import { StockByLocationQueryDto } from './dto/stock-by-location.query.dto';
import { ArrangeLocationDto } from './dto/arrange-location.dto';
import { BatchAssignItemsDto } from './inventory-location-stock.controller';
import { InventoryLocationService } from './inventory-location.service';

@Injectable()
export class InventoryLocationStockService {
  private readonly logger = new Logger(InventoryLocationStockService.name);

  constructor(
    @InjectRepository(StockBalanceEntity)
    private readonly stockBalanceRepo: Repository<StockBalanceEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    @InjectRepository(ItemStockThresholdEntity)
    private readonly thresholdRepo: Repository<ItemStockThresholdEntity>,
    @InjectRepository(ItemBarcodeEntity)
    private readonly barcodeRepo: Repository<ItemBarcodeEntity>,
    @InjectRepository(ItemProviderEntity)
    private readonly itemProviderRepo: Repository<ItemProviderEntity>,
    private readonly pslService: ItemStorageLocationService,
    private readonly locationService: InventoryLocationService,
    private readonly stockTransferService: StockTransferService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Bind an existing item to a location (intended placement).
   * Creates a stock_balance row at quantity 0 if not already present so the
   * item shows up in the location's stock list. Also assigns the product↔location
   * PSL mapping via the shared service (validates one-location-per-product-per-storage).
   *
   * No stock movement is recorded — actual stock arrives via goods receipts.
   */
  async addItemToLocation(
    locationId: string,
    itemId: string,
    actor: ActorContext,
  ): Promise<{ ok: true }> {
    await this.dataSource.transaction((manager) =>
      this.addItemToLocationInternal(manager, locationId, itemId, actor),
    );
    return { ok: true };
  }

  /**
   * Batch-assign multiple (item, location) pairs in a single transaction.
   * Idempotent: rows where the stock_balance already exists are skipped.
   */
  async assignBatch(
    dto: BatchAssignItemsDto,
    actor: ActorContext,
  ): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;
    await this.dataSource.transaction(async (manager) => {
      for (const row of dto.rows) {
        const result = await this.addItemToLocationInternal(
          manager,
          row.locationId,
          row.itemId,
          actor,
        );
        if (result.created) created++;
        else skipped++;
      }
    });
    return { created, skipped };
  }

  /** Move unassigned stock onto a real shelf, then record the preferred shelf. */
  async arrange(
    dto: ArrangeLocationDto,
    actor: ActorContext,
  ): Promise<{ moved: number; transferId: string | null }> {
    // Resolve each line's "Chưa xếp" source. When the UI does not send a
    // quantity, move all currently unassigned stock; if none exists, still write
    // the preferred shelf mapping below.
    const resolved: {
      line: ArrangeLocationDto['lines'][number];
      qty: number;
      unassignedId: string;
    }[] = [];
    for (const line of dto.lines) {
      const unassigned = await this.locationService.ensureUnassignedLocation(
        line.storageId,
        actor,
      );
      const balance = await this.stockBalanceRepo.findOne({
        where: {
          organizationId: actor.organizationId,
          itemId: line.itemId,
          locationId: unassigned.id,
        },
      });
      const unassignedQty = balance ? Number(balance.quantity) : 0;
      resolved.push({
        line,
        qty: line.quantity ?? unassignedQty,
        unassignedId: unassigned.id,
      });
    }

    const moves: IntraWarehouseMoveLine[] = resolved
      .filter((r) => r.qty > 0)
      .map((r) => ({
        itemId: r.line.itemId,
        quantity: r.qty,
        sourceLocationId: r.unassignedId,
        destinationLocationId: r.line.destinationLocationId,
      }));

    let transferId: string | null = null;
    if (moves.length > 0) {
      const transfer = await this.stockTransferService.postIntraWarehouseMoves(
        moves,
        actor,
      );
      transferId = transfer.id;
    }

    // Record the preferred shelf after the immutable transfer succeeds.
    for (const r of resolved) {
      try {
        await this.pslService.setLocationByItem(
          r.line.itemId,
          r.line.destinationLocationId,
          actor,
        );
      } catch (err) {
        this.logger.warn(
          `Xếp vị trí: không ghi nhận được vị trí ưu tiên cho hàng ${r.line.itemId} ` +
            `→ kệ ${r.line.destinationLocationId}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { moved: dto.lines.length, transferId };
  }

  /**
   * Core logic shared by addItemToLocation and assignBatch.
   * Runs within the provided EntityManager so callers control the transaction.
   * Returns { created: true } when a new stock_balance row was inserted,
   * { created: false } when it already existed (idempotent skip).
   */
  private async addItemToLocationInternal(
    manager: EntityManager,
    locationId: string,
    itemId: string,
    actor: ActorContext,
  ): Promise<{ created: boolean }> {
    const location = await manager.findOne(LocationEntity, {
      where: { id: locationId, organizationId: actor.organizationId },
      relations: { storage: { branch: true } },
    });
    if (!location || !location.storage) {
      throw new NotFoundException('Vị trí không tồn tại');
    }
    const locationBranchId = location.branchId ?? location.storage.branchId;
    if (actor.branchId && locationBranchId !== actor.branchId) {
      throw new NotFoundException('Vị trí không tồn tại');
    }

    const item = await manager.findOne(ItemEntity, {
      where: { id: itemId, organizationId: actor.organizationId },
    });
    if (!item) {
      throw new NotFoundException('Hàng hoá không tồn tại');
    }

    // Validate / auto-create item-storage-location binding (item-level).
    // pslService uses its own repos — runs outside the transaction boundary
    // which is acceptable here (the mapping is config, not a balance row).
    await this.pslService.validateAndAssignByLocation(itemId, locationId, actor);

    // Upsert stock_balance row so the item appears in the location's stock list.
    const existing = await manager.findOne(StockBalanceEntity, {
      where: {
        organizationId: actor.organizationId,
        itemId,
        locationId,
      },
    });
    if (existing) {
      return { created: false };
    }

    const branchId = locationBranchId || actor.branchId;
    await manager.insert(StockBalanceEntity, {
      organizationId: actor.organizationId,
      branchId,
      itemId,
      locationId,
      quantity: 0,
      createdBy: actor.userId,
    });
    return { created: true };
  }

  /**
   * Remove an item from a location. Only allowed when current balance is 0 to
   * avoid orphan stock. (Caller may force-zero via stock adjustment first.)
   */
  async removeItemFromLocation(
    locationId: string,
    itemId: string,
    actor: ActorContext,
  ): Promise<void> {
    await this.resolveLocation(locationId, actor);

    const balance = await this.stockBalanceRepo.findOne({
      where: {
        organizationId: actor.organizationId,
        itemId,
        locationId,
      },
    });
    if (!balance) return;
    if (Number(balance.quantity) !== 0) {
      throw new ForbiddenException(
        'Không thể bỏ hàng hóa khi tồn kho khác 0. Hãy điều chỉnh tồn về 0 trước.',
      );
    }
    await this.stockBalanceRepo.delete(balance.id);
  }

  async getStockByLocation(
    locationId: string,
    query: StockByLocationQueryDto,
    actor: ActorContext,
  ): Promise<StockByLocationResponse> {
    const location = await this.resolveLocation(locationId, actor);

    const where = this.buildWhere(locationId, actor.organizationId, query);
    const order = this.buildOrder(query);

    // BELOW_MIN compares two columns (sb.quantity < th.min_qty), which a
    // FindOperator can't express. Load all, filter, then paginate in JS.
    if (query.stockState === StockStateFilter.BELOW_MIN) {
      return this.getBelowMinStock({
        where,
        order,
        locationId,
        organizationId: actor.organizationId,
        location,
        query,
      });
    }

    const [rows, total] = await this.stockBalanceRepo.findAndCount({
      where,
      // Only many-to-one here to avoid row duplication + TypeORM's
      // distinctAlias bug when paginating with one-to-many relations.
      relations: { item: { category: true } },
      order,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return this.buildResponse(rows, location, total, query, locationId, actor);
  }

  private async getBelowMinStock(args: {
    where:
      | FindOptionsWhere<StockBalanceEntity>
      | FindOptionsWhere<StockBalanceEntity>[];
    order: FindOptionsOrder<StockBalanceEntity>;
    locationId: string;
    organizationId: string;
    location: StockByLocationLocationRef;
    query: StockByLocationQueryDto;
  }): Promise<StockByLocationResponse> {
    const all = await this.stockBalanceRepo.find({
      where: args.where,
      relations: { item: { category: true } },
      order: args.order,
    });

    const thresholdByItem = await this.loadThresholds(
      all.map((r) => r.itemId),
      args.locationId,
      args.organizationId,
    );

    const filtered = all.filter((sb) => {
      const t = thresholdByItem.get(sb.itemId);
      if (!t || t.minQty == null) return false;
      return Number(sb.quantity) < Number(t.minQty);
    });

    const total = filtered.length;
    const start = (args.query.page - 1) * args.query.pageSize;
    const page = filtered.slice(start, start + args.query.pageSize);

    return this.buildResponse(
      page,
      args.location,
      total,
      args.query,
      args.locationId,
      { organizationId: args.organizationId } as ActorContext,
      thresholdByItem,
    );
  }

  private async buildResponse(
    rows: StockBalanceEntity[],
    location: StockByLocationLocationRef,
    total: number,
    query: StockByLocationQueryDto,
    locationId: string,
    actor: Pick<ActorContext, 'organizationId'>,
    prefetchedThresholds?: Map<string, ItemStockThresholdEntity>,
  ): Promise<StockByLocationResponse> {
    const itemIds = rows.map((r) => r.itemId);
    const [barcodesByItem, providersByItem, thresholdByItem] =
      await Promise.all([
        this.loadBarcodes(itemIds, actor.organizationId),
        this.loadProviders(itemIds),
        prefetchedThresholds
          ? Promise.resolve(prefetchedThresholds)
          : this.loadThresholds(itemIds, locationId, actor.organizationId),
      ]);

    return {
      data: rows.map((sb) =>
        this.toItem(
          sb,
          thresholdByItem.get(sb.itemId),
          barcodesByItem.get(sb.itemId) ?? [],
          providersByItem.get(sb.itemId) ?? [],
        ),
      ),
      meta: {
        location,
        total,
        page: query.page,
        pageSize: query.pageSize,
      },
    };
  }

  private buildWhere(
    locationId: string,
    organizationId: string,
    query: StockByLocationQueryDto,
  ):
    | FindOptionsWhere<StockBalanceEntity>
    | FindOptionsWhere<StockBalanceEntity>[] {
    const itemWhere: FindOptionsWhere<ItemEntity> = {};
    if (query.categoryId) itemWhere.categoryId = query.categoryId;
    if (typeof query.isPosVisible === 'boolean') {
      itemWhere.isPosVisible = query.isPosVisible;
    }
    if (typeof query.isActive === 'boolean') {
      itemWhere.isActive = query.isActive;
    }
    if (query.barcode) {
      itemWhere.barcodes = { code: query.barcode };
    }
    if (query.providerId) {
      itemWhere.providers = { providerId: query.providerId };
    }

    const base: FindOptionsWhere<StockBalanceEntity> = {
      organizationId,
      locationId,
    };
    if (Object.keys(itemWhere).length > 0) {
      base.item = itemWhere;
    }

    switch (query.stockState) {
      case StockStateFilter.POSITIVE:
        base.quantity = MoreThan(0);
        break;
      case StockStateFilter.ZERO:
        base.quantity = Equal(0);
        break;
      case StockStateFilter.NEGATIVE:
        base.quantity = LessThan(0);
        break;
      case StockStateFilter.BELOW_MIN:
      case StockStateFilter.ALL:
      default:
        break;
    }

    if (query.search) {
      const pattern = `%${escapeLike(query.search)}%`;
      return [
        { ...base, item: { ...itemWhere, code: ILike(pattern) } },
        { ...base, item: { ...itemWhere, name: ILike(pattern) } },
      ];
    }

    return base;
  }

  private buildOrder(
    query: StockByLocationQueryDto,
  ): FindOptionsOrder<StockBalanceEntity> {
    const dir: 'ASC' | 'DESC' = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    switch (query.sortBy) {
      case 'code':
        return { item: { code: dir } };
      case 'quantity':
        return { quantity: dir, item: { code: 'ASC' } };
      case 'lastMovementAt':
        return { lastMovementAt: dir, item: { code: 'ASC' } };
      case 'name':
      default:
        return { item: { name: dir, code: 'ASC' } };
    }
  }

  private async resolveLocation(
    locationId: string,
    actor: ActorContext,
  ): Promise<StockByLocationLocationRef> {
    const location = await this.locationRepo.findOne({
      where: { id: locationId, organizationId: actor.organizationId },
      relations: { storage: { branch: true } },
    });

    if (!location || !location.storage) {
      throw new NotFoundException(`Vị trí ${locationId} không tồn tại`);
    }

    const storage = location.storage;
    const locationBranchId = location.branchId ?? storage.branchId;
    if (actor.branchId && locationBranchId !== actor.branchId) {
      throw new ForbiddenException(
        `Vị trí ${locationId} không thuộc chi nhánh đang chọn`,
      );
    }

    return {
      id: location.id,
      code: location.code,
      name: location.name,
      type: location.type as StockByLocationLocationRef['type'],
      isActive: location.isActive,
      storage: { id: storage.id, name: storage.name },
      branch: {
        id: storage.branchId ?? '',
        name: storage.branch?.name ?? '',
      },
    };
  }

  private async loadThresholds(
    itemIds: string[],
    locationId: string,
    organizationId: string,
  ): Promise<Map<string, ItemStockThresholdEntity>> {
    if (itemIds.length === 0) return new Map();
    const thresholds = await this.thresholdRepo.find({
      where: { itemId: In(itemIds), locationId, organizationId },
    });
    return new Map(thresholds.map((t) => [t.itemId, t]));
  }

  private async loadBarcodes(
    itemIds: string[],
    organizationId: string,
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (itemIds.length === 0) return map;
    const barcodes = await this.barcodeRepo.find({
      where: { itemId: In(itemIds), organizationId },
      order: { code: 'ASC' },
    });
    for (const bc of barcodes) {
      const existing = map.get(bc.itemId);
      if (existing) existing.push(bc.code);
      else map.set(bc.itemId, [bc.code]);
    }
    return map;
  }

  private async loadProviders(
    itemIds: string[],
  ): Promise<Map<string, StockByLocationProvider[]>> {
    const map = new Map<string, StockByLocationProvider[]>();
    if (itemIds.length === 0) return map;
    const links = await this.itemProviderRepo.find({
      where: { itemId: In(itemIds) },
      relations: { provider: true },
      order: { isPrimary: 'DESC' },
    });
    for (const link of links) {
      const entry: StockByLocationProvider = {
        providerId: link.providerId,
        providerName: link.provider?.name ?? '',
        isPrimary: link.isPrimary,
      };
      const existing = map.get(link.itemId);
      if (existing) existing.push(entry);
      else map.set(link.itemId, [entry]);
    }
    // Secondary tiebreaker by provider name within the same isPrimary group.
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.providerName.localeCompare(b.providerName);
      });
    }
    return map;
  }

  private toItem(
    sb: StockBalanceEntity,
    threshold: ItemStockThresholdEntity | undefined,
    barcodes: string[],
    providers: StockByLocationProvider[],
  ): StockByLocationItem {
    const item = sb.item;
    if (!item) {
      throw new Error(`Item relation chưa được load cho stock_balance ${sb.id}`);
    }

    const quantity = Number(sb.quantity);
    const minQty =
      threshold && threshold.minQty != null ? Number(threshold.minQty) : null;
    const maxQty =
      threshold && threshold.maxQty != null ? Number(threshold.maxQty) : null;
    const belowMin = minQty != null && quantity < minQty;

    return {
      itemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      categoryId: item.categoryId ?? null,
      categoryName: item.category?.name ?? null,
      productId: item.productId ?? null,
      variantLabel: item.variantLabel ?? null,
      isPosVisible: item.isPosVisible,
      isActive: item.isActive,
      sellingPrice: Number(item.sellingPrice) || 0,
      purchasePrice: Number(item.purchasePrice) || 0,
      barcodes,
      providers,
      quantity,
      minQty,
      maxQty,
      belowMin,
      lastMovementAt: sb.lastMovementAt
        ? new Date(sb.lastMovementAt).toISOString()
        : null,
    };
  }

  async getPreferredShelf(
    itemId: string,
    storageId: string,
    actor: ActorContext,
  ): Promise<{ id: string; code: string; name: string } | null> {
    const item = await this.dataSource.getRepository(ItemEntity).findOne({
      where: { id: itemId, organizationId: actor.organizationId },
    });
    if (!item) return null;

    const psls = await this.pslService.listByItem(itemId, actor);
    const psl = psls.find((p) => p.storageId === storageId);
    if (psl) {
      const preferred = await this.findAccessibleShelf(
        psl.locationId,
        storageId,
        actor,
      );
      if (preferred) return preferred;
    }

    // Legacy items and imported data may have real stock locations without a
    // preferred-shelf mapping. Fall back to the item's most-used
    // accessible shelf in the selected storage so document forms can still
    // auto-fill a valid location.
    const balances = await this.stockBalanceRepo.find({
      where: {
        organizationId: actor.organizationId,
        itemId,
        ...(actor.branchId ? { branchId: actor.branchId } : {}),
      },
      order: {
        quantity: 'DESC',
        lastMovementAt: 'DESC',
      },
    });
    for (const balance of balances) {
      const location = await this.findAccessibleShelf(
        balance.locationId,
        storageId,
        actor,
      );
      if (location) return location;
    }

    return null;
  }

  private async findAccessibleShelf(
    locationId: string,
    storageId: string,
    actor: ActorContext,
  ): Promise<{ id: string; code: string; name: string } | null> {
    const location = await this.locationRepo.findOne({
      where: {
        id: locationId,
        organizationId: actor.organizationId,
        storageId,
        isUnassigned: false,
        ...(actor.branchId ? { storage: { branchId: actor.branchId } } : {}),
      },
      relations: { storage: true },
    });
    if (!location) return null;

    return {
      id: location.id,
      code: location.code,
      name: location.name,
    };
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
