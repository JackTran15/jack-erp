import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
  StockMovementType,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BaseCrudService } from '../../crud/base-crud.service';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { ItemEntity } from './item.entity';
import { ItemCategoryEntity } from './item-category.entity';
import { ItemProviderEntity } from './item-provider.entity';
import { ItemBarcodeEntity } from './item-barcode.entity';
import { ItemStockThresholdEntity } from './item-stock-threshold.entity';
import { ItemUnitEntity } from './item-unit.entity';
import { LocationEntity } from './location.entity';
import {
  CreateItemBarcodeInput,
  CreateItemProviderInput,
  CreateItemThresholdInput,
  CreateItemUnitInput,
} from './dto/create-item.dto';

export const INVENTORY_ITEM_SERVICE_TOKEN = 'InventoryItemCrudService';

interface NestedPayload {
  barcodes?: CreateItemBarcodeInput[];
  providers?: CreateItemProviderInput[];
  units?: CreateItemUnitInput[];
  threshold?: CreateItemThresholdInput;
  initialStock?: number;
  initialStockUnitPrice?: number;
  initialLocationId?: string;
  providerId?: string;
}

@Injectable()
export class InventoryItemCrudService extends BaseCrudService<
  ItemEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig = INVENTORY_ITEM_ENTITY_CONFIG;

  constructor(
    @InjectRepository(ItemEntity)
    protected readonly repository: Repository<ItemEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categoryRepo: Repository<ItemCategoryEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    protected readonly dataSource: DataSource,
    private readonly stockLedger: StockLedgerService,
  ) {
    super(dataSource);
  }

  protected override getByIdRelations(): string[] {
    return ['category', 'product'];
  }

  protected override configureListQuery(
    qb: SelectQueryBuilder<ItemEntity>,
    alias: string,
  ): void {
    qb.leftJoinAndSelect(`${alias}.category`, 'category');
    qb.leftJoinAndSelect(`${alias}.product`, 'product');
  }

  protected override applySearch(
    qb: SelectQueryBuilder<ItemEntity>,
    alias: string,
    search?: string,
  ): void {
    if (!search) return;
    qb.andWhere(
      new Brackets((sub) => {
        sub
          .where(`${alias}.code ILIKE :search`, { search: `%${search}%` })
          .orWhere(`${alias}.name ILIKE :search`, { search: `%${search}%` })
          .orWhere('category.name ILIKE :search', { search: `%${search}%` })
          .orWhere('product.name ILIKE :search', { search: `%${search}%` });
      }),
    );
  }

  protected override transformListResults(data: ItemEntity[]): unknown[] {
    return data.map((row) => {
      const category = row.category;
      const product = row.product;
      const { category: _c, product: _p, ...rest } = row;
      return {
        ...rest,
        categoryName: category?.name ?? '',
        productName: product?.name ?? '',
        variantLabel: row.variantLabel ?? '',
      };
    });
  }

  /**
   * Full create: split nested arrays from the item payload, save the item,
   * then upsert providers / barcodes / units / threshold / initial stock —
   * all in a single transaction.
   */
  override async create(
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<ItemEntity> {
    const normalized = normalizePayload(payload);
    const { nested, itemPayload } = this.splitNested(normalized);
    const cleaned = stripDerivedFields(itemPayload);

    if (cleaned.categoryId) {
      await this.ensureCategoryBelongsToOrg(cleaned.categoryId, actor);
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const item = manager.create(ItemEntity, {
        ...cleaned,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
      });
      const savedItem = await manager.save(ItemEntity, item);

      await this.saveProviders(
        manager,
        savedItem.id,
        actor,
        nested.providers,
        nested.providerId,
      );
      await this.saveBarcodes(manager, savedItem.id, actor, nested.barcodes);
      await this.saveUnits(manager, savedItem.id, actor, nested.units);
      await this.saveThreshold(manager, savedItem.id, actor, nested.threshold);

      return savedItem;
    });

    // Initial stock — done OUTSIDE the txn since StockLedgerService manages
    // its own transaction (ledger + balance + event publish).
    if (nested.initialStock && Number(nested.initialStock) > 0) {
      const locationId =
        nested.initialLocationId ?? (await this.resolveDefaultLocationId(actor));
      if (!locationId) {
        throw new BadRequestException(
          'Không tìm thấy vị trí kho mặc định để ghi tồn kho đầu kỳ. Vui lòng cấu hình tối thiểu một vị trí.',
        );
      }
      await this.stockLedger.recordMovement({
        itemId: saved.id,
        locationId,
        branchId: actor.branchId ?? '',
        organizationId: actor.organizationId,
        movementType: StockMovementType.ADJUSTMENT_INCREASE,
        quantity: Number(nested.initialStock),
        referenceType: 'INITIAL_STOCK',
        referenceId: saved.id,
        notes: `Tồn kho đầu kỳ — đơn giá nhập ${nested.initialStockUnitPrice ?? 0}`,
        actorContext: actor,
        unitCost: Number(
          nested.initialStockUnitPrice ?? saved.purchasePrice ?? 0,
        ),
      });
    }

    this.logger.log(`Created inventory-items id=${saved.id}`);
    return saved;
  }

  protected override async beforeUpdate(
    id: string,
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    const normalized = normalizePayload(payload);
    const { itemPayload } = this.splitNested(normalized);
    const cleaned = stripDerivedFields(itemPayload);
    if (cleaned.categoryId) {
      await this.ensureCategoryBelongsToOrg(cleaned.categoryId, actor);
    }
    return super.beforeUpdate(id, cleaned, actor);
  }

  // ─── Nested helpers ─────────────────────────────────────────────────

  private splitNested(payload: Record<string, any>): {
    nested: NestedPayload;
    itemPayload: Record<string, any>;
  } {
    const {
      barcodes,
      providers,
      units,
      threshold,
      initialStock,
      initialStockUnitPrice,
      initialLocationId,
      providerId,
      ...itemPayload
    } = payload;
    return {
      nested: {
        barcodes,
        providers,
        units,
        threshold,
        initialStock,
        initialStockUnitPrice,
        initialLocationId,
        providerId,
      },
      itemPayload,
    };
  }

  private async saveProviders(
    manager: EntityManager,
    itemId: string,
    actor: ActorContext,
    providers?: CreateItemProviderInput[],
    legacyProviderId?: string,
  ): Promise<void> {
    const rows: CreateItemProviderInput[] = [];
    if (providers?.length) rows.push(...providers);
    if (legacyProviderId && !rows.some((r) => r.providerId === legacyProviderId)) {
      rows.push({ providerId: legacyProviderId, isPrimary: true });
    }
    if (rows.length === 0) return;

    // Ensure exactly one primary
    let primaryAssigned = false;
    const normalized = rows.map((r) => {
      const shouldBePrimary = !primaryAssigned && (r.isPrimary === true);
      if (shouldBePrimary) primaryAssigned = true;
      return { ...r, isPrimary: shouldBePrimary };
    });
    if (!primaryAssigned && normalized.length > 0) {
      normalized[0].isPrimary = true;
    }

    const entities = normalized.map((r) =>
      manager.create(ItemProviderEntity, {
        itemId,
        providerId: r.providerId,
        isPrimary: r.isPrimary,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
      }),
    );
    await manager.save(ItemProviderEntity, entities);
  }

  private async saveBarcodes(
    manager: EntityManager,
    itemId: string,
    actor: ActorContext,
    barcodes?: CreateItemBarcodeInput[],
  ): Promise<void> {
    if (!barcodes?.length) return;
    const entities = barcodes
      .filter((b) => b.code && b.code.trim().length > 0)
      .map((b) =>
        manager.create(ItemBarcodeEntity, {
          itemId,
          code: b.code.trim(),
          notes: b.notes,
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          createdBy: actor.userId,
        }),
      );
    if (entities.length === 0) return;
    await manager.save(ItemBarcodeEntity, entities);
  }

  private async saveUnits(
    manager: EntityManager,
    itemId: string,
    actor: ActorContext,
    units?: CreateItemUnitInput[],
  ): Promise<void> {
    if (!units?.length) return;
    const cleaned = units.filter(
      (u) => u.unitName && u.unitName.trim().length > 0,
    );
    if (cleaned.length === 0) return;

    let defaultSellAssigned = false;
    let defaultBuyAssigned = false;
    const entities = cleaned.map((u) => {
      const isDefaultSell = !defaultSellAssigned && u.isDefaultSell === true;
      if (isDefaultSell) defaultSellAssigned = true;
      const isDefaultBuy = !defaultBuyAssigned && u.isDefaultBuy === true;
      if (isDefaultBuy) defaultBuyAssigned = true;
      return manager.create(ItemUnitEntity, {
        itemId,
        unitName: u.unitName.trim(),
        ratio: u.ratio ?? 1,
        description: u.description,
        purchasePrice: u.purchasePrice ?? 0,
        sellPrice: u.sellPrice ?? 0,
        isDefaultSell,
        isDefaultBuy,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
      });
    });
    await manager.save(ItemUnitEntity, entities);
  }

  private async saveThreshold(
    manager: EntityManager,
    itemId: string,
    actor: ActorContext,
    threshold?: CreateItemThresholdInput,
  ): Promise<void> {
    if (!threshold) return;
    const hasMin = threshold.minQty !== undefined && threshold.minQty !== null;
    const hasMax = threshold.maxQty !== undefined && threshold.maxQty !== null;
    if (!hasMin && !hasMax) return;

    const locationId =
      threshold.locationId ?? (await this.resolveDefaultLocationId(actor));
    if (!locationId) {
      // No location available — silently skip rather than fail item create.
      this.logger.warn(
        `Skipping threshold for item=${itemId}: no default location available`,
      );
      return;
    }

    const entity = manager.create(ItemStockThresholdEntity, {
      itemId,
      locationId,
      minQty: hasMin ? Number(threshold.minQty) : null,
      maxQty: hasMax ? Number(threshold.maxQty) : null,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
    });
    await manager.save(ItemStockThresholdEntity, entity);
  }

  private async resolveDefaultLocationId(
    actor: ActorContext,
  ): Promise<string | undefined> {
    const qb = this.locationRepo
      .createQueryBuilder('loc')
      .innerJoin('storages', 's', 's.id = loc.storage_id')
      .where('s.organization_id = :orgId', { orgId: actor.organizationId })
      .andWhere('loc.is_active = true')
      .orderBy('loc.created_at', 'ASC')
      .limit(1);
    if (actor.branchId) {
      qb.andWhere('s.branch_id = :branchId', { branchId: actor.branchId });
    }
    const row = await qb.getOne();
    return row?.id;
  }

  private async ensureCategoryBelongsToOrg(
    categoryId: string,
    actor: ActorContext,
  ): Promise<void> {
    const cat = await this.categoryRepo.findOne({
      where: { id: categoryId, organizationId: actor.organizationId },
    });
    if (!cat) {
      throw new BadRequestException(
        `Danh mục ${categoryId} không tồn tại trong tổ chức`,
      );
    }
  }
}

function stripDerivedFields<T extends Record<string, any>>(payload: T): T {
  const next = { ...payload };
  delete next.categoryName;
  delete next.category;
  delete next.productName;
  delete next.product;
  delete next.providers;
  delete next.barcodes;
  delete next.thresholds;
  delete next.units;
  // Frontend-only display fields leaked from picker state
  delete next.providerName;
  delete next.providerCode;
  return next;
}

/**
 * Normalize an incoming raw payload — the generic CRUD controller accepts
 * `Record<string, any>` and runs no DTO validation, so empty strings reach
 * us untouched and break UUID / numeric columns at INSERT time. Convert
 * "" → undefined for every top-level scalar; required columns will surface
 * as NOT NULL violations downstream (acceptable, validation is upstream's
 * responsibility).
 */
function normalizePayload<T extends Record<string, any>>(payload: T): T {
  const next: Record<string, any> = { ...payload };
  for (const [key, value] of Object.entries(next)) {
    if (value === '') next[key] = undefined;
  }
  return next as T;
}

export const INVENTORY_ITEM_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'inventory-items',
  displayName: 'Mặt hàng kho',
  apiResource: 'inventory/items',
  idField: 'id',
  fields: [
    { key: 'code', label: 'Mã', type: 'string', required: true },
    { key: 'name', label: 'Tên', type: 'string', required: true },
    { key: 'description', label: 'Mô tả', type: 'string' },
    { key: 'unit', label: 'Đơn vị', type: 'string', required: true },
    { key: 'categoryId', label: 'ID Danh mục', type: 'string' },
    { key: 'categoryName', label: 'Danh mục', type: 'string', readOnly: true },
    { key: 'brand', label: 'Thương hiệu', type: 'string' },
    { key: 'itemType', label: 'Nhóm hàng', type: 'string' },
    {
      key: 'purchasePrice',
      label: 'Giá mua',
      type: 'number',
      numberFormat: 'money',
      required: true,
    },
    {
      key: 'sellingPrice',
      label: 'Giá bán',
      type: 'number',
      numberFormat: 'money',
      required: true,
    },
    { key: 'isPosVisible', label: 'Hiển thị POS', type: 'boolean' },
    { key: 'weightGram', label: 'Trọng lượng (g)', type: 'number' },
    { key: 'lengthCm', label: 'Dài (cm)', type: 'number' },
    { key: 'widthCm', label: 'Rộng (cm)', type: 'number' },
    { key: 'heightCm', label: 'Cao (cm)', type: 'number' },
    { key: 'packageWeightGram', label: 'Trọng lượng gói hàng (g)', type: 'number' },
    { key: 'packageLengthCm', label: 'Dài đóng gói (cm)', type: 'number' },
    { key: 'packageWidthCm', label: 'Rộng đóng gói (cm)', type: 'number' },
    { key: 'packageHeightCm', label: 'Cao đóng gói (cm)', type: 'number' },
    { key: 'manufactureYear', label: 'Năm sản xuất', type: 'number' },
    { key: 'composition', label: 'Thành phần', type: 'string' },
    { key: 'oddSize', label: 'Đầy size', type: 'string' },
    { key: 'isGoldSilver', label: 'Mặt hàng vàng bạc', type: 'boolean' },
    { key: 'manageBarcodePerUnit', label: 'Mã vạch theo đơn vị', type: 'boolean' },
    { key: 'providerId', label: 'Nhà cung cấp', type: 'string' },
    { key: 'productId', label: 'ID Sản phẩm', type: 'string' },
    { key: 'productName', label: 'Tên sản phẩm', type: 'string', readOnly: true },
    { key: 'variantLabel', label: 'Biến thể', type: 'string', readOnly: true },
    { key: 'isActive', label: 'Đang hoạt động', type: 'boolean' },
    { key: 'createdAt', label: 'Ngày tạo', type: 'date' },
  ],
  searchableFields: ['code', 'name', 'categoryName', 'productName'],
  filterDefinitions: [
    {
      key: 'isActive',
      label: 'Đang hoạt động',
      type: 'select',
      options: [
        { label: 'Có', value: 'true' },
        { label: 'Không', value: 'false' },
      ],
    },
    {
      key: 'isPosVisible',
      label: 'Hiển thị POS',
      type: 'select',
      options: [
        { label: 'Có', value: 'true' },
        { label: 'Không', value: 'false' },
      ],
    },
    { key: 'categoryId', label: 'ID Danh mục', type: 'text' },
    { key: 'productId', label: 'ID Sản phẩm', type: 'text' },
    { key: 'brand', label: 'Thương hiệu', type: 'text' },
    { key: 'itemType', label: 'Nhóm hàng', type: 'text' },
  ],
  permissions: {
    create: 'inventory.write',
    read: 'inventory.read',
    update: 'inventory.write',
    delete: 'inventory.write',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.HARD,
};
