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
import { CountedRows } from '../../../reporting/report-core/report-definition';
import { toEngineFilters } from '../report-column-mapper.util';
import {
  assertKnownColumns,
  projectRows,
  toTotalsRow,
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
    const scope = await this.resolveScope(dto, actor);

    const result = await this.transferReport.byBranch({
      ...this.engineQuery(dto, actor, scope),
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
      ...this.engineQuery(dto, actor, scope),
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
  private engineQuery(
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
      categoryIds: filters.categoryId ? [filters.categoryId] : undefined,
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
