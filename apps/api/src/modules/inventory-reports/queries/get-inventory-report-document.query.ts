import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InventoryReportExportDto } from '../dto/inventory-report-export.dto';

/**
 * Build the renderable document for one inventory report.
 *
 * Serves both output routes: `export` turns the result into a workbook,
 * `print-payload` returns it as JSON. One query means the printed page and the
 * exported file can never disagree (ADR-01).
 */
export class GetInventoryReportDocumentQuery {
  constructor(
    public readonly dto: InventoryReportExportDto,
    public readonly actor: ActorContext,
  ) {}
}
