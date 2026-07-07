import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  INVENTORY_DOC_KIND_LABELS_VI,
  INVENTORY_REPORT_KEYS,
  InventoryReportResult,
  ReportColumnDataType,
  ReportColumnHeader,
  ReportRow,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../../branch/branch.entity';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { resolvePeriod } from '../../services/date-range-resolver';
import {
  DocumentDetailRow,
  DocumentDetailService,
} from '../../services/document-detail.service';
import { InventoryReportDefinition } from '../inventory-report-definition';
import {
  buildInventoryHeaders,
  InventoryColumnDef,
  numericKeys,
} from '../inventory-report-column.util';
import {
  applyColumnFilters,
  assertKnownColumns,
  assertUnderRowCap,
  buildTotalsRow,
  MAX_REPORT_ROWS,
  paginateRows,
} from '../report-data.util';
import { resolveInventoryBranchIds } from '../report-scope.util';

const { STRING, NUMBER } = ReportColumnDataType;

const COLUMNS: InventoryColumnDef[] = [
  { key: 'date', type: STRING, width: 140 },
  { key: 'documentType', type: STRING, width: 200 },
  { key: 'warehouse', type: STRING, width: 180 },
  { key: 'documentNumber', type: STRING, width: 130 },
  { key: 'reference', type: STRING, width: 120 },
  { key: 'sku', type: STRING, width: 140 },
  { key: 'name', type: STRING, width: 220 },
  { key: 'unit', type: STRING, width: 110 },
  { key: 'notes', type: STRING, width: 160 },
  { key: 'group', type: STRING, width: 140 },
  { key: 'parentSku', type: STRING, width: 130 },
  { key: 'parentName', type: STRING, width: 130 },
  { key: 'color', type: STRING, width: 100 },
  { key: 'size', type: STRING, width: 80 },
  { key: 'inQty', type: NUMBER, band: 'in', width: 110 },
  { key: 'inUnitPrice', type: NUMBER, band: 'in', width: 120 },
  { key: 'inValue', type: NUMBER, band: 'in', width: 130 },
  { key: 'inSalePrice', type: NUMBER, band: 'in', width: 120 },
  { key: 'outQty', type: NUMBER, band: 'out', width: 110 },
  { key: 'outUnitPrice', type: NUMBER, band: 'out', width: 120 },
  { key: 'outValue', type: NUMBER, band: 'out', width: 130 },
  { key: 'outSalePrice', type: NUMBER, band: 'out', width: 120 },
  { key: 'customer', type: STRING, width: 160 },
  { key: 'branchCode', type: STRING, width: 130 },
  { key: 'branchName', type: STRING, width: 180 },
  { key: 'receiverBranchCode', type: STRING, width: 160 },
  { key: 'receiverBranchName', type: STRING, width: 180 },
];

const CATALOG_KEYS = new Set(COLUMNS.map((c) => c.key));
const NUMERIC = numericKeys(COLUMNS);
/** Unit/sale prices are per-line — summing them is meaningless. */
const NON_ADDITIVE = new Set([
  'inUnitPrice',
  'inSalePrice',
  'outUnitPrice',
  'outSalePrice',
]);

const DATE_FMT = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** "Bảng kê chi tiết phiếu nhập xuất kho" — one row per posted document line. */
@Injectable()
export class DocumentDetailReport implements InventoryReportDefinition {
  readonly key = INVENTORY_REPORT_KEYS.DOCUMENT_DETAIL;

  constructor(
    private readonly documentDetail: DocumentDetailService,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
  ) {}

  buildColumns(): Promise<ReportColumnHeader[]> {
    return Promise.resolve(buildInventoryHeaders(this.key, COLUMNS, ['date']));
  }

  async buildData(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<InventoryReportResult> {
    assertKnownColumns(dto, CATALOG_KEYS);
    const filters = dto.filters;
    const period = resolvePeriod({
      preset: filters.period?.from || filters.period?.to ? undefined : filters.preset,
      startDate: filters.period?.from,
      endDate: filters.period?.to,
    });
    const branchIds = await resolveInventoryBranchIds(
      this.branches,
      filters.store,
      actor,
    );

    const result = await this.documentDetail.list({
      organizationId: actor.organizationId,
      startDate: period.startDate,
      endDate: period.endDate,
      branchIds,
      categoryIds: filters.categoryId ? [filters.categoryId] : undefined,
      search: filters.search,
      page: 1,
      pageSize: MAX_REPORT_ROWS,
    });
    assertUnderRowCap(result.total);

    let rows = result.data.map((r) => this.toRow(r));
    rows = applyColumnFilters(rows, dto.columnFilters);

    return {
      rows: paginateRows(rows, dto.columns, dto.page ?? 1, dto.limit ?? 20),
      totals: buildTotalsRow(dto.columns, rows, NUMERIC, NON_ADDITIVE),
      total: rows.length,
    };
  }

  private toRow(r: DocumentDetailRow): ReportRow {
    const posted = new Date(r.postedAt);
    return {
      date: Number.isNaN(posted.valueOf()) ? null : DATE_FMT.format(posted),
      documentType: INVENTORY_DOC_KIND_LABELS_VI[r.docKind] ?? r.docKind,
      warehouse: r.locationName ?? r.branchName,
      documentNumber: r.documentNumber,
      reference: r.referenceNumber,
      sku: r.sku,
      name: r.itemName,
      unit: r.unit,
      notes: r.notes,
      group: r.categoryName,
      parentSku: r.parentSku,
      parentName: r.parentName,
      color: r.color ?? null,
      size: r.size ?? null,
      inQty: r.inQty,
      inUnitPrice: r.inUnitPrice,
      inValue: r.inValue,
      inSalePrice: r.inSalePrice ?? null,
      outQty: r.outQty,
      outUnitPrice: r.outUnitPrice,
      outValue: r.outValue,
      outSalePrice: r.outSalePrice ?? null,
      customer: r.customerName,
      branchCode: null,
      branchName: r.branchName,
      receiverBranchCode: null,
      receiverBranchName: r.receiverBranchName,
    };
  }
}
