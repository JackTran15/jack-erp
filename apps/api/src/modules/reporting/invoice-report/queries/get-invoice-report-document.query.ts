import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InvoiceReportExportDto } from '../dto/invoice-report-export.dto';

/**
 * Build the renderable document for one invoice report.
 *
 * Serves both output routes: `export` renders it to a workbook,
 * `print-payload` returns it as JSON, so the two can never disagree (ADR-01).
 */
export class GetInvoiceReportDocumentQuery {
  constructor(
    public readonly dto: InvoiceReportExportDto,
    public readonly actor: ActorContext,
  ) {}
}
