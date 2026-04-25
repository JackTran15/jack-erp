import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  DashboardSummary,
  SalesSummary,
  InventoryValuation,
  AgingReport,
  CashReconciliation,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { RbacService } from '../rbac/rbac.service';

export interface ReportDateRange {
  startDate: string;
  endDate: string;
}

export interface ReportQuery {
  branchId?: string;
  dateRange?: ReportDateRange;
}

const CONSOLIDATED_PERMISSION = 'reporting.dashboard.consolidated.read';
const BRANCH_PERMISSION = 'reporting.dashboard.branch.read';

@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly rbacService: RbacService,
  ) {}

  async getDashboard(
    query: ReportQuery,
    actor: ActorContext,
  ): Promise<DashboardSummary> {
    const branchFilter = await this.resolveBranchScope(query.branchId, actor);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86_400_000);

    const salesResult = await this.dataSource.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total
       FROM pos_sales
       WHERE organization_id = $1
         AND ($2 IS NULL OR branch_id = $2)
         AND sale_date >= $3 AND sale_date < $4`,
      [actor.organizationId, branchFilter, todayStart, todayEnd],
    );

    const returnsResult = await this.dataSource.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total
       FROM pos_returns
       WHERE organization_id = $1
         AND ($2 IS NULL OR branch_id = $2)
         AND return_date >= $3 AND return_date < $4`,
      [actor.organizationId, branchFilter, todayStart, todayEnd],
    );

    const openSessionsResult = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count
       FROM pos_sessions
       WHERE organization_id = $1
         AND ($2 IS NULL OR branch_id = $2)
         AND status IN ('OPEN', 'ACTIVE_SALES')`,
      [actor.organizationId, branchFilter],
    );

    const receivablesResult = await this.dataSource.query(
      `SELECT COALESCE(SUM(amount - settled_amount), 0) AS total
       FROM receivables
       WHERE organization_id = $1
         AND ($2 IS NULL OR branch_id = $2)
         AND status IN ('POSTED', 'PARTIALLY_SETTLED')`,
      [actor.organizationId, branchFilter],
    );

    const payablesResult = await this.dataSource.query(
      `SELECT COALESCE(SUM(amount - settled_amount), 0) AS total
       FROM payables
       WHERE organization_id = $1
         AND ($2 IS NULL OR branch_id = $2)
         AND status IN ('POSTED', 'PARTIALLY_SETTLED')`,
      [actor.organizationId, branchFilter],
    );

    const lowStockResult = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count
       FROM stock_balances
       WHERE organization_id = $1
         AND ($2 IS NULL OR branch_id = $2)
         AND quantity <= 0`,
      [actor.organizationId, branchFilter],
    );

    const totalSales = Number(salesResult[0]?.total ?? 0);
    const totalReturns = Number(returnsResult[0]?.total ?? 0);

    return {
      organizationId: actor.organizationId,
      branchId: branchFilter ?? undefined,
      totalSalesToday: totalSales,
      totalReturnsToday: totalReturns,
      netRevenue: totalSales - totalReturns,
      openPosSessionCount: openSessionsResult[0]?.count ?? 0,
      lowStockItemCount: lowStockResult[0]?.count ?? 0,
      pendingReceivables: Number(receivablesResult[0]?.total ?? 0),
      pendingPayables: Number(payablesResult[0]?.total ?? 0),
      generatedAt: new Date().toISOString(),
    };
  }

  async getSalesSummary(
    query: ReportQuery,
    actor: ActorContext,
  ): Promise<SalesSummary> {
    const branchFilter = await this.resolveBranchScope(query.branchId, actor);
    const { startDate, endDate } = this.resolveRange(query.dateRange);

    const salesResult = await this.dataSource.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total,
              COUNT(*)::int AS count
       FROM pos_sales
       WHERE organization_id = $1
         AND ($2 IS NULL OR branch_id = $2)
         AND sale_date >= $3 AND sale_date < $4`,
      [actor.organizationId, branchFilter, startDate, endDate],
    );

    const returnsResult = await this.dataSource.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total,
              COUNT(*)::int AS count
       FROM pos_returns
       WHERE organization_id = $1
         AND ($2 IS NULL OR branch_id = $2)
         AND return_date >= $3 AND return_date < $4`,
      [actor.organizationId, branchFilter, startDate, endDate],
    );

    const totalSales = Number(salesResult[0]?.total ?? 0);
    const saleCount = salesResult[0]?.count ?? 0;
    const totalReturns = Number(returnsResult[0]?.total ?? 0);
    const returnCount = returnsResult[0]?.count ?? 0;

    return {
      organizationId: actor.organizationId,
      branchId: branchFilter ?? undefined,
      periodStart: startDate,
      periodEnd: endDate,
      totalSales,
      totalReturns,
      netRevenue: totalSales - totalReturns,
      saleCount,
      returnCount,
      averageSaleValue: saleCount > 0 ? totalSales / saleCount : 0,
    };
  }

  async getInventoryValuation(
    query: ReportQuery,
    actor: ActorContext,
  ): Promise<InventoryValuation[]> {
    const branchFilter = await this.resolveBranchScope(query.branchId, actor);

    const rows = await this.dataSource.query(
      `SELECT sb.item_id,
              i.name AS item_name,
              i.code AS sku,
              sb.quantity,
              sb.branch_id
       FROM stock_balances sb
       JOIN items i ON i.id = sb.item_id AND i.organization_id = sb.organization_id
       WHERE sb.organization_id = $1
         AND ($2 IS NULL OR sb.branch_id = $2)
       ORDER BY i.name`,
      [actor.organizationId, branchFilter],
    );

    const generatedAt = new Date().toISOString();

    return rows.map((row: any) => ({
      organizationId: actor.organizationId,
      branchId: row.branch_id ?? undefined,
      itemId: row.item_id,
      itemName: row.item_name,
      sku: row.sku,
      quantityOnHand: Number(row.quantity),
      unitCost: 0,
      totalValue: 0,
      generatedAt,
    }));
  }

  async getReceivablesAging(
    query: ReportQuery,
    actor: ActorContext,
  ): Promise<AgingReport> {
    const branchFilter = await this.resolveBranchScope(query.branchId, actor);
    return this.buildAgingReport('RECEIVABLE', actor.organizationId, branchFilter);
  }

  async getPayablesAging(
    query: ReportQuery,
    actor: ActorContext,
  ): Promise<AgingReport> {
    const branchFilter = await this.resolveBranchScope(query.branchId, actor);
    return this.buildAgingReport('PAYABLE', actor.organizationId, branchFilter);
  }

  async getCashReconciliation(
    query: ReportQuery,
    actor: ActorContext,
  ): Promise<CashReconciliation[]> {
    const branchFilter = await this.resolveBranchScope(query.branchId, actor);

    const rows = await this.dataSource.query(
      `SELECT r.session_id,
              r.expected_cash,
              r.actual_cash,
              r.variance,
              s.branch_id,
              r.created_at AS reconciled_at
       FROM pos_session_reconciliations r
       JOIN pos_sessions s ON s.id = r.session_id
       WHERE r.organization_id = $1
         AND ($2 IS NULL OR s.branch_id = $2)
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [actor.organizationId, branchFilter],
    );

    return rows.map((row: any) => ({
      organizationId: actor.organizationId,
      branchId: row.branch_id,
      sessionId: row.session_id,
      expectedBalance: Number(row.expected_cash),
      actualBalance: Number(row.actual_cash),
      discrepancy: Number(row.variance),
      reconciledAt: new Date(row.reconciled_at).toISOString(),
    }));
  }

  private async buildAgingReport(
    type: 'PAYABLE' | 'RECEIVABLE',
    organizationId: string,
    branchFilter: string | null,
  ): Promise<AgingReport> {
    const table = type === 'RECEIVABLE' ? 'receivables' : 'payables';

    const result = await this.dataSource.query(
      `SELECT
         COALESCE(SUM(CASE WHEN due_date >= CURRENT_DATE THEN amount - settled_amount ELSE 0 END), 0) AS current_bucket,
         COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30 THEN amount - settled_amount ELSE 0 END), 0) AS days_30,
         COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60 THEN amount - settled_amount ELSE 0 END), 0) AS days_60,
         COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - 60 AND due_date >= CURRENT_DATE - 90 THEN amount - settled_amount ELSE 0 END), 0) AS days_90,
         COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - 90 THEN amount - settled_amount ELSE 0 END), 0) AS over_90,
         COALESCE(SUM(amount - settled_amount), 0) AS total
       FROM ${table}
       WHERE organization_id = $1
         AND ($2 IS NULL OR branch_id = $2)
         AND status IN ('POSTED', 'PARTIALLY_SETTLED')`,
      [organizationId, branchFilter],
    );

    const row = result[0] ?? {};

    return {
      organizationId,
      branchId: branchFilter ?? undefined,
      type,
      current: Number(row.current_bucket ?? 0),
      days30: Number(row.days_30 ?? 0),
      days60: Number(row.days_60 ?? 0),
      days90: Number(row.days_90 ?? 0),
      over90: Number(row.over_90 ?? 0),
      total: Number(row.total ?? 0),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Resolve branch scope based on permissions:
   * - If branchId is provided and user has access, use it.
   * - If no branchId and user has consolidated permission, return null (all branches).
   * - Otherwise restrict to actor's own branch.
   */
  private async resolveBranchScope(
    requestedBranchId: string | undefined,
    actor: ActorContext,
  ): Promise<string | null> {
    const hasConsolidated = await this.rbacService.hasPermission(
      actor.userId,
      actor.organizationId,
      CONSOLIDATED_PERMISSION,
    );

    if (requestedBranchId) {
      if (hasConsolidated) return requestedBranchId;

      if (actor.branchId && actor.branchId === requestedBranchId) {
        return requestedBranchId;
      }

      throw new ForbiddenException(
        `Access denied for branch: ${requestedBranchId}`,
      );
    }

    if (hasConsolidated) return null;

    if (!actor.branchId) {
      throw new ForbiddenException(
        'No branch scope available and consolidated access not granted',
      );
    }

    return actor.branchId;
  }

  private resolveRange(dateRange?: ReportDateRange): {
    startDate: string;
    endDate: string;
  } {
    if (dateRange?.startDate && dateRange?.endDate) {
      return { startDate: dateRange.startDate, endDate: dateRange.endDate };
    }
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const endDate = now.toISOString().slice(0, 10);
    return { startDate, endDate };
  }
}
