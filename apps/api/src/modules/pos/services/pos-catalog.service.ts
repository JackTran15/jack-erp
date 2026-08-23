import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { TempWarehouseStagedStockService } from '../../inventory/temp-warehouse/temp-warehouse-staged-stock.service';
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
  /**
   * Projected on-hand at the branch's main (showroom) storages once every open
   * temp-warehouse line lands: stock already booked there, plus stock staged
   * into it, minus stock staged out of it. Floored at 0.
   *
   * This, not `quantityOnHand`, is the oversell-warning basis. A POS sale
   * deducts in two beats — `resolveBranchItemLocations(..., showroomOnly)` off
   * the showroom, then `fulfillInvoiceFromTempWarehouse` off the staged lines —
   * so the warning has to sit on the sum of both. Counting warehouse stock as
   * well would make it fire late by whatever is sitting in the back;
   * `quantityOnHand` stays the branch-wide total for the callers that
   * legitimately want it (fast stock transfer).
   */
  sellableQuantity: number;
  locations: { locationId: string; name: string; quantity: number }[];
  /** Vị trí ưu tiên trừ khi bán (kho còn nhiều nhất). */
  defaultLocationId: string;
};

@Injectable()
export class PosCatalogService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly stagedStock: TempWarehouseStagedStockService,
  ) {}

  async getCatalog(
    branchId: string,
    actor: ActorContext,
    search?: string,
    direction?: PosCatalogDirection,
    includeUntracked = false,
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
        includeUntracked,
      );
    }

    // Bán hàng ẩn tồn ở chi tiết đã ngừng theo dõi; Chuyển kho tạm truyền
    // includeUntracked=true để vẫn lấy được nguồn dọn hàng.
    const trackedFilter = includeUntracked ? '' : 'AND sb.is_tracked = true';

    const params: string[] = [orgId, branchId];

    const rows: Array<{
      itemId: string;
      productId: string | null;
      locationId: string;
      locationName: string | null;
      quantity: string;
      isShowroom: boolean;
      isMainStorage: boolean | null;
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
              COALESCE(st.is_main_storage, false) AS "isMainStorage",
              i.code,
              i.name,
              i.unit,
              i.selling_price::text AS "sellingPrice"
       FROM stock_balances sb
       INNER JOIN items i
         ON i.id = sb.item_id AND i.organization_id = sb.organization_id
       LEFT JOIN locations l
         ON l.id = sb.location_id
       -- storages.branch_id is uuid while stock_balances.branch_id is varchar, so
       -- the branch parameter is compared as text on both sides: casting $2 to
       -- uuid here would make Postgres deduce two conflicting types for the same
       -- parameter and reject the statement.
       LEFT JOIN storages st
         ON st.id = l.storage_id
        AND st.organization_id = $1
        AND st.branch_id::text = $2
       WHERE sb.organization_id = $1
         AND sb.branch_id = $2
         AND i.is_active = true
         AND i.is_pos_visible = true
         AND l.is_active = true
         ${trackedFilter}
       ORDER BY i.name ASC, sb.location_id ASC`,
      params,
    );

    const stagedDelta = await this.stagedStock.getBranchDelta(branchId, orgId);
    return this.aggregateStockRows(rows, direction, stagedDelta);
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
    includeUntracked = false,
  ): Promise<PosCatalogLineDto[]> {
    const trackedFilter = includeUntracked ? '' : 'AND sb.is_tracked = true';
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
              END AS "isShowroom",
              COALESCE(st.is_main_storage, false) AS "isMainStorage"
       FROM items i
       LEFT JOIN item_barcodes b
         ON b.item_id = i.id AND b.organization_id = i.organization_id
       LEFT JOIN stock_balances sb
         ON sb.item_id = i.id
        AND sb.organization_id = i.organization_id
        AND sb.branch_id = $2
        ${trackedFilter}
        AND EXISTS (
          SELECT 1 FROM locations lact
          WHERE lact.id = sb.location_id AND lact.is_active = true
        )
       LEFT JOIN locations l
         ON l.id = sb.location_id
       LEFT JOIN storages st
         ON st.id = l.storage_id
        AND st.organization_id = $1
        AND st.branch_id::text = $2
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

    const stagedDelta = await this.stagedStock.getBranchDelta(branchId, orgId);
    return this.aggregateStockRows(rows, direction, stagedDelta);
  }

  private aggregateStockRows(
    rows: Array<{
      itemId: string;
      productId: string | null;
      locationId: string | null;
      locationName: string | null;
      quantity: string | null;
      isShowroom?: boolean | null;
      isMainStorage?: boolean | null;
      code: string;
      name: string;
      unit: string;
      sellingPrice: string;
    }>,
    direction: PosCatalogDirection | undefined,
    stagedDelta: Map<string, number>,
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
        mainStorageQuantity: number;
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
          mainStorageQuantity: 0,
          locations: [],
          locationIds: new Set<string>(),
        });
      }
      const a = byItem.get(r.itemId)!;
      if (!r.locationId || a.locationIds.has(r.locationId)) continue;
      a.locationIds.add(r.locationId);
      const qty = Number(r.quantity) || 0;
      a.quantityOnHand += qty;
      // Showroom is classified by `storages.is_main_storage` scoped to the
      // branch — the exact filter `resolveBranchItemLocations(..., showroomOnly)`
      // uses to pick where a POS sale deducts from. The `showrooms` table above
      // classifies the `direction` parameter (fast stock transfer) and is left
      // alone: two notions of "showroom" live in this file on purpose, and this
      // one has to predict the deduction.
      if (r.isMainStorage === true) a.mainStorageQuantity += qty;
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
        // Staged temp-warehouse stock has not moved in stock_balances yet, so
        // the projected showroom on-hand is the booked figure plus the net
        // effect of the branch's open sessions. Floored at 0: a negative
        // threshold warns on exactly the same quantities as 0 does, and reads
        // as a nonsense number in the cashier's tooltip.
        sellableQuantity: Math.max(
          0,
          a.mainStorageQuantity + (stagedDelta.get(a.itemId) ?? 0),
        ),
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
    includeUntracked = false,
  ): Promise<PosCatalogLineDto[]> {
    const orgId = actor.organizationId;
    const trackedFilter = includeUntracked ? '' : 'AND sb.is_tracked = true';

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
      isMainStorage: boolean | null;
    }> = await this.dataSource.query(
      `SELECT i.id                  AS "itemId",
              i.product_id          AS "productId",
              i.code,
              i.name,
              i.unit,
              i.selling_price::text AS "sellingPrice",
              sb.location_id        AS "locationId",
              l.name                AS "locationName",
              sb.quantity::text     AS "quantity",
              COALESCE(st.is_main_storage, false) AS "isMainStorage"
       FROM items i
       LEFT JOIN item_barcodes b
         ON b.item_id = i.id AND b.organization_id = i.organization_id
       LEFT JOIN stock_balances sb
         ON sb.item_id = i.id
        AND sb.organization_id = i.organization_id
        AND sb.branch_id = $2
        ${trackedFilter}
        AND EXISTS (
          SELECT 1 FROM locations lact
          WHERE lact.id = sb.location_id AND lact.is_active = true
        )
       LEFT JOIN locations l
         ON l.id = sb.location_id
       LEFT JOIN storages st
         ON st.id = l.storage_id
        AND st.organization_id = $1
        AND st.branch_id::text = $2
       WHERE i.organization_id = $1
         AND i.is_active = true
         AND i.is_pos_visible = true
         AND (i.code = $3 OR b.code = $3)
       ORDER BY i.name ASC, sb.location_id ASC`,
      [orgId, branchId, code],
    );

    const stagedDelta = await this.stagedStock.getBranchDelta(branchId, orgId);
    return this.aggregateStockRows(rows, undefined, stagedDelta);
  }
}
