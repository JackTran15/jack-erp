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
import { ItemCategoryEntity } from '../../../inventory/location/item-category.entity';
import { LocationEntity } from '../../../inventory/location/location.entity';
import { StorageEntity } from '../../../inventory/location/storage.entity';
import { ItemStorageLocationEntity } from '../../../inventory/product/item-storage-location.entity';
import { StockBalanceEntity } from '../../../inventory/ledger/stock-balance.entity';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { resolvePeriod } from '../../services/date-range-resolver';
import {
  StockPeriodRow,
  StockPeriodService,
} from '../../services/stock-period.service';
import {
  InventoryReportColumnsFilterDto,
  InventoryReportDefinition,
} from '../inventory-report-definition';
import {
  buildInventoryHeaders,
  InventoryColumnDef,
} from '../inventory-report-column.util';
import { CountedRows } from '../../../reporting/report-core/report-definition';
import {
  ItemWarehouseLocation,
  ItemWarehouseLocationRepos,
  resolveItemWarehouseLocations,
} from '../../../reporting/report-core/item-warehouse-location.util';
import { toEngineFilters } from '../report-column-mapper.util';
import {
  assertKnownColumns,
  projectRows,
  toTotalsRow,
} from '../report-data.util';
import {
  resolveInventoryBranchIds,
  resolveWarehouseLocationIds,
  resolveDescendantCategoryIds,
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
  // Reference-only: resolved live from the item's current shelf rather than
  // aggregated from the ledger, so there is nothing for SQL to filter on.
  { key: 'positionCode', type: STRING, filterKind: 'none', width: 110 },
  { key: 'positionName', type: STRING, filterKind: 'none', width: 110 },
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

/**
 * The two columns the chain view has no answer for.
 *
 * A shelf belongs to one branch, so a row that totals an item across every shop
 * in the chain has no single location to name. They are dropped from the catalog
 * rather than returned empty, so nobody can save a template around a column that
 * will always be blank. `CATALOG_KEYS` still lists them — a template saved in the
 * branch view must keep replaying without a 400.
 */
const LOCATION_COLUMN_KEYS = ['positionCode', 'positionName'];

/**
 * Which identity columns survive each "Thống kê theo" grain.
 *
 * The parent and category grains re-aggregate in SQL and select NULL for every
 * identity column they cannot speak for (`buildAggSqls`' `displayCols` and
 * `nullSpatialCols`). Leaving those in the catalog prints a screen of empty
 * cells — at the category grain, eight of them, with "Tên hàng hóa" repeating
 * the category name beside "Nhóm hàng hóa". So the catalog names exactly the
 * columns the grain actually fills; the measure columns are unaffected.
 *
 * `item` is not listed: it fills all of them.
 */
/**
 * Measure columns the aggregate grains do not compute (ADR-07).
 *
 * `pendingTransferCtes` is only spliced into the item-level query, so at the
 * parent and group grains these four come back as a structural zero rather than
 * a number the query stands behind. They stay in the catalog — a saved template
 * names them — but with no filter box, like `positionCode`.
 */
const UNFILLED_MEASURES_AT_AGGREGATE = [
  'transferOutQty',
  'transferOutValue',
  'incomingQty',
  'incomingValue',
];

const IDENTITY_KEYS_BY_GRAIN: Record<'parent' | 'group', string[]> = {
  // buildAggSqls puts the product's own code and name into sku / item_name.
  parent: ['name', 'sku'],
  group: ['group'],
};

/** Identity columns, i.e. everything the period bands do not own. */
const IDENTITY_KEYS = COLUMNS.filter((c) => !c.band).map((c) => c.key);

/**
 * Report column key → the field `StockPeriodService` knows it by (ADR-03).
 *
 * Only the disagreements are listed; everything else matches by name — including
 * `supplier` and the four transfer columns, which UOW-03 gave SQL expressions of
 * their own.
 *
 * `positionCode`/`positionName` are deliberately absent: they no longer come
 * from the ledger at all, so mapping them onto the engine's `locationCode` would
 * point a filter at a column the query does not select. They are declared
 * `filterKind: 'none'` for the same reason.
 */
const KEY_MAP = {
  name: 'itemName',
  group: 'categoryName',
  endingQty: 'closingQty',
  endingValue: 'closingValue',
} as const;

/**
 * "Tổng hợp nhập xuất tồn kho" — one row per item over a period, in both views.
 *
 * The report never splits an item across shelves. The branch view still shows a
 * location, but as a *reference*: the item's current shelf, resolved live and
 * preferring a warehouse over the showroom, not the shelf each movement happened
 * to be booked against. The chain view drops the two columns entirely, because a
 * row spanning several branches has no single shelf.
 */
@Injectable()
export class StockSummaryReport implements InventoryReportDefinition {
  readonly key = INVENTORY_REPORT_KEYS.STOCK_SUMMARY;

  constructor(
    private readonly stockPeriod: StockPeriodService,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(LocationEntity)
    private readonly locations: Repository<LocationEntity>,
    @InjectRepository(StorageEntity)
    private readonly storages: Repository<StorageEntity>,
    @InjectRepository(ItemStorageLocationEntity)
    private readonly itemStorageLocations: Repository<ItemStorageLocationEntity>,
    @InjectRepository(StockBalanceEntity)
    private readonly stockBalances: Repository<StockBalanceEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categories: Repository<ItemCategoryEntity>,
  ) {}

  private get locationRepos(): ItemWarehouseLocationRepos {
    return {
      storages: this.storages,
      locations: this.locations,
      itemStorageLocations: this.itemStorageLocations,
      stockBalances: this.stockBalances,
    };
  }

  // The actor is unused here — the catalog is the same for everyone — but the
  // interface passes it first, so it has to be named to reach `filters`.
  buildColumns(
    _actor?: ActorContext,
    filters?: InventoryReportColumnsFilterDto,
  ): Promise<ReportColumnHeader[]> {
    const grain = filters?.statBy;
    const kept =
      grain === 'parent' || grain === 'group'
        ? new Set(IDENTITY_KEYS_BY_GRAIN[grain])
        : null;
    const columns = COLUMNS.filter((c) => {
      if (kept && IDENTITY_KEYS.includes(c.key)) return kept.has(c.key);
      // A row spanning several branches has no single shelf to name.
      if (filters?.viewMode === 'chain') return !LOCATION_COLUMN_KEYS.includes(c.key);
      return true;
    });
    // The pin follows whichever identity column leads this grain.
    const pinned = columns.length ? [columns[0].key] : [];
    const unfilterable = kept
      ? new Set(UNFILLED_MEASURES_AT_AGGREGATE)
      : new Set<string>();
    return Promise.resolve(
      buildInventoryHeaders(this.key, columns, pinned, unfilterable),
    );
  }

  async buildData(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<InventoryReportResult> {
    assertKnownColumns(dto, CATALOG_KEYS);
    const scope = await this.scopedQuery(dto, actor);

    // Filtering, counting, totalling and paging all happen in SQL. This used to
    // pull the entire result set into memory to do the same four things, which
    // is what made a 74k-row organisation answer 400 for a 50-row page.
    const result = await this.stockPeriod.aggregate({
      ...scope,
      page: dto.page ?? 1,
      pageSize: dto.limit ?? 20,
    });

    const locations = await this.resolveLocations(
      dto,
      actor,
      scope.branchIds,
      result.data,
    );

    return {
      rows: projectRows(
        result.data.map((r) => this.toRow(r, locations.get(r.itemId))),
        dto.columns,
      ),
      totals: toTotalsRow(dto.columns, result.totals, KEY_MAP),
      total: result.total,
    };
  }

  /**
   * The reference shelf for each item on the page — one lookup, page-sized.
   *
   * Skipped unless it can actually answer: the chain view has no single branch,
   * a multi-store selection has no single branch either, and a request that did
   * not ask for the columns should not pay for four extra queries.
   */
  private async resolveLocations(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
    branchIds: string[] | undefined,
    rows: StockPeriodRow[],
  ): Promise<Map<string, ItemWarehouseLocation>> {
    const wanted = dto.columns.some((c) => LOCATION_COLUMN_KEYS.includes(c));
    const branchId = branchIds?.length === 1 ? branchIds[0] : null;
    if (!wanted || !branchId || dto.filters.viewMode === 'chain' || !rows.length) {
      return new Map();
    }
    return resolveItemWarehouseLocations(
      this.locationRepos,
      [...new Set(rows.map((r) => r.itemId))],
      actor.organizationId,
      branchId,
      { showroomFallback: true },
    );
  }

  /**
   * Row count for the whole set, without reading a row.
   *
   * `ReportExportService` only enforces the row cap for definitions that offer
   * this; without it, removing `assertUnderRowCap` from `buildData` would leave
   * the export path with nothing guarding it (ADR-01).
   */
  async countRows(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<CountedRows> {
    const scope = await this.scopedQuery(dto, actor);
    const result = await this.stockPeriod.aggregate({
      ...scope,
      page: 1,
      pageSize: 1,
    });
    return { total: result.total, subject: 'rows' };
  }

  /**
   * The engine query for one request, minus paging.
   *
   * `buildData` and `countRows` both build on this, so a count can never
   * describe a different period, scope or filter than the rows it counts.
   */
  private async scopedQuery(dto: InventoryReportSearchDto, actor: ActorContext) {
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

    return {
      organizationId: actor.organizationId,
      startDate: period.startDate,
      endDate: period.endDate,
      // One row per item, in both views: this report totals a SKU, it does not
      // break it down by shelf. The branch view's location column is resolved
      // afterwards from the item's current shelf (see `resolveLocations`).
      groupBy: 'item' as const,
      itemGroupBy: filters.statBy,
      branchIds,
      locationIds,
      // A parent group holds no items of its own — only its leaves do — so the
      // filter has to carry the whole subtree (ADR-01).
      categoryIds: await resolveDescendantCategoryIds(
        this.categories,
        filters.categoryId,
        actor.organizationId,
      ),
      search: filters.search,
      hideZeroRows: filters.hideZeroRows ?? true,
      // The unit/brand dropdowns used to filter the materialised rows in JS.
      // Left there, they would now filter only the page in view (ADR-06).
      columnFilters: toEngineFilters(dto.columnFilters, KEY_MAP, {
        unit: filters.unit,
        brand: filters.brand,
      }),
    };
  }

  private toRow(
    r: StockPeriodRow,
    location: ItemWarehouseLocation | undefined,
  ): ReportRow {
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
      positionCode: location?.code ?? null,
      positionName: location?.name ?? null,
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
      supplier: r.supplier ?? null,
    };
  }
}
