import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  Brackets,
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
  SelectQueryBuilder,
} from "typeorm";
import { ProductEntity } from "../product/product.entity";
import { ProductAttributeDefinitionEntity } from "../product/product-attribute-definition.entity";
import { ProductAttributeOptionEntity } from "../product/product-attribute-option.entity";
import { ItemAttributeValueEntity } from "../product/item-attribute-value.entity";
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
  StockMovementType,
} from "@erp/shared-interfaces";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { BaseCrudService } from "../../crud/base-crud.service";
import { PaginationQueryDto } from "../../crud/dto/pagination-query.dto";
import type { PaginatedResponse } from "@erp/shared-interfaces";
import { StockLedgerService } from "../ledger/stock-ledger.service";
import { CacheService } from "../../redis/cache.service";
import {
  CATALOG_CACHE_NAMESPACE,
  catalogCardsKey,
} from "../../pos/pos-catalog-cache.constants";
import { ItemEntity } from "./item.entity";
import { ItemCategoryEntity } from "./item-category.entity";
import { BrandEntity } from "./brand.entity";
import { ItemProviderEntity } from "./item-provider.entity";
import { ItemStockThresholdEntity } from "./item-stock-threshold.entity";
import { ItemUnitEntity } from "./item-unit.entity";
import { ItemBarcodeEntity } from "./item-barcode.entity";
import { LocationEntity } from "./location.entity";
import {
  CreateItemBarcodeInput,
  CreateItemProviderInput,
  CreateItemThresholdInput,
  CreateItemUnitInput,
} from "./dto/create-item.dto";
import type {
  ProductGroupRow,
  ProductGroupsQueryDto,
  ProductItemsQueryDto,
  ProductVariantRow,
} from "./dto/product-group-query.dto";

export const INVENTORY_ITEM_SERVICE_TOKEN = "InventoryItemCrudService";

interface NestedPayload {
  barcodes?: CreateItemBarcodeInput[];
  providers?: CreateItemProviderInput[];
  units?: CreateItemUnitInput[];
  threshold?: CreateItemThresholdInput;
  initialStock?: number;
  initialStockUnitPrice?: number;
  initialLocationId?: string;
  providerId?: string;
  colors?: string[];
  sizes?: string[];
}

interface ItemAttrSnapshot {
  colors: string[];
  sizes: string[];
}

@Injectable()
export class InventoryItemCrudService extends BaseCrudService<
  ItemEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig =
    INVENTORY_ITEM_ENTITY_CONFIG;

  constructor(
    @InjectRepository(ItemEntity)
    protected readonly repository: Repository<ItemEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categoryRepo: Repository<ItemCategoryEntity>,
    @InjectRepository(BrandEntity)
    private readonly brandRepo: Repository<BrandEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    @InjectRepository(ProductAttributeDefinitionEntity)
    private readonly attrDefRepo: Repository<ProductAttributeDefinitionEntity>,
    @InjectRepository(ProductAttributeOptionEntity)
    private readonly attrOptRepo: Repository<ProductAttributeOptionEntity>,
    @InjectRepository(ItemAttributeValueEntity)
    private readonly attrValRepo: Repository<ItemAttributeValueEntity>,
    protected readonly dataSource: DataSource,
    private readonly stockLedger: StockLedgerService,
    private readonly cacheService: CacheService,
  ) {
    super(dataSource);
  }

  /**
   * Drop the POS catalog card cache for this org after an item/product write so the
   * next POS catalog list rebuilds it (name/price/category/visibility feed the cards).
   * The cache also has a short TTL, so a missed call self-heals within seconds.
   */
  private async invalidatePosCatalogCache(actor: ActorContext): Promise<void> {
    await this.cacheService.invalidate(
      CATALOG_CACHE_NAMESPACE,
      catalogCardsKey(actor.organizationId),
    );
  }

  protected override getByIdRelations(): string[] {
    return ["category", "product"];
  }

  protected override configureListQuery(
    qb: SelectQueryBuilder<ItemEntity>,
    alias: string,
  ): void {
    qb.leftJoinAndSelect(`${alias}.category`, "category");
    qb.leftJoinAndSelect(`${alias}.product`, "product");
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
          .orWhere("category.name ILIKE :search", { search: `%${search}%` })
          .orWhere("product.name ILIKE :search", { search: `%${search}%` });
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
        categoryName: category?.name ?? "",
        productCode: product?.code ?? "",
        productName: product?.name ?? "",
        variantLabel: row.variantLabel ?? "",
      };
    });
  }

  // ─── Override list/getById to show product groups ────────────────────

  override async list(
    query: PaginationQueryDto,
    filters: Record<string, any>,
    actor: ActorContext,
  ): Promise<PaginatedResponse<any>> {
    const categoryId = filters?.categoryId as string | undefined;
    const includeInactive =
      filters?.includeInactive === true || filters?.includeInactive === "true";
    const result = await this.listProductGroups(actor, {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      categoryId,
      includeInactive,
      sortOrder: query.sortOrder,
    });
    return { ...result, page: query.page, pageSize: query.pageSize };
  }

  override async getById(id: string, actor: ActorContext): Promise<any> {
    // Try as a real item ID first
    const item = await this.repository.findOne({
      where: { id, organizationId: actor.organizationId },
      relations: [
        "category",
        "product",
        "units",
        "providers",
        "providers.provider",
      ],
    });
    if (item) {
      const transformed = (this.transformListResults([item]) as any[])[0];
      const attrs = item.productId
        ? await this.loadProductAttributes(item.productId)
        : await this.loadItemAttributes(item.id);
      const opening = await this.loadInitialStockSnapshot(actor, item.id);
      return { ...transformed, ...attrs, ...opening };
    }

    // Fall back: treat id as a product ID → return representative item
    const rep = await this.getRepresentativeItemForProduct(actor, id);
    if (rep) return rep;

    throw new NotFoundException(`Record ${id} not found`);
  }

  /** Bulk toggle is_active for org-scoped items ("Ngừng theo dõi" / "Sử dụng lại"). */
  async setActiveStatus(
    ids: string[],
    isActive: boolean,
    actor: ActorContext,
  ): Promise<{ updated: number }> {
    if (!ids?.length) return { updated: 0 };
    // Rule: hàng hóa đang ở kho Showroom không được ngừng theo dõi — phải chuyển
    // hàng khỏi Showroom trước. Chỉ chặn khi tắt theo dõi (kích hoạt lại luôn cho phép).
    if (!isActive) {
      const inShowroom = await this.dataSource.query<Array<{ code: string }>>(
        `SELECT DISTINCT i.code AS code
           FROM stock_balances sb
           JOIN locations loc ON loc.id = sb.location_id
           JOIN storages s    ON s.id = loc.storage_id
           JOIN items i       ON i.id = sb.item_id
          WHERE sb.organization_id = $1
            AND sb.item_id = ANY($2::uuid[])
            AND s.is_main_storage = true
          ORDER BY i.code`,
        [actor.organizationId, ids],
      );
      if (inShowroom.length) {
        const codes = inShowroom.slice(0, 5).map((r) => r.code).join(", ");
        const more = inShowroom.length > 5 ? "…" : "";
        throw new BadRequestException(
          `Không thể ngừng theo dõi hàng hóa đang ở Showroom (${codes}${more}).`,
        );
      }
    }
    const result = await this.repository
      .createQueryBuilder()
      .update(ItemEntity)
      .set({ isActive })
      .where("id IN (:...ids)", { ids })
      .andWhere("organization_id = :orgId", { orgId: actor.organizationId })
      .execute();
    await this.invalidatePosCatalogCache(actor);
    return { updated: result.affected ?? 0 };
  }

  /** Block hard-delete once an item has posted movements — MISA parity: use "Ngừng theo dõi" instead. */
  protected override async beforeDelete(
    id: string,
    actor: ActorContext,
  ): Promise<void> {
    const rows = await this.dataSource.query<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM stock_ledger_entries
         WHERE item_id = $1 AND organization_id = $2
       ) AS exists`,
      [id, actor.organizationId],
    );
    if (rows[0]?.exists) {
      throw new BadRequestException(
        "Hàng hóa đã phát sinh chứng từ nên không thể xóa. Hãy dùng 'Ngừng theo dõi'.",
      );
    }
  }

  protected override async afterDelete(
    _id: string,
    actor: ActorContext,
  ): Promise<void> {
    await this.invalidatePosCatalogCache(actor);
  }

  /**
   * Full create: split nested arrays from the item payload, save the item,
   * then upsert providers / units / threshold / initial stock —
   * all in a single transaction.
   */
  override async create(
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<any> {
    const normalized = normalizePayload(payload);

    // Resolve brand FK → denormalize the brand name onto the item.
    if (normalized.brandId) {
      normalized.brand = await this.resolveBrandName(normalized.brandId, actor);
    }

    // When colors/sizes arrays are present → create product with variant matrix
    if (Array.isArray(normalized.colors) || Array.isArray(normalized.sizes)) {
      const created = await this.createProductWithVariants(normalized, actor);
      await this.invalidatePosCatalogCache(actor);
      return created;
    }

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
    await this.recordInitialStock(
      saved,
      nested.initialStock,
      nested.initialStockUnitPrice,
      actor,
      nested.initialLocationId,
    );

    this.logger.log(`Created inventory-items id=${saved.id}`);
    await this.invalidatePosCatalogCache(actor);
    return saved;
  }

  override async update(
    id: string,
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<any> {
    const normalized = normalizePayload(payload);

    // Resolve / clear brand FK and keep the denormalized name in sync. Do this
    // before the product-variant branch as those payloads also carry brandId.
    if ("brandId" in normalized) {
      if (normalized.brandId) {
        normalized.brand = await this.resolveBrandName(
          normalized.brandId,
          actor,
        );
      } else {
        normalized.brandId = null;
        normalized.brand = null;
      }
    }

    const productRepo = this.dataSource.getRepository(ProductEntity);
    const isProductUuid = await productRepo.exist({
      where: { id, organizationId: actor.organizationId },
    });
    if (isProductUuid && this.hasProductLevelPatch(normalized)) {
      const updated = await this.updateProductWithVariants(id, normalized, actor);
      await this.invalidatePosCatalogCache(actor);
      return updated;
    }

    // Only reconcile nested collections that were explicitly provided — a patch
    // that omits them must leave the existing rows untouched.
    const hasProviders = "providers" in normalized;
    const hasUnits = "units" in normalized;
    const hasBarcodes = "barcodes" in normalized;
    const providers = Array.isArray(normalized.providers)
      ? normalized.providers
      : undefined;
    const units = Array.isArray(normalized.units)
      ? normalized.units
      : undefined;
    const barcodes = Array.isArray(normalized.barcodes)
      ? normalized.barcodes
      : undefined;

    const { colors: _c, sizes: _s, ...rest } = normalized;
    const saved = (await super.update(id, rest as any, actor)) as ItemEntity;

    if (hasProviders || hasUnits || hasBarcodes) {
      await this.dataSource.transaction(async (manager) => {
        if (hasProviders) {
          await manager.delete(ItemProviderEntity, {
            itemId: id,
            organizationId: actor.organizationId,
          });
          await this.saveProviders(manager, id, actor, providers);
        }
        if (hasBarcodes) {
          await manager.delete(ItemBarcodeEntity, {
            itemId: id,
            organizationId: actor.organizationId,
          });
          await this.saveBarcodes(manager, id, actor, barcodes);
        }
        if (hasUnits) {
          await manager.delete(ItemUnitEntity, {
            itemId: id,
            organizationId: actor.organizationId,
          });
          await this.saveUnits(manager, id, actor, units);
        }
      });
    }

    await this.invalidatePosCatalogCache(actor);
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
      colors,
      sizes,
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
        colors: Array.isArray(colors) ? colors : undefined,
        sizes: Array.isArray(sizes) ? sizes : undefined,
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
    if (
      legacyProviderId &&
      !rows.some((r) => r.providerId === legacyProviderId)
    ) {
      rows.push({ providerId: legacyProviderId, isPrimary: true });
    }
    if (rows.length === 0) return;

    // Ensure exactly one primary
    let primaryAssigned = false;
    const normalized = rows.map((r) => {
      const shouldBePrimary = !primaryAssigned && r.isPrimary === true;
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
    const seen = new Set<string>();
    const rows: Array<{ code: string; notes?: string }> = [];
    for (const barcode of barcodes) {
      const code = cleanString(barcode.code);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      rows.push({ code, notes: cleanString(barcode.notes) });
    }
    if (rows.length === 0) return;

    const entities = rows.map((b) =>
      manager.create(ItemBarcodeEntity, {
        itemId,
        code: b.code,
        notes: b.notes,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
      }),
    );
    await manager.save(ItemBarcodeEntity, entities);
  }

  private async replaceBarcodesForItem(
    itemId: string,
    actor: ActorContext,
    barcodes?: CreateItemBarcodeInput[],
  ): Promise<void> {
    const repo = this.dataSource.getRepository(ItemBarcodeEntity);
    await repo.delete({ itemId, organizationId: actor.organizationId });
    if (!barcodes?.length) return;
    const seen = new Set<string>();
    const rows: Array<{ code: string; notes?: string }> = [];
    for (const barcode of barcodes) {
      const code = cleanString(barcode.code);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      rows.push({ code, notes: cleanString(barcode.notes) });
    }
    const entities = rows.map((b) =>
      repo.create({
        itemId,
        code: b.code,
        notes: b.notes,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
      }),
    );
    if (entities.length > 0) await repo.save(entities);
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
      .createQueryBuilder("loc")
      .innerJoin("storages", "s", "s.id = loc.storage_id")
      .where("s.organization_id = :orgId", { orgId: actor.organizationId })
      .andWhere("loc.is_active = true")
      .orderBy("loc.created_at", "ASC")
      .limit(1);
    if (actor.branchId) {
      qb.andWhere("s.branch_id = :branchId", { branchId: actor.branchId });
    }
    const row = await qb.getOne();
    return row?.id;
  }

  private async recordInitialStock(
    item: ItemEntity,
    quantity: unknown,
    unitPrice: unknown,
    actor: ActorContext,
    locationId?: string,
  ): Promise<void> {
    const qty = finiteNumber(quantity);
    if (!qty || qty <= 0) return;

    const resolvedLocationId =
      locationId ?? (await this.resolveDefaultLocationId(actor));
    if (!resolvedLocationId) {
      throw new BadRequestException(
        "Không tìm thấy vị trí kho mặc định để ghi tồn kho đầu kỳ. Vui lòng cấu hình tối thiểu một vị trí.",
      );
    }

    const cost = finiteNumber(unitPrice) ?? Number(item.purchasePrice) ?? 0;
    await this.stockLedger.recordMovement({
      itemId: item.id,
      locationId: resolvedLocationId,
      branchId: actor.branchId ?? "",
      organizationId: actor.organizationId,
      movementType: StockMovementType.ADJUSTMENT_INCREASE,
      quantity: qty,
      referenceType: "INITIAL_STOCK",
      referenceId: item.id,
      notes: `Tồn kho đầu kỳ — đơn giá nhập ${cost}`,
      actorContext: actor,
      unitCost: cost,
    });
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

  /** Re-throw a Postgres unique-violation (23505) as a user-facing 409, matching
   *  BaseCrudService's behaviour; pass other errors through unchanged. */
  private toConflictIfDuplicate(err: unknown): never {
    const code =
      err instanceof QueryFailedError
        ? ((err as QueryFailedError & { code?: string }).code ??
          (err as { driverError?: { code?: string } }).driverError?.code)
        : undefined;
    if (code === "23505") {
      throw new ConflictException(
        "A record with the same unique code already exists in this organization",
      );
    }
    throw err;
  }

  /** Resolve a brand FK to its name (org-scoped). Throws when the brand is
   *  missing or belongs to another organization. */
  private async resolveBrandName(
    brandId: string,
    actor: ActorContext,
  ): Promise<string> {
    const brand = await this.brandRepo.findOne({
      where: { id: brandId, organizationId: actor.organizationId },
    });
    if (!brand) {
      throw new BadRequestException(
        `Brand ${brandId} not found in organization`,
      );
    }
    return brand.name;
  }

  // ─── Product + Variant creation ──────────────────────────────────────

  private async createProductWithVariants(
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<{ productId: string; itemsCreated: number }> {
    const {
      name: productName,
      code: productCode,
      brand,
      brandId,
      categoryId,
      purchasePrice = 0,
      sellingPrice = 0,
      unit = "Đôi",
      isPosVisible = true,
      isActive = true,
      colors = [],
      sizes = [],
      variants = [],
      initialStock,
      initialStockUnitPrice,
      initialLocationId,
    } = payload;

    if (!productName) throw new BadRequestException("Tên hàng hóa là bắt buộc");
    if (categoryId) {
      await this.ensureCategoryBelongsToOrg(categoryId, actor);
    }

    const productRepo = this.dataSource.getRepository(ProductEntity);
    const product = await productRepo
      .save(
        productRepo.create({
          code: productCode || undefined,
          name: productName,
          isActive: isActive !== false,
          organizationId: actor.organizationId,
          createdBy: actor.userId,
        }),
      )
      .catch((err) => this.toConflictIfDuplicate(err));

    const colorDef =
      (colors as string[]).length > 0
        ? await this.resolveOrCreateAttrDef(product.id, "Color", actor)
        : null;
    const sizeDef =
      (sizes as string[]).length > 0
        ? await this.resolveOrCreateAttrDef(product.id, "Size", actor)
        : null;

    const colorOptions: Array<{ id: string; label: string }> = colorDef
      ? await Promise.all(
          (colors as string[]).map(async (c) => ({
            id: await this.resolveOrCreateAttrOption(colorDef, c, actor),
            label: c,
          })),
        )
      : [];
    const sizeOptions: Array<{ id: string; label: string }> = sizeDef
      ? await Promise.all(
          (sizes as string[]).map(async (s) => ({
            id: await this.resolveOrCreateAttrOption(sizeDef, s, actor),
            label: s,
          })),
        )
      : [];

    const combos = this.buildCombos(colorOptions, sizeOptions);

    // Per-variant overrides (price / SKU / name / unit) sent by the
    // FE variant table, keyed by the same "color__size" combo the table uses.
    const variantByKey = new Map<string, Record<string, any>>();
    for (const v of (Array.isArray(variants) ? variants : []) as Record<
      string,
      any
    >[]) {
      variantByKey.set(`${v?.color ?? ""}__${v?.size ?? ""}`, v);
    }
    const str = (val: unknown): string | undefined =>
      typeof val === "string" && val.trim() ? val.trim() : undefined;
    const sharedItemFields = pickProductVariantSharedItemFields(payload);

    let itemsCreated = 0;

    for (const combo of combos) {
      const variantLabel = [combo.size?.label, combo.color?.label]
        .filter(Boolean)
        .join(" · ");
      const v = variantByKey.get(
        `${combo.color?.label ?? ""}__${combo.size?.label ?? ""}`,
      );
      const code =
        str(v?.sku) ?? this.buildVariantCode(productCode || productName, combo);
      const itemName =
        str(v?.name) ??
        (variantLabel ? `${productName} ${variantLabel}` : productName);

      const item = await this.repository
        .save(
          this.repository.create({
            code,
            name: itemName,
            unit: str(v?.unit) ?? unit,
            ...sharedItemFields,
            isActive: isActive !== false,
            isPosVisible: isPosVisible !== false,
            purchasePrice: Number(v?.purchasePrice ?? purchasePrice) || 0,
            sellingPrice: Number(v?.sellPrice ?? sellingPrice) || 0,
            productId: product.id,
            categoryId: categoryId || undefined,
            brand: brand || undefined,
            brandId: brandId || undefined,
            variantLabel: variantLabel || undefined,
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            createdBy: actor.userId,
          }),
        )
        .catch((err) => this.toConflictIfDuplicate(err));

      if (str(v?.barcode)) {
        await this.replaceBarcodesForItem(item.id, actor, [
          { code: str(v?.barcode)! },
        ]);
      }

      if (combo.color && colorDef) {
        await this.upsertAttrValue(item.id, colorDef, combo.color.id, actor);
      }
      if (combo.size && sizeDef) {
        await this.upsertAttrValue(item.id, sizeDef, combo.size.id, actor);
      }
      await this.recordInitialStock(
        item,
        finiteNumber(v?.initialStock) ??
          (combos.length === 1 ? finiteNumber(initialStock) : undefined),
        initialStockUnitPrice,
        actor,
        initialLocationId,
      );
      itemsCreated++;
    }

    return { productId: product.id, itemsCreated };
  }

  private hasProductLevelPatch(payload: Record<string, any>): boolean {
    return (
      Array.isArray(payload.colors) ||
      Array.isArray(payload.sizes) ||
      Array.isArray(payload.variants) ||
      Object.keys(pickProductVariantSharedItemFields(payload)).length > 0
    );
  }

  private async updateProductWithVariants(
    productId: string,
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<{ productId: string; itemsAdded: number }> {
    const { colors = [], sizes = [], name, code, isActive } = payload;
    const productRepo = this.dataSource.getRepository(ProductEntity);

    const product = await productRepo.findOne({
      where: { id: productId, organizationId: actor.organizationId },
    });
    if (!product) throw new NotFoundException(`Product ${productId} not found`);
    if (payload.categoryId) {
      await this.ensureCategoryBelongsToOrg(payload.categoryId, actor);
    }

    const patch: Partial<ProductEntity> = {};
    if (name) patch.name = name;
    if (code !== undefined) patch.code = code || undefined;
    if (isActive !== undefined) patch.isActive = Boolean(isActive);
    if (Object.keys(patch).length > 0) {
      await productRepo.update({ id: productId }, patch as any);
    }

    const sharedPatch = pickProductVariantSharedItemFields(payload);
    if (Object.keys(sharedPatch).length > 0) {
      await this.repository.update(
        { productId, organizationId: actor.organizationId } as any,
        sharedPatch as any,
      );
    }
    await this.updateExistingVariantRowsFromPayload(payload.variants, actor);

    const colorDef =
      (colors as string[]).length > 0
        ? await this.resolveOrCreateAttrDef(productId, "Color", actor)
        : null;
    const sizeDef =
      (sizes as string[]).length > 0
        ? await this.resolveOrCreateAttrDef(productId, "Size", actor)
        : null;

    const colorOptions: Array<{ id: string; label: string }> = colorDef
      ? await Promise.all(
          (colors as string[]).map(async (c) => ({
            id: await this.resolveOrCreateAttrOption(colorDef, c, actor),
            label: c,
          })),
        )
      : [];
    const sizeOptions: Array<{ id: string; label: string }> = sizeDef
      ? await Promise.all(
          (sizes as string[]).map(async (s) => ({
            id: await this.resolveOrCreateAttrOption(sizeDef, s, actor),
            label: s,
          })),
        )
      : [];

    const combos = this.buildCombos(colorOptions, sizeOptions);
    let itemsAdded = 0;

    for (const combo of combos) {
      const alreadyExists = await this.variantExists(productId, combo, actor);
      if (alreadyExists) continue;

      const variantLabel = [combo.size?.label, combo.color?.label]
        .filter(Boolean)
        .join(" · ");
      const code = this.buildVariantCode(product.code || product.name, combo);

      const item = await this.repository.save(
        this.repository.create({
          code,
          name: variantLabel ? `${product.name} ${variantLabel}` : product.name,
          unit: payload.unit || "Đôi",
          ...sharedPatch,
          isActive:
            payload.isActive !== undefined
              ? payload.isActive !== false
              : product.isActive,
          isPosVisible: payload.isPosVisible !== false,
          purchasePrice: Number(payload.purchasePrice) || 0,
          sellingPrice: Number(payload.sellingPrice) || 0,
          productId,
          variantLabel: variantLabel || undefined,
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          createdBy: actor.userId,
        }),
      );

      if (combo.color && colorDef) {
        await this.upsertAttrValue(item.id, colorDef, combo.color.id, actor);
      }
      if (combo.size && sizeDef) {
        await this.upsertAttrValue(item.id, sizeDef, combo.size.id, actor);
      }
      itemsAdded++;
    }

    const attrs = await this.loadProductAttributes(productId);
    return { productId, itemsAdded, ...attrs } as any;
  }

  private async updateExistingVariantRowsFromPayload(
    variants: unknown,
    actor: ActorContext,
  ): Promise<void> {
    if (!Array.isArray(variants) || variants.length === 0) return;
    for (const raw of variants as Record<string, any>[]) {
      const itemId = typeof raw?.itemId === "string" ? raw.itemId : undefined;
      if (!itemId) continue;

      const itemPatch: Record<string, any> = {};
      const name = cleanString(raw.name);
      const unit = cleanString(raw.unit);
      const sku = cleanString(raw.sku);
      const purchasePrice = finiteNumber(raw.purchasePrice);
      const sellingPrice = finiteNumber(raw.sellPrice);
      const barcode = cleanString(raw.barcode);

      if (name) itemPatch.name = name;
      if (unit) itemPatch.unit = unit;
      if (sku) itemPatch.code = sku;
      if (purchasePrice !== undefined) itemPatch.purchasePrice = purchasePrice;
      if (sellingPrice !== undefined) itemPatch.sellingPrice = sellingPrice;

      if (Object.keys(itemPatch).length > 0) {
        await this.repository.update(
          { id: itemId, organizationId: actor.organizationId } as any,
          itemPatch as any,
        );
      }

      if ("barcode" in raw) {
        await this.replaceBarcodesForItem(
          itemId,
          actor,
          barcode ? [{ code: barcode }] : [],
        );
      }
    }
  }

  private async loadInitialStockSnapshot(
    actor: ActorContext,
    itemId: string,
  ): Promise<{ initialStock: number; initialStockUnitPrice: number }> {
    const rows = await this.dataSource.query<
      Array<{ initialStock: string | number | null; notes: string | null }>
    >(
      `
        SELECT
          COALESCE(SUM(quantity)::float, 0) AS "initialStock",
          (
            ARRAY_AGG(notes ORDER BY posted_at DESC)
            FILTER (WHERE notes IS NOT NULL)
          )[1] AS notes
        FROM stock_ledger_entries
        WHERE organization_id = $1
          AND item_id = $2
          AND reference_type = 'INITIAL_STOCK'
      `,
      [actor.organizationId, itemId],
    );
    const row = rows[0];
    return {
      initialStock: finiteNumber(row?.initialStock) ?? 0,
      initialStockUnitPrice: parseInitialStockUnitPrice(row?.notes) ?? 0,
    };
  }

  private buildCombos(
    colors: Array<{ id: string; label: string }>,
    sizes: Array<{ id: string; label: string }>,
  ): Array<{
    color?: { id: string; label: string };
    size?: { id: string; label: string };
  }> {
    if (colors.length === 0 && sizes.length === 0) return [{}];
    if (colors.length === 0) return sizes.map((s) => ({ size: s }));
    if (sizes.length === 0) return colors.map((c) => ({ color: c }));
    return colors.flatMap((c) => sizes.map((s) => ({ color: c, size: s })));
  }

  private buildVariantCode(
    base: string,
    combo: { color?: { label: string }; size?: { label: string } },
  ): string {
    const prefix =
      base
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 6)
        .toUpperCase() || "ITEM";
    const parts = [combo.size?.label, combo.color?.label].filter(Boolean);
    return parts.length > 0 ? `${prefix}-${parts.join("-")}` : prefix;
  }

  private async variantExists(
    productId: string,
    combo: { color?: { id: string }; size?: { id: string } },
    actor: ActorContext,
  ): Promise<boolean> {
    const optionIds = [combo.color?.id, combo.size?.id].filter(
      Boolean,
    ) as string[];
    if (optionIds.length === 0) return false;

    const count = await this.repository
      .createQueryBuilder("i")
      .innerJoin(
        "item_attribute_values",
        "av",
        "av.item_id = i.id AND av.option_id IN (:...optionIds)",
        { optionIds },
      )
      .where("i.productId = :productId", { productId })
      .andWhere("i.organizationId = :orgId", { orgId: actor.organizationId })
      .groupBy("i.id")
      .having("COUNT(DISTINCT av.option_id) = :cnt", { cnt: optionIds.length })
      .getCount();

    return count > 0;
  }

  // ─── Attribute helpers (Color / Size) ────────────────────────────────

  private async loadProductAttributes(
    productId: string,
  ): Promise<ItemAttrSnapshot> {
    const rows = await this.attrValRepo
      .createQueryBuilder("av")
      .innerJoin(
        ItemEntity,
        "i",
        "i.id = av.itemId AND i.productId = :productId",
        { productId },
      )
      .innerJoin("av.attributeDefinition", "def")
      .innerJoin("av.option", "opt")
      .andWhere("LOWER(def.name) IN ('color', 'size')")
      .select(["def.name AS def_name", "opt.valueLabel AS opt_value_label"])
      .distinct(true)
      .getRawMany<{ def_name: string; opt_value_label: string }>();

    return rows.reduce(
      (acc, r) => {
        const lower = r.def_name?.toLowerCase();
        if (lower === "color" && !acc.colors.includes(r.opt_value_label)) {
          acc.colors.push(r.opt_value_label);
        } else if (lower === "size" && !acc.sizes.includes(r.opt_value_label)) {
          acc.sizes.push(r.opt_value_label);
        }
        return acc;
      },
      { colors: [] as string[], sizes: [] as string[] } as ItemAttrSnapshot,
    );
  }

  private async loadItemAttributes(itemId: string): Promise<ItemAttrSnapshot> {
    const rows = await this.attrValRepo
      .createQueryBuilder("av")
      .innerJoin("av.attributeDefinition", "def")
      .innerJoin("av.option", "opt")
      .where("av.itemId = :itemId", { itemId })
      .andWhere("LOWER(def.name) IN ('color', 'size')")
      .select(["def.name AS def_name", "opt.valueLabel AS opt_value_label"])
      .getRawMany<{ def_name: string; opt_value_label: string }>();

    return rows.reduce(
      (acc, r) => {
        const lower = r.def_name?.toLowerCase();
        if (lower === "color") acc.colors = [r.opt_value_label ?? ""];
        else if (lower === "size") acc.sizes = [r.opt_value_label ?? ""];
        return acc;
      },
      { colors: [] as string[], sizes: [] as string[] } as ItemAttrSnapshot,
    );
  }

  private async resolveOrCreateAttrDef(
    productId: string,
    name: string,
    actor: ActorContext,
  ): Promise<string> {
    const existing = await this.attrDefRepo
      .createQueryBuilder("d")
      .where("d.productId = :productId", { productId })
      .andWhere("d.organizationId = :orgId", { orgId: actor.organizationId })
      .andWhere("LOWER(d.name) = LOWER(:name)", { name })
      .getOne();
    if (existing) return existing.id;

    const created = await this.attrDefRepo.save(
      this.attrDefRepo.create({
        productId,
        name,
        sortOrder: 0,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
      }),
    );
    return created.id;
  }

  private async resolveOrCreateAttrOption(
    defId: string,
    valueLabel: string,
    actor: ActorContext,
  ): Promise<string> {
    const existing = await this.attrOptRepo
      .createQueryBuilder("o")
      .where("o.attributeDefinitionId = :defId", { defId })
      .andWhere("o.organizationId = :orgId", { orgId: actor.organizationId })
      .andWhere("LOWER(o.value_label) = LOWER(:valueLabel)", { valueLabel })
      .getOne();
    if (existing) return existing.id;

    const created = await this.attrOptRepo.save(
      this.attrOptRepo.create({
        attributeDefinitionId: defId,
        valueLabel,
        sortOrder: 0,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
      }),
    );
    return created.id;
  }

  private async upsertAttrValue(
    itemId: string,
    defId: string,
    optionId: string,
    actor: ActorContext,
  ): Promise<void> {
    const existing = await this.attrValRepo.findOne({
      where: { itemId, attributeDefinitionId: defId },
    });
    if (existing) {
      if (existing.optionId !== optionId) {
        existing.optionId = optionId;
        await this.attrValRepo.save(existing);
      }
      return;
    }
    await this.attrValRepo.save(
      this.attrValRepo.create({
        itemId,
        attributeDefinitionId: defId,
        optionId,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
      }),
    );
  }

  // ─── Product-grouped item queries ────────────────────────────────────

  async listProductGroups(
    actor: ActorContext,
    query: ProductGroupsQueryDto,
  ): Promise<{ data: ProductGroupRow[]; total: number }> {
    const { page = 1, pageSize = 20, search, categoryId, isActive } = query;
    const orgId = actor.organizationId;
    const offset = (page - 1) * pageSize;
    const searchParam = search?.trim() ? `%${search.trim()}%` : null;
    const catParam = categoryId ?? null;
    // Default-hide discontinued groups unless the caller opts in (includeInactive)
    // or filters isActive explicitly. null = no filter (include both).
    const isActiveParam =
      query.includeInactive === true ? (isActive ?? null) : (isActive ?? true);

    const dataSql = `
      WITH combined AS (
        SELECT
          'product'                                   AS type,
          p.id                                        AS id,
          COALESCE(p.code, p.name)                    AS code,
          p.name                                      AS name,
          ic.id                                       AS "categoryId",
          ic.name                                     AS "categoryName",
          MIN(i.unit)                                 AS unit,
          AVG(i.purchase_price::numeric)::float       AS "purchasePrice",
          AVG(i.selling_price::numeric)::float        AS "sellingPrice",
          MIN(i.brand)                                AS brand,
          MIN(i.item_type)                            AS "itemType",
          bool_and(i.is_pos_visible)                  AS "isPosVisible",
          bool_and(i.is_active)                       AS "isActive",
          COUNT(i.id)::int                            AS "itemCount"
        FROM products p
        INNER JOIN items i
          ON i.product_id = p.id
          AND i.organization_id = $1
          AND ($6::boolean IS NULL OR i.is_active = $6)
        LEFT JOIN inventory_item_categories ic
          ON ic.id = i.category_id
        WHERE p.organization_id = $1
          AND ($2::text IS NULL OR p.code ILIKE $2 OR p.name ILIKE $2 OR ic.name ILIKE $2)
          AND ($3::uuid IS NULL OR ic.id = $3::uuid)
        GROUP BY p.id, p.code, p.name, ic.id, ic.name

        UNION ALL

        SELECT
          'orphan'                                    AS type,
          i.id                                        AS id,
          i.code                                      AS code,
          i.name                                      AS name,
          ic.id                                       AS "categoryId",
          ic.name                                     AS "categoryName",
          i.unit                                      AS unit,
          i.purchase_price::float                     AS "purchasePrice",
          i.selling_price::float                      AS "sellingPrice",
          i.brand                                     AS brand,
          i.item_type                                 AS "itemType",
          i.is_pos_visible                            AS "isPosVisible",
          i.is_active                                 AS "isActive",
          0                                           AS "itemCount"
        FROM items i
        LEFT JOIN inventory_item_categories ic
          ON ic.id = i.category_id
        WHERE i.organization_id = $1
          AND i.product_id IS NULL
          AND ($2::text IS NULL OR i.code ILIKE $2 OR i.name ILIKE $2 OR ic.name ILIKE $2)
          AND ($3::uuid IS NULL OR ic.id = $3::uuid)
          AND ($6::boolean IS NULL OR i.is_active = $6)
      )
      SELECT * FROM combined ORDER BY code ASC
      LIMIT $4 OFFSET $5
    `;

    const countSql = `
      WITH combined AS (
        SELECT p.id
        FROM products p
        INNER JOIN items i ON i.product_id = p.id AND i.organization_id = $1
          AND ($4::boolean IS NULL OR i.is_active = $4)
        LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
        WHERE p.organization_id = $1
          AND ($2::text IS NULL OR p.code ILIKE $2 OR p.name ILIKE $2 OR ic.name ILIKE $2)
          AND ($3::uuid IS NULL OR ic.id = $3::uuid)
        GROUP BY p.id

        UNION ALL

        SELECT i.id
        FROM items i
        LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
        WHERE i.organization_id = $1 AND i.product_id IS NULL
          AND ($2::text IS NULL OR i.code ILIKE $2 OR i.name ILIKE $2 OR ic.name ILIKE $2)
          AND ($3::uuid IS NULL OR ic.id = $3::uuid)
          AND ($4::boolean IS NULL OR i.is_active = $4)
      )
      SELECT COUNT(*)::int AS total FROM combined
    `;

    const baseParams = [orgId, searchParam, catParam];
    const [countResult, data] = await Promise.all([
      this.dataSource.query<{ total: number }[]>(countSql, [
        ...baseParams,
        isActiveParam,
      ]),
      this.dataSource.query<ProductGroupRow[]>(dataSql, [
        ...baseParams,
        pageSize,
        offset,
        isActiveParam,
      ]),
    ]);

    return { data, total: countResult[0]?.total ?? 0 };
  }

  /** Returns a single representative ItemEntity for a product (the first item by code ASC),
   *  merged with product-level fields (code, name). Used to pre-populate the item edit form. */
  async getRepresentativeItemForProduct(
    actor: ActorContext,
    productId: string,
  ): Promise<Record<string, unknown> | null> {
    const item = await this.repository
      .createQueryBuilder("i")
      .leftJoinAndSelect("i.category", "category")
      .leftJoinAndSelect("i.product", "product")
      .where("i.organizationId = :orgId", { orgId: actor.organizationId })
      .andWhere("i.productId = :productId", { productId })
      .orderBy("i.code", "ASC")
      .getOne();

    if (!item) return null;

    const { category, product, ...rest } = item as ItemEntity & {
      category?: { id: string; name: string };
      product?: { id: string; code?: string; name: string };
    };

    const attrs = await this.loadProductAttributes(productId);
    const variants = await this.loadProductVariants(actor, productId);
    const opening = await this.loadProductInitialStockSnapshot(
      actor,
      productId,
    );

    return {
      ...rest,
      ...attrs,
      ...opening,
      variants,
      categoryName: category?.name ?? "",
      productName: product?.name ?? "",
      // Override code/name with the PRODUCT values so the form shows product-level fields
      code: product?.code ?? rest.code,
      name: product?.name ?? rest.name,
      _productId: productId,
    };
  }

  /** Per-variant rows for a product (price / SKU / barcode + the color/size
   *  labels), used to hydrate the variant table on edit. */
  private async loadProductVariants(
    actor: ActorContext,
    productId: string,
  ): Promise<Record<string, unknown>[]> {
    const sql = `
      SELECT
        i.id,
        i.code,
        i.name,
        i.unit,
        i.purchase_price::float AS "purchasePrice",
        i.selling_price::float  AS "sellPrice",
        MAX(CASE WHEN LOWER(def.name) = 'color' THEN opt.value_label END) AS color,
        MAX(CASE WHEN LOWER(def.name) = 'size'  THEN opt.value_label END) AS size,
        (
          SELECT b.code FROM item_barcodes b
          WHERE b.item_id = i.id
          ORDER BY b.created_at ASC
          LIMIT 1
        ) AS barcode
      FROM items i
      LEFT JOIN item_attribute_values av ON av.item_id = i.id
      LEFT JOIN product_attribute_definitions def ON def.id = av.attribute_definition_id
      LEFT JOIN product_attribute_options opt ON opt.id = av.option_id
      WHERE i.product_id = $1 AND i.organization_id = $2
      GROUP BY i.id, i.code, i.name, i.unit, i.purchase_price, i.selling_price
      ORDER BY i.code ASC
    `;
    return this.dataSource.query<Record<string, unknown>[]>(sql, [
      productId,
      actor.organizationId,
    ]);
  }

  private async loadProductInitialStockSnapshot(
    actor: ActorContext,
    productId: string,
  ): Promise<{ initialStock: number; initialStockUnitPrice: number }> {
    const rows = await this.dataSource.query<
      Array<{ initialStock: string | number | null; notes: string | null }>
    >(
      `
        SELECT
          COALESCE(SUM(sle.quantity)::float, 0) AS "initialStock",
          (
            ARRAY_AGG(sle.notes ORDER BY sle.posted_at DESC)
            FILTER (WHERE sle.notes IS NOT NULL)
          )[1] AS notes
        FROM stock_ledger_entries sle
        INNER JOIN items i ON i.id = sle.item_id
        WHERE sle.organization_id = $1
          AND i.product_id = $2
          AND sle.reference_type = 'INITIAL_STOCK'
      `,
      [actor.organizationId, productId],
    );
    const row = rows[0];
    return {
      initialStock: finiteNumber(row?.initialStock) ?? 0,
      initialStockUnitPrice: parseInitialStockUnitPrice(row?.notes) ?? 0,
    };
  }

  async getProductGroup(
    actor: ActorContext,
    productId: string,
  ): Promise<ProductGroupRow | null> {
    const sql = `
      SELECT
        'product'                          AS type,
        p.id                               AS id,
        COALESCE(p.code, p.name)           AS code,
        p.name                             AS name,
        ic.id                              AS "categoryId",
        ic.name                            AS "categoryName",
        MIN(i.unit)                        AS unit,
        AVG(i.selling_price::numeric)::float AS "sellingPrice",
        COUNT(i.id)::int                   AS "itemCount"
      FROM products p
      INNER JOIN items i
        ON i.product_id = p.id
        AND i.organization_id = $1
      LEFT JOIN inventory_item_categories ic
        ON ic.id = i.category_id
      WHERE p.organization_id = $1
        AND p.id = $2
      GROUP BY p.id, p.code, p.name, ic.id, ic.name
      LIMIT 1
    `;
    const rows = await this.dataSource.query<ProductGroupRow[]>(sql, [
      actor.organizationId,
      productId,
    ]);
    return rows[0] ?? null;
  }

  async listProductItems(
    actor: ActorContext,
    productId: string,
    query: ProductItemsQueryDto,
  ): Promise<{ data: ProductVariantRow[]; total: number }> {
    const { page = 1, pageSize = 20 } = query;
    const offset = (page - 1) * pageSize;

    const qb = this.repository
      .createQueryBuilder("i")
      .leftJoinAndSelect("i.category", "category")
      .where("i.organizationId = :orgId", { orgId: actor.organizationId })
      .andWhere("i.productId = :productId", { productId })
      .orderBy("i.code", "ASC")
      .skip(offset)
      .take(pageSize);

    // Default-hide discontinued variants unless the caller opts in
    // (includeInactive) or filters isActive explicitly.
    if (query.isActive !== undefined) {
      qb.andWhere("i.isActive = :isActive", { isActive: query.isActive });
    } else if (query.includeInactive !== true) {
      qb.andWhere("i.isActive = true");
    }

    const [items, total] = await qb.getManyAndCount();

    const data: ProductVariantRow[] = items.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      variantLabel: i.variantLabel ?? null,
      categoryId: i.categoryId ?? null,
      categoryName: i.category?.name ?? null,
      unit: i.unit,
      purchasePrice: Number(i.purchasePrice),
      sellingPrice: Number(i.sellingPrice),
      brand: i.brand ?? null,
      itemType: i.itemType ?? null,
      isPosVisible: i.isPosVisible,
      isActive: i.isActive,
    }));

    return { data, total };
  }
}

function stripDerivedFields<T extends Record<string, any>>(payload: T): T {
  const next = { ...payload };
  delete next.categoryName;
  delete next.category;
  delete next.productName;
  delete next.product;
  delete next._productId;
  delete next.providers;
  delete next.barcodes;
  delete next.thresholds;
  delete next.units;
  // Frontend-only display fields leaked from picker state
  delete next.providerName;
  delete next.providerCode;
  // Attribute virtual fields — stored in attribute tables, not item columns
  delete next.colors;
  delete next.sizes;
  return next;
}

function pickProductVariantSharedItemFields(
  payload: Record<string, any>,
): Record<string, any> {
  const keys = [
    "unit",
    "categoryId",
    "brand",
    "brandId",
    "itemType",
    "purchasePrice",
    "sellingPrice",
    "isPosVisible",
    "isActive",
    "weightGram",
    "lengthCm",
    "widthCm",
    "heightCm",
    "manufactureYear",
    "composition",
    "packageWeightGram",
    "packageLengthCm",
    "packageWidthCm",
    "packageHeightCm",
    "oddSize",
    "isGoldSilver",
    "manageBarcodePerUnit",
  ];
  const picked: Record<string, any> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      picked[key] = payload[key];
    }
  }
  return picked;
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseInitialStockUnitPrice(notes: unknown): number | undefined {
  if (typeof notes !== "string") return undefined;
  const match = notes.match(/đơn giá nhập\s+([0-9.,]+)/i);
  if (!match) return undefined;
  const normalized = match[1].replace(/\./g, "").replace(",", ".");
  return finiteNumber(normalized);
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
    if (value === "") next[key] = undefined;
  }
  return next as T;
}

export const INVENTORY_ITEM_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: "inventory-items",
  displayName: "Hàng hoá",
  apiResource: "inventory/items",
  idField: "id",
  fields: [
    // ── List-visible fields (shown in table, order matches the UI) ────────
    { key: "code", label: "SKU mẫu mã", type: "string" },
    {
      key: "barcode",
      label: "Mã vạch",
      type: "string",
      readOnly: true,
      hideInList: true,
    },
    { key: "name", label: "Tên mẫu mã", type: "string", required: true },
    { key: "unit", label: "Đơn vị tính", type: "string", required: true },
    { key: "brand", label: "Thương hiệu", type: "string" },
    {
      key: "purchasePrice",
      label: "Giá mua TB",
      type: "number",
      numberFormat: "money",
    },
    {
      key: "sellingPrice",
      label: "Giá bán TB",
      type: "number",
      numberFormat: "money",
    },
    { key: "isPosVisible", label: "Hiển thị MH bán hàng", type: "boolean" },
    { key: "isActive", label: "Trạng thái", type: "boolean" },
    // ── Display fields removed from the table (kept for form/back-compat) ──
    {
      key: "categoryName",
      label: "Nhóm hàng hóa",
      type: "string",
      readOnly: true,
      hideInList: true,
    },
    {
      key: "itemType",
      label: "Loại hàng hóa",
      type: "string",
      hideInList: true,
    },
    // ── Form-only fields (hidden from list table) ─────────────────────────
    {
      key: "categoryId",
      label: "ID Danh mục",
      type: "string",
      hideInList: true,
    },
    { key: "description", label: "Mô tả", type: "string", hideInList: true },
    {
      key: "productId",
      label: "ID Sản phẩm",
      type: "string",
      hideInList: true,
    },
    {
      key: "productCode",
      label: "Mã SKU mẫu mã",
      type: "string",
      readOnly: true,
      hideInList: true,
    },
    {
      key: "productName",
      label: "Tên mẫu mã",
      type: "string",
      readOnly: true,
      hideInList: true,
    },
    { key: "colors", label: "Màu sắc", type: "tags", hideInList: true },
    { key: "sizes", label: "Size", type: "tags", hideInList: true },
    {
      key: "variantLabel",
      label: "Biến thể",
      type: "string",
      readOnly: true,
      hideInList: true,
    },
    {
      key: "providerId",
      label: "Nhà cung cấp",
      type: "string",
      hideInList: true,
    },
    {
      key: "weightGram",
      label: "Trọng lượng (g)",
      type: "number",
      hideInList: true,
    },
    { key: "lengthCm", label: "Dài (cm)", type: "number", hideInList: true },
    { key: "widthCm", label: "Rộng (cm)", type: "number", hideInList: true },
    { key: "heightCm", label: "Cao (cm)", type: "number", hideInList: true },
    {
      key: "packageWeightGram",
      label: "Trọng lượng gói hàng (g)",
      type: "number",
      hideInList: true,
    },
    {
      key: "packageLengthCm",
      label: "Dài đóng gói (cm)",
      type: "number",
      hideInList: true,
    },
    {
      key: "packageWidthCm",
      label: "Rộng đóng gói (cm)",
      type: "number",
      hideInList: true,
    },
    {
      key: "packageHeightCm",
      label: "Cao đóng gói (cm)",
      type: "number",
      hideInList: true,
    },
    {
      key: "manufactureYear",
      label: "Năm sản xuất",
      type: "number",
      hideInList: true,
    },
    {
      key: "composition",
      label: "Thành phần",
      type: "string",
      hideInList: true,
    },
    { key: "oddSize", label: "Đầy size", type: "string", hideInList: true },
    {
      key: "isGoldSilver",
      label: "Mặt hàng vàng bạc",
      type: "boolean",
      hideInList: true,
    },
    {
      key: "manageBarcodePerUnit",
      label: "Mã vạch theo đơn vị",
      type: "boolean",
      hideInList: true,
    },
    { key: "createdAt", label: "Ngày tạo", type: "date", hideInList: true },
  ],
  searchableFields: ["code", "name", "categoryName", "productName"],
  filterDefinitions: [
    {
      key: "isActive",
      label: "Trạng thái",
      type: "select",
      options: [
        { label: "Đang hoạt động", value: "true" },
        { label: "Ngừng kinh doanh", value: "false" },
      ],
    },
    {
      key: "isPosVisible",
      label: "Hiển thị POS",
      type: "select",
      options: [
        { label: "Có", value: "true" },
        { label: "Không", value: "false" },
      ],
    },
  ],
  permissions: {
    create: "inventory.write",
    read: "inventory.read",
    update: "inventory.write",
    delete: "inventory.write",
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.HARD,
};
