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
import { ProductAttributeDefinitionEntity } from '../../inventory/product/product-attribute-definition.entity';
import { ItemAttributeValueEntity } from '../../inventory/product/item-attribute-value.entity';
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
  ) {}

  /** List sellable products (parent products + standalone items) with price range and branch stock. */
  async listProducts(
    branchId: string,
    actor: ActorContext,
    query: PosCatalogProductsQueryDto,
  ): Promise<PaginatedResponse<PosProductCardDto>> {
    const orgId = actor.organizationId;

    const items = await this.itemRepo.find({
      where: { organizationId: orgId, isActive: true, isPosVisible: true },
      relations: ['product', 'category'],
    });

    const stockByItem = await this.loadBranchStock(orgId, branchId, query.direction);

    type CardAgg = {
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
      quantityOnHand: number;
      /** Lowercased haystack (product/item names, variant codes/labels, category) for search. */
      search: string;
    };

    const cards = new Map<string, CardAgg>();

    for (const item of items) {
      const isProduct = !!item.productId && !!item.product;
      const key = isProduct ? `product:${item.productId}` : `item:${item.id}`;
      const price = Number(item.sellingPrice) || 0;
      const qty = stockByItem.get(item.id)?.total ?? 0;

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
          quantityOnHand: 0,
          search: '',
        };
        cards.set(key, card);
      }

      card.minPrice = Math.min(card.minPrice, price);
      card.maxPrice = Math.max(card.maxPrice, price);
      card.variantCount += 1;
      card.quantityOnHand += qty;
      card.search += ` ${item.code} ${item.name} ${item.variantLabel ?? ''}`;
      // A card's category falls back to the first variant that has one.
      if (!card.categoryId && item.categoryId) {
        card.categoryId = item.categoryId;
        card.categoryName = item.category?.name ?? null;
      }
    }

    let list = [...cards.values()];
    for (const c of list) {
      c.search = `${c.name} ${c.categoryName ?? ''}${c.search}`.toLowerCase();
    }

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
      where: { id: In(locationIds), organizationId: orgId },
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
