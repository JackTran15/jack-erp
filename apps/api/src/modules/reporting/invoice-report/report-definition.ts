import { InvoiceReportResult, ReportColumnHeader } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InvoiceReportSearchDto } from './dto/invoice-report-search.dto';

/**
 * A pluggable report. Each report type (daily sales summary, invoice listing,
 * revenue by employee, …) is one backend definition: it owns its columns and
 * its data/aggregation. The frontend stays generic — it only renders headers +
 * dataRaw and never knows a report's semantics.
 */
export interface ReportDefinition {
  /** Stable English key (matches InvoiceReportTypeOption.key + REPORT_TYPE_LABELS_VI). */
  readonly key: string;
  /** Full catalog of columns for this report (fixed + any dynamic), scoped to the actor. */
  buildColumns(actor: ActorContext): Promise<ReportColumnHeader[]>;
  /** Run the report and return the data-only envelope (no headers). */
  buildData(
    dto: InvoiceReportSearchDto,
    actor: ActorContext,
  ): Promise<InvoiceReportResult>;
}

/** Indexes the registered report definitions by key. */
export class ReportRegistry {
  private readonly byKey: Map<string, ReportDefinition>;

  constructor(definitions: ReportDefinition[]) {
    this.byKey = new Map(definitions.map((d) => [d.key, d]));
  }

  list(): string[] {
    return [...this.byKey.keys()];
  }

  get(key: string): ReportDefinition | undefined {
    return this.byKey.get(key);
  }
}
