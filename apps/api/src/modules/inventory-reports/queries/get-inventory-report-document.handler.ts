import {
  INVENTORY_REPORT_TYPE_LABELS_VI,
  INVENTORY_VALUE_PERMISSION,
  InventoryReportKey,
} from '@erp/shared-interfaces';
import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { RbacService } from '../../rbac/rbac.service';
import { withoutValueColumns } from '../report/inventory-report-column.util';
import {
  dateRangeSubtitle,
  filterSummarySubtitle,
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
 * The two context lines under the document title: the period, then one line
 * naming the active filters. Only states what the user actually filtered on —
 * an absent filter contributes nothing, so the header does not claim a scope
 * that was never applied.
 */
export function buildSubtitleLines(
  filters: InventoryReportFilterDto | undefined,
): string[] {
  if (!filters) return [];

  const period = filters.period?.from || filters.period?.to
    ? dateRangeSubtitle(filters.period)
    : filters.preset
      ? [`Kỳ báo cáo: ${PRESET_LABELS_VI[filters.preset] ?? filters.preset}`]
      : [];

  return [
    ...period,
    ...filterSummarySubtitle([
      filters.warehouseIds?.length
        ? `Kho: ${filters.warehouseIds.length} kho được chọn`
        : null,
      filters.search ? `Tìm kiếm: ${filters.search}` : null,
    ]),
  ];
}

@QueryHandler(GetInventoryReportDocumentQuery)
export class GetInventoryReportDocumentHandler
  implements IQueryHandler<GetInventoryReportDocumentQuery>
{
  constructor(
    private readonly registry: InventoryReportRegistry,
    private readonly exportService: ReportExportService,
    private readonly rbac: RbacService,
  ) {}

  async execute({
    dto,
    actor,
  }: GetInventoryReportDocumentQuery): Promise<PreparedExport> {
    const label =
      INVENTORY_REPORT_TYPE_LABELS_VI[dto.reportType as InventoryReportKey] ??
      dto.reportType;

    const def = this.registry.get(dto.reportType);
    if (!def) {
      throw new BadRequestException(`Unknown report type: ${dto.reportType}`);
    }
    const canSeeValue = await this.rbac.hasPermission(
      actor.userId,
      actor.organizationId,
      INVENTORY_VALUE_PERMISSION,
    );
    // The gate has to hold on the way out too — an .xlsx or a print payload
    // reaches the same numbers the screen does.
    const scoped = {
      ...dto,
      columns: withoutValueColumns(dto.columns, def.valueColumns, canSeeValue),
    };

    return this.exportService.prepareExport(this.registry, scoped, actor, {
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
