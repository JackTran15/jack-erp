import { BadRequestException } from '@nestjs/common';
import {
  CompareOperator,
  StringOperator,
} from '../../../common/filters/filter.dto';
import type { ReportColumnFilterDto } from '../dto/report-column-filter.dto';

/**
 * How one grid column maps onto SQL.
 *
 * `sql` is spliced into the outermost stage of a report's query — after the
 * aggregation, where the row the user sees actually exists. Reports assemble
 * their rows through CTEs, so filtering earlier would change what is being
 * aggregated rather than which aggregated rows survive.
 */
export interface ReportColumnSpec {
  /** SQL expression producing the column's value at the outer stage. */
  sql: string;
  kind: 'text' | 'number';
}

export type ReportColumnSpecs = Record<string, ReportColumnSpec>;

/**
 * The filters one report request carries, keyed by engine field name.
 *
 * A key may hold several filters, which are AND-ed. That happens when a column
 * is constrained from two places at once — the filter bar's unit/brand
 * dropdowns and the grid's own filter row both land on `unit` (ADR-06). Keeping
 * one and dropping the other would return rows the user did not ask for while
 * the UI shows both filters as active.
 */
export type ReportColumnFilters = Record<
  string,
  ReportColumnFilterDto | ReportColumnFilterDto[]
>;

export interface ReportFilterFragment {
  /** `WHERE`-ready clause, already parenthesised. Empty when nothing applies. */
  where: string;
  /** Positional parameters, continuing from `startIndex`. */
  params: unknown[];
}

const COMPARE_SQL: Record<CompareOperator, string> = {
  [CompareOperator.EQUALS]: '=',
  [CompareOperator.LT]: '<',
  [CompareOperator.LTE]: '<=',
  [CompareOperator.GT]: '>',
  [CompareOperator.GTE]: '>=',
};

/**
 * Builds the column-filter predicate for a report query.
 *
 * The same fragment goes into the rows query, the count query and the totals
 * query — one build, three uses — which is what stops the footer from
 * disagreeing with the grid it sits under.
 *
 * @param startIndex number of parameters already consumed by the caller's SQL;
 *                   emitted placeholders start at `startIndex + 1`.
 */
export function buildReportColumnFilter(
  filters: ReportColumnFilters | undefined,
  specs: ReportColumnSpecs,
  startIndex: number,
): ReportFilterFragment {
  const params: unknown[] = [];
  const clauses: string[] = [];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${startIndex + params.length}`;
  };

  for (const [key, entry] of Object.entries(filters ?? {})) {
    if (!entry) continue;
    const spec = specs[key];
    // An unknown key is a contract mismatch between grid and report, not a
    // reason to silently return unfiltered rows under a filtered-looking UI.
    if (!spec) {
      throw new BadRequestException(
        `Cột "${key}" không hỗ trợ lọc trên báo cáo này`,
      );
    }

    // Several filters on one column all have to hold, so each contributes its
    // own clause to the same AND-ed list.
    for (const filter of Array.isArray(entry) ? entry : [entry]) {
      if (!filter) continue;
      const clause =
        spec.kind === 'number'
          ? numberClause(spec.sql, filter, bind)
          : textClause(spec.sql, filter, bind);
      if (clause) clauses.push(clause);
    }
  }

  return { where: clauses.join(' AND '), params };
}

function numberClause(
  sql: string,
  filter: ReportColumnFilterDto,
  bind: (value: unknown) => string,
): string | null {
  const parts: string[] = [];

  // Range wins over the single-value compare when both arrive: the grid sends
  // from/to only for its range mode, and mixing them would silently drop one.
  if (filter.from !== undefined && filter.from !== null && filter.from !== '') {
    parts.push(`(${sql}) >= ${bind(Number(filter.from))}`);
  }
  if (filter.to !== undefined && filter.to !== null && filter.to !== '') {
    parts.push(`(${sql}) <= ${bind(Number(filter.to))}`);
  }
  if (parts.length > 0) return `(${parts.join(' AND ')})`;

  if (filter.value === undefined || filter.value === null || filter.value === '') {
    return null;
  }
  const value = Number(filter.value);
  if (Number.isNaN(value)) return null;
  const operator = COMPARE_SQL[filter.operator as CompareOperator] ?? '=';
  return `((${sql}) ${operator} ${bind(value)})`;
}

function textClause(
  sql: string,
  filter: ReportColumnFilterDto,
  bind: (value: unknown) => string,
): string | null {
  const raw = filter.value;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const value = String(raw);

  switch (filter.operator as StringOperator) {
    case StringOperator.EQUALS:
      return `(LOWER(${sql}) = LOWER(${bind(value)}))`;
    case StringOperator.STARTS_WITH:
      return `(${sql} ILIKE ${bind(`${escapeLike(value)}%`)})`;
    case StringOperator.ENDS_WITH:
      return `(${sql} ILIKE ${bind(`%${escapeLike(value)}`)})`;
    case StringOperator.NOT_CONTAINS:
      // COALESCE so a NULL cell counts as "does not contain", which is what a
      // user filtering for absence expects.
      return `(COALESCE(${sql}, '') NOT ILIKE ${bind(`%${escapeLike(value)}%`)})`;
    case StringOperator.CONTAINS:
    default:
      return `(${sql} ILIKE ${bind(`%${escapeLike(value)}%`)})`;
  }
}

/** `%` and `_` are wildcards in LIKE; a user typing them means them literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
