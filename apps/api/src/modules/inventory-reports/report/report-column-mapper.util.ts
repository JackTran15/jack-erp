import { BadRequestException } from '@nestjs/common';
import { ColumnFilter } from '@erp/shared-interfaces';
import {
  CompareOperator,
  StringOperator,
} from '../../../common/filters/filter.dto';
import type { ReportColumnFilterDto } from '../dto/report-column-filter.dto';
import type { ReportColumnFilters } from '../services/report-column-filter.util';

/**
 * Bridges the two filter vocabularies that meet at the v2 report boundary.
 *
 * The grid speaks `ColumnFilter`, where the operator IS the field name
 * (`{col: 'endingQty', gte: 10}`). The report engines speak
 * `ReportColumnFilterDto`, where the operator is a value (`{operator: '>=',
 * value: 10}`) — the shape `buildReportColumnFilter` compiles into SQL.
 *
 * Without this translation a v2 report definition has no way to push a filter
 * down, which is why they all filtered in memory over the whole result set and
 * tripped the row cap on the way in (see 03-logical-design.md).
 */

/**
 * Report column key → the field name its engine knows it by.
 *
 * A key that is absent maps to itself. Report catalogs and engine rows disagree
 * often enough (`name`/`itemName`, `endingQty`/`closingQty`,
 * `reference`/`referenceNumber`) that the mapping has to live somewhere; it
 * lives next to each report's `COLUMNS`, so a reader sees the catalog and its
 * translation in one place (ADR-03).
 */
export type ReportKeyMap = Readonly<Record<string, string>>;

/**
 * Filter-bar selections that are really equality predicates on a report column.
 *
 * These used to be applied in JS after pagination, which was harmless only
 * because the whole set was in memory. Once paging moves into SQL, leaving them
 * behind would filter just the page in view — a wrong answer that looks right,
 * which is worse than the 400 this whole feature exists to remove (A-11).
 */
export interface ScopeColumnFilters {
  unit?: string;
  brand?: string;
}

/** Grid operator field → the engine's text operator. */
const TEXT_OPERATORS: ReadonlyArray<[keyof ColumnFilter, StringOperator]> = [
  ['contains', StringOperator.CONTAINS],
  ['equals', StringOperator.EQUALS],
  ['startsWith', StringOperator.STARTS_WITH],
  ['endsWith', StringOperator.ENDS_WITH],
  ['notContains', StringOperator.NOT_CONTAINS],
];

/** Grid operator field → the engine's numeric comparison operator. */
const NUMBER_OPERATORS: ReadonlyArray<[keyof ColumnFilter, CompareOperator]> = [
  ['eq', CompareOperator.EQUALS],
  ['lt', CompareOperator.LT],
  ['lte', CompareOperator.LTE],
  ['gt', CompareOperator.GT],
  ['gte', CompareOperator.GTE],
];

/** Every field that carries an operator, `from`/`to` included. */
const OPERATOR_FIELDS: ReadonlyArray<keyof ColumnFilter> = [
  ...TEXT_OPERATORS.map(([field]) => field),
  ...NUMBER_OPERATORS.map(([field]) => field),
  'from',
  'to',
];

function isSet(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function single(
  field: keyof ColumnFilter,
  filter: ColumnFilter,
): ReportColumnFilterDto | null {
  const text = TEXT_OPERATORS.find(([f]) => f === field);
  if (text) return { operator: text[1], value: String(filter[text[0]]) };

  const num = NUMBER_OPERATORS.find(([f]) => f === field);
  if (num) return { operator: num[1], value: Number(filter[num[0]]) };

  // A lone `from` or `to` — how the grid renders < / > on a non-numeric column.
  if (field === 'from') return { from: filter.from };
  if (field === 'to') return { to: filter.to };
  return null;
}

/**
 * Collapse one grid filter onto the engine's single-operator shape.
 *
 * Refuses rather than picks when a column carries operators that cannot be
 * expressed together (ADR-02). The grid emits exactly one operator per column
 * — `invoice-report.api.ts` pushes `{col, [op]: value}` — so this only fires
 * for a hand-rolled caller, one that today is silently getting under-filtered
 * rows back from the in-memory path.
 */
function toEngineFilter(col: string, filter: ColumnFilter): ReportColumnFilterDto {
  const present = OPERATOR_FIELDS.filter((field) => isSet(filter[field]));

  if (present.length === 0) return {};
  if (present.length === 1) {
    return single(present[0], filter) ?? {};
  }

  // The one legal pairing: two ends of a range. `gte`/`lte` is what the grid's
  // range mode emits; `from`/`to` is the same idea already in engine terms.
  const pair = new Set(present);
  if (pair.size === 2 && pair.has('gte') && pair.has('lte')) {
    return { from: Number(filter.gte), to: Number(filter.lte) };
  }
  if (pair.size === 2 && pair.has('from') && pair.has('to')) {
    return { from: filter.from, to: filter.to };
  }

  throw new BadRequestException(
    `Cột "${col}" nhận nhiều toán tử lọc không gộp được (${present.join(', ')}); ` +
      'chỉ gửi một toán tử, hoặc dùng cặp gte/lte cho khoảng',
  );
}

/**
 * Translate the grid's column filters into the keyed map the engines take.
 *
 * Columns whose filter is empty are dropped rather than forwarded: an entry
 * with no operator would reach `buildReportColumnFilter`, which rejects keys it
 * has no spec for — turning a blank filter box into a 400.
 *
 * `scope` folds the filter bar's unit/brand selections onto the same columns as
 * exact matches (ADR-06). When the bar and the grid both constrain one column
 * the two predicates are kept side by side and AND-ed in SQL, which is what the
 * in-memory path did by running both filters in sequence.
 */
export function toEngineFilters(
  filters: ColumnFilter[] | undefined,
  keyMap: ReportKeyMap = {},
  scope: ScopeColumnFilters = {},
): ReportColumnFilters {
  const out: ReportColumnFilters = {};

  for (const filter of filters ?? []) {
    const engineFilter = toEngineFilter(filter.col, filter);
    if (Object.keys(engineFilter).length === 0) continue;
    out[keyMap[filter.col] ?? filter.col] = engineFilter;
  }

  for (const [column, value] of Object.entries(scope)) {
    if (!isSet(value)) continue;
    const key = keyMap[column] ?? column;
    const scopeFilter: ReportColumnFilterDto = {
      operator: StringOperator.EQUALS,
      value: value as string,
    };
    const existing = out[key];
    if (!existing) {
      out[key] = scopeFilter;
      continue;
    }
    out[key] = [...(Array.isArray(existing) ? existing : [existing]), scopeFilter];
  }

  return out;
}
