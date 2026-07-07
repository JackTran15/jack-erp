import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ColumnFilter, ReportRow } from '@erp/shared-interfaces';
import { matchColumnFilter } from '../../reporting/report-core/column-filter.util';
import { InventoryReportSearchDto } from '../dto/inventory-report-search.dto';

/**
 * Upper bound on the rows a definition may materialize for in-memory
 * column-filtering + totals. Beyond this the user must narrow the period
 * or filters — silently truncating would produce wrong totals.
 */
export const MAX_REPORT_ROWS = 50_000;

export function assertUnderRowCap(total: number): void {
  if (total > MAX_REPORT_ROWS) {
    throw new BadRequestException(
      `Report exceeds ${MAX_REPORT_ROWS} rows (${total}); narrow the period or filters`,
    );
  }
}

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

/** Apply every per-column filter (AND) on the keyed rows. */
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

/** Slice one page and project each row onto the requested columns. */
export function paginateRows(
  rows: ReportRow[],
  columns: string[],
  page: number,
  limit: number,
): ReportRow[] {
  const offset = (page - 1) * limit;
  return rows.slice(offset, offset + limit).map((row) => {
    const projected: ReportRow = {};
    for (const col of columns) projected[col] = row[col] ?? null;
    return projected;
  });
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
