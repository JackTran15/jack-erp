import { ReportRow } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { ReportDefinition } from '../report-definition';
import { ExportFetcher, PushRows } from './export.types';

/**
 * Fetches a whole report in one `buildData` call and pushes it as a single
 * batch.
 *
 * This is the path for aggregate reports: a row is a sum over the entire
 * period, so there is no record-level cursor to page on, and the totals must
 * be computed over every row anyway (A-01). It is also the fallback for any
 * report that has not declared a keyset source.
 *
 * What keeps it bounded is the row cap, and that check does NOT belong here:
 * by the time `drain` runs the response is already open, so a failure can only
 * break the download. `ReportExportService.prepareExport` enforces it while a
 * 400 is still possible (ADR-08).
 */
export class SingleShotFetcher<TDto> implements ExportFetcher {
  constructor(
    private readonly definition: ReportDefinition<TDto>,
    private readonly dto: TDto,
    private readonly actor: ActorContext,
    /** Passed in rather than imported, so this file owns no policy. */
    private readonly limit: number,
  ) {}

  async drain(push: PushRows): Promise<ReportRow | null> {
    const data = await this.definition.buildData(
      { ...this.dto, page: 1, limit: this.limit },
      this.actor,
    );
    if (data.rows.length) await push(data.rows);
    return data.totals;
  }
}
