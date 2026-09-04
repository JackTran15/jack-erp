import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import {
  CompareFilterDto,
  CompareOperator,
  StringFilterDto,
  StringOperator,
} from "../../../common/filters/filter.dto";
import { StockLedgerCardDto } from "./dto/stock-ledger-card.dto";
import { StockSkuBreakdownDto } from "./dto/stock-sku-breakdown.dto";
import {
  REFERENCE_TYPE_OPTIONS,
  descriptionSql,
  documentNumberSql,
  resolveReferenceLabel,
} from "./stock-ledger-reference.constants";
import { EXCLUDE_VOIDED_DOCS_SQL, addOneDay } from "./stock-summary.service";

export interface StockSkuBreakdownRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  /** Same derivation as the parent grid: period ? opening + in - out : balance. */
  quantity: number;
  openingQty: number;
  inQty: number;
  outQty: number;
  /**
   * Pending transfers are tracked per (item × storage) — they have no location.
   * The figure is therefore attributed to one anchor row per item so the column
   * footer still equals the parent grid's cell.
   */
  transferOutQty: number;
  incomingQty: number;
  isPendingAnchor: boolean;
  reservedQty: number;
}

export interface StockSkuBreakdownTotals {
  quantity: number;
  openingQty: number;
  inQty: number;
  outQty: number;
  transferOutQty: number;
  incomingQty: number;
  reservedQty: number;
}

export interface StockSkuBreakdownResponse {
  data: StockSkuBreakdownRow[];
  total: number;
  page: number;
  pageSize: number;
  /** "Số hàng hóa = N" — distinct items after filtering, before the page slice. */
  itemCount: number;
  totals: StockSkuBreakdownTotals;
}

export interface StockLedgerCardRow {
  id: string;
  documentType: string;
  documentTypeLabel: string;
  documentNumber: string | null;
  postedAt: string;
  description: string | null;
  inQty: number;
  outQty: number;
  /** Running balance: opening + every movement up to and including this one. */
  balanceQty: number;
}

export interface StockLedgerCardResponse {
  data: StockLedgerCardRow[];
  total: number;
  page: number;
  pageSize: number;
  unit: string;
  /** `Số dư đầu kỳ` — rendered as a pinned first row, not part of `data`. */
  openingQty: number;
  closingQty: number;
  totals: { inQty: number; outQty: number };
  /**
   * (item × storage) figures with no ledger equivalent — pending transfer
   * orders have posted nothing. Surfaced once so the modal can show them in the
   * footer instead of faking a per-movement number.
   */
  pendingTransferOutQty: number;
  pendingIncomingQty: number;
  /** Options for the `Loại chứng từ` dropdown — one source of truth, no FE map. */
  documentTypeOptions: Array<{ value: string; label: string }>;
}

interface RawBreakdownRow {
  item_id: string;
  item_code: string;
  item_name: string;
  unit: string;
  location_id: string;
  location_code: string;
  location_name: string;
  balance_qty: string | number | null;
  opening_qty: string | number | null;
  in_qty: string | number | null;
  out_qty: string | number | null;
  reserved_qty: string | number | null;
}

interface RawPendingRow {
  item_id: string;
  transfer_out_qty: string | number | null;
  incoming_qty: string | number | null;
}

interface RawLedgerRow {
  id: string;
  reference_type: string;
  posted_at: Date;
  description: string | null;
  in_qty: string | number;
  out_qty: string | number;
  balance_qty: string | number;
  document_number: string | null;
}

const DEFAULT_START = "1970-01-01";
const DEFAULT_END = "2999-12-31";

@Injectable()
export class StockSummaryDetailService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * "Chi tiết hàng hóa" — every variant of one SKU held in one storage, split
   * by location. Bounded by construction (one model × one storage), so the
   * per-column filters, the footer and the page slice all run in memory, the
   * same way `StockSummaryService` handles its derived-column filters.
   */
  async getSkuBreakdown(
    dto: StockSkuBreakdownDto,
    organizationId: string,
    branchId?: string,
  ): Promise<StockSkuBreakdownResponse> {
    const page = Math.max(1, Number(dto.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(dto.limit ?? 50)));
    const hasPeriod = Boolean(dto.startDate || dto.endDate);
    const startDate = dto.startDate || DEFAULT_START;
    const endDate = dto.endDate ? addOneDay(dto.endDate) : DEFAULT_END;

    // Two arms instead of COALESCE(product_id, id) so both stay sargable:
    // the first uses IDX_items_org_product, the second the primary key.
    const sql = `
      WITH grp_items AS (
        SELECT i.id, i.code, i.name, i.unit
        FROM items i
        WHERE i.organization_id = $1 AND i.product_id = $2
        UNION ALL
        SELECT i.id, i.code, i.name, i.unit
        FROM items i
        WHERE i.organization_id = $1 AND i.id = $2 AND i.product_id IS NULL
      ),
      cells AS (
        SELECT sb.item_id, sb.location_id
        FROM stock_balances sb
        INNER JOIN grp_items g ON g.id = sb.item_id
        INNER JOIN locations loc
          ON loc.id = sb.location_id AND loc.storage_id = $3 AND loc.is_active = true
        WHERE sb.organization_id = $1 AND sb.is_tracked = true
        UNION
        SELECT sle.item_id, sle.location_id
        FROM stock_ledger_entries sle
        INNER JOIN grp_items g ON g.id = sle.item_id
        INNER JOIN locations loc
          ON loc.id = sle.location_id AND loc.storage_id = $3 AND loc.is_active = true
        WHERE sle.organization_id = $1 AND sle.posted_at < $5
        ${EXCLUDE_VOIDED_DOCS_SQL}
      ),
      balance AS (
        SELECT sb.item_id, sb.location_id, SUM(sb.quantity)::numeric AS qty
        FROM stock_balances sb
        INNER JOIN cells c ON c.item_id = sb.item_id AND c.location_id = sb.location_id
        WHERE sb.organization_id = $1 AND sb.is_tracked = true
        GROUP BY sb.item_id, sb.location_id
      ),
      period AS (
        SELECT
          sle.item_id,
          sle.location_id,
          SUM(CASE WHEN sle.posted_at < $4 THEN sle.quantity ELSE 0 END)::numeric AS opening_qty,
          SUM(CASE WHEN sle.posted_at >= $4 AND sle.posted_at < $5 AND sle.quantity > 0 THEN sle.quantity ELSE 0 END)::numeric AS in_qty,
          SUM(CASE WHEN sle.posted_at >= $4 AND sle.posted_at < $5 AND sle.quantity < 0 THEN ABS(sle.quantity) ELSE 0 END)::numeric AS out_qty
        FROM stock_ledger_entries sle
        INNER JOIN cells c ON c.item_id = sle.item_id AND c.location_id = sle.location_id
        WHERE sle.organization_id = $1
        ${EXCLUDE_VOIDED_DOCS_SQL}
        GROUP BY sle.item_id, sle.location_id
      ),
      reserved AS (
        SELECT
          invoice_item.item_id,
          invoice_item.location_id,
          COALESCE(SUM(invoice_item.quantity), 0)::numeric AS reserved_qty
        FROM invoice_items invoice_item
        INNER JOIN cells c
          ON c.item_id = invoice_item.item_id AND c.location_id = invoice_item.location_id
        INNER JOIN invoices invoice
          ON invoice.id = invoice_item.invoice_id
         AND invoice.organization_id = $1
         AND invoice.branch_id = $6
         AND invoice.type = 'SALE'
         AND invoice.status IN ('draft', 'pending')
        WHERE invoice_item.organization_id = $1
          AND invoice_item.direction = 'OUT'
        GROUP BY invoice_item.item_id, invoice_item.location_id
      )
      SELECT
        c.item_id,
        g.code AS item_code,
        g.name AS item_name,
        g.unit,
        loc.id AS location_id,
        loc.code AS location_code,
        loc.name AS location_name,
        COALESCE(balance.qty, 0)::numeric AS balance_qty,
        COALESCE(period.opening_qty, 0)::numeric AS opening_qty,
        COALESCE(period.in_qty, 0)::numeric AS in_qty,
        COALESCE(period.out_qty, 0)::numeric AS out_qty,
        COALESCE(reserved.reserved_qty, 0)::numeric AS reserved_qty
      FROM cells c
      INNER JOIN grp_items g ON g.id = c.item_id
      INNER JOIN locations loc ON loc.id = c.location_id
      LEFT JOIN balance ON balance.item_id = c.item_id AND balance.location_id = c.location_id
      LEFT JOIN period ON period.item_id = c.item_id AND period.location_id = c.location_id
      LEFT JOIN reserved ON reserved.item_id = c.item_id AND reserved.location_id = c.location_id
      ORDER BY g.code ASC, loc.code ASC, loc.id ASC
    `;

    const [raw, pendingRaw] = await Promise.all([
      this.dataSource.query<RawBreakdownRow[]>(sql, [
        organizationId,
        dto.groupKey,
        dto.storageId,
        startDate,
        endDate,
        branchId ?? null,
      ]),
      this.loadPendingTransfers(organizationId, dto.storageId, {
        groupKey: dto.groupKey,
        branchId,
      }),
    ]);

    const anchored = new Set<string>();
    let rows: StockSkuBreakdownRow[] = raw.map((r) => {
      // Without a period the parent grid leaves these three at 0 rather than
      // reporting lifetime movement; the modal has to say the same thing.
      const openingQty = hasPeriod ? Number(r.opening_qty ?? 0) : 0;
      const inQty = hasPeriod ? Number(r.in_qty ?? 0) : 0;
      const outQty = hasPeriod ? Number(r.out_qty ?? 0) : 0;
      const isPendingAnchor = !anchored.has(r.item_id);
      anchored.add(r.item_id);
      const pending = isPendingAnchor ? pendingRaw.get(r.item_id) : undefined;
      return {
        itemId: r.item_id,
        itemCode: r.item_code,
        itemName: r.item_name,
        unit: r.unit,
        locationId: r.location_id,
        locationCode: r.location_code,
        locationName: r.location_name,
        quantity: hasPeriod
          ? openingQty + inQty - outQty
          : Number(r.balance_qty ?? 0),
        openingQty,
        inQty,
        outQty,
        transferOutQty: Number(pending?.transfer_out_qty ?? 0),
        incomingQty: Number(pending?.incoming_qty ?? 0),
        isPendingAnchor,
        reservedQty: Number(r.reserved_qty ?? 0),
      };
    });

    rows = rows.filter(
      (row) =>
        matchesString(row.itemCode, dto.itemCode) &&
        matchesString(row.itemName, dto.itemName) &&
        matchesString(row.unit, dto.unit) &&
        matchesString(row.locationCode, dto.locationCode) &&
        matchesString(row.locationName, dto.locationName) &&
        matchesCompare(displayQuantity(row, dto.excludeReservations), dto.quantity) &&
        matchesCompare(row.openingQty, dto.openingQty) &&
        matchesCompare(row.inQty, dto.inQty) &&
        matchesCompare(row.outQty, dto.outQty) &&
        matchesCompare(row.transferOutQty, dto.transferOutQty) &&
        matchesCompare(row.incomingQty, dto.incomingQty),
    );

    // Footer over the filtered set, taken before the page slice — the totals
    // must not change when the user pages.
    const totals = rows.reduce<StockSkuBreakdownTotals>(
      (sum, row) => ({
        quantity: sum.quantity + row.quantity,
        openingQty: sum.openingQty + row.openingQty,
        inQty: sum.inQty + row.inQty,
        outQty: sum.outQty + row.outQty,
        transferOutQty: sum.transferOutQty + row.transferOutQty,
        incomingQty: sum.incomingQty + row.incomingQty,
        reservedQty: sum.reservedQty + row.reservedQty,
      }),
      {
        quantity: 0,
        openingQty: 0,
        inQty: 0,
        outQty: 0,
        transferOutQty: 0,
        incomingQty: 0,
        reservedQty: 0,
      },
    );

    return {
      data: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
      itemCount: new Set(rows.map((row) => row.itemId)).size,
      totals,
    };
  }

  /**
   * "Chi tiết tồn kho" — the stock card of one item in one storage.
   *
   * The running balance is a window over the **whole** period, computed before
   * paging and before the per-column filters. Anything else and the balance
   * would stop reconciling the moment the user turns a page or hides a row.
   */
  async getLedgerCard(
    dto: StockLedgerCardDto,
    organizationId: string,
    branchId: string,
  ): Promise<StockLedgerCardResponse> {
    const page = Math.max(1, Number(dto.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(dto.limit ?? 50)));
    const startDate = dto.startDate || DEFAULT_START;
    const endDate = dto.endDate ? addOneDay(dto.endDate) : DEFAULT_END;

    const scope = [
      organizationId,
      dto.itemId,
      dto.storageId,
      branchId,
      startDate,
      endDate,
      dto.locationId ?? null,
    ];
    const params: unknown[] = [...scope];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const conditions: string[] = [];
    if (dto.documentType?.value?.trim()) {
      conditions.push(
        `m.reference_type = ${bind(dto.documentType.value.trim())}`,
      );
    }
    if (dto.documentDate?.value) {
      conditions.push(
        `m.posted_at::date ${compareSql(dto.documentDate.operator)} ${bind(
          dto.documentDate.value,
        )}::date`,
      );
    }
    // Filtering on the document number or the description is the one case
    // that forces the corresponding CASE expression into the scanned set
    // instead of just the page — see the `movements` CTE below.
    const filtersDocumentNumber = Boolean(dto.documentNumber?.value?.trim());
    if (filtersDocumentNumber) {
      conditions.push(
        stringSql("COALESCE(m.document_number, '')", dto.documentNumber!, bind),
      );
    }
    const filtersDescription = Boolean(dto.description?.value?.trim());
    if (filtersDescription) {
      conditions.push(
        stringSql("COALESCE(m.resolved_description, '')", dto.description!, bind),
      );
    }
    for (const [column, filter] of [
      ["m.in_qty", dto.inQty],
      ["m.out_qty", dto.outQty],
      ["m.balance_qty", dto.balanceQty],
    ] as const) {
      if (
        filter?.value === undefined ||
        filter?.value === null ||
        filter?.value === ""
      ) {
        continue;
      }
      conditions.push(
        `${column} ${compareSql(filter.operator)} ${bind(Number(filter.value))}`,
      );
    }

    const documentNumberExpr = documentNumberSql("sle");
    const descriptionExpr = descriptionSql("sle");
    const cte = `
      WITH opening AS (
        SELECT COALESCE(SUM(sle.quantity), 0)::numeric AS qty
        FROM stock_ledger_entries sle
        INNER JOIN locations loc ON loc.id = sle.location_id
        WHERE sle.organization_id = $1
          AND sle.item_id = $2
          AND loc.storage_id = $3
          AND sle.branch_id = $4
          AND ($7::uuid IS NULL OR sle.location_id = $7)
          AND sle.posted_at < $5
          ${EXCLUDE_VOIDED_DOCS_SQL}
      ),
      movements AS (
        SELECT
          sle.id,
          sle.reference_type,
          sle.posted_at,
          GREATEST(sle.quantity, 0)::numeric AS in_qty,
          GREATEST(-sle.quantity, 0)::numeric AS out_qty,
          -- Running balance over the WHOLE period, before paging and before
          -- the per-column filters: a stock card that stops reconciling when
          -- you turn a page or hide a row is worse than no card.
          ((SELECT qty FROM opening) + SUM(sle.quantity) OVER (
             ORDER BY sle.posted_at ASC, sle.id ASC
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ))::numeric AS balance_qty
          ${filtersDocumentNumber ? `, ${documentNumberExpr} AS document_number` : ""}
          ${filtersDescription ? `, ${descriptionExpr} AS resolved_description` : ""}
        FROM stock_ledger_entries sle
        INNER JOIN locations loc ON loc.id = sle.location_id
        WHERE sle.organization_id = $1
          AND sle.item_id = $2
          AND loc.storage_id = $3
          AND sle.branch_id = $4
          AND ($7::uuid IS NULL OR sle.location_id = $7)
          AND sle.posted_at >= $5
          AND sle.posted_at < $6
          ${EXCLUDE_VOIDED_DOCS_SQL}
      ),
      filtered AS (
        SELECT m.*, ROW_NUMBER() OVER (ORDER BY m.posted_at ASC, m.id ASC) AS rn
        FROM movements m
        ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      )`;

    const offset = (page - 1) * pageSize;
    const pageParams = [...params, offset, offset + pageSize];
    const pageSql = `${cte}
      SELECT f.id, f.reference_type, f.posted_at,
             f.in_qty, f.out_qty, f.balance_qty,
             ${filtersDocumentNumber ? "f.document_number" : `(${documentNumberSql("src")}) AS document_number`},
             ${filtersDescription ? "f.resolved_description AS description" : `(${descriptionSql("src")}) AS description`}
      FROM filtered f
      ${filtersDocumentNumber && filtersDescription ? "" : "INNER JOIN stock_ledger_entries src ON src.id = f.id"}
      WHERE f.rn > $${params.length + 1} AND f.rn <= $${params.length + 2}
      ORDER BY f.rn ASC`;

    const statsSql = `${cte}
      SELECT COUNT(*)::int AS total_rows,
             COALESCE(SUM(in_qty), 0)::numeric AS total_in,
             COALESCE(SUM(out_qty), 0)::numeric AS total_out
      FROM filtered`;

    const [raw, stats, balances, pending, item] = await Promise.all([
      this.dataSource.query<RawLedgerRow[]>(pageSql, pageParams),
      this.dataSource.query<
        Array<{
          total_rows: number;
          total_in: string;
          total_out: string;
        }>
      >(statsSql, params),
      // Opening and closing describe the period, not the filtered rows, and the
      // page can legitimately be empty — so they get their own statement.
      this.dataSource.query<Array<{ opening_qty: string; closing_qty: string }>>(
        `
          SELECT
            COALESCE(SUM(CASE WHEN sle.posted_at < $5 THEN sle.quantity ELSE 0 END), 0)::numeric AS opening_qty,
            COALESCE(SUM(CASE WHEN sle.posted_at < $6 THEN sle.quantity ELSE 0 END), 0)::numeric AS closing_qty
          FROM stock_ledger_entries sle
          INNER JOIN locations loc ON loc.id = sle.location_id
          WHERE sle.organization_id = $1
            AND sle.item_id = $2
            AND loc.storage_id = $3
            AND sle.branch_id = $4
            AND ($7::uuid IS NULL OR sle.location_id = $7)
            ${EXCLUDE_VOIDED_DOCS_SQL}
        `,
        scope,
      ),
      this.loadPendingTransfers(organizationId, dto.storageId, {
        itemId: dto.itemId,
        branchId,
      }),
      this.dataSource.query<Array<{ unit: string }>>(
        `SELECT unit FROM items WHERE id = $1 AND organization_id = $2`,
        [dto.itemId, organizationId],
      ),
    ]);

    const itemPending = pending.get(dto.itemId);
    return {
      data: raw.map((r) => ({
        id: r.id,
        documentType: r.reference_type,
        documentTypeLabel: resolveReferenceLabel(r.reference_type),
        documentNumber: r.document_number ?? null,
        postedAt: r.posted_at.toISOString(),
        description: r.description ?? null,
        inQty: Number(r.in_qty),
        outQty: Number(r.out_qty),
        balanceQty: Number(r.balance_qty),
      })),
      total: Number(stats[0]?.total_rows ?? 0),
      page,
      pageSize,
      unit: item[0]?.unit ?? "",
      openingQty: Number(balances[0]?.opening_qty ?? 0),
      closingQty: Number(balances[0]?.closing_qty ?? 0),
      totals: {
        inQty: Number(stats[0]?.total_in ?? 0),
        outQty: Number(stats[0]?.total_out ?? 0),
      },
      pendingTransferOutQty: Number(itemPending?.transfer_out_qty ?? 0),
      pendingIncomingQty: Number(itemPending?.incoming_qty ?? 0),
      documentTypeOptions: REFERENCE_TYPE_OPTIONS,
    };
  }
  /**
   * `Đang chuyển đi` / `Sắp nhận về` per item for one storage — the same
   * in-progress transfer-order arithmetic the summary grid uses, narrowed to a
   * single SKU group or a single item.
   */
  private async loadPendingTransfers(
    organizationId: string,
    storageId: string,
    target: { branchId?: string; itemId?: string; groupKey?: string },
  ): Promise<Map<string, RawPendingRow>> {
    const result = new Map<string, RawPendingRow>();
    const { branchId, itemId, groupKey } = target;
    if (!branchId) return result;
    const scope = itemId
      ? "line.item_id = $4"
      : "item.product_id = $4 OR (item.id = $4 AND item.product_id IS NULL)";
    const rows = await this.dataSource.query<RawPendingRow[]>(
      `
        SELECT
          line.item_id,
          COALESCE(SUM(CASE
            WHEN t.source_branch_id = $2
             AND COALESCE(line.source_storage_id, t.source_storage_id) = $3
            THEN line.requested_qty ELSE 0 END), 0)::numeric AS transfer_out_qty,
          COALESCE(SUM(CASE
            WHEN t.destination_branch_id = $2
             AND t.destination_storage_id = $3
            THEN line.requested_qty ELSE 0 END), 0)::numeric AS incoming_qty
        FROM transfer_order_lines line
        INNER JOIN transfer_orders t
          ON t.id = line.transfer_order_id
         AND t.organization_id = $1
         AND t.status = 'IN_PROGRESS'
         AND t.deleted_at IS NULL
        INNER JOIN items item ON item.id = line.item_id AND item.organization_id = $1
        WHERE line.organization_id = $1 AND (${scope})
        GROUP BY line.item_id
      `,
      [organizationId, branchId, storageId, itemId ?? groupKey],
    );
    for (const row of rows) result.set(row.item_id, row);
    return result;
  }
}

function displayQuantity(
  row: StockSkuBreakdownRow,
  excludeReservations?: boolean,
): number {
  return row.quantity - (excludeReservations ? row.reservedQty : 0);
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

function stringSql(
  column: string,
  filter: StringFilterDto,
  bind: (value: unknown) => string,
): string {
  const value = filter.value;
  switch (filter.operator) {
    case StringOperator.EQUALS:
      return `${column} = ${bind(value)}`;
    case StringOperator.STARTS_WITH:
      return `${column} ILIKE ${bind(`${value}%`)}`;
    case StringOperator.ENDS_WITH:
      return `${column} ILIKE ${bind(`%${value}`)}`;
    case StringOperator.NOT_CONTAINS:
      return `${column} NOT ILIKE ${bind(`%${value}%`)}`;
    default:
      return `${column} ILIKE ${bind(`%${value}%`)}`;
  }
}

function matchesString(value: string, filter?: StringFilterDto): boolean {
  const expected = filter?.value?.trim().toLocaleLowerCase("vi-VN");
  if (!expected) return true;
  const actual = (value ?? "").toLocaleLowerCase("vi-VN");
  switch (filter!.operator) {
    case StringOperator.EQUALS:
      return actual === expected;
    case StringOperator.STARTS_WITH:
      return actual.startsWith(expected);
    case StringOperator.ENDS_WITH:
      return actual.endsWith(expected);
    case StringOperator.NOT_CONTAINS:
      return !actual.includes(expected);
    default:
      return actual.includes(expected);
  }
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
