import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { PaginatedResponse } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ItemEntity } from '../../inventory/location/item.entity';
import { ProductEntity } from '../../inventory/product/product.entity';
import { StockBalanceEntity } from '../../inventory/ledger/stock-balance.entity';
import { LocationEntity } from '../../inventory/location/location.entity';
import { ShowroomEntity } from '../../inventory/location/showroom.entity';
import { ItemCategoryEntity } from '../../inventory/location/item-category.entity';
import { ProductAttributeDefinitionEntity } from '../../inventory/product/product-attribute-definition.entity';
import { ItemAttributeValueEntity } from '../../inventory/product/item-attribute-value.entity';
import { CacheService } from '../../redis/cache.service';
import {
  CATALOG_CACHE_NAMESPACE,
  CATALOG_CACHE_TTL_SECONDS,
  catalogCardsKey,
} from '../pos-catalog-cache.constants';
import { PosCatalogDirection } from '../dto/pos-catalog.query.dto';
import {
  PosCatalogProductsQueryDto,
  PosProductKind,
} from '../dto/pos-catalog-products.query.dto';
import {
  PosProductCardDto,
  PosProductDetailDto,
  PosProductVariantDto,
  PosVariantLocationDto,
} from '../dto/pos-catalog-product.response.dto';

/** Aggregated branch stock for a single item: total quantity plus per-location breakdown. */
type ItemStock = { total: number; locations: PosVariantLocationDto[] };

/** A variant's attribute value annotated with its dimension sort order, for display ordering. */
type VariantAttr = { name: string; value: string; sortOrder: number };

/**
 * A catalog card without volatile branch stock — org-scoped and stable, so it can be cached and
 * reused across branches. `itemIds` retains the member items so live stock can be summed per card
 * at request time. Everything here is derived from item/product/category data only.
 */
type CachedCard = {
  kind: PosProductKind;
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  unit: string;
  minPrice: number;
  maxPrice: number;
  variantCount: number;
  itemIds: string[];
  /** Lowercased haystack (product/item names, variant codes/labels, category) for search. */
  search: string;
};


/**
 * Product-level POS catalog. Unlike the flat per-SKU catalog (PosCatalogService), this groups
 * variant items under their parent product and exposes standalone items (product_id = null) as
 * their own cards. Items are organization-scoped; stock is branch-scoped. All grouping/aggregation
 * is done in memory (no SQL GROUP BY).
 */
@Injectable()
export class PosCatalogProductService {
  constructor(
    @InjectRepository(ItemEntity)
    private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(StockBalanceEntity)
    private readonly balanceRepo: Repository<StockBalanceEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    @InjectRepository(ShowroomEntity)
    private readonly showroomRepo: Repository<ShowroomEntity>,
    @InjectRepository(ProductAttributeDefinitionEntity)
    private readonly attrDefRepo: Repository<ProductAttributeDefinitionEntity>,
    @InjectRepository(ItemAttributeValueEntity)
    private readonly itemAttrValueRepo: Repository<ItemAttributeValueEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categoryRepo: Repository<ItemCategoryEntity>,
    private readonly cacheService: CacheService,
  ) {}

  /** List sellable products (parent products + standalone items) with price range and branch stock. */
  async listProducts(
    branchId: string,
    actor: ActorContext,
    query: PosCatalogProductsQueryDto,
  ): Promise<PaginatedResponse<PosProductCardDto>> {
    const orgId = actor.organizationId;

    // Org-scoped card skeleton (name/price/category/membership) is stable → cache it. Branch stock
    // stays live so quantities never go stale; category filtering runs in memory over the cache so a
    // single cache entry serves every category filter.
    const cards = await this.cacheService.getOrSet<CachedCard[]>(
      CATALOG_CACHE_NAMESPACE,
      catalogCardsKey(orgId),
      () => this.buildOrgCards(orgId),
      CATALOG_CACHE_TTL_SECONDS,
    );

    const stockByItem = await this.loadBranchStock(orgId, branchId, query.direction);

    // Selecting a group shows that group AND all descendant groups (items are tagged to leaf
    // categories, so a parent group would otherwise be empty).
    const allowedCategoryIds = query.categoryId
      ? await this.resolveDescendantCategoryIds(orgId, query.categoryId)
      : null;

    let list = cards
      .filter(
        (c) =>
          !allowedCategoryIds ||
          (c.categoryId != null && allowedCategoryIds.has(c.categoryId)),
      )
      .map((c) => ({
        ...c,
        quantityOnHand: c.itemIds.reduce(
          (sum, id) => sum + (stockByItem.get(id)?.total ?? 0),
          0,
        ),
      }));

    const search = query.search?.trim().toLowerCase();
    if (search) {
      list = list.filter((c) => c.search.includes(search));
    }

    const sortBy = query.sortBy ?? 'name';
    const dir = (query.sortOrder ?? 'asc') === 'desc' ? -1 : 1;
    list.sort((a, b) => {
      switch (sortBy) {
        case 'minPrice':
          return (a.minPrice - b.minPrice) * dir;
        case 'maxPrice':
          return (a.maxPrice - b.maxPrice) * dir;
        case 'quantityOnHand':
          return (a.quantityOnHand - b.quantityOnHand) * dir;
        case 'name':
        default:
          return a.name.localeCompare(b.name, 'vi') * dir;
      }
    });

    const total = list.length;
    const start = (query.page - 1) * query.pageSize;
    const pageItems = list.slice(start, start + query.pageSize);

    const data: PosProductCardDto[] = pageItems.map((c) => ({
      kind: c.kind,
      id: c.id,
      name: c.name,
      description: c.description,
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      imageUrl: null,
      minPrice: c.minPrice,
      maxPrice: c.maxPrice,
      unit: c.unit,
      variantCount: c.variantCount,
      quantityOnHand: c.quantityOnHand,
    }));

    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Build the org-scoped catalog card skeleton (no branch stock). Loads only the columns needed for
   * grouping/display instead of hydrating full item + relation entities, then groups variant items
   * under their parent product. Cached by listProducts and invalidated on item/product writes.
   */
  private async buildOrgCards(orgId: string): Promise<CachedCard[]> {
    const items = await this.itemRepo
      .createQueryBuilder('i')
      .leftJoin('i.product', 'p')
      .leftJoin('i.category', 'c')
      .select([
        'i.id',
        'i.code',
        'i.name',
        'i.variantLabel',
        'i.unit',
        'i.sellingPrice',
        'i.categoryId',
        'i.productId',
        'i.description',
        'p.id',
        'p.name',
        'p.description',
        'c.id',
        'c.name',
      ])
      .where('i.organizationId = :orgId', { orgId })
      .andWhere('i.isActive = true')
      .andWhere('i.isPosVisible = true')
      .getMany();

    const cards = new Map<string, CachedCard>();

    for (const item of items) {
      const isProduct = !!item.productId && !!item.product;
      const key = isProduct ? `product:${item.productId}` : `item:${item.id}`;
      const price = Number(item.sellingPrice) || 0;

      let card = cards.get(key);
      if (!card) {
        card = {
          kind: isProduct ? 'PRODUCT' : 'ITEM',
          id: isProduct ? item.productId! : item.id,
          name: isProduct ? item.product!.name : item.name,
          description: (isProduct ? item.product!.description : item.description) ?? null,
          categoryId: item.categoryId ?? null,
          categoryName: item.category?.name ?? null,
          unit: item.unit,
          minPrice: price,
          maxPrice: price,
          variantCount: 0,
          itemIds: [],
          search: '',
        };
        cards.set(key, card);
      }

      card.minPrice = Math.min(card.minPrice, price);
      card.maxPrice = Math.max(card.maxPrice, price);
      card.variantCount += 1;
      card.itemIds.push(item.id);
      card.search += ` ${item.code} ${item.name} ${item.variantLabel ?? ''}`;
      // A card's category falls back to the first variant that has one.
      if (!card.categoryId && item.categoryId) {
        card.categoryId = item.categoryId;
        card.categoryName = item.category?.name ?? null;
      }
    }

    const list = [...cards.values()];
    for (const c of list) {
      c.search = `${c.name} ${c.categoryName ?? ''}${c.search}`.toLowerCase();
    }
    return list;
  }

  /**
   * Resolve a category to itself plus all of its descendant categories (adjacency list walk over the
   * org's `parent_group_id` chain), so a parent-group filter includes every sub-group's items.
   */
  private async resolveDescendantCategoryIds(
    orgId: string,
    rootId: string,
  ): Promise<Set<string>> {
    const categories = await this.categoryRepo.find({
      where: { organizationId: orgId },
      select: ['id', 'parentGroupId'],
    });
    const childrenByParent = new Map<string, string[]>();
    for (const c of categories) {
      if (!c.parentGroupId) continue;
      const siblings = childrenByParent.get(c.parentGroupId) ?? [];
      siblings.push(c.id);
      childrenByParent.set(c.parentGroupId, siblings);
    }

    const result = new Set<string>([rootId]);
    const queue = [rootId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const child of childrenByParent.get(current) ?? []) {
        if (!result.has(child)) {
          result.add(child);
          queue.push(child);
        }
      }
    }
    return result;
  }

  /** Drop the cached org catalog skeleton after an item/product write so the next list rebuilds it. */
  async invalidateCatalogCache(orgId: string): Promise<void> {
    await this.cacheService.invalidate(
      CATALOG_CACHE_NAMESPACE,
      catalogCardsKey(orgId),
    );
  }

  /** Resolve a card id to a product (with its variants) or a standalone item, then build detail. */
  async getProductDetail(
    branchId: string,
    id: string,
    kind: PosProductKind | undefined,
    actor: ActorContext,
  ): Promise<PosProductDetailDto> {
    const orgId = actor.organizationId;

    if (kind !== 'ITEM') {
      const product = await this.productRepo.findOne({
        where: { id, organizationId: orgId },
      });
      if (product) {
        return this.buildProductDetail(product, branchId, orgId);
      }
      if (kind === 'PRODUCT') {
        throw new NotFoundException(`Product ${id} not found`);
      }
    }

    const item = await this.itemRepo.findOne({
      where: { id, organizationId: orgId },
      relations: ['category'],
    });
    if (!item) {
      throw new NotFoundException(`Catalog product ${id} not found`);
    }
    return this.buildItemDetail(item, branchId, orgId);
  }

  private async buildProductDetail(
    product: ProductEntity,
    branchId: string,
    orgId: string,
  ): Promise<PosProductDetailDto> {
    const variants = await this.itemRepo.find({
      where: {
        productId: product.id,
        organizationId: orgId,
        isActive: true,
        isPosVisible: true,
      },
      relations: ['category'],
    });
    const itemIds = variants.map((v) => v.id);

    const definitions = await this.attrDefRepo.find({
      where: { productId: product.id },
      relations: ['options'],
      order: { sortOrder: 'ASC' },
    });
    const attributes = definitions.map((d) => ({
      name: d.name,
      options: (d.options ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((o) => o.valueLabel),
    }));

    const attrValues = itemIds.length
      ? await this.itemAttrValueRepo.find({
          where: { itemId: In(itemIds) },
          relations: ['attributeDefinition', 'option'],
        })
      : [];
    const attrByItem = new Map<string, VariantAttr[]>();
    for (const av of attrValues) {
      const arr = attrByItem.get(av.itemId) ?? [];
      arr.push({
        name: av.attributeDefinition?.name ?? '',
        value: av.option?.valueLabel ?? '',
        sortOrder: av.attributeDefinition?.sortOrder ?? 0,
      });
      attrByItem.set(av.itemId, arr);
    }

    const stockByItem = await this.loadBranchStock(orgId, branchId, undefined, itemIds);

    const variantDtos = variants.map((v) =>
      this.toVariantDto(v, attrByItem.get(v.id), stockByItem.get(v.id)),
    );

    const prices = variants.map((v) => Number(v.sellingPrice) || 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;
    const categoryRef = variants.find((v) => v.category)?.category ?? null;

    return {
      kind: 'PRODUCT',
      id: product.id,
      name: product.name,
      description: product.description ?? null,
      categoryId: categoryRef?.id ?? null,
      categoryName: categoryRef?.name ?? null,
      imageUrl: null,
      isActive: product.isActive,
      minPrice,
      maxPrice,
      attributes,
      variants: variantDtos,
    };
  }

  private async buildItemDetail(
    item: ItemEntity,
    branchId: string,
    orgId: string,
  ): Promise<PosProductDetailDto> {
    const stockByItem = await this.loadBranchStock(orgId, branchId, undefined, [item.id]);
    const price = Number(item.sellingPrice) || 0;
    return {
      kind: 'ITEM',
      id: item.id,
      name: item.name,
      description: item.description ?? null,
      categoryId: item.categoryId ?? null,
      categoryName: item.category?.name ?? null,
      imageUrl: null,
      isActive: item.isActive,
      minPrice: price,
      maxPrice: price,
      attributes: [],
      variants: [this.toVariantDto(item, undefined, stockByItem.get(item.id))],
    };
  }

  private toVariantDto(
    item: ItemEntity,
    attrs: VariantAttr[] | undefined,
    stock: ItemStock | undefined,
  ): PosProductVariantDto {
    const attributes = (attrs ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((a) => ({ name: a.name, value: a.value }));
    return {
      itemId: item.id,
      code: item.code,
      name: item.name,
      variantLabel: item.variantLabel ?? null,
      unit: item.unit,
      sellingPrice: Number(item.sellingPrice) || 0,
      imageUrl: null,
      attributes,
      quantityOnHand: stock?.total ?? 0,
      locations: stock?.locations ?? [],
    };
  }

  /**
   * Sum branch stock per item from stock_balances, optionally restricted to a set of items and to
   * warehouse/showroom locations (matching PosCatalogService's showroom classification).
   */
  private async loadBranchStock(
    orgId: string,
    branchId: string,
    direction?: PosCatalogDirection,
    itemIds?: string[],
  ): Promise<Map<string, ItemStock>> {
    if (itemIds && itemIds.length === 0) {
      return new Map();
    }

    const where: FindOptionsWhere<StockBalanceEntity> = {
      organizationId: orgId,
      branchId,
      // Bán hàng không hiện tồn ở chi tiết đã ngừng theo dõi.
      isTracked: true,
    };
    if (itemIds) {
      where.itemId = In(itemIds);
    }
    const balances = await this.balanceRepo.find({ where });
    if (balances.length === 0) {
      return new Map();
    }

    const locationIds = [...new Set(balances.map((b) => b.locationId))];
    const locations = await this.locationRepo.find({
      where: { id: In(locationIds), organizationId: orgId, isActive: true },
    });
    const locById = new Map(locations.map((l) => [l.id, l]));

    let showroomStorageIds: Set<string> | null = null;
    if (direction) {
      const showrooms = await this.showroomRepo.find({
        where: { organizationId: orgId, branchId },
      });
      showroomStorageIds = new Set(showrooms.map((s) => s.storageId));
    }

    const map = new Map<string, ItemStock>();
    for (const b of balances) {
      const loc = locById.get(b.locationId);
      // Bỏ qua tồn ở vị trí đã ngừng hoạt động (không có trong locById).
      if (!loc) continue;
      if (direction && showroomStorageIds) {
        const isShowroom = loc ? showroomStorageIds.has(loc.storageId) : false;
        const wantShowroom = direction === PosCatalogDirection.SHOWROOM;
        if (isShowroom !== wantShowroom) {
          continue;
        }
      }
      const qty = Number(b.quantity) || 0;
      let agg = map.get(b.itemId);
      if (!agg) {
        agg = { total: 0, locations: [] };
        map.set(b.itemId, agg);
      }
      agg.total += qty;
      agg.locations.push({ locationId: b.locationId, name: loc?.name ?? '', quantity: qty });
    }

    for (const agg of map.values()) {
      agg.locations.sort(
        (x, y) => y.quantity - x.quantity || x.locationId.localeCompare(y.locationId),
      );
    }
    return map;
  }
}
