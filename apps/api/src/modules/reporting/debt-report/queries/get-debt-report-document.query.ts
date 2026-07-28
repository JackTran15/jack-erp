import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { DebtReportExportDto } from '../dto/debt-report-export.dto';

/**
 * Build the renderable document for one debt report.
 *
 * Serves both output routes: `export` renders it to a workbook,
 * `print-payload` returns it as JSON, so the two can never disagree (ADR-01).
 */
export class GetDebtReportDocumentQuery {
  constructor(
    public readonly dto: DebtReportExportDto,
    public readonly actor: ActorContext,
  ) {}
}
