import { DocumentColumn } from '@erp/shared-interfaces';
import {
  ExportDocumentHeader,
  ExportFetcher,
  ExportSink,
  ExportWriter,
} from './export.types';

/**
 * Runs one export: open the writer over the sink's stream, drain the fetcher
 * into it, close both.
 *
 * Everything that can fail with an HTTP status — unknown report, unknown
 * column, row cap — must have failed before `run` is called, because the first
 * byte leaves the process inside `begin` and a response cannot be un-sent
 * (ADR-08).
 */
export class ExportPipeline {
  constructor(
    private readonly fetcher: ExportFetcher,
    private readonly writer: ExportWriter,
    private readonly sink: ExportSink,
  ) {}

  /** Returns the number of data rows written, for the caller's export log. */
  async run(
    header: ExportDocumentHeader,
    columns: DocumentColumn[],
  ): Promise<number> {
    await this.writer.begin(this.sink.stream(), header, columns);
    let written = 0;
    const totals = await this.fetcher.drain(async (rows) => {
      written += rows.length;
      await this.writer.rows(rows);
    });
    await this.writer.end(totals);
    await this.sink.finalize();
    return written;
  }
}
