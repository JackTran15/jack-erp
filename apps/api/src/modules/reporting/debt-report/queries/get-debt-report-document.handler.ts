import { DEBT_REPORT_TYPE_LABELS_VI } from '@erp/shared-interfaces';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  dateRangeSubtitle,
  FILTERED_MARKER,
  filterSummarySubtitle,
  PreparedExport,
  ReportExportService,
} from '../../report-core/report-export.service';
import { DebtReportFilterDto } from '../dto/debt-report-filter.dto';
import { ReportRegistry } from '../report-definition';
import { GetDebtReportDocumentQuery } from './get-debt-report-document.query';

/** Document title of a report key, for the header and the download filename. */
export function debtReportLabel(reportType: string): string {
  return (DEBT_REPORT_TYPE_LABELS_VI as Record<string, string>)[reportType] ?? reportType;
}

const GROUP_BY_LABELS_VI: Record<string, string> = {
  item: 'Mẫu mã',
  productTemplate: 'Hàng hóa',
};

/** The filter line for debt reports; the branch block above already names the store. */
export function debtFilterSummary(
  filters: DebtReportFilterDto | undefined,
): string[] {
  if (!filters) return [];
  return filterSummarySubtitle([
    filters.groupBy
      ? `Thống kê theo: ${GROUP_BY_LABELS_VI[filters.groupBy] ?? filters.groupBy}`
      : null,
    filters.customerId ? `Khách hàng: ${FILTERED_MARKER}` : null,
    filters.customerGroupId ? `Nhóm khách hàng: ${FILTERED_MARKER}` : null,
    filters.supplierId ? `Nhà cung cấp: ${FILTERED_MARKER}` : null,
    filters.supplierGroupId ? `Nhóm nhà cung cấp: ${FILTERED_MARKER}` : null,
  ]);
}

@QueryHandler(GetDebtReportDocumentQuery)
export class GetDebtReportDocumentHandler
  implements IQueryHandler<GetDebtReportDocumentQuery>
{
  constructor(
    private readonly registry: ReportRegistry,
    private readonly exportService: ReportExportService,
  ) {}

  execute({
    dto,
    actor,
  }: GetDebtReportDocumentQuery): Promise<PreparedExport> {
    return this.exportService.prepareExport(this.registry, dto, actor, {
      title: debtReportLabel(dto.reportType).toUpperCase(),
      subtitleLines: [
        ...dateRangeSubtitle(dto.filters?.period),
        ...debtFilterSummary(dto.filters),
      ],
    });
  }
}
