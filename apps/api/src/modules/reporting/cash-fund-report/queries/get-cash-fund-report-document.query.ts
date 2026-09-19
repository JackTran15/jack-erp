import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CashFundReportExportDto } from '../dto/cash-fund-report-export.dto';

/**
 * Build the renderable document for one cash-fund report.
 *
 * Serves both output routes: `export` renders it to a workbook,
 * `print-payload` returns it as JSON, so the two can never disagree (ADR-01).
 */
export class GetCashFundReportDocumentQuery {
  constructor(
    public readonly dto: CashFundReportExportDto,
    public readonly actor: ActorContext,
  ) {}
}
