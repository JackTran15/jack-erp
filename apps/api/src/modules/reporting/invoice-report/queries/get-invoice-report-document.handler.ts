import { REPORT_TYPE_LABELS_VI, ReportGroupBy } from '@erp/shared-interfaces';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  dateRangeSubtitle,
  FILTERED_MARKER,
  filterSummarySubtitle,
  PreparedExport,
  ReportExportService,
} from '../../report-core/report-export.service';
import { InvoiceReportFilterDto } from '../dto/invoice-report-filter.dto';
import { ReportRegistry } from '../report-definition';
import { RevenueByItemParamsBuilder } from '../revenue-by-item-params.builder';
import { GetInvoiceReportDocumentQuery } from './get-invoice-report-document.query';

// Matches RevenueByItemReport.key (reports/revenue-by-item.report.ts). No
// shared constant exists for invoice-report keys today — report-types.seed.ts
// uses the same literal — so this mirrors the established convention rather
// than introducing a new one for a single comparison.
const REVENUE_BY_ITEM_REPORT_KEY = 'revenue-by-item';

/** Document title of a report key, for the header and the download filename. */
export function invoiceReportLabel(reportType: string): string {
  return (REPORT_TYPE_LABELS_VI as Record<string, string>)[reportType] ?? reportType;
}

// Grain label for the parameter line. Follows `resolveGrain` in
// RevenueByItemReport: PARENT groups by the parent product ("mẫu mã"), ITEM
// keeps one row per SKU/variant ("hàng hóa"). Exported for
// RevenueByItemParamsBuilder, which needs the same mapping.
export const GROUP_BY_LABELS_VI: Record<ReportGroupBy, string> = {
  [ReportGroupBy.ITEM]: 'Hàng hóa',
  [ReportGroupBy.PARENT]: 'Mẫu mã',
  [ReportGroupBy.GROUP]: 'Nhóm hàng hóa',
};

const STAT_DATE_LABELS_VI: Record<string, string> = {
  invoice_date: 'Ngày hóa đơn',
  created_date: 'Ngày tạo',
};

// Exported for RevenueByItemParamsBuilder, which needs the same mapping.
export const PRODUCT_TYPE_LABELS_VI: Record<string, string> = {
  product: 'Hàng hóa',
  service: 'Dịch vụ',
  combo: 'Combo',
};

/**
 * The filter line for invoice reports. The issuing branch is already printed in
 * the branch block above the title, so it is deliberately not repeated here.
 */
export function invoiceFilterSummary(
  filters: InvoiceReportFilterDto | undefined,
): string[] {
  if (!filters) return [];
  return filterSummarySubtitle([
    filters.store?.scope === 'group' && filters.store.storeIds.length
      ? `Cửa hàng: ${filters.store.storeIds.length} cửa hàng được chọn`
      : filters.store?.scope === 'all'
        ? 'Cửa hàng: Toàn hệ thống'
        : null,
    filters.statDateType
      ? `Thống kê theo: ${STAT_DATE_LABELS_VI[filters.statDateType] ?? filters.statDateType}`
      : null,
    filters.invoiceStatus?.length
      ? `Trạng thái: ${filters.invoiceStatus.join(', ')}`
      : null,
    filters.statBy ? `Nhóm theo: ${GROUP_BY_LABELS_VI[filters.statBy]}` : null,
    filters.statisticByBrand ? 'Thống kê theo thương hiệu: Có' : null,
    filters.productType
      ? `Loại hàng hóa: ${PRODUCT_TYPE_LABELS_VI[filters.productType] ?? filters.productType}`
      : null,
    filters.brand ? `Thương hiệu: ${filters.brand}` : null,
    filters.allocateComboRevenue ? 'Phân bổ doanh thu combo: Có' : null,
    filters.categoryId ? `Nhóm hàng hóa: ${FILTERED_MARKER}` : null,
    filters.customerId ? `Khách hàng: ${FILTERED_MARKER}` : null,
    filters.cashierId ? `Thu ngân: ${FILTERED_MARKER}` : null,
    filters.salespersonId ? `Nhân viên bán hàng: ${FILTERED_MARKER}` : null,
  ]);
}

@QueryHandler(GetInvoiceReportDocumentQuery)
export class GetInvoiceReportDocumentHandler
  implements IQueryHandler<GetInvoiceReportDocumentQuery>
{
  constructor(
    private readonly registry: ReportRegistry,
    private readonly exportService: ReportExportService,
    private readonly revenueByItemParams: RevenueByItemParamsBuilder,
  ) {}

  async execute({
    dto,
    actor,
  }: GetInvoiceReportDocumentQuery): Promise<PreparedExport> {
    // The MISA-parity parameter line applies to revenue-by-item only; the
    // other three invoice reports keep the "print active filters only" rule
    // (ADR-02, revenue-by-item-misa-parity).
    const filterLines =
      dto.reportType === REVENUE_BY_ITEM_REPORT_KEY
        ? await this.revenueByItemParams.build(dto.filters, actor)
        : invoiceFilterSummary(dto.filters);

    return this.exportService.prepareExport(this.registry, dto, actor, {
      title: invoiceReportLabel(dto.reportType).toUpperCase(),
      subtitleLines: [...dateRangeSubtitle(dto.filters?.issuedAt), ...filterLines],
    });
  }
}
