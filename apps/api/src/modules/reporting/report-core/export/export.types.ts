import { DocumentColumn, ReportDocumentPayload, ReportRow } from '@erp/shared-interfaces';
import { Writable } from 'stream';

/**
 * The three seams of an export (ADR-06).
 *
 * A fetcher decides where rows come from, a writer decides how bytes are
 * shaped, a sink decides where bytes go. `ExportPipeline` is the only thing
 * that knows all three, and it knows nothing about reports.
 *
 * The split exists because the first version welded the three together —
 * payload, then workbook, then response — so the cash ledger, which is not in
 * the report registry, could not reuse any of it (A-08).
 */

/** Everything above the header row: branch block, title, filter lines. */
export type ExportDocumentHeader = Omit<
  ReportDocumentPayload,
  'columns' | 'rows' | 'totals'
>;

/**
 * A page cursor for keyset pagination on `(at DESC, id DESC)`.
 *
 * `at` is the full-precision Postgres `timestamptz` as text, read with a
 * `::text` cast. A JS `Date` drops sub-millisecond precision, and a cursor that
 * rounds is a cursor that skips or repeats the rows either side of it.
 */
export interface KeysetCursor {
  at: string;
  id: string;
}

/** A half-open `[from, to)` time window. Missing bounds mean an open window. */
export interface TimePartition {
  from?: Date;
  to?: Date;
}

export interface FetchPageArgs {
  partition: TimePartition;
  cursor: KeysetCursor | null;
  size: number;
}

export interface FetchPageResult {
  rows: ReportRow[];
  nextCursor: KeysetCursor | null;
  /** True when another page may exist — `rows.length === size`, never a COUNT. */
  hasMore: boolean;
}

/** Hands one batch of rows downstream, in output order. */
export type PushRows = (rows: ReportRow[]) => Promise<void>;

export interface ExportFetcher {
  /**
   * Drain every row, calling `push` in output order as batches become
   * available, and return the totals row (null when there are no rows).
   */
  drain(push: PushRows): Promise<ReportRow | null>;
}

export interface ExportWriter {
  begin(
    target: Writable,
    header: ExportDocumentHeader,
    columns: DocumentColumn[],
  ): Promise<void>;
  rows(rows: ReportRow[]): Promise<void>;
  end(totals: ReportRow | null): Promise<void>;
}

export interface ExportSink {
  /** The destination the writer writes into. */
  stream(): Writable;
  /** Called once the writer is done, and only if it succeeded. */
  finalize(): Promise<void>;
}
