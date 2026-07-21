import { ReportColumnHeader, ReportGroupBy } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  ReportDefinition as CoreReportDefinition,
  ReportRegistry as CoreReportRegistry,
} from '../report-core/report-definition';
import { StoreScopeDto } from './dto/store-scope.dto';
import { InvoiceReportSearchDto } from './dto/invoice-report-search.dto';

/** Optional columns-catalog filters — only `revenue-by-item` reads these today. */
export interface InvoiceReportColumnsFilterDto {
  statBy?: ReportGroupBy;
  store?: StoreScopeDto;
  branchId?: string;
}

/**
 * Invoice-domain specialization of the generic report core (mirrors
 * profit-report/report-definition.ts). `buildColumns` widens the core
 * contract with an OPTIONAL second `filters` parameter — `revenue-by-item`'s
 * location columns depend on `statBy`/`store`; the other invoice reports
 * ignore it (TS allows an implementation to declare fewer parameters than
 * the interface). The name `ReportDefinition` is kept so existing invoice
 * report implementations, providers and specs stay untouched.
 */
export interface ReportDefinition
  extends CoreReportDefinition<InvoiceReportSearchDto> {
  buildColumns(
    actor: ActorContext,
    filters?: InvoiceReportColumnsFilterDto,
  ): Promise<ReportColumnHeader[]>;
}

/** Indexes the registered invoice report definitions by key (DI class token). */
export class ReportRegistry extends CoreReportRegistry<ReportDefinition> {}
