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
import { InventoryReportDefinition } from '../inventory-report-definition';
import {
  buildInventoryHeaders,
  InventoryColumnDef,
  numericKeys,
} from '../inventory-report-column.util';
import { CountedRows } from '../../../reporting/report-core/report-definition';
import { toEngineFilters } from '../report-column-mapper.util';
import { projectRows, toTotalsRow } from '../report-data.util';
import {
  permittedBranchIds,
  resolveInventoryBranchIds,
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
@Injectable()
export class StockByStorePivotReport implements InventoryReportDefinition {
  readonly key = INVENTORY_REPORT_KEYS.STOCK_BY_STORE_PIVOT;

  constructor(
    private readonly pivot: StockBalancePivotService,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
  ) {}

  async buildColumns(actor: ActorContext): Promise<ReportColumnHeader[]> {
    const fixed = buildInventoryHeaders(this.key, FIXED_COLUMNS, ['sku']);
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
      ...this.engineQuery(dto, actor, branchIds),
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
      ...this.engineQuery(dto, actor, branchIds),
      page: 1,
      pageSize: 1,
    });
    return { total: result.total, subject: 'rows' };
  }

  /** Everything the engine needs except paging, shared by both callers. */
  private engineQuery(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
    branchIds: string[] | undefined,
  ) {
    const filters = dto.filters;
    return {
      organizationId: actor.organizationId,
      itemGroupBy: filters.statBy,
      branchIds,
      categoryIds: filters.categoryId ? [filters.categoryId] : undefined,
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
