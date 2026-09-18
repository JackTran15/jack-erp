import { CASH_FUND_REPORT_TYPE_LABELS_VI } from '@erp/shared-interfaces';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  dateRangeSubtitle,
  FILTERED_MARKER,
  filterSummarySubtitle,
  PreparedExport,
  ReportExportService,
} from '../../report-core/report-export.service';
import { CashFundReportFilterDto } from '../dto/cash-fund-report-filter.dto';
import { ReportRegistry } from '../report-definition';
import { GetCashFundReportDocumentQuery } from './get-cash-fund-report-document.query';

/** Document title of a report key, for the header and the download filename (A-08). */
export function cashFundReportLabel(reportType: string): string {
  return (CASH_FUND_REPORT_TYPE_LABELS_VI as Record<string, string>)[reportType] ?? reportType;
}

/**
 * The filter line for cash-fund reports: the store scope and the employee
 * filter. The header-branch reports send `branchId`, which the branch block
 * above already names, so only the multi-store `store` picker is reported.
 */
export function cashFundFilterSummary(
  filters: CashFundReportFilterDto | undefined,
): string[] {
  if (!filters) return [];
  return filterSummarySubtitle([
    filters.store
      ? `Xem theo cửa hàng: ${filters.store.scope === 'all' ? 'Tất cả' : FILTERED_MARKER}`
      : null,
    filters.employeeIds?.length ? `Nhân viên: ${FILTERED_MARKER}` : null,
  ]);
}

@QueryHandler(GetCashFundReportDocumentQuery)
export class GetCashFundReportDocumentHandler
  implements IQueryHandler<GetCashFundReportDocumentQuery>
{
  constructor(
    private readonly registry: ReportRegistry,
    private readonly exportService: ReportExportService,
  ) {}

  execute({
    dto,
    actor,
  }: GetCashFundReportDocumentQuery): Promise<PreparedExport> {
    return this.exportService.prepareExport(this.registry, dto, actor, {
      title: cashFundReportLabel(dto.reportType).toUpperCase(),
      subtitleLines: [
        ...dateRangeSubtitle(dto.filters?.period),
        ...cashFundFilterSummary(dto.filters),
      ],
    });
  }
}
