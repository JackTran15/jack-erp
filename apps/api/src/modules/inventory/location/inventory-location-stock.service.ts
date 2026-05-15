import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
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
import { ItemBarcodeEntity } from './item-barcode.entity';
import { ItemEntity } from './item.entity';
import { ItemProviderEntity } from './item-provider.entity';
import { ItemStockThresholdEntity } from './item-stock-threshold.entity';
import { LocationEntity } from './location.entity';
import { StockByLocationQueryDto } from './dto/stock-by-location.query.dto';

@Injectable()
export class InventoryLocationStockService {
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
  ) {}

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
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
