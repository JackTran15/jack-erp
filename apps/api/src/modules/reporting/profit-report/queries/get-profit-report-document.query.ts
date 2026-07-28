import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { ProfitReportExportDto } from '../dto/profit-report-export.dto';

/**
 * Build the renderable document for one profit report.
 *
 * Serves both output routes: `export` renders it to a workbook,
 * `print-payload` returns it as JSON, so the two can never disagree (ADR-01).
 */
export class GetProfitReportDocumentQuery {
  constructor(
    public readonly dto: ProfitReportExportDto,
    public readonly actor: ActorContext,
  ) {}
}
