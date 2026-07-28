import {
  DocumentColumn,
  ReportColumnDataType,
  ReportColumnHeader,
  ReportDocumentPayload,
  ReportRow,
} from '@erp/shared-interfaces';
import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../branch/branch.entity';
import { splitIntoWindows } from './export/date-range.util';
import { ExportDocumentHeader, ExportFetcher } from './export/export.types';
import { SingleShotFetcher } from './export/single-shot.fetcher';
import { TimePartitionKeysetFetcher } from './export/time-partition-keyset.fetcher';
import { ReportDefinition, ReportRegistry } from './report-definition';
import { assertUnderRowCap, MAX_REPORT_ROWS } from './row-cap.util';

/**
 * Turns any registered report definition into something an export can run on.
 *
 * Generic over the domain DTO, so one instance serves the invoice, inventory,
 * profit and debt registries alike — and a report added later gets export and
 * print for free, without touching this file (ADR-01).
 *
 * Two shapes come out of the same data path: `prepareExport` for the streaming
 * file (the header and a fetcher, no rows in hand), `buildPayload` for the
 * print route, which genuinely needs every row at once. The second is written
 * on top of the first so the two can never drift.
 */

/**
 * Upper bound passed to `buildData` so it returns the whole result set.
 *
 * Same number as the cap it must never truncate before: one constant, imported
 * from `row-cap.util`, so the two cannot drift apart.
 */
export const EXPORT_ROW_LIMIT = MAX_REPORT_ROWS;

const NUMBER_TYPES: ReadonlySet<ReportColumnDataType> = new Set([
  ReportColumnDataType.NUMBER,
  ReportColumnDataType.CURRENCY,
  ReportColumnDataType.PERCENT,
]);

/** The subset of a domain search DTO that exporting actually depends on. */
export interface ReportExportRequest {
  reportType: string;
  /** Visible column keys, already in display order. */
  columns: string[];
  /** Per-column labels the user renamed; missing keys fall back to the catalog. */
  columnLabels?: Record<string, string>;
  page?: number;
  limit?: number;
}

/** Document framing the caller supplies — the domain owns its Vietnamese title. */
export interface ReportExportContext {
  title: string;
  subtitleLines?: string[];
}

/**
 * Everything an export needs, with the rows still unread.
 *
 * `onComplete` closes over the request's log context so the caller reports the
 * finished row count without having to carry `reportType` and the actor around
 * — that count is the number A-02 (whether async export is needed) turns on.
 */
export interface PreparedExport {
  header: ExportDocumentHeader;
  columns: DocumentColumn[];
  fetcher: ExportFetcher;
  onComplete(rowCount: number): void;
}

/**
 * Period line for the document header. Every domain stores its range as a
 * `DateRangeFilterDto` under a different field name (`issuedAt`, `period`, …),
 * so the caller passes the range and this formats it. Returns no line at all
 * when nothing was filtered, rather than claiming an open-ended period.
 */
export function dateRangeSubtitle(
  range?: { from?: string; to?: string } | null,
): string[] {
  if (!range?.from && !range?.to) return [];
  return [`Từ ngày: ${range.from ?? '—'}; Đến ngày: ${range.to ?? '—'}`];
}

@Injectable()
export class ReportExportService {
  private readonly logger = new Logger(ReportExportService.name);

  constructor(
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    // Optional so a unit test can build the service without a config module;
    // every tuning key falls back to the default when it is absent.
    @Optional() private readonly config?: ConfigService,
  ) {}

  /**
   * Resolve the report, validate the requested columns, and hand back a
   * fetcher — without reading a single row.
   *
   * Everything that can still fail with a 4xx happens here, on purpose: the
   * caller opens the response only afterwards, and once it is open a failure
   * can no longer be turned into a status code (ADR-08).
   */
  async prepareExport<TDto extends ReportExportRequest>(
    registry: ReportRegistry<ReportDefinition<TDto>>,
    dto: TDto,
    actor: ActorContext,
    context: ReportExportContext,
  ): Promise<PreparedExport> {
    const startedAt = Date.now();
    const definition = registry.get(dto.reportType);
    if (!definition) {
      throw new BadRequestException(`Unknown report type: ${dto.reportType}`);
    }

    // Validate against the resolved catalog, not a static list: pivot reports
    // add per-branch columns that only exist once the actor is known.
    const catalog = await definition.buildColumns(actor);
    const columns = this.resolveColumns(catalog, dto);

    // A cursor-paged report streams and never holds the whole set, so the row
    // cap has nothing to protect there and is deliberately not applied (AC-18).
    // Everything else gets counted here, while a 400 is still deliverable.
    if (!definition.exportSource && definition.countRows) {
      const counted = await definition.countRows(dto, actor);
      assertUnderRowCap(counted.total, counted.subject);
    }

    const { fetcher, path } = this.buildFetcher(definition, dto, actor, columns);

    return {
      header: {
        title: context.title,
        branch: await this.loadBranch(actor),
        subtitleLines: context.subtitleLines ?? [],
      },
      columns,
      fetcher,
      onComplete: (rowCount) =>
        this.logger.log(
          `report export reportType=${dto.reportType} org=${actor.organizationId} ` +
            `path=${path} columns=${columns.length} rows=${rowCount} ` +
            `ms=${Date.now() - startedAt}`,
        ),
    };
  }

  /**
   * Keyset when the report declares it can be paged by cursor, one big call
   * otherwise. Nothing above this line knows which one it got.
   */
  private buildFetcher<TDto extends ReportExportRequest>(
    definition: ReportDefinition<TDto>,
    dto: TDto,
    actor: ActorContext,
    columns: DocumentColumn[],
  ): { fetcher: ExportFetcher; path: 'single-shot' | 'keyset' } {
    const source = definition.exportSource;
    if (!source) {
      // Every domain filters and totals over all rows before slicing a page,
      // so a large limit yields correct totals (A-01).
      return {
        fetcher: new SingleShotFetcher(definition, dto, actor, EXPORT_ROW_LIMIT),
        path: 'single-shot',
      };
    }

    const tuning = this.tuning();
    const range = source.range(dto);
    const keys = columns.map((column) => column.col);
    // `splitIntoWindows` yields newest first; an ascending report reads the
    // other way round, and the window order is what fixes the row order in the
    // file, so it has to follow the report rather than the other way about.
    const windows = splitIntoWindows(range?.from, range?.to, tuning.partitions);
    if (source.order === 'asc') windows.reverse();
    return {
      fetcher: new TimePartitionKeysetFetcher({
        partitions: windows,
        parallel: tuning.parallel,
        columns: keys,
        summable: source.summable(keys),
        batchSize: tuning.batchSize,
        bufferHighWater: tuning.bufferHighWater,
        batchTimeoutMs: tuning.batchTimeoutMs,
        fetch: (args) => source.page(dto, actor, args),
      }),
      path: 'keyset',
    };
  }

  /**
   * Export tuning, read per request so a value can be changed without a
   * redeploy. `parallel` is also the number of pool connections one export
   * holds, and the pool is shared with every other request — hence the low
   * default.
   */
  private tuning() {
    return {
      partitions: this.number('EXPORT_PARTITIONS', 5),
      parallel: Math.max(1, this.number('EXPORT_PARTITION_PARALLEL', 3)),
      batchSize: this.number('EXPORT_BATCH_SIZE', 1000),
      bufferHighWater: this.number('EXPORT_BUFFER_HIGH_WATER', 20_000),
      batchTimeoutMs: this.number('EXPORT_BATCH_TIMEOUT_MS', 30_000),
    };
  }

  private number(key: string, fallback: number): number {
    const raw = Number(this.config?.get<string>(key));
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  /**
   * The whole report as one payload, for the print route — which has to hand
   * the browser every row at once and so cannot stream.
   */
  async buildPayload<TDto extends ReportExportRequest>(
    registry: ReportRegistry<ReportDefinition<TDto>>,
    dto: TDto,
    actor: ActorContext,
    context: ReportExportContext,
  ): Promise<ReportDocumentPayload> {
    const prepared = await this.prepareExport(registry, dto, actor, context);
    return this.materialize(prepared);
  }

  /**
   * Drains an already-prepared export into a full payload.
   *
   * Split out of `buildPayload` so a caller that already holds a
   * `PreparedExport` — the print-payload routes, which reuse the same query
   * as `export` (ADR-01) — can materialize it without resolving the report a
   * second time.
   */
  async materialize(prepared: PreparedExport): Promise<ReportDocumentPayload> {
    const rows: ReportRow[] = [];
    const totals = await prepared.fetcher.drain(async (batch) => {
      rows.push(...batch);
    });
    prepared.onComplete(rows.length);
    return { ...prepared.header, columns: prepared.columns, rows, totals };
  }

  /** Project the requested keys onto catalog metadata, rejecting unknown ones. */
  private resolveColumns(
    catalog: ReportColumnHeader[],
    dto: ReportExportRequest,
  ): DocumentColumn[] {
    const byKey = new Map(catalog.map((header) => [header.col, header]));
    const unknown = dto.columns.filter((col) => !byKey.has(col));
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown report columns: ${[...new Set(unknown)].join(', ')}`,
      );
    }

    return dto.columns.map((col) => {
      const header = byKey.get(col)!;
      // The label map arrives as free-form JSON, so take a renamed label only
      // when it really is a string; anything else falls back to the catalog.
      const renamed = dto.columnLabels?.[col];
      const column: DocumentColumn = {
        col,
        label: typeof renamed === 'string' ? renamed : header.name ?? col,
        type: header.type,
        align: header.align ?? (NUMBER_TYPES.has(header.type) ? 'right' : 'left'),
      };
      if (header.width !== undefined) column.width = header.width;
      return column;
    });
  }

  /**
   * The branch block is header decoration, so a missing or cross-org branch
   * yields null rather than an error — a chain-wide report has no single branch.
   */
  private async loadBranch(actor: ActorContext) {
    if (!actor.branchId) return null;
    const branch = await this.branchRepo.findOne({
      where: { id: actor.branchId, organizationId: actor.organizationId },
    });
    if (!branch) return null;
    return {
      name: branch.name,
      address: branch.address ?? null,
      phone: branch.phone ?? null,
    };
  }
}
