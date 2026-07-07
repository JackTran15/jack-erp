import { InvoiceReportResult, ReportColumnHeader } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

/**
 * A pluggable report, generic over its search DTO. Each report type is one
 * backend definition: it owns its columns and its data/aggregation. The
 * frontend stays generic — it only renders headers + rows and never knows a
 * report's semantics. Invoice and inventory reports share this core; each
 * domain keeps its own registry instance (own permission + own DTO).
 */
export interface ReportDefinition<TDto> {
  /** Stable English key (matches the domain's report-type option keys). */
  readonly key: string;
  /** Full catalog of columns for this report (fixed + any dynamic), scoped to the actor. */
  buildColumns(actor: ActorContext): Promise<ReportColumnHeader[]>;
  /** Run the report and return the data-only envelope (no headers). */
  buildData(dto: TDto, actor: ActorContext): Promise<InvoiceReportResult>;
}

/** Indexes the registered report definitions of one domain by key. */
export class ReportRegistry<
  TDef extends ReportDefinition<any> = ReportDefinition<any>,
> {
  private readonly byKey: Map<string, TDef>;

  constructor(definitions: TDef[]) {
    this.byKey = new Map(definitions.map((d) => [d.key, d]));
  }

  list(): string[] {
    return [...this.byKey.keys()];
  }

  get(key: string): TDef | undefined {
    return this.byKey.get(key);
  }
}
