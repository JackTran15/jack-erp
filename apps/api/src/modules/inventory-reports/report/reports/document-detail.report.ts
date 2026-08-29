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
import { toEngineFilters } from '../report-column-mapper.util';
import {
  assertKnownColumns,
  projectRows,
  toTotalsRow,
} from '../report-data.util';
import { ItemCategoryEntity } from '../../../inventory/location/item-category.entity';
import {
  resolveDescendantCategoryIds,
  resolveInventoryBranchIds,
} from '../report-scope.util';
import { ReportExportSource } from '../../../reporting/report-core/report-definition';

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
  // `branches` has no code column: toRow hard-codes null (ADR-05).
  { key: 'branchCode', type: STRING, filterKind: 'none', width: 130 },
  { key: 'branchName', type: STRING, width: 180 },
  // `branches` has no code column: toRow hard-codes null (ADR-05).
  { key: 'receiverBranchCode', type: STRING, filterKind: 'none', width: 160 },
  { key: 'receiverBranchName', type: STRING, width: 180 },
];

const CATALOG_KEYS = new Set(COLUMNS.map((c) => c.key));

/**
 * Report column key → the field `DocumentDetailService` knows it by (ADR-03).
 *
 * `branchCode` and `receiverBranchCode` are absent on purpose: `toRow` hard-codes
 * both to null because `branches` has no code column, so there is nothing to
 * filter and the engine answers 400 rather than looking active.
 */
const KEY_MAP = {
  name: 'itemName',
  reference: 'referenceNumber',
} as const;
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
    @InjectRepository(ItemCategoryEntity)
    private readonly categories: Repository<ItemCategoryEntity>,
  ) {}

  buildColumns(): Promise<ReportColumnHeader[]> {
    return Promise.resolve(buildInventoryHeaders(this.key, COLUMNS, ['date']));
  }

  async buildData(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<InventoryReportResult> {
    assertKnownColumns(dto, CATALOG_KEYS);
    const query = await this.scopedQuery(dto, actor);

    const result = await this.documentDetail.list({
      ...query,
      page: dto.page ?? 1,
      pageSize: dto.limit ?? 20,
    });

    return {
      rows: projectRows(result.data.map((r) => this.toRow(r)), dto.columns),
      totals: toTotalsRow(dto.columns, result.totals, KEY_MAP, NON_ADDITIVE),
      total: result.total,
    };
  }

  /**
   * Period + scope for one request, shared by `buildData` and the keyset
   * export so the file can never cover a different window than the table.
   */
  private async scopedQuery(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ) {
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
    return {
      organizationId: actor.organizationId,
      startDate: period.startDate,
      endDate: period.endDate,
      branchIds,
      // A parent group holds no items of its own — only its leaves do — so the
      // filter has to carry the whole subtree (ADR-01).
      categoryIds: await resolveDescendantCategoryIds(
        this.categories,
        filters.categoryId,
        actor.organizationId,
      ),
      search: filters.search,
      // Shared by the grid and the keyset export, so the file can never cover a
      // different set than the table it was exported from.
      columnFilters: toEngineFilters(dto.columnFilters, KEY_MAP),
    };
  }

  /**
   * Keyset export (ADR-07). One row per document line, so a cursor has a real
   * record to point at — and OFFSET is worst here, where every page re-runs a
   * three-way UNION and discards everything before it.
   */
  readonly exportSource: ReportExportSource<InventoryReportSearchDto> = {
    // The table reads newest first, and so must the file.
    order: 'desc',
    range: (dto) => {
      const period = resolvePeriod({
        preset:
          dto.filters.period?.from || dto.filters.period?.to
            ? undefined
            : dto.filters.preset,
        startDate: dto.filters.period?.from,
        endDate: dto.filters.period?.to,
      });
      return {
        from: period.startDate.toISOString(),
        to: period.endDate.toISOString(),
      };
    },
    summable: (columns) =>
      columns.filter((col) => NUMERIC.has(col) && !NON_ADDITIVE.has(col)),
    page: async (dto, actor, { partition, cursor, size }) => {
      assertKnownColumns(dto, CATALOG_KEYS);
      const query = await this.scopedQuery(dto, actor);
      const result = await this.documentDetail.list({
        ...query,
        // The window narrows the period; the CTE already filters half-open
        // `posted_at >= start AND posted_at < end`, which is exactly the
        // partition contract.
        startDate: partition.from ?? query.startDate,
        endDate: partition.to ?? query.endDate,
        page: 1,
        pageSize: size,
        keyset: true,
        cursor,
      });

      const rows = result.data.map((r) => this.toRow(r));
      return {
        rows: rows.map((row) => {
          const projected: ReportRow = {};
          for (const col of dto.columns) projected[col] = row[col] ?? null;
          return projected;
        }),
        nextCursor: result.nextCursor,
        // Follows what the database returned, not what survived the column
        // filters — otherwise a fully-filtered page ends the export early.
        hasMore: result.hasMore,
      };
    },
  };

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
