import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, In, Repository } from 'typeorm';
import { BranchStatus, PaginatedResponse } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ItemEntity } from '../../inventory/location/item.entity';
import { ProductEntity } from '../../inventory/product/product.entity';
import { StockBalanceEntity } from '../../inventory/ledger/stock-balance.entity';
import { LocationEntity } from '../../inventory/location/location.entity';
import { ShowroomEntity } from '../../inventory/location/showroom.entity';
import { StorageEntity } from '../../inventory/location/storage.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { TempWarehouseStagedStockService } from '../../inventory/temp-warehouse/temp-warehouse-staged-stock.service';
import { ItemCategoryEntity } from '../../inventory/location/item-category.entity';
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

/**
 * One page of card ids plus the total behind it. `stockByItem` is only set by
 * the ranking path, which cannot avoid totalling the whole branch and so has
 * nothing to gain from being asked again.
 */
type CardPage = {
  cardIds: string[];
  total: number;
  stockByItem?: Map<string, number>;
};

/** One catalogue card's display columns, as `loadCardDetails` returns them. */
type CardDetail = {
  kind: PosProductKind;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  unit: string;
  minPrice: number;
  maxPrice: number;
  variantCount: number;
  itemIds: string[];
};

/** Raw shape of a `loadCardDetails` row before the numeric columns are coerced. */
type CardDetailRow = {
  card_id: string;
  is_product: boolean;
  name: string;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  unit: string;
  min_price: string;
  max_price: string;
  variant_count: number;
  item_ids: string[];
};

/** Aggregated branch stock for a single item: total quantity plus per-location breakdown. */
type ItemStock = {
  total: number;
  /**
   * Projected on-hand at the branch's main (showroom) storages once every open
   * temp-warehouse line lands — booked stock there, plus stock staged into it,
   * minus stock staged out of it, floored at 0. A POS sale deducts in two beats
   * (`resolveBranchItemLocations(..., showroomOnly)`, then
   * `fulfillInvoiceFromTempWarehouse`), so this is what the oversell warning
   * has to compare against.
   */
  sellableTotal: number;
  locations: PosVariantLocationDto[];
};

/** A variant's attribute value annotated with its dimension sort order, for display ordering. */
type VariantAttr = { name: string; value: string; sortOrder: number };

/** Per-storage breakdown of a variant's stock at the current branch. */
type VariantStorageStock = {
  storageId: string;
  name: string;
  quantity: number;
  isMainShowroom: boolean;
};

/**
 * Per-item stock figures computed independently of `loadBranchStock`/`ItemStock`, used
 * only on the detail route (T-01-02 wires these into `PosProductVariantDto`). `storages`
 * — the current branch's per-storage breakdown — is added by T-02-01 on this same type;
 * wiring it into `PosProductVariantDto` is T-02-02.
 */
type VariantStockExtras = {
  /** Raw balance at the branch's main showroom storage (`showrooms.is_main_showroom`).
   * Not floored at 0, does not include temp-warehouse staging — see ADR-01/ADR-02. */
  mainShowroomQuantity: number;
  /** Total on-hand across every other ACTIVE branch's active storages. */
  otherBranchQuantity: number;
  /**
   * Every active storage of the current branch, including ones with a 0 balance for this
   * item (A-07). Sorted with the main showroom first, then by name (A-10).
   */
  storages: VariantStorageStock[];
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
    @InjectRepository(StorageEntity)
    private readonly storageRepo: Repository<StorageEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    @InjectRepository(ProductAttributeDefinitionEntity)
    private readonly attrDefRepo: Repository<ProductAttributeDefinitionEntity>,
    @InjectRepository(ItemAttributeValueEntity)
    private readonly itemAttrValueRepo: Repository<ItemAttributeValueEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categoryRepo: Repository<ItemCategoryEntity>,
    private readonly stagedStock: TempWarehouseStagedStockService,
    private readonly dataSource: DataSource,
  ) {}

  /** List sellable products (parent products + standalone items) with price range and branch stock. */
  async listProducts(
    branchId: string,
    actor: ActorContext,
    query: PosCatalogProductsQueryDto,
  ): Promise<PaginatedResponse<PosProductCardDto>> {
    const orgId = actor.organizationId;

    // Selecting a group shows that group AND all descendant groups (items are tagged to leaf
    // categories, so a parent group would otherwise be empty).
    const categoryIds = query.categoryId
      ? [...(await this.resolveDescendantCategoryIds(orgId, query.categoryId))]
      : null;

    const { cardIds, total, stockByItem: rankedStock } =
      query.sortBy === 'quantityOnHand'
        ? await this.rankCardsByStock(orgId, branchId, query, categoryIds)
        : await this.pageCardsInSql(orgId, query, categoryIds);

    const details = await this.loadCardDetails(orgId, cardIds);

    // The ranking path already had to total every item in the branch, so reuse
    // that map rather than asking again for a subset of what it just read.
    const stockByItem =
      rankedStock ??
      (await this.loadListStockTotals(
        orgId,
        branchId,
        query.direction,
        cardIds.flatMap((id) => details.get(id)?.itemIds ?? []),
      ));

    const data: PosProductCardDto[] = cardIds.flatMap((id) => {
      const card = details.get(id);
      // A card can only vanish between the two queries if it was deactivated
      // mid-request; dropping it beats returning a half-built row.
      if (!card) return [];
      return [
        {
          kind: card.kind,
          id,
          name: card.name,
          description: card.description,
          categoryId: card.categoryId,
          categoryName: card.categoryName,
          imageUrl: null,
          minPrice: card.minPrice,
          maxPrice: card.maxPrice,
          unit: card.unit,
          variantCount: card.variantCount,
          quantityOnHand: card.itemIds.reduce(
            (sum, itemId) => sum + (stockByItem.get(itemId) ?? 0),
            0,
          ),
        },
      ];
    });

    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * The fast path: the database filters, orders and paginates, so only one
   * page's worth of cards is ever built. Count and page are independent, so
   * they run together.
   */
  private async pageCardsInSql(
    orgId: string,
    query: PosCatalogProductsQueryDto,
    categoryIds: string[] | null,
  ): Promise<CardPage> {
    const [page, total] = await Promise.all([
      this.loadCardKeysPage(orgId, query, categoryIds),
      this.countCardKeys(orgId, query, categoryIds),
    ]);
    return { cardIds: page.map((k) => k.cardId), total };
  }

  /**
   * The slow path, for `sortBy=quantityOnHand` only. Ordering by stock cannot
   * be pushed into the card-key query the way name and price can: the total is
   * per branch, so every card's stock has to be known before the page can be
   * chosen. ADR-03 accepts this rather than dropping the sort.
   *
   * Kept as light as it can be — the card-to-items mapping is two columns, and
   * the display columns are still only fetched for the page that survives.
   */
  private async rankCardsByStock(
    orgId: string,
    branchId: string,
    query: PosCatalogProductsQueryDto,
    categoryIds: string[] | null,
  ): Promise<CardPage> {
    const params: unknown[] = [];
    const cte = this.cardKeysCte(orgId, categoryIds, query.search, params);
    const rows = await this.dataSource.query<
      { card_id: string; item_ids: string[] }[]
    >(
      `WITH card_keys AS (${cte})
       SELECT k.card_id::text AS card_id,
              array_agg(i.id::text) AS item_ids
         FROM card_keys k
         JOIN items i
           ON COALESCE(i.product_id, i.id) = k.card_id
          AND i.organization_id = $1
          AND i.is_active AND i.is_pos_visible
        GROUP BY k.card_id`,
      params,
    );

    // Branch-wide, with no itemIds narrowing: that is the whole reason this
    // path is the expensive one.
    const stockByItem = await this.loadListStockTotals(
      orgId,
      branchId,
      query.direction,
    );

    const direction = (query.sortOrder ?? 'asc') === 'desc' ? -1 : 1;
    const ranked = rows
      .map((r) => ({
        cardId: r.card_id,
        quantity: r.item_ids.reduce(
          (sum, id) => sum + (stockByItem.get(id) ?? 0),
          0,
        ),
      }))
      .sort((a, b) => (a.quantity - b.quantity) * direction);

    const start = (query.page - 1) * query.pageSize;
    return {
      cardIds: ranked
        .slice(start, start + query.pageSize)
        .map((r) => r.cardId),
      total: ranked.length,
      stockByItem,
    };
  }

  /**
   * The catalogue card set expressed as SQL: one row per parent product that
   * still has a POS-visible variant, plus one row per standalone POS-visible
   * item. Both arms carry every column the list can order by, so sorting and
   * pagination happen in the database rather than over the whole org catalogue
   * in memory.
   *
   * Written as a raw CTE rather than a QueryBuilder because a UNION ALL of two
   * differently-shaped arms, a collation-qualified ORDER BY and a HAVING over
   * an ordered aggregate are all outside what QueryBuilder expresses cleanly.
   * Every value is bound as a parameter; nothing is interpolated.
   *
   * `params` is appended to in place, and each `$n` below is the index the
   * value landed at.
   */
  private cardKeysCte(
    orgId: string,
    categoryIds: string[] | null,
    search: string | undefined,
    params: unknown[],
  ): string {
    const org = `$${params.push(orgId)}`;

    // A product card's category is the category of one representative variant.
    // `buildOrgCards` used "the first variant that has one" in whatever order
    // the rows came back, which is unspecified — ordering by item id makes the
    // same rule deterministic. On a production restore exactly 2 of 2,358
    // products have variants in more than one category, so this only decides a
    // case the previous code decided arbitrarily.
    const representativeCategory =
      "(array_agg(i.category_id ORDER BY i.id) FILTER (WHERE i.category_id IS NOT NULL))[1]";

    const categoryFilter = categoryIds
      ? `$${params.push(categoryIds)}::uuid[]`
      : null;

    // Matches what the in-memory filter did: one lowercased substring test over
    // the product/category name plus the code, name and variant label of every
    // variant. `bool_or` keeps it a filter on cards — a WHERE here would also
    // drop the non-matching variants from MIN/MAX and the variant count.
    //
    // Both sides have to be lowercased, not just the column: the caller's term
    // arrives as typed, so searching "Đầm" against `lower(name)` matches nothing.
    const needle = search?.trim().toLowerCase();
    const term = needle ? `$${params.push(`%${needle}%`)}` : null;
    const searchPredicate = (variantAlias: string, nameExpr: string) =>
      `(lower(${nameExpr}) LIKE ${term}` +
      ` OR lower(coalesce(c.name, '')) LIKE ${term}` +
      ` OR lower(${variantAlias}.code) LIKE ${term}` +
      ` OR lower(${variantAlias}.name) LIKE ${term}` +
      ` OR lower(coalesce(${variantAlias}.variant_label, '')) LIKE ${term})`;

    const productHaving = [
      categoryFilter ? `${representativeCategory} = ANY(${categoryFilter})` : null,
      term ? `bool_or(${searchPredicate('i', 'p.name')})` : null,
    ].filter(Boolean);

    const standaloneWhere = [
      categoryFilter ? `i.category_id = ANY(${categoryFilter})` : null,
      term ? searchPredicate('i', 'i.name') : null,
    ].filter(Boolean);

    return `
      SELECT p.id AS card_id,
             TRUE AS is_product,
             p.name AS name,
             MIN(i.selling_price) AS min_price,
             MAX(i.selling_price) AS max_price
        FROM products p
        JOIN items i
          ON i.product_id = p.id
         AND i.organization_id = ${org}
         AND i.is_active AND i.is_pos_visible
        LEFT JOIN inventory_item_categories c ON c.id = i.category_id
       WHERE p.organization_id = ${org}
       GROUP BY p.id, p.name
       ${productHaving.length ? `HAVING ${productHaving.join(' AND ')}` : ''}
      UNION ALL
      SELECT i.id, FALSE, i.name, i.selling_price, i.selling_price
        FROM items i
        LEFT JOIN inventory_item_categories c ON c.id = i.category_id
       WHERE i.organization_id = ${org}
         AND i.is_active AND i.is_pos_visible
         AND i.product_id IS NULL
         ${standaloneWhere.length ? `AND ${standaloneWhere.join(' AND ')}` : ''}
    `;
  }

  /**
   * ORDER BY fragment for the card-key query.
   *
   * The name arm carries an explicit ICU collation: the database is en_US.utf8,
   * under which a plain ORDER BY disagrees with the JS `localeCompare(name,
   * 'vi')` this replaced at 2,198 of 2,539 positions. See ADR-02.
   *
   * `quantityOnHand` is absent on purpose — it cannot be known before the page
   * is chosen, so `listProducts` routes that sort down a different path
   * (ADR-03).
   */
  private cardKeysOrderBy(query: PosCatalogProductsQueryDto): string {
    const direction = (query.sortOrder ?? 'asc') === 'desc' ? 'DESC' : 'ASC';
    switch (query.sortBy) {
      case 'minPrice':
        return `min_price ${direction}`;
      case 'maxPrice':
        return `max_price ${direction}`;
      case 'name':
      default:
        return `name COLLATE "vi-VN-x-icu" ${direction}`;
    }
  }

  /** One page of catalogue cards, ordered and paginated by the database. */
  private async loadCardKeysPage(
    orgId: string,
    query: PosCatalogProductsQueryDto,
    categoryIds: string[] | null,
  ): Promise<{ cardId: string; isProduct: boolean }[]> {
    const params: unknown[] = [];
    const cte = this.cardKeysCte(orgId, categoryIds, query.search, params);
    const limit = `$${params.push(query.pageSize)}`;
    const offset = `$${params.push((query.page - 1) * query.pageSize)}`;

    const rows = await this.dataSource.query<
      { card_id: string; is_product: boolean }[]
    >(
      `WITH card_keys AS (${cte})
       SELECT card_id, is_product FROM card_keys
        ORDER BY ${this.cardKeysOrderBy(query)}
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    return rows.map((r) => ({ cardId: r.card_id, isProduct: r.is_product }));
  }

  /** Total card count for the same filters, for the paginated envelope. */
  private async countCardKeys(
    orgId: string,
    query: PosCatalogProductsQueryDto,
    categoryIds: string[] | null,
  ): Promise<number> {
    const params: unknown[] = [];
    const cte = this.cardKeysCte(orgId, categoryIds, query.search, params);

    const rows = await this.dataSource.query<{ count: string }[]>(
      `WITH card_keys AS (${cte}) SELECT count(*)::text AS count FROM card_keys`,
      params,
    );

    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Display columns for one page of cards, keyed by card id.
   *
   * The fallback rules are the ones `buildOrgCards` used, kept deliberately:
   * a product card takes its name and description from the product and never
   * falls back to a variant's, while category and unit come from a
   * representative variant. "Representative" was previously whichever row the
   * driver happened to return first; ordering by item id makes that
   * deterministic without changing which value it picks for the 2,356 of 2,358
   * products whose variants agree.
   */
  private async loadCardDetails(
    orgId: string,
    cardIds: string[],
  ): Promise<Map<string, CardDetail>> {
    if (cardIds.length === 0) {
      return new Map();
    }

    const rows = await this.dataSource.query<CardDetailRow[]>(
      `SELECT COALESCE(i.product_id, i.id)::text AS card_id,
              (i.product_id IS NOT NULL) AS is_product,
              MAX(CASE WHEN i.product_id IS NOT NULL THEN p.name ELSE i.name END) AS name,
              MAX(CASE WHEN i.product_id IS NOT NULL THEN p.description ELSE i.description END) AS description,
              (array_agg(i.category_id ORDER BY i.id) FILTER (WHERE i.category_id IS NOT NULL))[1]::text AS category_id,
              (array_agg(c.name ORDER BY i.id) FILTER (WHERE c.name IS NOT NULL))[1] AS category_name,
              (array_agg(i.unit ORDER BY i.id))[1] AS unit,
              MIN(i.selling_price) AS min_price,
              MAX(i.selling_price) AS max_price,
              COUNT(*)::int AS variant_count,
              array_agg(i.id::text ORDER BY i.id) AS item_ids
         FROM items i
         LEFT JOIN products p ON p.id = i.product_id
         LEFT JOIN inventory_item_categories c ON c.id = i.category_id
        WHERE i.organization_id = $1
          AND i.is_active AND i.is_pos_visible
          AND COALESCE(i.product_id, i.id) = ANY($2::uuid[])
        GROUP BY COALESCE(i.product_id, i.id), (i.product_id IS NOT NULL)`,
      [orgId, cardIds],
    );

    return new Map(
      rows.map((r) => [
        r.card_id,
        {
          kind: (r.is_product ? 'PRODUCT' : 'ITEM') as PosProductKind,
          name: r.name,
          description: r.description ?? null,
          categoryId: r.category_id ?? null,
          categoryName: r.category_name ?? null,
          unit: r.unit,
          // `numeric` comes back as a string from the driver.
          minPrice: Number(r.min_price) || 0,
          maxPrice: Number(r.max_price) || 0,
          variantCount: r.variant_count,
          itemIds: r.item_ids,
        },
      ]),
    );
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
    const extrasByItem = await this.loadDetailStockExtras(orgId, branchId, itemIds);

    const variantDtos = variants.map((v) =>
      this.toVariantDto(v, attrByItem.get(v.id), stockByItem.get(v.id), extrasByItem.get(v.id)),
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
    const extrasByItem = await this.loadDetailStockExtras(orgId, branchId, [item.id]);
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
      variants: [
        this.toVariantDto(item, undefined, stockByItem.get(item.id), extrasByItem.get(item.id)),
      ],
    };
  }

  private toVariantDto(
    item: ItemEntity,
    attrs: VariantAttr[] | undefined,
    stock: ItemStock | undefined,
    extras: VariantStockExtras | undefined,
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
      sellableQuantity: stock?.sellableTotal ?? 0,
      locations: stock?.locations ?? [],
      mainShowroomQuantity: extras?.mainShowroomQuantity ?? 0,
      otherBranchQuantity: extras?.otherBranchQuantity ?? 0,
      storages: extras?.storages ?? [],
    };
  }

  /**
   * Sum branch stock per item for the *list* route: one aggregate query, no entity hydration.
   *
   * Deliberately not `loadBranchStock`. That method also produces `sellableTotal`, the
   * oversell-warning threshold two earlier features spent real effort defining, and ADR-01 of
   * pos-variant-stock-columns fences it off — a decision this route keeps rather than overturns.
   * The list route never reads `sellableTotal` or `locations`: `PosProductCardDto` has no field
   * for either, so the only figure it ever needed was the total, which SQL can sum without
   * materialising the branch's whole balance table as entities. That hydration is synchronous CPU
   * on the single Node thread, so loading ~14k rows to serve 30 cards inflated the latency of
   * every other in-flight request, not just this one.
   *
   * The filters mirror `loadBranchStock` case for case — including the two null-storage branches
   * below, which is where a naive `NOT IN` diverges. Changing a shared filter rule now means
   * moving three places together: here, `loadBranchStock`, and `loadDetailStockExtras`.
   */
  private async loadListStockTotals(
    orgId: string,
    branchId: string,
    direction?: PosCatalogDirection,
    itemIds?: string[],
  ): Promise<Map<string, number>> {
    // An empty page has no stock to look up, and `IN ()` is not valid SQL.
    if (itemIds && itemIds.length === 0) {
      return new Map();
    }

    let showroomStorageIds: string[] | null = null;
    if (direction) {
      // The same read loadBranchStock does for this branch. The ids are then bound as a
      // parameter rather than joined in raw SQL: stock_balances.branch_id is varchar while
      // showrooms.branch_id is uuid, and making one parameter serve both types is what forced
      // the casting notes in TempWarehouseStagedStockService.
      const showrooms = await this.showroomRepo.find({
        where: { organizationId: orgId, branchId },
      });
      showroomStorageIds = showrooms.map((s) => s.storageId);
      // A branch with no showroom configured is a valid state, not an error: SHOWROOM then
      // matches nothing at all, exactly as the in-memory filter did.
      if (
        direction === PosCatalogDirection.SHOWROOM &&
        showroomStorageIds.length === 0
      ) {
        return new Map();
      }
    }

    const qb = this.balanceRepo
      .createQueryBuilder('sb')
      // Drops stock at deactivated locations, which is what `if (!loc) continue` did.
      .innerJoin(
        LocationEntity,
        'l',
        'l.id = sb.locationId AND l.organizationId = :orgId AND l.isActive = true',
      )
      .select('sb.itemId', 'itemId')
      .addSelect('SUM(sb.quantity)', 'total')
      .where('sb.organizationId = :orgId')
      .andWhere('sb.branchId = :branchId')
      .andWhere('sb.isTracked = true')
      .groupBy('sb.itemId')
      .setParameters({ orgId, branchId });

    if (showroomStorageIds && showroomStorageIds.length > 0) {
      if (direction === PosCatalogDirection.SHOWROOM) {
        qb.andWhere('l.storageId IN (:...showroomStorageIds)', {
          showroomStorageIds,
        });
      } else {
        // `NOT IN` evaluates to NULL for a null storage_id and would drop the row; the
        // in-memory filter kept it, because `showroomStorageIds.has(undefined)` is false.
        qb.andWhere(
          '(l.storageId IS NULL OR l.storageId NOT IN (:...showroomStorageIds))',
          { showroomStorageIds },
        );
      }
    }

    // `quantity` is numeric, so SUM comes back as a string; one Number() per item rather than
    // the previous one per row, which is if anything less float drift, not more.
    // Narrowing to the page's items is what makes the list route cheap: the
    // branch-wide aggregate reads ~14,000 balance rows, one page's worth reads
    // a couple of hundred. Omitted only by the `sortBy=quantityOnHand` path,
    // which cannot know the page before it has every total (ADR-03).
    if (itemIds) {
      qb.andWhere('sb.itemId IN (:...itemIds)', { itemIds });
    }

    const rows = await qb.getRawMany<{ itemId: string; total: string }>();
    return new Map(rows.map((r) => [r.itemId, Number(r.total) || 0]));
  }

  /**
   * Sum branch stock per item from stock_balances, optionally restricted to a set of items and to
   * warehouse/showroom locations (matching PosCatalogService's showroom classification), and fold
   * in the branch's open temp-warehouse lines so `sellableTotal` matches what a sale can take.
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

    // Classification for the oversell-warning basis: the branch's main
    // storages, matching resolveBranchItemLocations(..., showroomOnly). This is
    // deliberately NOT the `showrooms` lookup below — that one classifies the
    // `direction` parameter for fast stock transfer and is left alone. Two
    // notions of "showroom" coexist here on purpose; this is the one that has
    // to predict where a sale deducts from.
    // Loaded by branch and filtered in memory, exactly as
    // resolveBranchItemLocations does — same query shape, same result set, so
    // the two cannot drift apart over a `where` clause.
    const branchStorages = await this.storageRepo.find({
      where: { organizationId: orgId, branchId },
    });
    const mainStorageIds = new Set(
      branchStorages.filter((st) => st.isMainStorage).map((st) => st.id),
    );

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
        agg = { total: 0, sellableTotal: 0, locations: [] };
        map.set(b.itemId, agg);
      }
      agg.total += qty;
      if (mainStorageIds.has(loc.storageId)) agg.sellableTotal += qty;
      agg.locations.push({ locationId: b.locationId, name: loc?.name ?? '', quantity: qty });
    }

    // Staged temp-warehouse stock has not moved in stock_balances yet, so the
    // booked showroom figure alone understates (or overstates) what the till
    // can sell. Floored at 0: a negative threshold warns on exactly the same
    // quantities as 0 does and reads as nonsense in the cashier's tooltip.
    const stagedDelta = await this.stagedStock.getBranchDelta(branchId, orgId);
    for (const [itemId, agg] of map.entries()) {
      agg.sellableTotal = Math.max(
        0,
        agg.sellableTotal + (stagedDelta.get(itemId) ?? 0),
      );
      agg.locations.sort(
        (x, y) => y.quantity - x.quantity || x.locationId.localeCompare(y.locationId),
      );
    }
    return map;
  }

  /**
   * Compute `mainShowroomQuantity`, `otherBranchQuantity` and the current branch's
   * per-storage breakdown (`storages`, T-02-01) per item — independent of `loadBranchStock`
   * (ADR-01: that method is not touched, so `sellableQuantity` cannot regress). Runs only on
   * the detail route, never on `listProducts`.
   *
   * Applies the same data filters as `loadBranchStock` (`stock_balances.is_tracked = true`,
   * `locations.is_active = true`, `organizationId` on every query), plus
   * `storages.is_active = true` and `branches.status = ACTIVE` for the cross-branch half
   * (A-08, A-09). A branch's row is attributed via `storage.branchId`, not
   * `stockBalance.branchId`, so the storage-active filter is applied in the same pass.
   *
   * `storages` lists every active storage of the current branch regardless of whether it has
   * any balance for the item (A-07) — built after the balance loop from `storagesById`, not
   * from the balances themselves, so a 0-quantity storage never disappears.
   */
  private async loadDetailStockExtras(
    orgId: string,
    branchId: string,
    itemIds: string[],
  ): Promise<Map<string, VariantStockExtras>> {
    const map = new Map<string, VariantStockExtras>();
    if (itemIds.length === 0) {
      return map;
    }

    const balances = await this.balanceRepo.find({
      where: {
        organizationId: orgId,
        itemId: In(itemIds),
        isTracked: true,
      },
    });

    const locationIds = [...new Set(balances.map((b) => b.locationId))];
    const [activeBranches, storages, mainShowroom, locations] = await Promise.all([
      this.branchRepo.find({
        where: { organizationId: orgId, status: BranchStatus.ACTIVE },
        select: ['id'],
      }),
      this.storageRepo.find({
        where: { organizationId: orgId, isActive: true },
      }),
      // A branch without a main-showroom record is not an error (A-12) — mainShowroomStorageId
      // stays null and every balance simply misses the mainShowroomQuantity bucket below.
      this.showroomRepo.findOne({
        where: { organizationId: orgId, branchId, isMainShowroom: true },
      }),
      locationIds.length
        ? this.locationRepo.find({
            where: { id: In(locationIds), organizationId: orgId, isActive: true },
          })
        : Promise.resolve([]),
    ]);

    const activeBranchIds = new Set(activeBranches.map((b) => b.id));
    const storagesById = new Map(storages.map((s) => [s.id, s]));
    const mainShowroomStorageId = mainShowroom?.storageId ?? null;
    const locById = new Map(locations.map((l) => [l.id, l]));
    // Only the current branch's storages ever show up in the `storages` breakdown.
    const currentBranchStorages = storages.filter((s) => s.branchId === branchId);

    const storageTotalsByItem = new Map<string, Map<string, number>>();

    for (const b of balances) {
      const loc = locById.get(b.locationId);
      if (!loc) continue;
      // Missing from storagesById means the storage is deactivated (A-08) — skip the balance
      // entirely rather than folding it into either bucket.
      const storage = storagesById.get(loc.storageId);
      if (!storage) continue;

      const qty = Number(b.quantity) || 0;
      let extras = map.get(b.itemId);
      if (!extras) {
        extras = { mainShowroomQuantity: 0, otherBranchQuantity: 0, storages: [] };
        map.set(b.itemId, extras);
      }

      if (storage.branchId === branchId) {
        if (storage.id === mainShowroomStorageId) {
          extras.mainShowroomQuantity += qty;
        }
        const totals = storageTotalsByItem.get(b.itemId) ?? new Map<string, number>();
        totals.set(storage.id, (totals.get(storage.id) ?? 0) + qty);
        storageTotalsByItem.set(b.itemId, totals);
      } else if (storage.branchId && activeBranchIds.has(storage.branchId)) {
        extras.otherBranchQuantity += qty;
      }
    }

    for (const itemId of itemIds) {
      const extras = map.get(itemId) ?? {
        mainShowroomQuantity: 0,
        otherBranchQuantity: 0,
        storages: [],
      };
      const totals = storageTotalsByItem.get(itemId);
      extras.storages = currentBranchStorages
        .map((s) => ({
          storageId: s.id,
          name: s.name,
          quantity: totals?.get(s.id) ?? 0,
          isMainShowroom: s.id === mainShowroomStorageId,
        }))
        .sort((a, b) => {
          if (a.isMainShowroom !== b.isMainShowroom) {
            return a.isMainShowroom ? -1 : 1;
          }
          return a.name.localeCompare(b.name, 'vi');
        });
      map.set(itemId, extras);
    }

    return map;
  }
}
