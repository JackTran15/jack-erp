import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { TempWarehouseStagedStockService } from '../../inventory/temp-warehouse/temp-warehouse-staged-stock.service';
import { PosCatalogDirection } from '../dto/pos-catalog.query.dto';
import {
  buildExactMatchCte,
  buildItemIdsCte,
  buildSuggestCte,
} from './pos-catalog-sql';

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

/**
 * One raw row of the catalogue queries: an item joined to one of its branch
 * stock locations, or to none at all (`locationId` null) when the item matches
 * but the branch holds no balance for it.
 */
type CatalogStockRow = {
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
};

/** Both arms of the merged POS catalogue search. */
export type PosCatalogSearchResult = {
  /**
   * The single item whose SKU or barcode equals the term exactly. Null for zero
   * matches and null for several: the caller auto-adds on a unique hit, so
   * "which one" is not a question it can answer.
   */
  exact: PosCatalogLineDto | null;
  suggestions: PosCatalogLineDto[];
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
   * ILIKE search over item name/SKU, attached barcodes and the parent product's
   * code/name. Stock is LEFT JOINed on afterwards, so an item that matches but
   * carries no balance in the branch still comes back (same contract as
   * `lookupByCode`).
   *
   * `limit` caps the matched items before the stock join. It is optional and
   * `getCatalog` does not pass it: `GET /pos/branches/:id/catalog` keeps its
   * historical unbounded response, which fast stock transfer relies on.
   *
   * When both are supplied, `direction` filters *after* the cap, so it can
   * shrink the result below `limit`. The two are never combined today —
   * `direction` comes only from fast stock transfer and `limit` only from the
   * CQRS search handler — and reconciling them would mean pushing the showroom
   * classification into the capped subquery for no present caller.
   */
  private async searchCatalogByTerm(
    branchId: string,
    orgId: string,
    pattern: string,
    direction?: PosCatalogDirection,
    includeUntracked = false,
    limit?: number,
  ): Promise<PosCatalogLineDto[]> {
    const rows = await this.querySuggestRows(
      branchId,
      orgId,
      pattern,
      includeUntracked,
      limit,
    );
    const stagedDelta = await this.stagedStock.getBranchDelta(branchId, orgId);
    return this.aggregateStockRows(rows, direction, stagedDelta);
  }

  /** Raw stock rows for the fuzzy arm; aggregation and the staged delta are the caller's. */
  private async querySuggestRows(
    branchId: string,
    orgId: string,
    pattern: string,
    includeUntracked = false,
    limit?: number,
  ): Promise<CatalogStockRow[]> {
    const trackedFilter = includeUntracked ? '' : 'AND sb.is_tracked = true';
    const rows = await this.dataSource.query(
      // The match runs as a UNION of index-driven arms and is capped there, so
      // the stock join reads balances for the surviving items only. See
      // buildSuggestCte for why this is not an OR across a LEFT JOIN.
      `WITH matched AS (
         ${buildSuggestCte({ org: '$1', pattern: '$3', limit })}
       )
       SELECT i.id                  AS "itemId",
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
       FROM matched m
       INNER JOIN items i
         ON i.id = m.id
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
       -- storages.branch_id is uuid while stock_balances.branch_id is varchar, so
       -- the branch parameter is compared as text on both sides: casting $2 to
       -- uuid here would make Postgres deduce two conflicting types for the same
       -- parameter and reject the statement.
       LEFT JOIN storages st
         ON st.id = l.storage_id
        AND st.organization_id = $1
        AND st.branch_id::text = $2
       ORDER BY i.name ASC, sb.location_id ASC`,
      [orgId, branchId, pattern],
    );

    return rows;
  }

  private aggregateStockRows(
    rows: CatalogStockRow[],
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
    const rows = await this.queryExactRows(
      branchId,
      orgId,
      code,
      includeUntracked,
    );
    const stagedDelta = await this.stagedStock.getBranchDelta(branchId, orgId);
    return this.aggregateStockRows(rows, undefined, stagedDelta);
  }

  /**
   * Both arms of the POS search bar in one round trip: the exact SKU/barcode
   * match that drives auto-add, and the fuzzy suggestions that fill the
   * dropdown.
   *
   * They are issued together because the caller needs both to decide what to
   * do with a keystroke, and because the staged temp-warehouse delta — which
   * `sellableQuantity` depends on and which is a query of its own — is then
   * read once for the request rather than once per arm.
   *
   * `mode: 'exact'` skips the fuzzy arm entirely. That is what the Enter key
   * and a barcode scan want, and it also keeps them clear of the one case no
   * index can help: pg_trgm needs three characters, so a one- or two-character
   * term makes the fuzzy arm scan.
   */
  async searchCatalog(
    branchId: string,
    actor: ActorContext,
    params: {
      term: string;
      exactOnly?: boolean;
      limit?: number;
      includeUntracked?: boolean;
    },
  ): Promise<PosCatalogSearchResult> {
    const orgId = actor.organizationId;
    const includeUntracked = params.includeUntracked ?? false;
    const term = params.term.trim();
    const pattern = `%${term.replace(/[%_\\]/g, '')}%`;

    const [exactRows, suggestRows, stagedDelta] = await Promise.all([
      this.queryExactRows(branchId, orgId, term, includeUntracked),
      params.exactOnly
        ? Promise.resolve<CatalogStockRow[]>([])
        : this.querySuggestRows(
            branchId,
            orgId,
            pattern,
            includeUntracked,
            params.limit,
          ),
      this.stagedStock.getBranchDelta(branchId, orgId),
    ]);

    const exactLines = this.aggregateStockRows(exactRows, undefined, stagedDelta);

    return {
      // Deliberately null when several items share the code: the caller's whole
      // reason for asking is to auto-add without a choice to make.
      exact: exactLines.length === 1 ? exactLines[0]! : null,
      suggestions: this.aggregateStockRows(suggestRows, undefined, stagedDelta),
    };
  }

  /** Raw stock rows for the exact arm; aggregation and the staged delta are the caller's. */
  private async queryExactRows(
    branchId: string,
    orgId: string,
    code: string,
    includeUntracked = false,
  ): Promise<CatalogStockRow[]> {
    const trackedFilter = includeUntracked ? '' : 'AND sb.is_tracked = true';

    const rows: CatalogStockRow[] = await this.dataSource.query(
      // The match itself is a UNION of two index-driven arms (see
      // buildExactMatchCte); only the stock projection is joined on afterwards,
      // so the branch's balances are read for the handful of matched items
      // rather than for every POS-visible item in the organization.
      `WITH matched AS (
         ${buildExactMatchCte({ org: '$1', code: '$3' })}
       )
       SELECT i.id                  AS "itemId",
              i.product_id          AS "productId",
              i.code,
              i.name,
              i.unit,
              i.selling_price::text AS "sellingPrice",
              sb.location_id        AS "locationId",
              l.name                AS "locationName",
              sb.quantity::text     AS "quantity",
              COALESCE(st.is_main_storage, false) AS "isMainStorage"
       FROM matched m
       INNER JOIN items i
         ON i.id = m.id
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
       -- storages.branch_id is uuid while stock_balances.branch_id is varchar, so
       -- the branch parameter is compared as text on both sides: casting $2 to
       -- uuid here would make Postgres deduce two conflicting types for the same
       -- parameter and reject the statement.
       LEFT JOIN storages st
         ON st.id = l.storage_id
        AND st.organization_id = $1
        AND st.branch_id::text = $2
       ORDER BY i.name ASC, sb.location_id ASC`,
      [orgId, branchId, code],
    );

    return rows;
  }

  /**
   * Branch stock for a known set of items, in the same shape and from the same
   * aggregation as every other catalogue read.
   *
   * This exists so the POS page can refresh the on-hand snapshot of the lines
   * already in the cart without pulling the branch catalogue: on a production
   * restore that catalogue is 10,400 items and ~3.8 MB, to answer a question
   * about three of them.
   *
   * Items that are no longer active or POS-visible simply do not come back, so
   * the result can be shorter than `itemIds`. That is deliberate — the caller
   * leaves such a line with an unknown on-hand, which keeps the oversell
   * warning on rather than quoting a figure that is no longer true.
   */
  async getStockForItems(
    branchId: string,
    actor: ActorContext,
    itemIds: string[],
    includeUntracked = false,
  ): Promise<PosCatalogLineDto[]> {
    const orgId = actor.organizationId;
    const rows = await this.queryItemIdRows(
      branchId,
      orgId,
      itemIds,
      includeUntracked,
    );
    const stagedDelta = await this.stagedStock.getBranchDelta(branchId, orgId);
    return this.aggregateStockRows(rows, undefined, stagedDelta);
  }

  /** Raw stock rows for a known item set; aggregation and the staged delta are the caller's. */
  private async queryItemIdRows(
    branchId: string,
    orgId: string,
    itemIds: string[],
    includeUntracked = false,
  ): Promise<CatalogStockRow[]> {
    const trackedFilter = includeUntracked ? '' : 'AND sb.is_tracked = true';

    const rows: CatalogStockRow[] = await this.dataSource.query(
      // Same shape as queryExactRows: the item set is resolved first and the
      // stock projection hangs off it, so stock_balances is probed on
      // (organization, branch, item) for the handful of ids asked about.
      `WITH matched AS (
         ${buildItemIdsCte({ org: '$1', itemIds: '$3' })}
       )
       SELECT i.id                  AS "itemId",
              i.product_id          AS "productId",
              i.code,
              i.name,
              i.unit,
              i.selling_price::text AS "sellingPrice",
              sb.location_id        AS "locationId",
              l.name                AS "locationName",
              sb.quantity::text     AS "quantity",
              COALESCE(st.is_main_storage, false) AS "isMainStorage"
       FROM matched m
       INNER JOIN items i
         ON i.id = m.id
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
       -- storages.branch_id is uuid while stock_balances.branch_id is varchar, so
       -- the branch parameter is compared as text on both sides: casting $2 to
       -- uuid here would make Postgres deduce two conflicting types for the same
       -- parameter and reject the statement.
       LEFT JOIN storages st
         ON st.id = l.storage_id
        AND st.organization_id = $1
        AND st.branch_id::text = $2
       ORDER BY i.name ASC, sb.location_id ASC`,
      // The id list is bound as one array parameter, never interpolated.
      [orgId, branchId, itemIds],
    );

    return rows;
  }
}
