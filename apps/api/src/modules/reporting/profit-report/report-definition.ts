import { ReportColumnHeader } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  ReportDefinition as CoreReportDefinition,
  ReportRegistry as CoreReportRegistry,
} from '../report-core/report-definition';
import { ProfitReportFilterDto } from './dto/profit-report-filter.dto';
import { ProfitReportSearchDto } from './dto/profit-report-search.dto';

/**
 * Profit-domain specialization of the generic report core (mirrors
 * debt-report/report-definition.ts). `buildColumns` widens the core contract
 * with an OPTIONAL second `filters` parameter — `profit-by-item`'s column SET
 * depends on the "Thống kê theo" (`statBy`) filter; the other 2 reports ignore
 * it (TS allows an implementation to declare fewer parameters than the interface).
 */
export interface ReportDefinition
  extends CoreReportDefinition<ProfitReportSearchDto> {
  buildColumns(
    actor: ActorContext,
    filters?: ProfitReportFilterDto,
  ): Promise<ReportColumnHeader[]>;
}

/** Indexes the registered profit report definitions by key. */
export class ReportRegistry extends CoreReportRegistry<ReportDefinition> {}
