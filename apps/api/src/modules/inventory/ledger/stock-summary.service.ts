import { Injectable } from "@nestjs/common";
import type { ReportTotals } from "@erp/shared-interfaces";
import { InjectRepository } from "@nestjs/typeorm";
import { ObjectLiteral, Repository, SelectQueryBuilder } from "typeorm";
import {
  CompareFilterDto,
  CompareOperator,
  StringFilterDto,
} from "../../../common/filters/filter.dto";
import { FilterBuilder } from "../../../common/filters/filter.builder";
import { StockBalanceEntity } from "./stock-balance.entity";
import {
  StockStateFilter,
  StockSummaryGroupBy,
} from "./dto/stock-summary-query.dto";

/**
 * Loại bút toán của phiếu đã xoá khỏi báo cáo nhập-xuất-tồn (parity MISA):
 * phiếu nhập bị huỷ (deleted_at / status CANCELLED) và phiếu xuất bị huỷ
 * (status CANCELLED). Bút toán gốc + bút toán đảo dùng chung reference nên cả
 * hai cùng bị loại. Dùng alias `sle` cho stock_ledger_entries.
 */
export const EXCLUDE_VOIDED_DOCS_SQL = `
        AND NOT EXISTS (
          SELECT 1 FROM goods_receipts grx
          WHERE grx.id = sle.reference_id
            AND sle.reference_type = 'GOODS_RECEIPT'
            AND (grx.deleted_at IS NOT NULL OR grx.status = 'CANCELLED')
        )
        AND NOT EXISTS (
          SELECT 1 FROM goods_issues gix
          WHERE gix.id = sle.reference_id
            AND sle.reference_type = 'GOODS_ISSUE'
            AND gix.status = 'CANCELLED'
        )`;

export interface StockSummaryQuery {
  organizationId: string;
  page?: number;
  pageSize?: number;
  search?: string;
  branchId?: string;
  storageId?: string;
  categoryId?: string;
  brand?: string | StringFilterDto;
  unit?: string | StringFilterDto;
  isActive?: boolean;
  isPosVisible?: boolean;
  stockState?: StockStateFilter;
  /** YYYY-MM-DD inclusive */
  movementFrom?: string;
  /** YYYY-MM-DD inclusive (end of day) */
  movementTo?: string;
  /** YYYY-MM-DD inclusive */
  startDate?: string;
  /** YYYY-MM-DD inclusive (end of day) */
  endDate?: string;
  excludeReservations?: boolean;
  itemCode?: StringFilterDto;
  itemName?: StringFilterDto;
  category?: StringFilterDto;
  storage?: StringFilterDto;
  quantity?: CompareFilterDto;
  openingQty?: CompareFilterDto;
  inQty?: CompareFilterDto;
  outQty?: CompareFilterDto;
  transferOutQty?: CompareFilterDto;
  incomingQty?: CompareFilterDto;
  /**
   * Row granularity. Defaults to `VARIANT` (one row per item × storage), which
   * is what the Excel export needs. The grid asks for `SKU` (one row per parent
   * product × storage).
   */
  groupBy?: StockSummaryGroupBy;
  /**
   * Whole-set column totals for the grid footer. Defaults to true. The export
   * pipeline walks the result page by page and never renders a footer, so it
   * passes false rather than paying for the totals statement 40 times.
   */
  includeTotals?: boolean;
}

export interface StockSummaryRow {
  itemId: string;
  storageId: string;
  /**
   * Identity of the row's item dimension: the item id in `VARIANT` mode, the
   * parent product id (or the item id for parentless items) in `SKU` mode.
   * The grid keys rows on `groupKey:storageId` and drills down with it.
   */
  groupKey: string;
  /** Parent product, or null for items that have none. */
  productId: string | null;
  item: {
    id: string;
    code: string;
    name: string;
    unit: string;
    brand: string | null;
    isActive: boolean;
    categoryName: string | null;
  };
  storage: {
    id: string;
    name: string;
    branchId: string;
  };
  quantity: number;
  lastMovementAt: string | null;
  openingQty: number;
  openingValue: number;
  inQty: number;
  inValue: number;
  outQty: number;
  outValue: number;
  closingQty: number;
  closingValue: number;
  transferOutQty: number;
  incomingQty: number;
  reservedQty: number;
}

/**
 * Column totals over **every** row matching the filters, not only the page.
 * These back the grid footer, which must not change when the user pages.
 */
export interface StockSummaryTotals extends ReportTotals {
  /** Live tồn — same number as `totalQuantity`. */
  quantity: number;
  openingQty: number;
  inQty: number;
  outQty: number;
  /** Derived, exactly as per row: hasPeriod ? opening + in - out : quantity. */
  closingQty: number;
  transferOutQty: number;
  incomingQty: number;
  reservedQty: number;
}

export interface StockSummaryResponse {
  data: StockSummaryRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Kept alongside `totals` so existing consumers keep working. */
  totalQuantity: number;
  /** Absent when the caller passed `includeTotals: false` (the export path). */
  totals?: StockSummaryTotals;
}

export interface StockSummaryFilterOptions {
  brands: string[];
  units: string[];
}

interface RawPageRow {
  group_key: string;
  product_id: string | null;
  /** Every item folded into this row — one entry in `VARIANT` mode. */
  item_ids: string[];
  item_code: string;
  item_name: string;
  item_unit: string;
  item_brand: string | null;
  item_is_active: boolean;
  category_name: string | null;
  storage_id: string;
  storage_name: string;
  branch_id: string;
  quantity: string;
  last_movement_at: Date | null;
}

/**
 * One row, always. The count-only variant fills the first two columns and
 * leaves the rest undefined; `readTotals` is only called for the full variant.
 */
interface RawTotalsRow {
  total: number;
  total_quantity: string;
  opening_qty?: string;
  in_qty?: string;
  out_qty?: string;
  transfer_out_qty?: string;
  incoming_qty?: string;
  pending_only_incoming_qty?: string;
  reserved_qty?: string;
}

interface RawPeriodRow {
  item_id: string;
  storage_id: string;
  opening_qty: string | number | null;
  opening_value: string | number | null;
  in_qty: string | number | null;
  in_value: string | number | null;
  out_qty: string | number | null;
  out_value: string | number | null;
}

interface RawPendingTransferRow {
  item_id: string;
  storage_id: string;
  transfer_out_qty: string | number | null;
  incoming_qty: string | number | null;
}

interface RawReservationRow {
  item_id: string;
  storage_id: string;
  reserved_qty: string | number | null;
}

interface RawPendingOnlyRow {
  group_key: string;
  product_id: string | null;
  item_code: string;
  item_name: string;
  item_unit: string;
  item_brand: string | null;
  item_is_active: boolean;
  category_name: string | null;
  storage_id: string | null;
  storage_name: string | null;
  branch_id: string;
  incoming_qty: string | number | null;
}

@Injectable()
export class StockSummaryService {
  constructor(
    @InjectRepository(StockBalanceEntity)
    private readonly balanceRepo: Repository<StockBalanceEntity>,
  ) {}

  async getSummary(query: StockSummaryQuery): Promise<StockSummaryResponse> {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize ?? 50)));
    const needsDerivedFilter = Boolean(
      query.openingQty ||
      query.inQty ||
      query.outQty ||
      query.transferOutQty ||
      query.incomingQty,
    );

    const group = this.groupExpressions(query);
    const wantsPendingOnly = Boolean(query.branchId) && !query.storageId;

    const aggQb = this.applyHaving(
      this.buildGroupedQuery(query),
      query.stockState,
      query.quantity,
    );
    const [aggSql, aggParams] = aggQb.getQueryAndParameters();
    // The derived-filter branch materialises every row anyway and reduces the
    // totals in JS, so running the totals statement there would be work thrown
    // away. Everywhere else it replaces the old count-only aggregate, keeping
    // the round-trip count unchanged.
    const wantsTotals = query.includeTotals !== false && !needsDerivedFilter;
    const aggregate = wantsTotals
      ? this.buildTotalsSql(query, group, aggSql, aggParams)
      : {
          sql: `SELECT COUNT(*)::int AS total, COALESCE(SUM(sub.quantity), 0)::numeric AS total_quantity FROM (${aggSql}) sub`,
          params: aggParams,
        };

    // ADR-01: `needsDerivedFilter` already had to materialise every filtered
    // row instead of a SQL page (it reduces in memory below) — `limit: false`
    // here reuses exactly that knob, it is not a second way of doing the same
    // thing.
    const [{ data: pageData, rows }, aggResult] = await Promise.all([
      this.fetchPageData(query, group, !needsDerivedFilter, page, pageSize),
      this.balanceRepo.manager.query<RawTotalsRow[]>(
        aggregate.sql,
        aggregate.params,
      ),
    ]);
    let data = pageData;

    let total = Number(aggResult?.[0]?.total ?? 0);
    const totalQuantity = Number(aggResult?.[0]?.total_quantity ?? 0);
    const totals = wantsTotals
      ? this.readTotals(aggResult?.[0], totalQuantity, Boolean(query.startDate || query.endDate))
      : undefined;

    const pendingOnlyQuery = wantsPendingOnly
      ? this.buildPendingOnlyQuery(query, group)
      : null;
    const rawPendingOnlyRows = pendingOnlyQuery
      ? await this.balanceRepo.manager.query<RawPendingOnlyRow[]>(
          pendingOnlyQuery.sql,
          pendingOnlyQuery.params,
        )
      : [];
    // A genuine pending-only row always carries its own `group_key` — the
    // SELECT list in `buildPendingOnlyQuery` always projects it — so this
    // also doubles as a guard against a differently-shaped row reaching the
    // merge below.
    const pendingOnlyRows = (rawPendingOnlyRows ?? []).filter(
      (row): row is RawPendingOnlyRow =>
        Boolean(row) && typeof row.group_key === "string",
    );

    if (wantsPendingOnly) {
      const appended = this.mergePendingOnlyRows(data, pendingOnlyRows);
      // The common case — no incoming transfers survive the filter/dedupe —
      // never reaches here (`appended === 0`) and keeps the SQL-paginated
      // `data`/`total` from above untouched, single round trip.
      if (appended > 0) {
        if (
          !needsDerivedFilter &&
          (page > 1 || rows.length === pageSize)
        ) {
          // `data` merged into only a SQL LIMIT/OFFSET slice (or, for
          // page > 1, none of the earlier pages at all) — neither dedupe nor
          // pagination can trust it. Refetch the whole filtered set,
          // unpaginated, exactly like `needsDerivedFilter` already does, and
          // merge again against the complete picture.
          const full = await this.fetchPageData(
            query,
            group,
            false,
            page,
            pageSize,
          );
          data = full.data;
          this.mergePendingOnlyRows(data, pendingOnlyRows);
        }
        // Either `data` was already the full filtered set (page 1 under a
        // full page, or `needsDerivedFilter`'s own unlimited fetch) or it
        // just became one above — the SQL `total` never saw the appended
        // rows, so hand off to the shared in-memory path (ADR-01) instead of
        // trusting it.
        return this.paginateInMemory(
          data,
          query,
          page,
          pageSize,
          needsDerivedFilter,
        );
      }
    }

    if (needsDerivedFilter) {
      return this.paginateInMemory(data, query, page, pageSize, true);
    }

    return { data, total, page, pageSize, totalQuantity, totals };
  }

  /**
   * Runs the page query and its per-row enrichment (period figures, pending
   * transfers, reservations), mapping the result to `StockSummaryRow[]`.
   * `limit: false` fetches every row matching the filters instead of one
   * page — the same knob `needsDerivedFilter` already needed, now reused by
   * the pending-only merge (T-01-03, ADR-01) instead of a second one.
   */
  private async fetchPageData(
    query: StockSummaryQuery,
    group: ReturnType<StockSummaryService["groupExpressions"]>,
    limit: boolean,
    page: number,
    pageSize: number,
  ): Promise<{ data: StockSummaryRow[]; rows: RawPageRow[] }> {
    const pageQb = this.applyHaving(
      this.buildGroupedQuery(query),
      query.stockState,
      query.quantity,
    )
      .orderBy(group.aggCode, "ASC")
      .addOrderBy("storage.name", "ASC")
      // Tiebreakers: neither the displayed code nor the storage name is unique,
      // and without a total order OFFSET paging silently repeats/drops rows.
      .addOrderBy(group.key, "ASC")
      .addOrderBy("storage.id", "ASC");
    if (limit) {
      pageQb.limit(pageSize).offset((page - 1) * pageSize);
    }
    const rows = await pageQb.getRawMany<RawPageRow>();

    // These follow-up queries stay keyed on (item, storage) even when the
    // page is grouped by SKU: one row then contributes every variant it folds
    // in, and the per-variant results are summed back per row when mapping.
    const itemIds: string[] = [];
    const storageIds: string[] = [];
    for (const row of rows) {
      for (const memberId of row.item_ids ?? []) {
        itemIds.push(memberId);
        storageIds.push(row.storage_id);
      }
    }

    // Deduped item ids for the `= ANY(...)` hints below. The (item, storage)
    // arrays feeding `unnest` must keep their positional pairing, so only this
    // copy can be deduped.
    const pageItemIds = [...new Set(itemIds)];
    const wantsPeriod =
      rows.length > 0 && Boolean(query.startDate || query.endDate);
    const periodStart = query.startDate || "1970-01-01";
    const periodEnd = query.endDate ? addOneDay(query.endDate) : "2999-12-31";

    // `unnest(...)` carries no statistics, so the planner sizes the pair set at
    // its 100-row default and can pick a hash join that scans the whole ledger /
    // invoice_items / transfer_order_lines. The `= ANY(...)` predicates below are
    // implied by the pair join and select exactly the same rows, but being plain
    // restrictions on item_id they let the per-item indexes drive the scan.
    const periodQuery = `
        SELECT
          sle.item_id,
          loc.storage_id,
          SUM(CASE WHEN sle.posted_at < $1 THEN sle.quantity ELSE 0 END)::numeric AS opening_qty,
          SUM(CASE WHEN sle.posted_at < $1 THEN sle.line_value ELSE 0 END)::numeric AS opening_value,
          SUM(CASE WHEN sle.posted_at >= $1 AND sle.posted_at < $2 AND sle.quantity > 0 THEN sle.quantity ELSE 0 END)::numeric AS in_qty,
          SUM(CASE WHEN sle.posted_at >= $1 AND sle.posted_at < $2 AND sle.quantity > 0 THEN sle.line_value ELSE 0 END)::numeric AS in_value,
          SUM(CASE WHEN sle.posted_at >= $1 AND sle.posted_at < $2 AND sle.quantity < 0 THEN ABS(sle.quantity) ELSE 0 END)::numeric AS out_qty,
          SUM(CASE WHEN sle.posted_at >= $1 AND sle.posted_at < $2 AND sle.quantity < 0 THEN ABS(sle.line_value) ELSE 0 END)::numeric AS out_value
        FROM stock_ledger_entries sle
        INNER JOIN locations loc ON loc.id = sle.location_id
        INNER JOIN unnest($4::uuid[], $5::uuid[]) AS pair(item_id, storage_id)
          ON pair.item_id = sle.item_id
         AND pair.storage_id = loc.storage_id
        WHERE sle.organization_id = $3
          AND sle.item_id = ANY($6::uuid[])
        ${EXCLUDE_VOIDED_DOCS_SQL}
        GROUP BY sle.item_id, loc.storage_id
      `;

    const pendingTransferQuery = `
        SELECT
          pairs.item_id,
          pairs.storage_id,
          COALESCE(SUM(
            CASE
              WHEN transfer_order.source_branch_id = $1
               AND COALESCE(line.source_storage_id, transfer_order.source_storage_id) = pairs.storage_id
              THEN line.requested_qty
              ELSE 0
            END
          ), 0)::numeric AS transfer_out_qty,
          COALESCE(SUM(
            CASE
              WHEN transfer_order.destination_branch_id = $1
               AND transfer_order.destination_storage_id = pairs.storage_id
              THEN line.requested_qty
              ELSE 0
            END
          ), 0)::numeric AS incoming_qty
        FROM unnest($3::uuid[], $4::uuid[]) AS pairs(item_id, storage_id)
        LEFT JOIN transfer_order_lines line
          ON line.item_id = pairs.item_id
         AND line.item_id = ANY($5::uuid[])
         AND line.organization_id = $2
        LEFT JOIN transfer_orders transfer_order
          ON transfer_order.id = line.transfer_order_id
         AND transfer_order.organization_id = $2
         AND transfer_order.status = 'IN_PROGRESS'
         AND transfer_order.deleted_at IS NULL
        GROUP BY pairs.item_id, pairs.storage_id
      `;

    const reservationQuery = `
        SELECT
          pairs.item_id,
          pairs.storage_id,
          COALESCE(SUM(invoice_item.quantity), 0)::numeric AS reserved_qty
        FROM unnest($3::uuid[], $4::uuid[]) AS pairs(item_id, storage_id)
        LEFT JOIN invoice_items invoice_item
          ON invoice_item.item_id = pairs.item_id
         AND invoice_item.item_id = ANY($5::uuid[])
         AND invoice_item.organization_id = $2
         AND invoice_item.direction = 'OUT'
        LEFT JOIN invoices invoice
          ON invoice.id = invoice_item.invoice_id
         AND invoice.organization_id = $2
         AND invoice.branch_id = $1
         AND invoice.type = 'SALE'
         AND invoice.status IN ('draft', 'pending')
        LEFT JOIN locations reservation_location
          ON reservation_location.id = invoice_item.location_id
         AND reservation_location.organization_id = $2
        WHERE invoice.id IS NOT NULL
          AND reservation_location.storage_id = pairs.storage_id
        GROUP BY pairs.item_id, pairs.storage_id
      `;

    // None of these three reads depends on another's result, and they were
    // three serial round trips. Batched, the stage costs the slowest one
    // instead of their sum.
    const [periodResult, pendingRows, reservationRows] = await Promise.all([
      wantsPeriod
        ? this.balanceRepo.manager.query<RawPeriodRow[]>(periodQuery, [
            periodStart,
            periodEnd,
            query.organizationId,
            itemIds,
            storageIds,
            pageItemIds,
          ])
        : Promise.resolve([] as RawPeriodRow[]),
      rows.length > 0
        ? this.balanceRepo.manager.query<RawPendingTransferRow[]>(
            pendingTransferQuery,
            [
              query.branchId,
              query.organizationId,
              itemIds,
              storageIds,
              pageItemIds,
            ],
          )
        : Promise.resolve([] as RawPendingTransferRow[]),
      rows.length > 0 && query.branchId
        ? this.balanceRepo.manager.query<RawReservationRow[]>(
            reservationQuery,
            [
              query.branchId,
              query.organizationId,
              itemIds,
              storageIds,
              pageItemIds,
            ],
          )
        : Promise.resolve([] as RawReservationRow[]),
    ]);

    const periodDataMap = new Map<string, RawPeriodRow>();
    for (const row of periodResult ?? []) {
      periodDataMap.set(`${row.item_id}:${row.storage_id}`, row);
    }

    const pendingTransferMap = new Map<string, RawPendingTransferRow>();
    for (const row of pendingRows ?? []) {
      pendingTransferMap.set(`${row.item_id}:${row.storage_id}`, row);
    }

    const reservationMap = new Map<string, RawReservationRow>();
    for (const row of reservationRows ?? []) {
      reservationMap.set(`${row.item_id}:${row.storage_id}`, row);
    }

    const data: StockSummaryRow[] = rows.map((r) => {
      // In SKU mode a row folds several variants, so every follow-up figure is
      // the sum over its members. VARIANT mode has exactly one member, which
      // makes these loops a no-op rename of the old direct lookups.
      let openingQty = 0;
      let openingValue = 0;
      let inQty = 0;
      let inValue = 0;
      let outQty = 0;
      let outValue = 0;
      let transferOutQty = 0;
      let incomingQty = 0;
      let reservedQty = 0;
      for (const memberId of r.item_ids ?? []) {
        const pairKey = `${memberId}:${r.storage_id}`;
        const pd = periodDataMap.get(pairKey);
        const pending = pendingTransferMap.get(pairKey);
        const reservation = reservationMap.get(pairKey);
        openingQty += Number(pd?.opening_qty ?? 0);
        openingValue += Number(pd?.opening_value ?? 0);
        inQty += Number(pd?.in_qty ?? 0);
        inValue += Number(pd?.in_value ?? 0);
        outQty += Number(pd?.out_qty ?? 0);
        outValue += Number(pd?.out_value ?? 0);
        transferOutQty += Number(pending?.transfer_out_qty ?? 0);
        incomingQty += Number(pending?.incoming_qty ?? 0);
        reservedQty += Number(reservation?.reserved_qty ?? 0);
      }
      const hasPeriod = query.startDate || query.endDate;
      const closingQty = hasPeriod
        ? openingQty + inQty - outQty
        : Number(r.quantity);
      const closingValue = hasPeriod ? openingValue + inValue - outValue : 0;

      return {
        itemId: r.group_key,
        storageId: r.storage_id,
        groupKey: r.group_key,
        productId: r.product_id,
        item: {
          id: r.group_key,
          code: r.item_code,
          name: r.item_name,
          unit: r.item_unit,
          brand: r.item_brand,
          isActive: r.item_is_active,
          categoryName: r.category_name,
        },
        storage: {
          id: r.storage_id,
          name: r.storage_name,
          branchId: r.branch_id,
        },
        quantity: Number(r.quantity),
        lastMovementAt: r.last_movement_at
          ? r.last_movement_at.toISOString()
          : null,
        openingQty,
        openingValue,
        inQty,
        inValue,
        outQty,
        outValue,
        closingQty,
        closingValue,
        transferOutQty,
        incomingQty,
        reservedQty,
      };
    });

    return { data, rows };
  }

  /**
   * Appends the pending-only rows (T-01-02) that are not already duplicates
   * of a row already in `data`, mutating `data` in place. Returns how many
   * were appended — the caller uses that to decide whether the set it merged
   * into was trustworthy enough to keep as-is (T-01-03, ADR-01).
   */
  private mergePendingOnlyRows(
    data: StockSummaryRow[],
    pendingOnlyRows: RawPendingOnlyRow[],
  ): number {
    // Keyed by groupKey → the set of storageIds the SKU already has a row
    // for in `data` (branch-scoped whenever this runs, since it requires
    // query.branchId).
    const existingStorageIdsByGroup = new Map<string, Set<string>>();
    for (const row of data) {
      let set = existingStorageIdsByGroup.get(row.groupKey);
      if (!set) {
        set = new Set();
        existingStorageIdsByGroup.set(row.groupKey, set);
      }
      set.add(row.storageId);
    }
    let appended = 0;
    for (const row of pendingOnlyRows ?? []) {
      // `destination_storage_id IS NULL` (rendered "Chưa chọn kho nhận")
      // cannot be told apart from stock the SKU already has somewhere in
      // this branch (T-01-01: it is the same physical stock, just a
      // transfer order that has not picked a destination yet) — so it is a
      // duplicate whenever *any* row already exists for the SKU here, not
      // only when a row exists at that exact synthetic key. A row with a
      // real destination storage is a distinct (SKU × storage) grain and is
      // only a duplicate of that same storage.
      const isSyntheticPending = row.storage_id === null;
      const storageId = row.storage_id ?? `pending:${row.branch_id}`;
      const existingStorageIds = existingStorageIdsByGroup.get(
        row.group_key,
      );
      if (isSyntheticPending) {
        if (existingStorageIds && existingStorageIds.size > 0) continue;
      } else if (existingStorageIds?.has(storageId)) {
        continue;
      }
      let set = existingStorageIdsByGroup.get(row.group_key);
      if (!set) {
        set = new Set();
        existingStorageIdsByGroup.set(row.group_key, set);
      }
      set.add(storageId);
      data.push({
        itemId: row.group_key,
        storageId,
        groupKey: row.group_key,
        productId: row.product_id,
        item: {
          id: row.group_key,
          code: row.item_code,
          name: row.item_name,
          unit: row.item_unit,
          brand: row.item_brand,
          isActive: row.item_is_active,
          categoryName: row.category_name,
        },
        storage: {
          id: storageId,
          name: row.storage_name ?? "Chưa chọn kho nhận",
          branchId: row.branch_id,
        },
        quantity: 0,
        lastMovementAt: null,
        openingQty: 0,
        openingValue: 0,
        inQty: 0,
        inValue: 0,
        outQty: 0,
        outValue: 0,
        closingQty: 0,
        closingValue: 0,
        transferOutQty: 0,
        incomingQty: Number(row.incoming_qty ?? 0),
        reservedQty: 0,
      });
      appended += 1;
    }
    return appended;
  }

  /**
   * Shared in-memory pagination path (ADR-01): optionally applies the
   * derived-column filter, sorts deterministically, totals, then slices.
   * `needsDerivedFilter` used this alone before T-01-03; the pending-only
   * merge now routes through it too instead of a second, page-blind way of
   * appending rows and bumping `total`.
   */
  private paginateInMemory(
    data: StockSummaryRow[],
    query: StockSummaryQuery,
    page: number,
    pageSize: number,
    applyDerivedFilter: boolean,
  ): StockSummaryResponse {
    const filteredData = applyDerivedFilter
      ? data.filter(
          (row) =>
            matchesCompare(row.openingQty, query.openingQty) &&
            matchesCompare(row.inQty, query.inQty) &&
            matchesCompare(row.outQty, query.outQty) &&
            matchesCompare(row.transferOutQty, query.transferOutQty) &&
            matchesCompare(row.incomingQty, query.incomingQty),
        )
      : data;
    // Deterministic order across identical calls: pending-only rows are
    // appended after the SQL-ordered rows (`mergePendingOnlyRows`), so
    // without this the merged set has no total order and OFFSET slicing
    // would tear (T-01-03).
    const sorted = [...filteredData].sort(sortStockSummaryRows);
    const filteredTotal = sorted.length;
    // Every matching row is in memory here, so the footer totals are a plain
    // reduce — taken after the filter and before the page slice, and exact
    // by construction.
    const filteredTotals = sorted.reduce<StockSummaryTotals>(
      (sum, row) => ({
        quantity: sum.quantity + row.quantity,
        openingQty: sum.openingQty + row.openingQty,
        inQty: sum.inQty + row.inQty,
        outQty: sum.outQty + row.outQty,
        closingQty: sum.closingQty + row.closingQty,
        transferOutQty: sum.transferOutQty + row.transferOutQty,
        incomingQty: sum.incomingQty + row.incomingQty,
        reservedQty: sum.reservedQty + row.reservedQty,
      }),
      {
        quantity: 0,
        openingQty: 0,
        inQty: 0,
        outQty: 0,
        closingQty: 0,
        transferOutQty: 0,
        incomingQty: 0,
        reservedQty: 0,
      },
    );
    const paged = sorted.slice((page - 1) * pageSize, page * pageSize);
    return {
      data: paged,
      total: filteredTotal,
      page,
      pageSize,
      totalQuantity: filteredTotals.quantity,
      ...(query.includeTotals === false ? {} : { totals: filteredTotals }),
    };
  }

  async getFilterOptions(
    organizationId: string,
  ): Promise<StockSummaryFilterOptions> {
    const [brandRows, unitRows] = await Promise.all([
      this.balanceRepo.manager.query<Array<{ brand: string }>>(
        `SELECT DISTINCT item.brand AS brand
           FROM items item
          WHERE item.organization_id = $1
            AND item.brand IS NOT NULL
            AND item.brand <> ''
          ORDER BY item.brand ASC`,
        [organizationId],
      ),
      this.balanceRepo.manager.query<Array<{ unit: string }>>(
        `SELECT DISTINCT item.unit AS unit
           FROM items item
          WHERE item.organization_id = $1
            AND item.unit IS NOT NULL
            AND item.unit <> ''
          ORDER BY item.unit ASC`,
        [organizationId],
      ),
    ]);

    return {
      brands: brandRows.map((r) => r.brand),
      units: unitRows.map((r) => r.unit),
    };
  }

  /**
   * Column totals over the whole filtered set, in one statement.
   *
   * The page path feeds its period / pending-transfer / reservation queries a
   * `unnest()` of the (item, storage) pairs **on the current page**, which is
   * why the footer could only ever sum a page. Here the grouped query itself
   * becomes the `pairs` CTE, so the same aggregates run against every matching
   * pair. No GROUP BY: the page needs a value per pair to key a Map, the footer
   * only needs a scalar, and dropping the grouping is what keeps this
   * affordable at ~8k pairs.
   *
   * Every CTE is a single scalar row, so the final cross join is 1×1×1×1×1 and
   * cannot multiply anything. Each one is emitted under exactly the same
   * condition as its page-path counterpart — otherwise the footer would stop
   * matching the column above it.
   */
  private buildTotalsSql(
    query: StockSummaryQuery,
    group: ReturnType<StockSummaryService["groupExpressions"]>,
    aggSql: string,
    aggParams: unknown[],
  ): { sql: string; params: unknown[] } {
    const params = [...aggParams];
    // aggSql already consumed $1..$n; keep numbering after it. Only parameters
    // actually referenced get bound — Postgres rejects surplus ones.
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    // `groups` is one row per grid row (so COUNT/SUM below match the grid),
    // while `pairs` expands each row back to the (item, storage) pairs the
    // ledger/transfer/reservation CTEs join on. They are the same set in
    // VARIANT mode and differ only when a row folds several variants.
    const ctes: string[] = [
      `groups AS (${aggSql})`,
      `pairs AS (
         SELECT DISTINCT member_id AS item_id, g.storage_id
         FROM groups g, unnest(g.item_ids) AS member_id)`,
      `base AS (
         SELECT COUNT(*)::int AS total,
                COALESCE(SUM(groups.quantity), 0)::numeric AS total_quantity
         FROM groups)`,
    ];

    // Period columns — mirrors the page query's condition at the call site.
    if (query.startDate || query.endDate) {
      const start = bind(query.startDate || "1970-01-01");
      const end = bind(query.endDate ? addOneDay(query.endDate) : "2999-12-31");
      const org = bind(query.organizationId);
      ctes.push(`period AS (
         SELECT
           COALESCE(SUM(CASE WHEN sle.posted_at < ${start} THEN sle.quantity ELSE 0 END), 0)::numeric AS opening_qty,
           COALESCE(SUM(CASE WHEN sle.posted_at >= ${start} AND sle.posted_at < ${end} AND sle.quantity > 0 THEN sle.quantity ELSE 0 END), 0)::numeric AS in_qty,
           COALESCE(SUM(CASE WHEN sle.posted_at >= ${start} AND sle.posted_at < ${end} AND sle.quantity < 0 THEN ABS(sle.quantity) ELSE 0 END), 0)::numeric AS out_qty
         FROM stock_ledger_entries sle
         INNER JOIN locations loc ON loc.id = sle.location_id
         INNER JOIN pairs p ON p.item_id = sle.item_id AND p.storage_id = loc.storage_id
         WHERE sle.organization_id = ${org}
         ${EXCLUDE_VOIDED_DOCS_SQL})`);
    } else {
      ctes.push(
        `period AS (SELECT 0::numeric AS opening_qty, 0::numeric AS in_qty, 0::numeric AS out_qty)`,
      );
    }

    // Pending transfers. The page path runs this unconditionally; a null
    // branchId simply makes both CASE arms false. Keeping the IN_PROGRESS and
    // deleted_at predicates in the JOIN (not a WHERE) is what stops the
    // pairs × lines product from exploding.
    {
      const branch = bind(query.branchId ?? null);
      const org = bind(query.organizationId);
      ctes.push(`pending AS (
         SELECT
           COALESCE(SUM(CASE
             WHEN t.source_branch_id = ${branch}
              AND COALESCE(l.source_storage_id, t.source_storage_id) = p.storage_id
             THEN l.requested_qty ELSE 0 END), 0)::numeric AS transfer_out_qty,
           COALESCE(SUM(CASE
             WHEN t.destination_branch_id = ${branch}
              AND t.destination_storage_id = p.storage_id
             THEN l.requested_qty ELSE 0 END), 0)::numeric AS incoming_qty
         FROM pairs p
         INNER JOIN transfer_order_lines l
           ON l.item_id = p.item_id AND l.organization_id = ${org}
         INNER JOIN transfer_orders t
           ON t.id = l.transfer_order_id
          AND t.organization_id = ${org}
          AND t.status = 'IN_PROGRESS'
          AND t.deleted_at IS NULL)`);
    }

    // Reservations — page path gates on branchId.
    if (query.branchId) {
      const branch = bind(query.branchId);
      const org = bind(query.organizationId);
      ctes.push(`reserved AS (
         SELECT COALESCE(SUM(invoice_item.quantity), 0)::numeric AS reserved_qty
         FROM pairs p
         INNER JOIN invoice_items invoice_item
           ON invoice_item.item_id = p.item_id
          AND invoice_item.organization_id = ${org}
          AND invoice_item.direction = 'OUT'
         INNER JOIN invoices invoice
           ON invoice.id = invoice_item.invoice_id
          AND invoice.organization_id = ${org}
          AND invoice.branch_id = ${branch}
          AND invoice.type = 'SALE'
          AND invoice.status IN ('draft', 'pending')
         INNER JOIN locations reservation_location
           ON reservation_location.id = invoice_item.location_id
          AND reservation_location.organization_id = ${org}
          AND reservation_location.storage_id = p.storage_id)`);
    } else {
      ctes.push(`reserved AS (SELECT 0::numeric AS reserved_qty)`);
    }

    // Incoming transfers to pairs that have no stock balance yet. The page path
    // appends these rows only on page 1; the footer must count them on every
    // page or it would shrink when the user pages. The NOT EXISTS guard makes
    // this set disjoint from `pairs`, so nothing is counted twice.
    //
    // T-01-04: this CTE must carry the same row filters as `buildPendingOnlyQuery`
    // (T-01-02) — a filtered-to-zero grid must show a zero "Sắp nhận về" total,
    // not the whole branch's. Reuses `applyCommonFilters` via the same
    // `RawSqlWhereCollector` shim instead of a third copy of the predicate set.
    if (query.branchId && !query.storageId) {
      const org = bind(query.organizationId);
      const branch = bind(query.branchId);
      const collector = new RawSqlWhereCollector(bind, {
        organizationId: query.organizationId,
      });
      this.applyCommonFilters(collector, query, {
        code: group.code,
        name: group.name,
        categoryAlias: "category",
        storageAlias: "destination_storage",
      });
      const extraConditions = collector.conditions
        .map((condition) => `           AND ${condition}`)
        .join("\n");
      ctes.push(`pending_only AS (
         SELECT COALESCE(SUM(transfer_line.requested_qty), 0)::numeric AS incoming_qty
         FROM transfer_orders transfer_order
         INNER JOIN transfer_order_lines transfer_line
           ON transfer_line.transfer_order_id = transfer_order.id
          AND transfer_line.organization_id = transfer_order.organization_id
         INNER JOIN items item
           ON item.id = transfer_line.item_id
          AND item.organization_id = transfer_order.organization_id
         LEFT JOIN products prod
           ON prod.id = item.product_id
         LEFT JOIN inventory_item_categories category
           ON category.id = item.category_id
         LEFT JOIN storages destination_storage
           ON destination_storage.id = transfer_order.destination_storage_id
          AND destination_storage.organization_id = transfer_order.organization_id
         WHERE transfer_order.organization_id = ${org}
           AND transfer_order.destination_branch_id = ${branch}
           AND transfer_order.status = 'IN_PROGRESS'
           AND transfer_order.deleted_at IS NULL
           AND NOT EXISTS (${this.pendingOnlyGuardSql(
             query.groupBy === StockSummaryGroupBy.SKU,
           )})
${extraConditions})`);
    } else {
      ctes.push(`pending_only AS (SELECT 0::numeric AS incoming_qty)`);
    }

    const sql = `WITH ${ctes.join(",\n")}
      SELECT base.total,
             base.total_quantity,
             period.opening_qty,
             period.in_qty,
             period.out_qty,
             pending.transfer_out_qty,
             pending.incoming_qty,
             pending_only.incoming_qty AS pending_only_incoming_qty,
             reserved.reserved_qty
      FROM base, period, pending, reserved, pending_only`;

    return { sql, params };
  }

  /** Shapes the totals row, deriving closingQty exactly as each row does. */
  private readTotals(
    raw: RawTotalsRow | undefined,
    totalQuantity: number,
    hasPeriod: boolean,
  ): StockSummaryTotals {
    const openingQty = Number(raw?.opening_qty ?? 0);
    const inQty = Number(raw?.in_qty ?? 0);
    const outQty = Number(raw?.out_qty ?? 0);
    return {
      quantity: totalQuantity,
      openingQty,
      inQty,
      outQty,
      closingQty: hasPeriod ? openingQty + inQty - outQty : totalQuantity,
      transferOutQty: Number(raw?.transfer_out_qty ?? 0),
      incomingQty:
        Number(raw?.incoming_qty ?? 0) +
        Number(raw?.pending_only_incoming_qty ?? 0),
      reservedQty: Number(raw?.reserved_qty ?? 0),
    };
  }

  /**
   * SQL fragments that differ between the two row granularities. `key` is what
   * a row is identified by; `code`/`name` are the pre-aggregation expressions
   * used by WHERE filters, `aggCode`/`aggName` their SELECT counterparts.
   */
  private groupExpressions(query: StockSummaryQuery, itemAlias = "item") {
    if (query.groupBy === StockSummaryGroupBy.SKU) {
      return {
        sku: true,
        key: `COALESCE(${itemAlias}.product_id::text, ${itemAlias}.id::text)`,
        groupBy: `COALESCE(${itemAlias}.product_id::text, ${itemAlias}.id::text)`,
        code: "COALESCE(prod.code, item.code)",
        name: "COALESCE(prod.name, item.name)",
        aggCode: `COALESCE(prod.code, MIN(${itemAlias}.code))`,
        aggName: `COALESCE(prod.name, MIN(${itemAlias}.name))`,
      };
    }
    return {
      sku: false,
      key: `${itemAlias}.id::text`,
      groupBy: `${itemAlias}.id`,
      code: "item.code",
      name: "item.name",
      aggCode: `${itemAlias}.code`,
      aggName: `${itemAlias}.name`,
    };
  }

  /**
   * "This destination has no stock balance yet", the guard that makes the
   * pending-only set disjoint from the paged set — the footer would otherwise
   * count the same incoming quantity twice.
   *
   * In SKU mode the test has to run over the whole model: if one variant
   * already has a balance the group is on the page, and pass 2 has already
   * counted the incoming of *every* variant in it.
   *
   * Assumes `transfer_order`, `transfer_line` and `item` are in scope.
   */
  private pendingOnlyGuardSql(sku: boolean): string {
    if (!sku) {
      return `
                SELECT 1
                FROM stock_balances pending_balance
                INNER JOIN locations pending_location
                  ON pending_location.id = pending_balance.location_id
                WHERE pending_balance.organization_id = transfer_order.organization_id
                  AND pending_balance.item_id = transfer_line.item_id
                  AND pending_balance.branch_id = transfer_order.destination_branch_id
                  AND (
                    transfer_order.destination_storage_id IS NULL
                    OR pending_location.storage_id = transfer_order.destination_storage_id
                  )`;
    }
    // SKU mode has no single item_id to key on — any variant of the same
    // product having a balance in this branch counts. A CASE-wrapped join
    // condition here (matching sibling.id = item.id OR sibling.product_id =
    // item.product_id in one predicate) isn't sargable, so Postgres falls back
    // to scanning every stock_balances row in the branch per transfer line.
    // Driving the match off `items` (indexed on organization_id, product_id)
    // first, then probing stock_balances by the resolved sibling ids (indexed
    // on organization_id, branch_id, item_id), keeps both lookups on an index.
    return `
                SELECT 1
                FROM items sibling
                WHERE sibling.organization_id = transfer_order.organization_id
                  AND (
                    (item.product_id IS NULL AND sibling.id = item.id)
                    OR (item.product_id IS NOT NULL AND sibling.product_id = item.product_id)
                  )
                  AND EXISTS (
                    SELECT 1
                    FROM stock_balances pending_balance
                    WHERE pending_balance.organization_id = transfer_order.organization_id
                      AND pending_balance.branch_id = transfer_order.destination_branch_id
                      AND pending_balance.item_id = sibling.id
                      AND (
                        transfer_order.destination_storage_id IS NULL
                        OR EXISTS (
                          SELECT 1 FROM locations pending_location
                          WHERE pending_location.id = pending_balance.location_id
                            AND pending_location.storage_id = transfer_order.destination_storage_id
                        )
                      )
                  )`;
  }

  private buildGroupedQuery(
    query: StockSummaryQuery,
  ): SelectQueryBuilder<StockBalanceEntity> {
    const group = this.groupExpressions(query);
    const qb = this.buildBaseQuery(query)
      .select(group.key, "group_key")
      .addSelect("MIN(item.product_id::text)", "product_id")
      .addSelect("array_agg(DISTINCT item.id)", "item_ids")
      .addSelect(group.aggCode, "item_code")
      .addSelect(group.aggName, "item_name")
      .addSelect("storage.id", "storage_id")
      .addSelect("storage.name", "storage_name")
      .addSelect("storage.branch_id", "branch_id")
      .addSelect("SUM(sb.quantity)", "quantity")
      .addSelect("MAX(sb.last_movement_at)", "last_movement_at")
      .groupBy(group.groupBy);

    if (group.sku) {
      // Aggregated because a product's variants may in theory disagree; in
      // practice they share unit/brand/category and any of them is the answer.
      qb.addSelect("MIN(item.unit)", "item_unit")
        .addSelect("MIN(item.brand)", "item_brand")
        .addSelect("BOOL_OR(item.is_active)", "item_is_active")
        .addSelect("MIN(cat.name)", "category_name")
        .addGroupBy("prod.code")
        .addGroupBy("prod.name");
    } else {
      qb.addSelect("item.unit", "item_unit")
        .addSelect("item.brand", "item_brand")
        .addSelect("item.is_active", "item_is_active")
        .addSelect("cat.name", "category_name")
        .addGroupBy("item.code")
        .addGroupBy("item.name")
        .addGroupBy("item.unit")
        .addGroupBy("item.brand")
        .addGroupBy("item.is_active")
        .addGroupBy("cat.name");
    }

    return qb
      .addGroupBy("storage.id")
      .addGroupBy("storage.name")
      .addGroupBy("storage.branch_id");
  }

  private applyHaving(
    qb: SelectQueryBuilder<StockBalanceEntity>,
    stockState: StockStateFilter | undefined,
    quantity?: CompareFilterDto,
  ): SelectQueryBuilder<StockBalanceEntity> {
    if (stockState === StockStateFilter.IN_STOCK) {
      qb.having("SUM(sb.quantity) > 0");
    } else if (stockState === StockStateFilter.OUT_OF_STOCK) {
      qb.having("SUM(sb.quantity) = 0");
    } else if (stockState === StockStateFilter.NEGATIVE) {
      qb.having("SUM(sb.quantity) < 0");
    }
    if (
      quantity &&
      quantity.value !== undefined &&
      quantity.value !== null &&
      quantity.value !== ""
    ) {
      qb.andHaving(
        `SUM(sb.quantity) ${compareSql(quantity.operator)} :quantityFilter`,
        { quantityFilter: Number(quantity.value) },
      );
    }
    return qb;
  }

  private buildBaseQuery(
    query: StockSummaryQuery,
  ): SelectQueryBuilder<StockBalanceEntity> {
    const group = this.groupExpressions(query);
    const qb = this.balanceRepo
      .createQueryBuilder("sb")
      .innerJoin("items", "item", "item.id = sb.item_id")
      .innerJoin("locations", "loc", "loc.id = sb.location_id")
      .innerJoin("storages", "storage", "storage.id = loc.storage_id")
      .leftJoin("inventory_item_categories", "cat", "cat.id = item.category_id")
      .leftJoin(
        "products",
        "prod",
        "prod.id = item.product_id AND prod.organization_id = item.organization_id",
      )
      .where("sb.organization_id = :organizationId", {
        organizationId: query.organizationId,
      });

    if (query.branchId) {
      qb.andWhere("sb.branch_id = :branchId", { branchId: query.branchId });
    }
    if (query.storageId) {
      qb.andWhere("loc.storage_id = :storageId", {
        storageId: query.storageId,
      });
    }
    this.applyCommonFilters(qb, query, {
      code: group.code,
      name: group.name,
      categoryAlias: "cat",
      storageAlias: "storage",
    });
    // Loại phần tồn ở các cặp (item × vị trí) đã ngừng theo dõi ở cấp vị trí
    // (stock_balances.is_tracked = false). Số liệu vẫn còn ở Báo cáo tồn kho (ledger).
    qb.andWhere("sb.is_tracked = true");
    // Không thống kê tồn ở kho đã ngừng hoạt động; số liệu vẫn còn ở Báo cáo tồn kho.
    qb.andWhere("storage.is_active = true");
    // Không thống kê tồn ở vị trí đã ngừng hoạt động (location.is_active = false).
    qb.andWhere("loc.is_active = true");
    if (query.movementFrom) {
      qb.andWhere("sb.last_movement_at >= :movementFrom", {
        movementFrom: query.movementFrom,
      });
    }
    if (query.movementTo) {
      qb.andWhere("sb.last_movement_at < :movementToPlus1", {
        movementToPlus1: addOneDay(query.movementTo),
      });
    }

    return qb;
  }

  /**
   * The filter predicates `buildBaseQuery` and `pendingOnlyQuery` (T-01-02,
   * ADR-01) must apply identically: `search`, the category subtree,
   * `item.is_active`, `brand`/`unit`, `isPosVisible`, and the itemCode /
   * itemName / category / brand / storage column filters. `branchId`,
   * `storageId`, `sb.is_tracked`, `storage.is_active`, `loc.is_active` and the
   * movement-date filters stay out of this method: they reference
   * `stock_balances` / `locations`, which `pendingOnlyQuery` never joins — a
   * row on the way in has no balance yet, by construction.
   *
   * `target` only needs `andWhere(sql, params)`, so `pendingOnlyQuery` can
   * pass a lightweight collector (`RawSqlWhereCollector`) that turns the same
   * named-parameter calls into `$n` positional binds instead of a real
   * TypeORM `SelectQueryBuilder`. That is what keeps this one source instead
   * of two copies that drift.
   */
  private applyCommonFilters(
    target: WhereTarget,
    query: StockSummaryQuery,
    aliases: {
      code: string;
      name: string;
      categoryAlias: string;
      storageAlias: string;
    },
  ): void {
    const { code, name, categoryAlias, storageAlias } = aliases;
    if (query.categoryId) {
      // Item categories form a tree (`parent_group_id`) and items are attached
      // to leaves, so an exact match on a parent group returns nothing at all.
      // Filtering on the whole subtree matches the POS catalog filter
      // (`resolveDescendantCategoryIds`). `UNION` (not `UNION ALL`) so a
      // malformed tree with a cycle terminates instead of looping.
      target.andWhere(
        `item.category_id IN (
          WITH RECURSIVE category_tree AS (
            SELECT root.id
            FROM inventory_item_categories root
            WHERE root.id = :categoryId
              AND root.organization_id = :organizationId
            UNION
            SELECT child.id
            FROM inventory_item_categories child
            INNER JOIN category_tree parent ON child.parent_group_id = parent.id
          )
          SELECT id FROM category_tree
        )`,
        { categoryId: query.categoryId },
      );
    }
    if (query.search && query.search.trim()) {
      target.andWhere(`(${code} ILIKE :q OR ${name} ILIKE :q)`, {
        q: `%${query.search.trim()}%`,
      });
    }
    new FilterBuilder(target as unknown as SelectQueryBuilder<ObjectLiteral>)
      .applyString(code, query.itemCode)
      .applyString(name, query.itemName)
      .applyString(
        "item.unit",
        typeof query.unit === "object" ? query.unit : undefined,
      )
      .applyString(`${categoryAlias}.name`, query.category)
      .applyString(
        "item.brand",
        typeof query.brand === "object" ? query.brand : undefined,
      )
      .applyString(`${storageAlias}.name`, query.storage);
    if (typeof query.brand === "string" && query.brand.trim()) {
      target.andWhere("item.brand ILIKE :brandQ", {
        brandQ: `%${query.brand.trim()}%`,
      });
    }
    if (typeof query.unit === "string" && query.unit.trim()) {
      target.andWhere("item.unit = :unit", { unit: query.unit.trim() });
    }
    // Tổng hợp tồn kho mặc định không thống kê hàng đã ngừng theo dõi; vẫn cho xem
    // khi client truyền isActive=false tường minh.
    target.andWhere("item.is_active = :isActive", {
      isActive: query.isActive ?? true,
    });
    if (query.isPosVisible !== undefined) {
      target.andWhere("item.is_pos_visible = :isPosVisible", {
        isPosVisible: query.isPosVisible,
      });
    }
  }

  /**
   * Builds `pendingOnlyQuery` as dynamic parameterised SQL (T-01-02): the
   * predicates from `applyCommonFilters` are appended after the transfer-order
   * WHERE clauses, bound at `$3` onward — `$1`/`$2` stay `organizationId` /
   * `branchId` exactly as before. Never string-interpolated: every filter
   * value flows through `bind()`.
   */
  private buildPendingOnlyQuery(
    query: StockSummaryQuery,
    group: ReturnType<StockSummaryService["groupExpressions"]>,
  ): { sql: string; params: unknown[] } {
    const params: unknown[] = [query.organizationId, query.branchId];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };
    const collector = new RawSqlWhereCollector(bind, {
      organizationId: query.organizationId,
    });
    this.applyCommonFilters(collector, query, {
      code: group.code,
      name: group.name,
      categoryAlias: "category",
      storageAlias: "destination_storage",
    });
    const extraConditions = collector.conditions
      .map((condition) => `              AND ${condition}`)
      .join("\n");

    const sql = `
            SELECT
              ${group.key} AS group_key,
              MIN(item.product_id::text) AS product_id,
              ${group.aggCode} AS item_code,
              ${group.aggName} AS item_name,
              ${group.sku ? "MIN(item.unit)" : "item.unit"} AS item_unit,
              ${group.sku ? "MIN(item.brand)" : "item.brand"} AS item_brand,
              ${group.sku ? "BOOL_OR(item.is_active)" : "item.is_active"} AS item_is_active,
              ${group.sku ? "MIN(category.name)" : "category.name"} AS category_name,
              destination_storage.id AS storage_id,
              destination_storage.name AS storage_name,
              transfer_order.destination_branch_id AS branch_id,
              SUM(transfer_line.requested_qty)::numeric AS incoming_qty
            FROM transfer_orders transfer_order
            INNER JOIN transfer_order_lines transfer_line
              ON transfer_line.transfer_order_id = transfer_order.id
             AND transfer_line.organization_id = transfer_order.organization_id
            INNER JOIN items item
              ON item.id = transfer_line.item_id
             AND item.organization_id = transfer_order.organization_id
            LEFT JOIN products prod
              ON prod.id = item.product_id
            LEFT JOIN inventory_item_categories category
              ON category.id = item.category_id
            LEFT JOIN storages destination_storage
              ON destination_storage.id = transfer_order.destination_storage_id
             AND destination_storage.organization_id = transfer_order.organization_id
            WHERE transfer_order.organization_id = $1
              AND transfer_order.destination_branch_id = $2
              AND transfer_order.status = 'IN_PROGRESS'
              AND transfer_order.deleted_at IS NULL
              AND NOT EXISTS (${this.pendingOnlyGuardSql(group.sku)})
${extraConditions}
            GROUP BY ${group.sku
              ? "prod.code, prod.name"
              : "item.code, item.name, item.unit, item.brand, item.is_active, category.name"},
                     ${group.groupBy}, destination_storage.id,
                     destination_storage.name, transfer_order.destination_branch_id
          `;
    return { sql, params };
  }
}

/** The slice of `SelectQueryBuilder` that `applyCommonFilters` actually calls. */
interface WhereTarget {
  andWhere(sql: string, params?: Record<string, unknown>): unknown;
}

/**
 * Lets `applyCommonFilters` — written once against TypeORM's named-parameter
 * `andWhere(sql, { key: value })` — drive a plain dynamic-SQL string instead
 * of a real `SelectQueryBuilder`. Every `:name` in `sql` is resolved to a
 * bound `$n` positional placeholder via `bind`, first from this call's own
 * `params`, falling back to `knownValues` for names bound elsewhere in the
 * base query (e.g. `:organizationId`, already `$1` in `pendingOnlyQuery`) —
 * mirroring how TypeORM merges parameters by name across an entire
 * `SelectQueryBuilder` regardless of which `andWhere` call introduced them.
 */
class RawSqlWhereCollector implements WhereTarget {
  readonly conditions: string[] = [];

  constructor(
    private readonly bind: (value: unknown) => string,
    private readonly knownValues: Record<string, unknown>,
  ) {}

  andWhere(sql: string, params?: Record<string, unknown>): this {
    const values = { ...this.knownValues, ...params };
    const resolved = sql.replace(/:([a-zA-Z0-9_]+)/g, (match, name) =>
      name in values ? this.bind(values[name]) : match,
    );
    this.conditions.push(resolved);
    return this;
  }
}

function compareSql(operator: CompareOperator): string {
  return (
    {
      [CompareOperator.EQUALS]: "=",
      [CompareOperator.LT]: "<",
      [CompareOperator.LTE]: "<=",
      [CompareOperator.GT]: ">",
      [CompareOperator.GTE]: ">=",
    }[operator] ?? "="
  );
}

/**
 * Same total order as the page query's own `ORDER BY` (`fetchPageData`):
 * item code, then storage name, then the (groupKey, storageId) tiebreakers.
 * `paginateInMemory` re-sorts with this after merging in pending-only rows,
 * which are appended out of that sequence — without it, two identical calls
 * could slice the merged set into different pages (T-01-03).
 */
function sortStockSummaryRows(a: StockSummaryRow, b: StockSummaryRow): number {
  return (
    a.item.code.localeCompare(b.item.code) ||
    a.storage.name.localeCompare(b.storage.name) ||
    a.groupKey.localeCompare(b.groupKey) ||
    a.storageId.localeCompare(b.storageId)
  );
}

function matchesCompare(value: number, filter?: CompareFilterDto): boolean {
  if (
    !filter ||
    filter.value === undefined ||
    filter.value === null ||
    filter.value === ""
  ) {
    return true;
  }
  const target = Number(filter.value);
  if (!Number.isFinite(target)) return true;
  switch (filter.operator) {
    case CompareOperator.EQUALS:
      return value === target;
    case CompareOperator.LT:
      return value < target;
    case CompareOperator.LTE:
      return value <= target;
    case CompareOperator.GT:
      return value > target;
    case CompareOperator.GTE:
      return value >= target;
  }
}

export function addOneDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
