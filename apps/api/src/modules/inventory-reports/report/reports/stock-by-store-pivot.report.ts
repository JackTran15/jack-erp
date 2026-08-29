import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  branchQtyColumnKey,
  INVENTORY_REPORT_KEYS,
  InventoryReportResult,
  parseBranchQtyColumnKey,
  ReportColumnDataType,
  ReportColumnHeader,
  ReportRow,
  ReportTotals,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../../branch/branch.entity';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import {
  StockBalancePivotRow,
  StockBalancePivotService,
} from '../../services/stock-balance-pivot.service';
import {
  InventoryReportColumnsFilterDto,
  InventoryReportDefinition,
} from '../inventory-report-definition';
import {
  buildInventoryHeaders,
  InventoryColumnDef,
  numericKeys,
} from '../inventory-report-column.util';
import { CountedRows } from '../../../reporting/report-core/report-definition';
import { toEngineFilters } from '../report-column-mapper.util';
import { projectRows, toTotalsRow } from '../report-data.util';
import { ItemCategoryEntity } from '../../../inventory/location/item-category.entity';
import {
  permittedBranchIds,
  resolveInventoryBranchIds,
  resolveDescendantCategoryIds,
} from '../report-scope.util';

const { STRING, NUMBER } = ReportColumnDataType;

/**
 * Grid column key → the key the engine reports its totals under.
 *
 * The fixed columns match by name; only the per-branch cells differ, and they
 * are generated per organisation rather than declared (ADR-03).
 */
function branchTotalsKeyMap(
  orgBranches: Array<{ id: string }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const b of orgBranches) map[branchQtyColumnKey(b.id)] = `perBranch.${b.id}`;
  return map;
}

const FIXED_COLUMNS: InventoryColumnDef[] = [
  { key: 'sku', type: STRING, width: 140 },
  { key: 'name', type: STRING, width: 220 },
  { key: 'parentSku', type: STRING, width: 140 },
  { key: 'parentName', type: STRING, width: 150 },
  { key: 'color', type: STRING, width: 100 },
  { key: 'size', type: STRING, width: 80 },
  { key: 'unit', type: STRING, width: 110 },
  { key: 'group', type: STRING, width: 140 },
  { key: 'brand', type: STRING, width: 120 },
  { key: 'total', type: NUMBER, width: 120 },
];

const FIXED_KEYS = new Set(FIXED_COLUMNS.map((c) => c.key));

/**
 * "Số lượng tồn kho theo cửa hàng" — current balance pivot: fixed identity
 * columns + `total` + one dynamic NUMBER column per org branch
 * (`branch.qty.<branchId>`), mirroring the dynamic payment-method columns
 * of the daily sales summary.
 */
/**
 * Columns the aggregate grains leave empty, and so cannot filter on (ADR-07).
 *
 * The parent and group grains re-aggregate in SQL and select NULL for every
 * identity column they cannot speak for: a row spanning a whole product model
 * has no single colour, and one spanning a category has no single SKU. Drawing
 * a filter box over them answers 400. The lists are measured against real data
 * — see `evidence/probe-aggregate-grain-columns.txt` — not guessed from the SQL.
 *
 * The `item` grain fills everything, so it is absent.
 */
const UNFILLED_BY_GRAIN: Record<'parent' | 'group', ReadonlySet<string>> = {
  parent: new Set(['parentSku', 'parentName', 'color', 'size', 'unit', 'group', 'brand']),
  group: new Set(['parentSku', 'parentName', 'color', 'size', 'unit', 'brand']),
};

/** The unfilled set for one grain; the item grain fills everything. */
function unfilledAt(statBy: string | undefined): ReadonlySet<string> {
  return statBy === 'parent' || statBy === 'group'
    ? UNFILLED_BY_GRAIN[statBy]
    : new Set();
}

@Injectable()
export class StockByStorePivotReport implements InventoryReportDefinition {
  readonly key = INVENTORY_REPORT_KEYS.STOCK_BY_STORE_PIVOT;

  constructor(
    private readonly pivot: StockBalancePivotService,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categories: Repository<ItemCategoryEntity>,
  ) {}

  async buildColumns(
    actor: ActorContext,
    filters?: InventoryReportColumnsFilterDto,
  ): Promise<ReportColumnHeader[]> {
    const fixed = buildInventoryHeaders(
      this.key,
      FIXED_COLUMNS,
      ['sku'],
      unfilledAt(filters?.statBy),
    );
    const orgBranches = await this.orgBranches(actor);
    const dynamic: ReportColumnHeader[] = orgBranches.map((b) => ({
      col: branchQtyColumnKey(b.id),
      name: b.name,
      desc: null,
      type: NUMBER,
      group: { id: 'perBranch', name: 'Tồn theo cửa hàng' },
      filterKind: 'number',
      align: 'right',
      width: 120,
    }));
    return [...fixed, ...dynamic];
  }

  async buildData(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<InventoryReportResult> {
    const orgBranches = await this.orgBranches(actor);
    const branchIdSet = new Set(orgBranches.map((b) => b.id));
    this.assertKnownColumns(dto, branchIdSet);

    const filters = dto.filters;
    const branchIds = await resolveInventoryBranchIds(
      this.branches,
      filters.store,
      actor,
    );

    const result = await this.pivot.aggregate({
      ...(await this.engineQuery(dto, actor, branchIds)),
      page: dto.page ?? 1,
      pageSize: dto.limit ?? 20,
    });

    return {
      rows: projectRows(
        result.data.map((r) => this.toRow(r, orgBranches)),
        dto.columns,
      ),
      // Engine keys for the per-branch cells are `perBranch.<id>`; the grid
      // calls the same column `branch.qty.<id>`.
      totals: this.branchTotals(dto.columns, result.totals, orgBranches),
      total: result.total,
    };
  }

  /**
   * Footer for the pivot.
   *
   * `toTotalsRow` leaves a column absent from the engine totals as null, because
   * zero would otherwise be a claim the data does not make. A branch column is
   * the exception: `toRow` already renders a missing cell as 0, so a branch that
   * simply holds no stock has a real total of zero, and a blank footer under a
   * column of zeroes would read as "unknown" instead.
   */
  private branchTotals(
    columns: string[],
    totals: ReportTotals | undefined,
    orgBranches: BranchEntity[],
  ): ReportRow | null {
    const row = toTotalsRow(columns, totals, branchTotalsKeyMap(orgBranches));
    if (!row) return null;
    for (const b of orgBranches) {
      const key = branchQtyColumnKey(b.id);
      if (columns.includes(key) && row[key] === null) row[key] = 0;
    }
    return row;
  }

  /** Whole-set count for the export path's cap check (ADR-01). */
  async countRows(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<CountedRows> {
    const branchIds = await resolveInventoryBranchIds(
      this.branches,
      dto.filters.store,
      actor,
    );
    const result = await this.pivot.aggregate({
      ...(await this.engineQuery(dto, actor, branchIds)),
      page: 1,
      pageSize: 1,
    });
    return { total: result.total, subject: 'rows' };
  }

  /** Everything the engine needs except paging, shared by both callers. */
  private async engineQuery(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
    branchIds: string[] | undefined,
  ) {
    const filters = dto.filters;
    return {
      organizationId: actor.organizationId,
      itemGroupBy: filters.statBy,
      branchIds,
      // A parent group holds no items of its own — only its leaves do — so the
      // filter has to carry the whole subtree (ADR-01).
      categoryIds: await resolveDescendantCategoryIds(
        this.categories,
        filters.categoryId,
        actor.organizationId,
      ),
      search: filters.search,
      columnFilters: toEngineFilters(dto.columnFilters, {}, {
        unit: filters.unit,
        brand: filters.brand,
      }),
    };
  }

  private toRow(r: StockBalancePivotRow, orgBranches: BranchEntity[]): ReportRow {
    const row: ReportRow = {
      sku: r.sku,
      name: r.name,
      parentSku: r.parentSku,
      parentName: r.parentName,
      color: r.color ?? null,
      size: r.size ?? null,
      unit: r.unit,
      group: r.categoryName,
      brand: r.brand ?? null,
      total: r.totalQty,
    };
    for (const b of orgBranches) {
      row[branchQtyColumnKey(b.id)] = r.perBranch[b.id]?.qty ?? 0;
    }
    return row;
  }

  private assertKnownColumns(
    dto: InventoryReportSearchDto,
    branchIds: Set<string>,
  ): void {
    const referenced = [
      ...dto.columns,
      ...(dto.columnFilters ?? []).map((f) => f.col),
    ];
    const unknown = referenced.filter((k) => {
      if (FIXED_KEYS.has(k)) return false;
      const branchId = parseBranchQtyColumnKey(k);
      return !(branchId && branchIds.has(branchId));
    });
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown report columns: ${[...new Set(unknown)].join(', ')}`,
      );
    }
  }

  /** Dynamic-column catalog: the branches the actor manages (name ASC). */
  private async orgBranches(actor: ActorContext): Promise<BranchEntity[]> {
    const permitted = permittedBranchIds(actor);
    if (!permitted.size) return [];
    return this.branches.find({
      where: { organizationId: actor.organizationId, id: In([...permitted]) },
      order: { name: 'ASC' },
    });
  }
}
