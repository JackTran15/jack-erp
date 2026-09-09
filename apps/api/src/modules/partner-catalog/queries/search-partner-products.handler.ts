import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemCategoryEntity } from '../../inventory/location/item-category.entity';
import { ItemEntity } from '../../inventory/location/item.entity';
import { collectCategorySubtreeIds } from '../category-subtree.util';
import {
  PartnerProductRowDto,
  PartnerProductSearchResponseDto,
} from '../dto/partner-product-search.dto';
import {
  ATTRIBUTE_ALIASES,
  ATTRIBUTE_COLOR,
  ATTRIBUTE_SIZE,
} from '../partner-catalog.constants';
import { resolveProductOrderBy } from '../partner-product-sort';
import { inStockExistsSql, resolveStockBranchIds } from '../partner-stock.sql';
import { SearchPartnerProductsQuery } from './search-partner-products.query';

interface CountRow {
  total: number;
}

interface RawProductRow {
  id: string;
  code: string | null;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  priceMin: number;
  priceMax: number;
  inStock: boolean;
}

interface FacetRow {
  productId: string;
  colors: string[] | null;
  sizes: string[] | null;
}

export interface ProductSearchSqlParts {
  where: string[];
  having: string[];
  orderBy: string;
  inStockExpr: string;
  /** Placeholders for the colour/size dimension-name alias arrays, when filtering. */
  attributeNames?: { colorParam: string; sizeParam: string };
}

/**
 * The partner listing query.
 *
 * Two facts about this schema drive the shape:
 *
 *  - Price lives on the VARIANT (`items.selling_price`), never on the product,
 *    so a product's price is a MIN/MAX range across its active variants.
 *  - Category also lives on the variant (`items.category_id`); `products` has
 *    no category column at all.
 *
 * `::float` on the money columns is load-bearing: TypeORM returns `numeric` as
 * a *string*, which would put `"750000.00"` into the partner's JSON.
 *
 * Every product-level predicate goes in HAVING, never inside `active_items`.
 * Filtering the variant set would recompute MIN/MAX over only the matching
 * variants, so searching for "size 39" would silently change the product's
 * displayed price range.
 *
 * Items with no parent product (`product_id IS NULL`) are out of scope: the
 * storefront sells products, and a standalone stock row has no product page.
 */
export function buildProductSearchSql(parts: ProductSearchSqlParts): {
  dataSql: string;
  countSql: string;
} {
  const { where, having, orderBy, inStockExpr, attributeNames } = parts;
  const whereSql = where.length > 0 ? `AND ${where.join(' AND ')}` : '';
  const havingSql = having.length > 0 ? `HAVING ${having.join(' AND ')}` : '';

  // The attribute roll-up costs ~100 ms on the reference dataset, so it is only
  // joined in when a colour or size filter is actually present. Without one the
  // query stays at ~19 ms.
  const attrCte = attributeNames
    ? `
    item_attrs AS (
      SELECT
        iav.item_id,
        array_agg(DISTINCT o.value_label)
          FILTER (WHERE lower(d.name) = ANY(${attributeNames.colorParam}::varchar[])) AS colors,
        array_agg(DISTINCT o.value_label)
          FILTER (WHERE lower(d.name) = ANY(${attributeNames.sizeParam}::varchar[])) AS sizes
      FROM item_attribute_values iav
      JOIN items scoped ON scoped.id = iav.item_id AND scoped.organization_id = $1
      JOIN product_attribute_options o ON o.id = iav.option_id
      JOIN product_attribute_definitions d ON d.id = iav.attribute_definition_id
      GROUP BY iav.item_id
    ),`
    : '';

  // `varchar[]`, not `text[]`: value_label is varchar and the `&&` operator has
  // no varchar[]/text[] overload, so a text[] cast fails at runtime.
  const attrCols = attributeNames
    ? `COALESCE(ia.colors, '{}'::varchar[]) AS colors,
       COALESCE(ia.sizes, '{}'::varchar[]) AS sizes`
    : `'{}'::varchar[] AS colors, '{}'::varchar[] AS sizes`;
  const attrJoin = attributeNames
    ? 'LEFT JOIN item_attrs ia ON ia.item_id = i.id'
    : '';

  const cte = `
    WITH ${attrCte}
    active_items AS (
      SELECT i.id, i.product_id, i.code, i.category_id, i.selling_price,
             ${attrCols}
      FROM items i
      ${attrJoin}
      WHERE i.organization_id = $1
        AND i.is_active = true
        AND i.product_id IS NOT NULL
    ),
    agg AS (
      SELECT
        p.id,
        p.code,
        p.name,
        p.created_at,
        MIN(ai.selling_price)::float AS "priceMin",
        MAX(ai.selling_price)::float AS "priceMax",
        -- Category of the lowest-coded variant that actually has one, so a
        -- product whose variants span categories still reports one stable value.
        (array_agg(ai.category_id ORDER BY ai.code ASC)
           FILTER (WHERE ai.category_id IS NOT NULL))[1] AS "categoryId",
        -- A product is in stock when ANY active variant is.
        bool_or(${inStockExpr}) AS "inStock"
      FROM products p
      JOIN active_items ai ON ai.product_id = p.id
      WHERE p.organization_id = $1
        AND p.is_active = true
        ${whereSql}
      GROUP BY p.id, p.code, p.name, p.created_at
      ${havingSql}
    )
  `;

  return {
    dataSql: `
      ${cte}
      SELECT a.id, a.code, a.name, a."priceMin", a."priceMax",
             a."categoryId", a."inStock", c.name AS "categoryName"
      FROM agg a
      LEFT JOIN inventory_item_categories c ON c.id = a."categoryId"
      ORDER BY ${orderBy}
      LIMIT $LIMIT OFFSET $OFFSET
    `,
    countSql: `
      ${cte}
      SELECT COUNT(*)::int AS total FROM agg
    `,
  };
}

/**
 * Colour and size values for the products on the current page.
 *
 * Run as a second, tiny query keyed on the page's product ids rather than
 * aggregated into the main statement. Postgres will not nest an aggregate
 * inside an aggregate, so collecting per-product arrays in the grouped query
 * needs contortions; twenty ids and one indexed lookup is both faster to run
 * and far easier to read.
 */
const FACETS_SQL = `
  SELECT
    i.product_id AS "productId",
    array_agg(DISTINCT o.value_label)
      FILTER (WHERE lower(d.name) = ANY($2::varchar[])) AS colors,
    array_agg(DISTINCT o.value_label)
      FILTER (WHERE lower(d.name) = ANY($3::varchar[])) AS sizes
  FROM items i
  JOIN item_attribute_values iav ON iav.item_id = i.id
  JOIN product_attribute_options o ON o.id = iav.option_id
  JOIN product_attribute_definitions d ON d.id = iav.attribute_definition_id
  WHERE i.organization_id = $1
    AND i.is_active = true
    AND i.product_id = ANY($4::uuid[])
  GROUP BY i.product_id
`;

const COLOR_ALIASES = ATTRIBUTE_ALIASES[ATTRIBUTE_COLOR] ?? [];
const SIZE_ALIASES = ATTRIBUTE_ALIASES[ATTRIBUTE_SIZE] ?? [];

@QueryHandler(SearchPartnerProductsQuery)
export class SearchPartnerProductsHandler
  implements IQueryHandler<SearchPartnerProductsQuery>
{
  constructor(
    @InjectRepository(ItemEntity)
    private readonly items: Repository<ItemEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categories: Repository<ItemCategoryEntity>,
  ) {}

  async execute({
    dto,
    actor,
  }: SearchPartnerProductsQuery): Promise<PartnerProductSearchResponseDto> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    // $1 is the organization id throughout the CTE; filter params follow.
    const params: unknown[] = [actor.organizationId];
    const where: string[] = [];
    const having: string[] = [];

    if (dto.categoryId) {
      // Expanded in JS from the org's 60-odd categories rather than with a
      // recursive CTE: the category-tree endpoint needs the same expansion, and
      // one shared implementation cannot drift from itself.
      const rows = await this.categories.find({
        where: { organizationId: actor.organizationId },
        select: { id: true, parentGroupId: true },
      });
      const subtree = collectCategorySubtreeIds(
        dto.categoryId,
        rows.map((r) => ({ id: r.id, parentGroupId: r.parentGroupId ?? null })),
      );
      // An id from another organization expands to nothing, which matches zero
      // products rather than raising or confirming that the id exists.
      params.push(subtree);
      having.push(`bool_or(ai.category_id = ANY($${params.length}::uuid[]))`);
    }

    const keyword = dto.keyword?.trim();
    if (keyword) {
      params.push(`%${escapeLike(keyword)}%`);
      const p = `$${params.length}`;
      // bool_or over the already-joined variants, NOT `OR EXISTS`. Measured on
      // the reference dataset: the correlated form runs 290 ms against 19 ms,
      // the same trap the POS catalogue search hit.
      having.push(
        `(p.name ILIKE ${p} OR p.code ILIKE ${p} OR bool_or(ai.code ILIKE ${p}))`,
      );
    }

    // Price, colour and size must all be satisfied by the SAME variant: a
    // shopper asking for "BA in size 39" wants one shoe, not a product that
    // happens to exist in BA and, separately, in 39. So they are ANDed INSIDE a
    // single bool_or over variants, never as separate product-level clauses.
    const variantPredicates: string[] = [];
    const wantsAttributes =
      (dto.colors?.length ?? 0) > 0 || (dto.sizes?.length ?? 0) > 0;
    let attributeNames: { colorParam: string; sizeParam: string } | undefined;

    if (wantsAttributes) {
      params.push(COLOR_ALIASES);
      const colorParam = `$${params.length}`;
      params.push(SIZE_ALIASES);
      const sizeParam = `$${params.length}`;
      attributeNames = { colorParam, sizeParam };

      if (dto.colors?.length) {
        params.push(dto.colors);
        variantPredicates.push(`ai.colors && $${params.length}::varchar[]`);
      }
      if (dto.sizes?.length) {
        params.push(dto.sizes);
        variantPredicates.push(`ai.sizes && $${params.length}::varchar[]`);
      }
    }

    if (dto.priceFrom !== undefined) {
      params.push(dto.priceFrom);
      variantPredicates.push(`ai.selling_price >= $${params.length}`);
    }
    if (dto.priceTo !== undefined) {
      params.push(dto.priceTo);
      variantPredicates.push(`ai.selling_price <= $${params.length}`);
    }
    if (variantPredicates.length > 0) {
      having.push(`bool_or(${variantPredicates.join(' AND ')})`);
    }

    // Stock is scoped to the branches this credential may see. X-Branch-Id
    // deliberately plays no part: the partner catalogue is an organization-wide
    // view, so the same key gives the same answer whatever branch is named.
    const branchIds = resolveStockBranchIds(actor.branchIds);
    let branchParam: string | undefined;
    if (branchIds) {
      params.push(branchIds);
      branchParam = `$${params.length}`;
    }

    const { dataSql, countSql } = buildProductSearchSql({
      where,
      having,
      orderBy: resolveProductOrderBy(dto.sort),
      inStockExpr: inStockExistsSql({
        itemIdExpr: 'ai.id',
        orgParam: '$1',
        branchParam,
      }),
      attributeNames,
    });

    const paginated = dataSql
      .replace('$LIMIT', `$${params.length + 1}`)
      .replace('$OFFSET', `$${params.length + 2}`);

    const [rows, countResult] = await Promise.all([
      this.items.manager.query<RawProductRow[]>(paginated, [
        ...params,
        limit,
        offset,
      ]),
      this.items.manager.query<CountRow[]>(countSql, params),
    ]);

    const facets = await this.loadFacets(
      actor.organizationId,
      rows.map((r) => r.id),
    );

    return {
      data: rows.map((raw) => toRow(raw, facets.get(raw.id))),
      total: countResult[0]?.total ?? 0,
      page,
      limit,
    };
  }

  private async loadFacets(
    organizationId: string,
    productIds: string[],
  ): Promise<Map<string, FacetRow>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.items.manager.query<FacetRow[]>(FACETS_SQL, [
      organizationId,
      COLOR_ALIASES,
      SIZE_ALIASES,
      productIds,
    ]);
    return new Map(rows.map((r) => [r.productId, r]));
  }
}

/**
 * `images` is permanently empty: this ERP has nowhere to store one. The field
 * exists so images can appear later without a breaking change.
 */
function toRow(raw: RawProductRow, facet?: FacetRow): PartnerProductRowDto {
  return {
    id: raw.id,
    code: raw.code ?? null,
    name: raw.name,
    categoryId: raw.categoryId ?? null,
    categoryName: raw.categoryName ?? null,
    priceMin: raw.priceMin,
    priceMax: raw.priceMax,
    // Raw ERP codes, deliberately unmapped — this catalogue stores short
    // internal colour codes and has no display name or hex value for them.
    colors: sorted(facet?.colors),
    sizes: sorted(facet?.sizes),
    inStock: raw.inStock ?? false,
    images: [],
  };
}

function sorted(values: string[] | null | undefined): string[] {
  return values ? [...values].sort((a, b) => a.localeCompare(b, 'vi')) : [];
}

/**
 * Escapes LIKE metacharacters so a keyword of "100%" searches for that text
 * instead of matching everything. Backslash is Postgres's default LIKE escape.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
