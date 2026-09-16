import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaQueryService } from '../../../media/media-query.service';
import { ItemEntity } from '../item.entity';
import {
  ProductImageRowDto,
  ProductImageSearchResponseDto,
  ProductImageStatusFilter,
} from '../dto/product-image-search.dto';
import { buildCombinedCte } from './search-inventory-items-v2.handler';
import { SearchProductImagesQuery } from './search-product-images.query';

/** Shape of one row returned by the data query, before the thumbnail is added. */
interface ImageSearchRow {
  type: 'product' | 'orphan';
  id: string;
  code: string;
  name: string;
  categoryName: string | null;
  imageCount: number;
}

interface CountRow {
  total: number;
}

interface CategoryRow {
  id: string;
  parentGroupId: string | null;
}

/**
 * Category of a group: the variants' category, `MIN(name)` when they disagree
 * (A-07). `(i.product_id = c.id OR i.id = c.id)` covers both CTE arms — a
 * product's variants, or the orphan item itself.
 */
const CATEGORY_LATERAL = `
      LEFT JOIN LATERAL (
        SELECT MIN(ic.name) AS name
        FROM items i
        JOIN inventory_item_categories ic ON ic.id = i.category_id
        WHERE (i.product_id = c.id OR i.id = c.id)
          AND i.organization_id = $1
      ) cat ON true`;

/**
 * ATTACHED image count per group, served by `IDX_media_objects_owner_attached`.
 * The owner type follows the CTE arm rather than being hard-coded: a product
 * group owns PRODUCT media, an orphan item owns ITEM media.
 *
 * `$1` is inferred as varchar from the CTE (`items.organization_id` is a
 * varchar column), while `media_objects.organization_id` is uuid — hence the
 * explicit cast here and nowhere else.
 */
const IMAGE_COUNT_LATERAL = `
      CROSS JOIN LATERAL (
        SELECT COUNT(*)::int AS count
        FROM media_objects m
        WHERE m.organization_id = $1::uuid
          AND m.owner_id = c.id
          AND m.owner_type = CASE c.type WHEN 'product' THEN 'PRODUCT' ELSE 'ITEM' END
          AND m.status = 'ATTACHED'
      ) img`;

/**
 * Search behind the "Update images" utility page (ADR-01). Wraps the shared
 * `buildCombinedCte()` — called without arguments and never modified — and
 * adds, in the outer statement only, the category column, the ATTACHED image
 * count and the three page filters. `$1` is the organization id, as the CTE
 * contract requires; every placeholder added here is numbered from `$2`.
 *
 * Only active groups are listed (A-13), sorted by code. After the two SQL
 * statements, `MediaQueryService.resolvePublicUrls` runs once for the page to
 * pick each group's first image as `thumbnailUrl`; only the URL is copied out.
 */
@QueryHandler(SearchProductImagesQuery)
export class SearchProductImagesHandler
  implements IQueryHandler<SearchProductImagesQuery>
{
  constructor(
    @InjectRepository(ItemEntity)
    private readonly repo: Repository<ItemEntity>,
    private readonly mediaQuery: MediaQueryService,
  ) {}

  async execute({
    dto,
    actor,
  }: SearchProductImagesQuery): Promise<ProductImageSearchResponseDto> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const offset = (page - 1) * limit;
    const organizationId = actor.organizationId;

    // $1 = orgId (referenced throughout the CTE and both laterals).
    const params: unknown[] = [organizationId];
    const where: string[] = ['c."isActive" = true'];

    switch (dto.imageStatus ?? ProductImageStatusFilter.MISSING) {
      case ProductImageStatusFilter.MISSING:
        where.push('img.count = 0');
        break;
      case ProductImageStatusFilter.PRESENT:
        where.push('img.count > 0');
        break;
      case ProductImageStatusFilter.ALL:
        break;
    }

    if (dto.categoryId) {
      // A parent category includes every descendant (A-06). A category id
      // outside the organization yields an array of just itself, which no item
      // of this organization can match — 0 results, not a 404.
      const categoryIds = await this.collectCategoryIds(
        dto.categoryId,
        organizationId,
      );
      params.push(categoryIds);
      where.push(
        `EXISTS (SELECT 1 FROM items i WHERE (i.product_id = c.id OR i.id = c.id) AND i.organization_id = $1 AND i.category_id = ANY($${params.length}::uuid[]))`,
      );
    }

    const keyword = dto.keyword?.trim();
    if (keyword) {
      // Wildcards in the user value match literally — same escaping as
      // SearchInventoryItemsV2Handler.applyString. One placeholder, used three
      // times: group code, group name, and any variant code (A-17).
      const esc = keyword.replace(/[\\%_]/g, (c) => `\\${c}`);
      params.push(`%${esc}%`);
      const k = `$${params.length}`;
      where.push(
        `(c.code ILIKE ${k} OR c.name ILIKE ${k} OR EXISTS (SELECT 1 FROM items i WHERE i.product_id = c.id AND i.organization_id = $1 AND i.code ILIKE ${k}))`,
      );
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const cte = buildCombinedCte();

    const dataSql = `
      ${cte}
      SELECT c.type, c.id, c.code, c.name,
             cat.name AS "categoryName",
             img.count AS "imageCount"
      FROM combined c
      ${CATEGORY_LATERAL}
      ${IMAGE_COUNT_LATERAL}
      ${whereSql}
      ORDER BY c.code ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const countSql = `
      ${cte}
      SELECT COUNT(*)::int AS total
      FROM combined c
      ${IMAGE_COUNT_LATERAL}
      ${whereSql}
    `;

    const [rows, countResult] = await Promise.all([
      this.repo.manager.query<ImageSearchRow[]>(dataSql, [
        ...params,
        limit,
        offset,
      ]),
      this.repo.manager.query<CountRow[]>(countSql, params),
    ]);

    // One media lookup for the whole page. Copy the URL only — a MediaSummary
    // or PublicMedia object must never be placed in the response as-is.
    const urlsByOwner = await this.mediaQuery.resolvePublicUrls(
      rows.map((row) => row.id),
      organizationId,
    );
    const data: ProductImageRowDto[] = rows.map((row) => ({
      type: row.type,
      id: row.id,
      code: row.code,
      name: row.name,
      categoryName: row.categoryName,
      imageCount: row.imageCount,
      thumbnailUrl: urlsByOwner.get(row.id)?.[0]?.url ?? null,
    }));

    return { data, total: countResult[0]?.total ?? 0, page, limit };
  }

  /**
   * The requested category plus every descendant, walked in memory over the
   * organization's (small) category tree — the same approach as
   * `SearchItemCategoryTreeHandler`.
   */
  private async collectCategoryIds(
    rootId: string,
    organizationId: string,
  ): Promise<string[]> {
    const categories = await this.repo.manager.query<CategoryRow[]>(
      'SELECT id, parent_group_id AS "parentGroupId" FROM inventory_item_categories WHERE organization_id = $1',
      [organizationId],
    );

    const childrenOf = new Map<string, string[]>();
    for (const category of categories) {
      if (!category.parentGroupId) continue;
      const siblings = childrenOf.get(category.parentGroupId) ?? [];
      siblings.push(category.id);
      childrenOf.set(category.parentGroupId, siblings);
    }

    const ids = [rootId];
    const seen = new Set(ids);
    for (let i = 0; i < ids.length; i++) {
      for (const childId of childrenOf.get(ids[i]) ?? []) {
        if (seen.has(childId)) continue;
        seen.add(childId);
        ids.push(childId);
      }
    }
    return ids;
  }
}
