import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ColumnFilter, ReportRow, ReportTotals } from '@erp/shared-interfaces';
import { matchColumnFilter } from '../../reporting/report-core/column-filter.util';
import { InventoryReportSearchDto } from '../dto/inventory-report-search.dto';

/** Reject requested/filtered column keys not present in the catalog. */
export function assertKnownColumns(
  dto: InventoryReportSearchDto,
  catalog: Set<string>,
): void {
  const referenced = [
    ...dto.columns,
    ...(dto.columnFilters ?? []).map((f) => f.col),
  ];
  const unknown = referenced.filter((k) => !catalog.has(k));
  if (unknown.length) {
    throw new BadRequestException(
      `Unknown report columns: ${[...new Set(unknown)].join(', ')}`,
    );
  }
}

/**
 * Apply every per-column filter (AND) on the keyed rows.
 *
 * The seven paged inventory reports no longer use this — they compile their
 * filters into SQL. It stays for `transfer-summary`, whose engine returns one
 * row per branch and so has nothing to page or cap.
 */
export function applyColumnFilters(
  rows: ReportRow[],
  filters: ColumnFilter[] | undefined,
): ReportRow[] {
  if (!filters?.length) return rows;
  return rows.filter((row) =>
    filters.every((f) => matchColumnFilter(row[f.col] ?? null, f)),
  );
}

/**
 * Totals over ALL (filtered) rows: numeric columns summed, everything else
 * null. `nonAdditive` marks numeric columns whose sum is meaningless
 * (unit prices, averages). Returns null when there are no rows.
 */
export function buildTotalsRow(
  columns: string[],
  rows: ReportRow[],
  numeric: Set<string>,
  nonAdditive?: Set<string>,
): ReportRow | null {
  if (!rows.length) return null;
  const totals: ReportRow = {};
  for (const col of columns) {
    if (!numeric.has(col) || nonAdditive?.has(col)) {
      totals[col] = null;
      continue;
    }
    let sum = 0;
    for (const row of rows) sum += Number(row[col] ?? 0);
    totals[col] = Math.round(sum * 100) / 100;
  }
  return totals;
}

/**
 * Project each row onto the requested columns, in the requested order.
 *
 * What is left of `paginateRows` once the slicing moves into SQL: the engine
 * hands back the page already, and all that remains is trimming each row to the
 * columns the grid asked for.
 */
export function projectRows(rows: ReportRow[], columns: string[]): ReportRow[] {
  return rows.map((row) => {
    const projected: ReportRow = {};
    for (const col of columns) projected[col] = row[col] ?? null;
    return projected;
  });
}

/** Slice one page and project each row onto the requested columns. */
export function paginateRows(
  rows: ReportRow[],
  columns: string[],
  page: number,
  limit: number,
): ReportRow[] {
  const offset = (page - 1) * limit;
  return projectRows(rows.slice(offset, offset + limit), columns);
}

/** Deterministic cache key of one search request (must include the org). */
export function searchCacheKey(
  organizationId: string,
  dto: InventoryReportSearchDto,
): string {
  return createHash('sha256')
    .update(organizationId)
    .update(JSON.stringify(dto))
    .digest('hex');
}

/**
 * Project the engine's whole-set totals onto the requested columns.
 *
 * The in-memory sibling `buildTotalsRow` sums the rows it was handed, which is
 * only correct while every row is in hand. Once paging moves into SQL the
 * footer has to come from the engine's own aggregate — this turns that map
 * (keyed by engine field name) into a row keyed by report column, in the order
 * the grid asked for.
 *
 * A column missing from `totals` becomes `null`, never `0`: zero is a claim
 * about the data, and a column the engine does not aggregate has no such claim
 * to make. `nonAdditive` marks columns whose sum would be meaningless — unit
 * prices and averages, where the average of averages is simply wrong.
 */
export function toTotalsRow(
  columns: string[],
  totals: ReportTotals | undefined,
  keyMap: Readonly<Record<string, string>> = {},
  nonAdditive?: Set<string>,
): ReportRow | null {
  if (!totals || Object.keys(totals).length === 0) return null;

  const row: ReportRow = {};
  for (const col of columns) {
    if (nonAdditive?.has(col)) {
      row[col] = null;
      continue;
    }
    const value = totals[keyMap[col] ?? col];
    row[col] = typeof value === 'number' ? value : null;
  }
  return row;
}
