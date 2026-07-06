import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  INVENTORY_REPORT_KEYS,
  InventoryReportResult,
  ReportColumnDataType,
  ReportColumnHeader,
  ReportRow,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../../branch/branch.entity';
import { ItemProviderEntity } from '../../../inventory/location/item-provider.entity';
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
  { key: 'name', type: STRING, width: 240 },
  { key: 'parentSku', type: STRING, width: 140 },
  { key: 'parentName', type: STRING, width: 160 },
  { key: 'color', type: STRING, width: 100 },
  { key: 'size', type: STRING, width: 80 },
  { key: 'unit', type: STRING, width: 110 },
  { key: 'group', type: STRING, width: 140 },
  { key: 'brand', type: STRING, width: 120 },
  { key: 'sku', type: STRING, width: 140 },
  { key: 'positionCode', type: STRING, width: 110 },
  { key: 'positionName', type: STRING, width: 110 },
  { key: 'openingQty', type: NUMBER, band: 'opening', width: 110 },
  { key: 'openingValue', type: NUMBER, band: 'opening', width: 130 },
  { key: 'inQty', type: NUMBER, band: 'in', width: 110 },
  { key: 'inValue', type: NUMBER, band: 'in', width: 130 },
  { key: 'outQty', type: NUMBER, band: 'out', width: 110 },
  { key: 'outValue', type: NUMBER, band: 'out', width: 130 },
  { key: 'endingQty', type: NUMBER, band: 'ending', width: 110 },
  { key: 'endingValue', type: NUMBER, band: 'ending', width: 140 },
  { key: 'transferOutQty', type: NUMBER, band: 'transferOut', width: 110 },
  { key: 'transferOutValue', type: NUMBER, band: 'transferOut', width: 130 },
  { key: 'incomingQty', type: NUMBER, band: 'incoming', width: 110 },
  { key: 'incomingValue', type: NUMBER, band: 'incoming', width: 130 },
  { key: 'supplier', type: STRING, width: 160 },
];

const CATALOG_KEYS = new Set(COLUMNS.map((c) => c.key));
const NUMERIC = numericKeys(COLUMNS);

/** "Tổng hợp nhập xuất tồn kho" — one row per item × location over a period. */
@Injectable()
export class StockSummaryReport implements InventoryReportDefinition {
  readonly key = INVENTORY_REPORT_KEYS.STOCK_SUMMARY;

  constructor(
    private readonly stockPeriod: StockPeriodService,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(LocationEntity)
    private readonly locations: Repository<LocationEntity>,
    @InjectRepository(ItemProviderEntity)
    private readonly itemProviders: Repository<ItemProviderEntity>,
  ) {}

  buildColumns(): Promise<ReportColumnHeader[]> {
    return Promise.resolve(
      buildInventoryHeaders(this.key, COLUMNS, ['name']),
    );
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
      hideZeroRows: filters.hideZeroRows ?? true,
      page: 1,
      pageSize: MAX_REPORT_ROWS,
    });
    assertUnderRowCap(result.total);

    const suppliers = await this.primarySuppliers(
      result.data,
      actor.organizationId,
      filters.statBy,
    );

    let rows = result.data.map((r) => this.toRow(r, suppliers));
    if (filters.unit) rows = rows.filter((r) => r.unit === filters.unit);
    if (filters.brand) rows = rows.filter((r) => r.brand === filters.brand);
    rows = applyColumnFilters(rows, dto.columnFilters);

    return {
      rows: paginateRows(rows, dto.columns, dto.page ?? 1, dto.limit ?? 20),
      totals: buildTotalsRow(dto.columns, rows, NUMERIC),
      total: rows.length,
    };
  }

  private toRow(r: StockPeriodRow, suppliers: Map<string, string>): ReportRow {
    return {
      name: r.itemName,
      parentSku: r.parentSku,
      parentName: r.parentName,
      color: r.color ?? null,
      size: r.size ?? null,
      unit: r.unit,
      group: r.categoryName,
      brand: r.brand ?? null,
      sku: r.sku,
      positionCode: r.locationCode ?? null,
      positionName: r.locationName ?? null,
      openingQty: r.openingQty,
      openingValue: r.openingValue,
      inQty: r.inQty,
      inValue: r.inValue,
      outQty: r.outQty,
      outValue: r.outValue,
      endingQty: r.closingQty,
      endingValue: r.closingValue,
      transferOutQty: r.transferOutQty,
      transferOutValue: r.transferOutValue,
      incomingQty: r.incomingQty,
      incomingValue: r.incomingValue,
      supplier: suppliers.get(r.itemId) ?? null,
    };
  }

  /** itemId → primary provider name. Grouped grains carry no single item, so skip. */
  private async primarySuppliers(
    rows: StockPeriodRow[],
    organizationId: string,
    statBy: string | undefined,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (statBy && statBy !== 'item') return map;
    const itemIds = [...new Set(rows.map((r) => r.itemId).filter(Boolean))];
    if (!itemIds.length) return map;
    const links = await this.itemProviders.find({
      where: { organizationId, itemId: In(itemIds), isPrimary: true },
      relations: { provider: true },
    });
    for (const link of links) {
      if (link.provider?.name) map.set(link.itemId, link.provider.name);
    }
    return map;
  }
}
