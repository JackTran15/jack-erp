import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { PosCatalogDirection } from '../dto/pos-catalog.query.dto';

export type PosCatalogLineDto = {
  itemId: string;
  /** Product cha (gom biến thể) — null với hàng lẻ không thuộc product nào. */
  productId: string | null;
  code: string;
  name: string;
  unit: string;
  sellingPrice: number;
  /** Tổng tồn tại chi nhánh (cộng mọi vị trí lưu). */
  quantityOnHand: number;
  locations: { locationId: string; name: string; quantity: number }[];
  /** Vị trí ưu tiên trừ khi bán (kho còn nhiều nhất). */
  defaultLocationId: string;
};

@Injectable()
export class PosCatalogService {
  constructor(private readonly dataSource: DataSource) {}

  async getCatalog(
    branchId: string,
    actor: ActorContext,
    search?: string,
    direction?: PosCatalogDirection,
  ): Promise<PosCatalogLineDto[]> {
    const orgId = actor.organizationId;
    const raw = search?.trim() ?? '';
    const safeSearch = raw.replace(/[%_\\]/g, '');

    if (safeSearch.length > 0) {
      return this.searchCatalogByTerm(
        branchId,
        orgId,
        `%${safeSearch}%`,
        direction,
      );
    }

    const params: string[] = [orgId, branchId];

    const rows: Array<{
      itemId: string;
      productId: string | null;
      locationId: string;
      locationName: string | null;
      quantity: string;
      isShowroom: boolean;
      code: string;
      name: string;
      unit: string;
      sellingPrice: string;
    }> = await this.dataSource.query(
      `SELECT sb.item_id        AS "itemId",
              i.product_id      AS "productId",
              sb.location_id    AS "locationId",
              sb.quantity::text AS "quantity",
              l.name            AS "locationName",
              EXISTS (
                SELECT 1 FROM showrooms sr
                WHERE sr.storage_id = l.storage_id
                  AND sr.organization_id = sb.organization_id
              ) AS "isShowroom",
              i.code,
              i.name,
              i.unit,
              i.selling_price::text AS "sellingPrice"
       FROM stock_balances sb
       INNER JOIN items i
         ON i.id = sb.item_id AND i.organization_id = sb.organization_id
       LEFT JOIN locations l
         ON l.id = sb.location_id
       WHERE sb.organization_id = $1
         AND sb.branch_id = $2
         AND i.is_active = true
         AND i.is_pos_visible = true
         AND l.is_active = true
       ORDER BY i.name ASC, sb.location_id ASC`,
      params,
    );

    return this.aggregateStockRows(rows, direction);
  }

  /**
   * ILIKE search from items — LEFT JOIN stock_balances so hàng khớp tên/SKU/mã vạch
   * vẫn trả về dù chưa có tồn tại chi nhánh (giống lookupByCode).
   */
  private async searchCatalogByTerm(
    branchId: string,
    orgId: string,
    pattern: string,
    direction?: PosCatalogDirection,
  ): Promise<PosCatalogLineDto[]> {
    const rows = await this.dataSource.query(
      `SELECT i.id                  AS "itemId",
              i.product_id          AS "productId",
              i.code,
              i.name,
              i.unit,
              i.selling_price::text AS "sellingPrice",
              sb.location_id        AS "locationId",
              l.name                AS "locationName",
              sb.quantity::text     AS "quantity",
              CASE
                WHEN sb.location_id IS NULL THEN NULL
                ELSE EXISTS (
                  SELECT 1 FROM showrooms sr
                  WHERE sr.storage_id = l.storage_id
                    AND sr.organization_id = sb.organization_id
                )
              END AS "isShowroom"
       FROM items i
       LEFT JOIN item_barcodes b
         ON b.item_id = i.id AND b.organization_id = i.organization_id
       LEFT JOIN stock_balances sb
         ON sb.item_id = i.id
        AND sb.organization_id = i.organization_id
        AND sb.branch_id = $2
        AND EXISTS (
          SELECT 1 FROM locations lact
          WHERE lact.id = sb.location_id AND lact.is_active = true
        )
       LEFT JOIN locations l
         ON l.id = sb.location_id
       WHERE i.organization_id = $1
         AND i.is_active = true
         AND i.is_pos_visible = true
         AND (
           i.name ILIKE $3
           OR i.code ILIKE $3
           OR b.code ILIKE $3
           OR EXISTS (
             SELECT 1 FROM products p
             WHERE p.id = i.product_id
               AND p.organization_id = i.organization_id
               AND (p.code ILIKE $3 OR p.name ILIKE $3)
           )
         )
       ORDER BY i.name ASC, sb.location_id ASC`,
      [orgId, branchId, pattern],
    );

    return this.aggregateStockRows(rows, direction);
  }

  private aggregateStockRows(
    rows: Array<{
      itemId: string;
      productId: string | null;
      locationId: string | null;
      locationName: string | null;
      quantity: string | null;
      isShowroom?: boolean | null;
      code: string;
      name: string;
      unit: string;
      sellingPrice: string;
    }>,
    direction?: PosCatalogDirection,
  ): PosCatalogLineDto[] {
    const filteredRows = direction
      ? rows.filter((r) => {
          if (!r.locationId) return true;
          if (r.isShowroom == null) return true;
          return direction === PosCatalogDirection.SHOWROOM
            ? r.isShowroom === true
            : r.isShowroom === false;
        })
      : rows;

    const byItem = new Map<
      string,
      {
        itemId: string;
        productId: string | null;
        code: string;
        name: string;
        unit: string;
        sellingPrice: number;
        quantityOnHand: number;
        locations: { locationId: string; name: string; quantity: number }[];
        locationIds: Set<string>;
      }
    >();

    for (const r of filteredRows) {
      if (!byItem.has(r.itemId)) {
        byItem.set(r.itemId, {
          itemId: r.itemId,
          productId: r.productId ?? null,
          code: r.code,
          name: r.name,
          unit: r.unit,
          sellingPrice: Number(r.sellingPrice) || 0,
          quantityOnHand: 0,
          locations: [],
          locationIds: new Set<string>(),
        });
      }
      const a = byItem.get(r.itemId)!;
      if (!r.locationId || a.locationIds.has(r.locationId)) continue;
      a.locationIds.add(r.locationId);
      const qty = Number(r.quantity) || 0;
      a.quantityOnHand += qty;
      a.locations.push({
        locationId: r.locationId,
        name: r.locationName ?? '',
        quantity: qty,
      });
    }

    const result: PosCatalogLineDto[] = [];
    for (const a of byItem.values()) {
      const locs = [...a.locations].sort(
        (x, y) =>
          y.quantity - x.quantity || x.locationId.localeCompare(y.locationId),
      );
      result.push({
        itemId: a.itemId,
        productId: a.productId,
        code: a.code,
        name: a.name,
        unit: a.unit,
        sellingPrice: a.sellingPrice,
        quantityOnHand: a.quantityOnHand,
        locations: locs,
        defaultLocationId: locs[0]?.locationId ?? '',
      });
    }

    result.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return result;
  }

  /**
   * Exact-match lookup for the POS search bar barcode/SKU flow. Returns 0..n
   * catalog lines for items whose SKU code (`items.code`) OR an attached
   * barcode (`item_barcodes.code`) equals `code` exactly, scoped to the actor's
   * organization and the given branch, limited to active + POS-visible items.
   *
   * Unlike `getCatalog`, an item that matches but has no stock_balances row in
   * the branch still returns a line (quantityOnHand 0, empty locations,
   * defaultLocationId ''), so the caller can surface an out-of-stock state
   * instead of silently dropping the scan.
   */
  async lookupByCode(
    branchId: string,
    actor: ActorContext,
    code: string,
  ): Promise<PosCatalogLineDto[]> {
    const orgId = actor.organizationId;

    const rows: Array<{
      itemId: string;
      productId: string | null;
      code: string;
      name: string;
      unit: string;
      sellingPrice: string;
      locationId: string | null;
      locationName: string | null;
      quantity: string | null;
    }> = await this.dataSource.query(
      `SELECT i.id                  AS "itemId",
              i.product_id          AS "productId",
              i.code,
              i.name,
              i.unit,
              i.selling_price::text AS "sellingPrice",
              sb.location_id        AS "locationId",
              l.name                AS "locationName",
              sb.quantity::text     AS "quantity"
       FROM items i
       LEFT JOIN item_barcodes b
         ON b.item_id = i.id AND b.organization_id = i.organization_id
       LEFT JOIN stock_balances sb
         ON sb.item_id = i.id
        AND sb.organization_id = i.organization_id
        AND sb.branch_id = $2
        AND EXISTS (
          SELECT 1 FROM locations lact
          WHERE lact.id = sb.location_id AND lact.is_active = true
        )
       LEFT JOIN locations l
         ON l.id = sb.location_id
       WHERE i.organization_id = $1
         AND i.is_active = true
         AND i.is_pos_visible = true
         AND (i.code = $3 OR b.code = $3)
       ORDER BY i.name ASC, sb.location_id ASC`,
      [orgId, branchId, code],
    );

    return this.aggregateStockRows(rows);
  }
}
