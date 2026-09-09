import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemEntity } from '../../inventory/location/item.entity';
import {
  PartnerAttributeDto,
  PartnerProductDetailDto,
  PartnerVariantDto,
} from '../dto/partner-product-detail.dto';
import {
  ATTRIBUTE_COLOR,
  ATTRIBUTE_SIZE,
  matchesAttributeDimension,
} from '../partner-catalog.constants';
import { inStockExistsSql, resolveStockBranchIds } from '../partner-stock.sql';
import { GetPartnerProductQuery } from './get-partner-product.query';

/**
 * One message for every not-returnable case.
 *
 * "Does not exist", "belongs to another organization" and "has no sellable
 * variant" must be indistinguishable from outside. Answering 403 for the
 * second would confirm the id is real, which is exactly what an enumeration
 * attempt is looking for.
 */
const NOT_FOUND_MESSAGE = 'Product not found';

interface DetailRow {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  itemId: string;
  itemCode: string;
  variantLabel: string | null;
  price: number;
  inStock: boolean;
  attrName: string | null;
  attrValue: string | null;
}

@QueryHandler(GetPartnerProductQuery)
export class GetPartnerProductHandler
  implements IQueryHandler<GetPartnerProductQuery>
{
  constructor(
    @InjectRepository(ItemEntity)
    private readonly items: Repository<ItemEntity>,
  ) {}

  async execute({
    productId,
    actor,
  }: GetPartnerProductQuery): Promise<PartnerProductDetailDto> {
    const params: unknown[] = [actor.organizationId, productId];

    const branchIds = resolveStockBranchIds(actor.branchIds);
    let branchParam: string | undefined;
    if (branchIds) {
      params.push(branchIds);
      branchParam = `$${params.length}`;
    }

    // The organization predicate lives in the WHERE clause, not in a check
    // after the rows come back. Fetching first and comparing later is how a
    // cross-tenant read eventually ships.
    const sql = `
      SELECT
        p.id, p.code, p.name, p.description,
        i.category_id AS "categoryId",
        c.name AS "categoryName",
        i.id AS "itemId",
        i.code AS "itemCode",
        i.variant_label AS "variantLabel",
        i.selling_price::float AS price,
        ${inStockExistsSql({
          itemIdExpr: 'i.id',
          orgParam: '$1',
          branchParam,
        })} AS "inStock",
        d.name AS "attrName",
        o.value_label AS "attrValue"
      FROM products p
      JOIN items i
        ON i.product_id = p.id
       AND i.organization_id = $1
       AND i.is_active = true
      LEFT JOIN inventory_item_categories c ON c.id = i.category_id
      LEFT JOIN item_attribute_values iav ON iav.item_id = i.id
      LEFT JOIN product_attribute_definitions d ON d.id = iav.attribute_definition_id
      LEFT JOIN product_attribute_options o ON o.id = iav.option_id
      WHERE p.id = $2
        AND p.organization_id = $1
        AND p.is_active = true
      ORDER BY i.code ASC, d.sort_order ASC, o.sort_order ASC
    `;

    const rows = await this.items.manager.query<DetailRow[]>(sql, params);
    // Zero rows covers all three cases at once: unknown id, another org's id,
    // and a product whose variants are all retired. Same answer, by design.
    if (rows.length === 0) throw new NotFoundException(NOT_FOUND_MESSAGE);

    return buildDetail(rows);
  }
}

/**
 * Folds the flat join into the nested shape.
 *
 * Done in memory rather than in SQL because the row count is bounded: a product
 * caps at 500 variants (VariantGenerationService's own limit) times a handful
 * of dimensions. That is the opposite trade-off from the listing query, where
 * the row count is the whole catalogue and pushing down is the only option.
 */
export function buildDetail(rows: DetailRow[]): PartnerProductDetailDto {
  const first = rows[0]!;

  const variants = new Map<string, PartnerVariantDto>();
  // Insertion order is the SQL order (definition sort, then option sort), so
  // the partner's dropdowns come out in catalogue order rather than at random.
  const dimensions = new Map<string, string[]>();

  for (const row of rows) {
    let variant = variants.get(row.itemId);
    if (!variant) {
      variant = {
        id: row.itemId,
        code: row.itemCode,
        variantLabel: row.variantLabel ?? null,
        price: row.price,
        inStock: row.inStock,
        attributes: {},
      };
      variants.set(row.itemId, variant);
    }
    if (row.attrName && row.attrValue) {
      variant.attributes[row.attrName] = row.attrValue;
      const options = dimensions.get(row.attrName) ?? [];
      if (!options.includes(row.attrValue)) options.push(row.attrValue);
      dimensions.set(row.attrName, options);
    }
  }

  const attributes: PartnerAttributeDto[] = [...dimensions].map(
    ([name, options]) => ({ name, options }),
  );
  const variantList = [...variants.values()];
  const prices = variantList.map((v) => v.price);

  return {
    id: first.id,
    code: first.code ?? null,
    name: first.name,
    description: first.description ?? null,
    categoryId: first.categoryId ?? null,
    categoryName: first.categoryName ?? null,
    priceMin: Math.min(...prices),
    priceMax: Math.max(...prices),
    colors: optionsOf(dimensions, ATTRIBUTE_COLOR),
    sizes: optionsOf(dimensions, ATTRIBUTE_SIZE),
    inStock: variantList.some((v) => v.inStock),
    images: [],
    attributes,
    variants: variantList,
  };
}

/** Values of whichever stored dimension name denotes `dimension`. */
function optionsOf(
  dimensions: Map<string, string[]>,
  dimension: string,
): string[] {
  for (const [name, options] of dimensions) {
    if (matchesAttributeDimension(name, dimension)) return options;
  }
  return [];
}
