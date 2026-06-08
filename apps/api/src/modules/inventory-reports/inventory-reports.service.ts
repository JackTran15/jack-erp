import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { ActorContext } from '../../common/decorators/actor-context.decorator';
import { CacheService } from '../redis/cache.service';
import { InventoryReportQueryDto } from './dto/inventory-report-query.dto';
import { TransferByBranchQueryDto } from './dto/transfer-by-branch-query.dto';
import { resolvePeriod } from './services/date-range-resolver';
import {
  StockPeriodGroupBy,
  StockPeriodQuery,
  StockPeriodResult,
  StockPeriodService,
} from './services/stock-period.service';
import {
  StockBalancePivotQuery,
  StockBalancePivotResult,
  StockBalancePivotService,
} from './services/stock-balance-pivot.service';
import {
  TransferByBranchQuery,
  TransferByBranchResult,
  TransferReportService,
  TransferSummaryQuery,
  TransferSummaryResult,
} from './services/transfer-report.service';
import {
  DocumentDetailQuery,
  DocumentDetailResult,
  DocumentDetailService,
} from './services/document-detail.service';

const CACHE_NAMESPACE = 'inventory-reports';
const CACHE_TTL_SECONDS = 45;

/**
 * Facade service for inventory reports. Báo cáo 1 / 3 / 4 are powered by the
 * shared `StockPeriodService` CTE; báo cáo 5 uses `StockBalancePivotService`;
 * báo cáo 6 / 7 use `TransferReportService`. Báo cáo 2 (stock-document-details)
 * remains a stub for a later task.
 */
@Injectable()
export class InventoryReportsService {
  constructor(
    private readonly stockPeriodService: StockPeriodService,
    private readonly stockBalancePivotService: StockBalancePivotService,
    private readonly transferReportService: TransferReportService,
    private readonly documentDetailService: DocumentDetailService,
    private readonly cacheService: CacheService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Báo cáo 1 — Tổng hợp nhập xuất tồn (item × location)
  // ──────────────────────────────────────────────────────────────────
  async stockSummary(actor: ActorContext, query: InventoryReportQueryDto) {
    return this.runStockPeriod(
      'stock-summary',
      actor,
      query,
      'item_location',
      false,
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // Báo cáo 3 — Chi tiết số lượng nhập xuất tồn (item × location, with IN/OUT breakdown)
  // ──────────────────────────────────────────────────────────────────
  async stockQuantityDetails(
    actor: ActorContext,
    query: InventoryReportQueryDto,
  ) {
    return this.runStockPeriod(
      'stock-quantity-details',
      actor,
      query,
      'item_location',
      true,
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // Báo cáo 4 — Tổng hợp nhập xuất tồn theo cửa hàng (item × branch)
  // ──────────────────────────────────────────────────────────────────
  async stockSummaryByBranch(
    actor: ActorContext,
    query: InventoryReportQueryDto,
  ) {
    return this.runStockPeriod(
      'stock-summary-by-branch',
      actor,
      query,
      'item_branch',
      false,
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // Báo cáo 5 — Số lượng tồn theo cửa hàng (pivot)
  // ──────────────────────────────────────────────────────────────────
  async stockByBranch(actor: ActorContext, dto: InventoryReportQueryDto) {
    // Pivot is a current-snapshot view; we still resolve a period so the
    // response shape stays consistent with the other endpoints and the
    // FE doesn't have to special-case it.
    const period = resolvePeriod({
      preset: dto.preset,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;

    const pivotQuery: StockBalancePivotQuery = {
      organizationId: actor.organizationId,
      itemGroupBy: dto.itemGroupBy,
      branchIds: dto.branchIds,
      categoryIds: dto.categoryIds,
      search: dto.search,
      page,
      pageSize,
    };

    const cacheKey = this.buildPivotCacheKey('stock-by-branch', actor, pivotQuery);

    const result = await this.cacheService.getOrSet<StockBalancePivotResult>(
      CACHE_NAMESPACE,
      cacheKey,
      () => this.stockBalancePivotService.aggregate(pivotQuery),
      CACHE_TTL_SECONDS,
    );

    return {
      data: result.data,
      branches: result.branches,
      total: result.total,
      page,
      pageSize,
      period: {
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Báo cáo 6 — Tổng hợp nhập xuất điều chuyển
  // ──────────────────────────────────────────────────────────────────
  async transferSummary(actor: ActorContext, dto: InventoryReportQueryDto) {
    const period = resolvePeriod({
      preset: dto.preset,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;

    const summaryQuery: TransferSummaryQuery = {
      organizationId: actor.organizationId,
      startDate: period.startDate,
      endDate: period.endDate,
      branchIds: dto.branchIds,
    };

    const cacheKey = this.buildTransferSummaryCacheKey(
      'transfer-summary',
      actor,
      summaryQuery,
    );

    const result = await this.cacheService.getOrSet<TransferSummaryResult>(
      CACHE_NAMESPACE,
      cacheKey,
      () => this.transferReportService.summarize(summaryQuery),
      CACHE_TTL_SECONDS,
    );

    return {
      data: result.data,
      total: result.total,
      page,
      pageSize,
      period: {
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Báo cáo 7 — Hàng hóa điều chuyển theo cửa hàng
  // ──────────────────────────────────────────────────────────────────
  async transferByBranch(
    actor: ActorContext,
    dto: TransferByBranchQueryDto,
  ) {
    const sourceBranchId = dto.sourceBranchId ?? actor.branchId;
    if (!sourceBranchId) {
      throw new BadRequestException(
        'sourceBranchId là bắt buộc hoặc phải có X-Branch-Id trong header',
      );
    }

    const period = resolvePeriod({
      preset: dto.preset,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;

    // FE filter "Cửa hàng nhận" arrives via the shared `branchIds` field
    // (single source of truth across reports). It restricts destinations.
    const byBranchQuery: TransferByBranchQuery = {
      organizationId: actor.organizationId,
      startDate: period.startDate,
      endDate: period.endDate,
      sourceBranchId,
      destinationBranchIds: dto.branchIds,
      categoryIds: dto.categoryIds,
      search: dto.search,
      itemGroupBy: dto.itemGroupBy,
      page,
      pageSize,
    };

    const cacheKey = this.buildTransferByBranchCacheKey(
      'transfer-by-branch',
      actor,
      byBranchQuery,
    );

    const result = await this.cacheService.getOrSet<TransferByBranchResult>(
      CACHE_NAMESPACE,
      cacheKey,
      () => this.transferReportService.byBranch(byBranchQuery),
      CACHE_TTL_SECONDS,
    );

    return {
      data: result.data,
      total: result.total,
      page,
      pageSize,
      sourceBranchId,
      period: {
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Báo cáo 2 — Bảng kê chi tiết phiếu nhập xuất kho
  // ──────────────────────────────────────────────────────────────────
  async stockDocumentDetails(
    actor: ActorContext,
    dto: InventoryReportQueryDto,
  ) {
    const period = resolvePeriod({
      preset: dto.preset,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;

    const detailQuery: DocumentDetailQuery = {
      organizationId: actor.organizationId,
      startDate: period.startDate,
      endDate: period.endDate,
      branchIds: dto.branchIds,
      categoryIds: dto.categoryIds,
      search: dto.search,
      page,
      pageSize,
    };

    const cacheKey = this.buildDocumentDetailCacheKey(
      'stock-document-details',
      actor,
      detailQuery,
    );

    const result = await this.cacheService.getOrSet<DocumentDetailResult>(
      CACHE_NAMESPACE,
      cacheKey,
      () => this.documentDetailService.list(detailQuery),
      CACHE_TTL_SECONDS,
    );

    return {
      data: result.data,
      total: result.total,
      page,
      pageSize,
      period: {
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Internals
  // ──────────────────────────────────────────────────────────────────
  private async runStockPeriod(
    reportKey: string,
    actor: ActorContext,
    dto: InventoryReportQueryDto,
    groupBy: StockPeriodGroupBy,
    includeBreakdown: boolean,
  ) {
    const period = resolvePeriod({
      preset: dto.preset,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;

    const stockPeriodQuery: StockPeriodQuery = {
      organizationId: actor.organizationId,
      startDate: period.startDate,
      endDate: period.endDate,
      groupBy,
      itemGroupBy: dto.itemGroupBy,
      branchIds: dto.branchIds,
      locationIds: dto.locationIds,
      categoryIds: dto.categoryIds,
      search: dto.search,
      includeBreakdown,
      hideZeroRows: false,
      page,
      pageSize,
    };

    const cacheKey = this.buildCacheKey(reportKey, actor, stockPeriodQuery);

    const result = await this.cacheService.getOrSet<StockPeriodResult>(
      CACHE_NAMESPACE,
      cacheKey,
      () => this.stockPeriodService.aggregate(stockPeriodQuery),
      CACHE_TTL_SECONDS,
    );

    return {
      data: result.data,
      total: result.total,
      page,
      pageSize,
      period: {
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
      },
    };
  }

  /**
   * Hash key namespaced by report + org. Array filters are sorted and
   * empty arrays / undefined are dropped before hashing so equivalent
   * queries collapse to the same key.
   */
  private buildCacheKey(
    reportKey: string,
    actor: ActorContext,
    query: StockPeriodQuery,
  ): string {
    const normalised = {
      startDate: query.startDate.toISOString(),
      endDate: query.endDate.toISOString(),
      groupBy: query.groupBy,
      itemGroupBy: query.itemGroupBy ?? 'item',
      branchIds:
        query.branchIds && query.branchIds.length > 0
          ? [...query.branchIds].sort()
          : null,
      locationIds:
        query.locationIds && query.locationIds.length > 0
          ? [...query.locationIds].sort()
          : null,
      categoryIds:
        query.categoryIds && query.categoryIds.length > 0
          ? [...query.categoryIds].sort()
          : null,
      search: query.search && query.search.length > 0 ? query.search : null,
      includeBreakdown: query.includeBreakdown === true,
      hideZeroRows: query.hideZeroRows === true,
      page: query.page,
      pageSize: query.pageSize,
    };
    return this.hashKey(reportKey, actor, normalised);
  }

  private buildPivotCacheKey(
    reportKey: string,
    actor: ActorContext,
    query: StockBalancePivotQuery,
  ): string {
    const normalised = {
      itemGroupBy: query.itemGroupBy ?? 'item',
      branchIds:
        query.branchIds && query.branchIds.length > 0
          ? [...query.branchIds].sort()
          : null,
      categoryIds:
        query.categoryIds && query.categoryIds.length > 0
          ? [...query.categoryIds].sort()
          : null,
      search: query.search && query.search.length > 0 ? query.search : null,
      page: query.page,
      pageSize: query.pageSize,
    };
    return this.hashKey(reportKey, actor, normalised);
  }

  private buildTransferSummaryCacheKey(
    reportKey: string,
    actor: ActorContext,
    query: TransferSummaryQuery,
  ): string {
    const normalised = {
      startDate: query.startDate.toISOString(),
      endDate: query.endDate.toISOString(),
      branchIds:
        query.branchIds && query.branchIds.length > 0
          ? [...query.branchIds].sort()
          : null,
    };
    return this.hashKey(reportKey, actor, normalised);
  }

  private buildDocumentDetailCacheKey(
    reportKey: string,
    actor: ActorContext,
    query: DocumentDetailQuery,
  ): string {
    const normalised = {
      startDate: query.startDate.toISOString(),
      endDate: query.endDate.toISOString(),
      branchIds:
        query.branchIds && query.branchIds.length > 0
          ? [...query.branchIds].sort()
          : null,
      categoryIds:
        query.categoryIds && query.categoryIds.length > 0
          ? [...query.categoryIds].sort()
          : null,
      search: query.search && query.search.length > 0 ? query.search : null,
      page: query.page,
      pageSize: query.pageSize,
    };
    return this.hashKey(reportKey, actor, normalised);
  }

  private buildTransferByBranchCacheKey(
    reportKey: string,
    actor: ActorContext,
    query: TransferByBranchQuery,
  ): string {
    const normalised = {
      startDate: query.startDate.toISOString(),
      endDate: query.endDate.toISOString(),
      itemGroupBy: query.itemGroupBy ?? 'item',
      sourceBranchId: query.sourceBranchId,
      destinationBranchIds:
        query.destinationBranchIds && query.destinationBranchIds.length > 0
          ? [...query.destinationBranchIds].sort()
          : null,
      categoryIds:
        query.categoryIds && query.categoryIds.length > 0
          ? [...query.categoryIds].sort()
          : null,
      search: query.search && query.search.length > 0 ? query.search : null,
      page: query.page,
      pageSize: query.pageSize,
    };
    return this.hashKey(reportKey, actor, normalised);
  }

  private hashKey(
    reportKey: string,
    actor: ActorContext,
    normalised: unknown,
  ): string {
    const hash = createHash('sha256')
      .update(JSON.stringify(normalised))
      .digest('hex');
    return `${reportKey}:${actor.organizationId}:${hash}`;
  }

  private emptyResponse(query: InventoryReportQueryDto) {
    const period = resolvePeriod({
      preset: query.preset,
      startDate: query.startDate,
      endDate: query.endDate,
    });
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return {
      data: [] as unknown[],
      total: 0,
      page,
      pageSize,
      period: {
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
      },
    };
  }
}
