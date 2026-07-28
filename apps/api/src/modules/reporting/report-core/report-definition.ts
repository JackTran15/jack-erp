import { InvoiceReportResult, ReportColumnHeader } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { FetchPageArgs, FetchPageResult } from './export/export.types';

/**
 * A report's optional keyset capability (ADR-07).
 *
 * Reports that list one row per record implement this and get exported by
 * cursor, in parallel time windows, with no row cap. Aggregate reports — where
 * one row is a sum over the whole period — have no `(at, id)` to point a cursor
 * at, so they leave it undefined and keep the single-shot path.
 */
export interface ReportExportSource<TDto> {
  /**
   * Which way the exported file reads, and therefore both the order the time
   * windows are drained in and the direction `page` compares its cursor.
   *
   * It has to match how the report sorts on screen: a file that comes out
   * newest-first when the table is oldest-first is not the same report.
   * Defaults to `desc`.
   */
  readonly order?: 'asc' | 'desc';
  /** The date range to partition on, read from this report's own DTO field. */
  range(dto: TDto): { from?: string; to?: string } | null;
  /** Of the requested columns, the ones whose running sum means something. */
  summable(columns: string[]): string[];
  /**
   * One keyset page, already projected to report rows.
   *
   * Must order by `(at DESC, id DESC)` and return `at` as full-precision
   * timestamptz text — a cursor built from a JS `Date` skips rows.
   */
  page(
    dto: TDto,
    actor: ActorContext,
    args: FetchPageArgs,
  ): Promise<FetchPageResult>;
}

/**
 * A pluggable report, generic over its search DTO. Each report type is one
 * backend definition: it owns its columns and its data/aggregation. The
 * frontend stays generic — it only renders headers + rows and never knows a
 * report's semantics. Invoice and inventory reports share this core; each
 * domain keeps its own registry instance (own permission + own DTO).
 */
export interface ReportDefinition<TDto> {
  /** Stable English key (matches the domain's report-type option keys). */
  readonly key: string;
  /** Full catalog of columns for this report (fixed + any dynamic), scoped to the actor. */
  buildColumns(actor: ActorContext): Promise<ReportColumnHeader[]>;
  /** Run the report and return the data-only envelope (no headers). */
  buildData(dto: TDto, actor: ActorContext): Promise<InvoiceReportResult>;
  /**
   * How many records this report would pull into memory, without pulling them.
   *
   * Optional: a report that declares it gets its row cap checked *before*
   * `buildData` runs, which is the only point at which exceeding it can still
   * be answered with a 400 rather than an out-of-memory process (ADR-08).
   *
   * The number is whatever predicts memory for this report — the source rows
   * for one that aggregates in memory, the result rows for one that aggregates
   * in SQL — and `subject` names it so the error can say what it counted.
   */
  countRows?(dto: TDto, actor: ActorContext): Promise<CountedRows>;
  /**
   * Declared by reports that can be paged by cursor; absent everywhere else.
   *
   * Present means the export streams by keyset with no row cap; absent means
   * the single-shot path and the cap that goes with it.
   */
  readonly exportSource?: ReportExportSource<TDto>;
}

/** A pre-flight count and the noun for the error message. */
export interface CountedRows {
  total: number;
  /** e.g. 'rows', 'invoices'. */
  subject: string;
}

/** Indexes the registered report definitions of one domain by key. */
export class ReportRegistry<
  TDef extends ReportDefinition<any> = ReportDefinition<any>,
> {
  private readonly byKey: Map<string, TDef>;

  constructor(definitions: TDef[]) {
    this.byKey = new Map(definitions.map((d) => [d.key, d]));
  }

  list(): string[] {
    return [...this.byKey.keys()];
  }

  get(key: string): TDef | undefined {
    return this.byKey.get(key);
  }
}
