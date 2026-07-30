import { PROFIT_REPORT_TYPE_LABELS_VI, ReportGroupBy } from '@erp/shared-interfaces';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  dateRangeSubtitle,
  FILTERED_MARKER,
  filterSummarySubtitle,
  formatDocumentDate,
  PreparedExport,
  ReportExportService,
} from '../../report-core/report-export.service';
import { ProfitReportFilterDto } from '../dto/profit-report-filter.dto';
import { ReportRegistry } from '../report-definition';
import { GetProfitReportDocumentQuery } from './get-profit-report-document.query';

/** Document title of a report key, for the header and the download filename. */
export function profitReportLabel(reportType: string): string {
  return (PROFIT_REPORT_TYPE_LABELS_VI as Record<string, string>)[reportType] ?? reportType;
}

const GROUP_BY_LABELS_VI: Record<ReportGroupBy, string> = {
  [ReportGroupBy.ITEM]: 'Mẫu mã',
  [ReportGroupBy.PARENT]: 'Hàng hóa',
  [ReportGroupBy.GROUP]: 'Nhóm hàng hóa',
};

/**
 * The filter line for profit reports. `business-results` compares two periods,
 * so the comparison window gets its own part rather than being folded into the
 * period line above.
 */
export function profitFilterSummary(
  filters: ProfitReportFilterDto | undefined,
): string[] {
  if (!filters) return [];
  const previous = filters.previousPeriod;
  return filterSummarySubtitle([
    filters.store?.scope === 'group' && filters.store.storeIds.length
      ? `Cửa hàng: ${filters.store.storeIds.length} cửa hàng được chọn`
      : filters.store?.scope === 'all'
        ? 'Cửa hàng: Toàn hệ thống'
        : null,
    filters.statBy ? `Thống kê theo: ${GROUP_BY_LABELS_VI[filters.statBy]}` : null,
    filters.categoryId ? `Nhóm hàng hóa: ${FILTERED_MARKER}` : null,
    previous?.from || previous?.to
      ? `Kỳ so sánh: ${previous.from ? formatDocumentDate(previous.from) : '—'} — ${
          previous.to ? formatDocumentDate(previous.to) : '—'
        }`
      : null,
  ]);
}

@QueryHandler(GetProfitReportDocumentQuery)
export class GetProfitReportDocumentHandler
  implements IQueryHandler<GetProfitReportDocumentQuery>
{
  constructor(
    private readonly registry: ReportRegistry,
    private readonly exportService: ReportExportService,
  ) {}

  execute({
    dto,
    actor,
  }: GetProfitReportDocumentQuery): Promise<PreparedExport> {
    return this.exportService.prepareExport(this.registry, dto, actor, {
      title: profitReportLabel(dto.reportType).toUpperCase(),
      subtitleLines: [
        ...dateRangeSubtitle(dto.filters?.issuedAt ?? dto.filters?.currentPeriod),
        ...profitFilterSummary(dto.filters),
      ],
    });
  }
}
