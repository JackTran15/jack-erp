import {
  INVENTORY_REPORT_TYPE_LABELS_VI,
  InventoryReportKey,
} from '@erp/shared-interfaces';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  PreparedExport,
  ReportExportService,
} from '../../reporting/report-core/report-export.service';
import { InventoryReportFilterDto } from '../dto/inventory-report-filter.dto';
import { InventoryReportRegistry } from '../report/inventory-report-definition';
import { GetInventoryReportDocumentQuery } from './get-inventory-report-document.query';

/** Vietnamese labels for the period presets, for the document subtitle. */
const PRESET_LABELS_VI: Record<string, string> = {
  today: 'Hôm nay',
  this_week: 'Tuần này',
  last_week: 'Tuần trước',
  this_month: 'Tháng này',
  last_month: 'Tháng trước',
  this_quarter: 'Quý này',
  this_year: 'Năm nay',
  custom: 'Tuỳ chọn',
};

/**
 * Context lines under the document title. Only states what the user actually
 * filtered on — an absent filter contributes no line, so the header does not
 * claim a scope that was never applied.
 */
export function buildSubtitleLines(
  filters: InventoryReportFilterDto | undefined,
): string[] {
  if (!filters) return [];
  const lines: string[] = [];

  const from = filters.period?.from;
  const to = filters.period?.to;
  if (from || to) {
    lines.push(`Từ ngày: ${from ?? '—'}; Đến ngày: ${to ?? '—'}`);
  } else if (filters.preset) {
    lines.push(`Kỳ báo cáo: ${PRESET_LABELS_VI[filters.preset] ?? filters.preset}`);
  }

  if (filters.warehouseIds?.length) {
    lines.push(`Kho: ${filters.warehouseIds.length} kho được chọn`);
  }
  if (filters.search) lines.push(`Tìm kiếm: ${filters.search}`);

  return lines;
}

@QueryHandler(GetInventoryReportDocumentQuery)
export class GetInventoryReportDocumentHandler
  implements IQueryHandler<GetInventoryReportDocumentQuery>
{
  constructor(
    private readonly registry: InventoryReportRegistry,
    private readonly exportService: ReportExportService,
  ) {}

  execute({
    dto,
    actor,
  }: GetInventoryReportDocumentQuery): Promise<PreparedExport> {
    const label =
      INVENTORY_REPORT_TYPE_LABELS_VI[dto.reportType as InventoryReportKey] ??
      dto.reportType;

    return this.exportService.prepareExport(this.registry, dto, actor, {
      title: label.toUpperCase(),
      subtitleLines: buildSubtitleLines(dto.filters),
    });
  }
}

/** Document title of a report key, for the download filename. */
export function inventoryReportLabel(reportType: string): string {
  return (
    INVENTORY_REPORT_TYPE_LABELS_VI[reportType as InventoryReportKey] ??
    reportType
  );
}
