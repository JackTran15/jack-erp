import { Injectable } from '@nestjs/common';
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
import { LocationEntity } from '../../../inventory/location/location.entity';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { resolvePeriod } from '../../services/date-range-resolver';
import {
  StockPeriodRow,
  StockPeriodService,
} from '../../services/stock-period.service';
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
import {
  resolveInventoryBranchIds,
  resolveWarehouseLocationIds,
} from '../report-scope.util';

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
  { key: 'openingQty', type: NUMBER, width: 110 },
  { key: 'inTotal', type: NUMBER, band: 'in', width: 100 },
  { key: 'inPurchase', type: NUMBER, band: 'in', width: 110 },
  { key: 'inTransfer', type: NUMBER, band: 'in', width: 120 },
  { key: 'inReturn', type: NUMBER, band: 'in', width: 120 },
  { key: 'inWh', type: NUMBER, band: 'in', width: 110 },
  { key: 'inAdjust', type: NUMBER, band: 'in', width: 110 },
  { key: 'inOther', type: NUMBER, band: 'in', width: 100 },
  { key: 'outTotal', type: NUMBER, band: 'out', width: 100 },
  { key: 'outSale', type: NUMBER, band: 'out', width: 110 },
  { key: 'outTransfer', type: NUMBER, band: 'out', width: 120 },
  { key: 'outPurchaseReturn', type: NUMBER, band: 'out', width: 140 },
  { key: 'outWh', type: NUMBER, band: 'out', width: 110 },
  { key: 'outAdjust', type: NUMBER, band: 'out', width: 110 },
  { key: 'outVoid', type: NUMBER, band: 'out', width: 110 },
  { key: 'outOther', type: NUMBER, band: 'out', width: 100 },
  { key: 'endingQty', type: NUMBER, width: 120 },
];

const CATALOG_KEYS = new Set(COLUMNS.map((c) => c.key));
const NUMERIC = numericKeys(COLUMNS);

/** "Chi tiết số lượng nhập xuất tồn kho" — quantities with IN/OUT breakdown. */
@Injectable()
export class StockQuantityDetailReport implements InventoryReportDefinition {
  readonly key = INVENTORY_REPORT_KEYS.STOCK_QUANTITY_DETAIL;

  constructor(
    private readonly stockPeriod: StockPeriodService,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(LocationEntity)
    private readonly locations: Repository<LocationEntity>,
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
    const [branchIds, locationIds] = await Promise.all([
      resolveInventoryBranchIds(this.branches, filters.store, actor),
      resolveWarehouseLocationIds(
        this.locations,
        filters.warehouseIds,
        actor.organizationId,
      ),
    ]);

    const result = await this.stockPeriod.aggregate({
      organizationId: actor.organizationId,
      startDate: period.startDate,
      endDate: period.endDate,
      groupBy: 'item_location',
      itemGroupBy: filters.statBy,
      branchIds,
      locationIds,
      categoryIds: filters.categoryId ? [filters.categoryId] : undefined,
      search: filters.search,
      includeBreakdown: true,
      hideZeroRows: filters.hideZeroRows ?? true,
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
      totals: buildTotalsRow(dto.columns, rows, NUMERIC),
      total: rows.length,
    };
  }

  private toRow(r: StockPeriodRow): ReportRow {
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
      openingQty: r.openingQty,
      inTotal: r.inQty,
      inPurchase: r.inQtyPurchase ?? 0,
      inTransfer: r.inQtyTransferIn ?? 0,
      inReturn: r.inQtyReturn ?? 0,
      // No backing movement subtype today — null, not a fake zero.
      inWh: null,
      inAdjust: r.inQtyAdjustIn ?? 0,
      inOther: null,
      outTotal: r.outQty,
      outSale: r.outQtySale ?? 0,
      outTransfer: r.outQtyTransferOut ?? 0,
      outPurchaseReturn: null,
      outWh: null,
      outAdjust: r.outQtyAdjustOut ?? 0,
      outVoid: null,
      outOther: null,
      endingQty: r.closingQty,
    };
  }
}
