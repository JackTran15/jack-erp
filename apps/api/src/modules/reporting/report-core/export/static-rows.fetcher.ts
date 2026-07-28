import { ReportRow } from '@erp/shared-interfaces';
import { ExportFetcher, PushRows } from './export.types';

/**
 * Fetches from rows already fully resolved in memory — one batch, no query.
 *
 * The voucher-export routes (UOW-08) already hold the whole document after
 * `getById`; there is nothing to page or count, so this fetcher exists only
 * to satisfy `ExportPipeline`'s contract (ADR-09) and let a single voucher
 * reuse the exact same `ExportPipeline`/`XlsxStreamWriter`/`HttpResponseSink`
 * as report export (ADR-06), instead of a bespoke writer for one row source.
 */
export class StaticRowsFetcher implements ExportFetcher {
  constructor(
    private readonly rows: ReportRow[],
    private readonly totals: ReportRow | null,
  ) {}

  async drain(push: PushRows): Promise<ReportRow | null> {
    if (this.rows.length) await push(this.rows);
    return this.totals;
  }
}
