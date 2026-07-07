import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
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
  TransferByBranchRow,
  TransferReportService,
} from '../../services/transfer-report.service';
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
import { permittedBranchIds } from '../report-scope.util';

const { STRING, NUMBER } = ReportColumnDataType;

const COLUMNS: InventoryColumnDef[] = [
  { key: 'sku', type: STRING, width: 140 },
  { key: 'name', type: STRING, width: 220 },
  { key: 'parentSku', type: STRING, width: 140 },
  { key: 'parentName', type: STRING, width: 150 },
  { key: 'color', type: STRING, width: 100 },
  { key: 'size', type: STRING, width: 80 },
  { key: 'unit', type: STRING, width: 110 },
  { key: 'group', type: STRING, width: 140 },
  { key: 'brand', type: STRING, width: 120 },
  { key: 'targetBranch', type: STRING, width: 220 },
  { key: 'outQty', type: NUMBER, width: 130 },
  { key: 'outAvgPrice', type: NUMBER, width: 160 },
  { key: 'outValue', type: NUMBER, width: 140 },
  { key: 'inQty', type: NUMBER, width: 130 },
  { key: 'inAvgPrice', type: NUMBER, width: 160 },
  { key: 'inValue', type: NUMBER, width: 140 },
];

const CATALOG_KEYS = new Set(COLUMNS.map((c) => c.key));
const NUMERIC = numericKeys(COLUMNS);
/** Average prices must not be summed. */
const NON_ADDITIVE = new Set(['outAvgPrice', 'inAvgPrice']);

/** "Tổng hợp hàng hóa đã điều chuyển theo cửa hàng" — item × destination branch. */
@Injectable()
export class TransferByStoreReport implements InventoryReportDefinition {
  readonly key = INVENTORY_REPORT_KEYS.TRANSFER_BY_STORE;

  constructor(
    private readonly transferReport: TransferReportService,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
  ) {}

  buildColumns(): Promise<ReportColumnHeader[]> {
    return Promise.resolve(buildInventoryHeaders(this.key, COLUMNS, ['sku']));
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

    const sourceBranchId = filters.sourceStoreId ?? actor.branchId;
    if (!sourceBranchId) {
      throw new BadRequestException(
        'filters.sourceStoreId is required (no active branch on the request)',
      );
    }
    if (!permittedBranchIds(actor).has(sourceBranchId)) {
      throw new ForbiddenException(
        `Access denied for stores: ${sourceBranchId}`,
      );
    }
    const owned = await this.branches.findOne({
      where: { id: sourceBranchId, organizationId: actor.organizationId },
      select: { id: true },
    });
    if (!owned) {
      throw new BadRequestException(`Unknown store ids: ${sourceBranchId}`);
    }

    const result = await this.transferReport.byBranch({
      organizationId: actor.organizationId,
      startDate: period.startDate,
      endDate: period.endDate,
      sourceBranchId,
      destinationBranchIds: filters.receivingStoreIds,
      categoryIds: filters.categoryId ? [filters.categoryId] : undefined,
      search: filters.search,
      itemGroupBy: filters.statBy,
      page: 1,
      pageSize: MAX_REPORT_ROWS,
    });
    assertUnderRowCap(result.total);

    let rows = result.data.map((r) => this.toRow(r));
    if (filters.unit) rows = rows.filter((r) => r.unit === filters.unit);
    if (filters.brand) rows = rows.filter((r) => r.brand === filters.brand);
    rows = applyColumnFilters(rows, dto.columnFilters);

    return {
      rows: paginateRows(rows, dto.columns, dto.page ?? 1, dto.limit ?? 20),
      totals: buildTotalsRow(dto.columns, rows, NUMERIC, NON_ADDITIVE),
      total: rows.length,
    };
  }

  private toRow(r: TransferByBranchRow): ReportRow {
    return {
      sku: r.sku,
      name: r.itemName,
      parentSku: r.parentSku,
      parentName: r.parentName,
      color: r.color ?? null,
      size: r.size ?? null,
      unit: r.unit,
      group: r.categoryName,
      brand: r.brand ?? null,
      targetBranch: r.destinationBranchName,
      outQty: r.outQty,
      outAvgPrice: r.outAvgPrice,
      outValue: r.outValue,
      inQty: r.inQty,
      inAvgPrice: r.inAvgPrice,
      inValue: r.inValue,
    };
  }
}
