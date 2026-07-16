import { ReportColumnHeader } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  ReportDefinition as CoreReportDefinition,
  ReportRegistry as CoreReportRegistry,
} from '../report-core/report-definition';
import { DebtReportFilterDto } from './dto/debt-report-filter.dto';
import { DebtReportSearchDto } from './dto/debt-report-search.dto';

/**
 * Debt-domain specialization of the generic report core (mirrors
 * invoice-report/report-definition.ts). `buildColumns` widens the core
 * contract with an OPTIONAL second `filters` parameter — every debt report
 * except supplier-debts-detail-by-document-and-product ignores it (TS allows
 * an implementation to declare fewer parameters than the interface). That one
 * report's column SET itself depends on the "Thống kê theo" (`groupBy`)
 * filter, which the generic {columns, search, filter-options, templates}
 * contract otherwise never needs — see docs/24-debt-reports-spec.md #4.
 */
export interface ReportDefinition extends CoreReportDefinition<DebtReportSearchDto> {
  buildColumns(
    actor: ActorContext,
    filters?: DebtReportFilterDto,
  ): Promise<ReportColumnHeader[]>;
}

/** Indexes the registered debt report definitions by key (DI class token). */
export class ReportRegistry extends CoreReportRegistry<ReportDefinition> {}
