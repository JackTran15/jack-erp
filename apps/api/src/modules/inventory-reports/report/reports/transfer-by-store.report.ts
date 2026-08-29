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
import {
  assertKnownColumns,
  projectRows,
  toTotalsRow,
} from '../report-data.util';
import { ItemCategoryEntity } from '../../../inventory/location/item-category.entity';
import {
  resolveDescendantCategoryIds,
  permittedBranchIds,
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
  { key: 'targetBranch', type: STRING, width: 220 },
  { key: 'outQty', type: NUMBER, width: 130 },
  { key: 'outAvgPrice', type: NUMBER, width: 160 },
  { key: 'outValue', type: NUMBER, width: 140 },
  { key: 'inQty', type: NUMBER, width: 130 },
  { key: 'inAvgPrice', type: NUMBER, width: 160 },
  { key: 'inValue', type: NUMBER, width: 140 },
];

const CATALOG_KEYS = new Set(COLUMNS.map((c) => c.key));

/** Report column key → the field `TransferReportService` knows it by (ADR-03). */
const KEY_MAP = {
  name: 'itemName',
  group: 'categoryName',
  targetBranch: 'destinationBranchName',
} as const;
const NUMERIC = numericKeys(COLUMNS);
/** Average prices must not be summed. */
const NON_ADDITIVE = new Set(['outAvgPrice', 'inAvgPrice']);

/** "Tổng hợp hàng hóa đã điều chuyển theo cửa hàng" — item × destination branch. */
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
export class TransferByStoreReport implements InventoryReportDefinition {
  readonly key = INVENTORY_REPORT_KEYS.TRANSFER_BY_STORE;

  constructor(
    private readonly transferReport: TransferReportService,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categories: Repository<ItemCategoryEntity>,
  ) {}

  buildColumns(
    _actor: ActorContext,
    filters?: InventoryReportColumnsFilterDto,
  ): Promise<ReportColumnHeader[]> {
    return Promise.resolve(
      buildInventoryHeaders(this.key, COLUMNS, ['sku'], unfilledAt(filters?.statBy)),
    );
  }

  async buildData(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<InventoryReportResult> {
    assertKnownColumns(dto, CATALOG_KEYS);
    const scope = await this.resolveScope(dto, actor);

    const result = await this.transferReport.byBranch({
      ...(await this.engineQuery(dto, actor, scope)),
      page: dto.page ?? 1,
      pageSize: dto.limit ?? 20,
    });

    return {
      rows: projectRows(result.data.map((r) => this.toRow(r)), dto.columns),
      totals: toTotalsRow(dto.columns, result.totals, KEY_MAP, NON_ADDITIVE),
      total: result.total,
    };
  }

  /** Whole-set count for the export path's cap check (ADR-01). */
  async countRows(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<CountedRows> {
    const scope = await this.resolveScope(dto, actor);
    const result = await this.transferReport.byBranch({
      ...(await this.engineQuery(dto, actor, scope)),
      page: 1,
      pageSize: 1,
    });
    return { total: result.total, subject: 'rows' };
  }

  /**
   * Period plus the validated source branch.
   *
   * The permission checks live here rather than in `buildData` so that
   * `countRows` — reached from the export path — cannot skip them.
   */
  private async resolveScope(dto: InventoryReportSearchDto, actor: ActorContext) {
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
      throw new ForbiddenException(`Access denied for stores: ${sourceBranchId}`);
    }
    const owned = await this.branches.findOne({
      where: { id: sourceBranchId, organizationId: actor.organizationId },
      select: { id: true },
    });
    if (!owned) {
      throw new BadRequestException(`Unknown store ids: ${sourceBranchId}`);
    }

    return { period, sourceBranchId };
  }

  /** Everything the engine needs except paging, shared by both callers. */
  private async engineQuery(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
    scope: { period: { startDate: Date; endDate: Date }; sourceBranchId: string },
  ) {
    const filters = dto.filters;
    return {
      organizationId: actor.organizationId,
      startDate: scope.period.startDate,
      endDate: scope.period.endDate,
      sourceBranchId: scope.sourceBranchId,
      destinationBranchIds: filters.receivingStoreIds,
      // A parent group holds no items of its own — only its leaves do — so the
      // filter has to carry the whole subtree (ADR-01).
      categoryIds: await resolveDescendantCategoryIds(
        this.categories,
        filters.categoryId,
        actor.organizationId,
      ),
      search: filters.search,
      itemGroupBy: filters.statBy,
      columnFilters: toEngineFilters(dto.columnFilters, KEY_MAP, {
        unit: filters.unit,
        brand: filters.brand,
      }),
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
