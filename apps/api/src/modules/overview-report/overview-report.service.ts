import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { BranchService } from '../branch/branch.service';
import { MobileRevenueTimeUnit } from '../mobile/dto/mobile-revenue-report.query.dto';
import { cellsSql } from '../mobile/services/mobile-business-report.service';
import { LEGS_CTE } from '../mobile/services/mobile-cashflow-report.service';
import { resolveReportBranchScope } from '../mobile/services/mobile-report-scope.util';
import {
  SUBJECT_GROUP_BY_SQL,
  SUBJECT_ROW_SQL,
  TIME_BUCKET_SQL,
  revenueLinesSql,
} from '../mobile/services/mobile-revenue-report.sql';
import {
  DEBT_PAYMENTS_SQL,
  PaymentRow,
  SALES_PAYMENTS_SQL,
  revenueSql,
  splitOf,
} from '../mobile/services/mobile-store-detail.service';
import {
  OverviewShareDimension,
  OverviewTopProductsSortBy,
} from './dto/overview-report.query.dto';
import {
  OverviewCashFlowResponseDto,
  OverviewDailyActivityResponseDto,
  OverviewProductProfitResponseDto,
  OverviewRevenueCostProfitResponseDto,
  OverviewRevenueCostProfitTimelineResponseDto,
  OverviewRevenueTimelineResponseDto,
  OverviewSubjectListResponseDto,
  OverviewSubjectRowDto,
} from './dto/overview-report.response.dto';
import {
  CANCELLED_WITH_AMOUNT_SQL,
  OTHER_RECEIPTS_SQL,
} from './overview-report.sql';

interface RangeQuery {
  from: string;
  to: string;
  branchIds?: string[];
}

interface TimelineQuery extends RangeQuery {
  unit: MobileRevenueTimeUnit;
}

interface CellRow {
  branchId: string | null;
  year: number;
  month: number;
  revenue: number;
  cost: number;
}

interface Scope {
  branchIds: string[];
  params: unknown[];
  bind: (value: unknown) => string;
}

const round2 = (n: number): number => Math.round(Number(n ?? 0) * 100) / 100;
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Cột dòng hàng theo trục của "Tỉ trọng doanh thu" — nội suy từ enum, không bind. */
const SHARE_SELECT_SQL: Record<OverviewShareDimension, { select: string; groupBy: string }> = {
  [OverviewShareDimension.PRODUCT_GROUP]: {
    select: `
      COALESCE(category_id::text, '')        AS id,
      ''                                     AS code,
      COALESCE(MAX(category_name), 'Chưa phân nhóm') AS name,
      ''                                     AS unit,
      COALESCE(SUM(qty), 0)::float           AS quantity,
      COALESCE(SUM(amount), 0)::float        AS revenue`,
    groupBy: 'GROUP BY category_id',
  },
  [OverviewShareDimension.VARIANT]: {
    select: SUBJECT_ROW_SQL,
    groupBy: SUBJECT_GROUP_BY_SQL,
  },
  [OverviewShareDimension.PRODUCT]: {
    select: `
      item_id::text                          AS id,
      COALESCE(MAX(item_code), '')           AS code,
      COALESCE(MAX(item_name), MAX(item_code), '') AS name,
      COALESCE(MAX(unit), '')                AS unit,
      COALESCE(SUM(qty), 0)::float           AS quantity,
      COALESCE(SUM(amount), 0)::float        AS revenue`,
    groupBy: 'GROUP BY item_id',
  },
};

const TOP_ORDER_BY_SQL: Record<OverviewTopProductsSortBy, string> = {
  [OverviewTopProductsSortBy.REVENUE]: 'ORDER BY revenue DESC, quantity DESC, code ASC, id ASC',
  [OverviewTopProductsSortBy.QUANTITY]: 'ORDER BY quantity DESC, revenue DESC, code ASC, id ASC',
};

/**
 * Trang "Tổng quan" của backoffice — CHỈ đọc.
 *
 * Nhất quán với các báo cáo của app quản lý (`modules/mobile`): mọi con số
 * dựng trên đúng mảnh SQL của chúng — `revenueLinesSql` (doanh thu: loại huỷ,
 * loại nháp, dấu theo `direction`, trừ KM engine), `cellsSql` (doanh thu/chi
 * phí/lợi nhuận ≡ web KQKD, KHÔNG loại huỷ), `LEGS_CTE` (quỹ tiền mặt), các
 * câu thanh toán của chi tiết cửa hàng. Phạm vi = tập chi nhánh PHÂN CÔNG
 * (`resolveReportBranchScope`); `branchIds` vắng = mọi chi nhánh đó — đó là
 * chế độ "Chuỗi cửa hàng" của web.
 *
 * Kế thừa luôn giới hạn đã biết của các mảnh đó: chúng giả định session
 * Postgres ở Asia/Ho_Chi_Minh trong khi kết nối ép UTC, nên mốc ngày/giờ lệch
 * 7h. Sửa ở mảnh dùng chung, không sửa riêng ở đây — hai màn phải cùng số.
 */
@Injectable()
export class OverviewReportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly branches: BranchService,
  ) {}

  /** Row 1 — tiền thu, doanh thu tách đã/chưa thanh toán, hoá đơn huỷ trong kỳ. */
  async getDailyActivity(
    query: RangeQuery,
    actor: ActorContext,
  ): Promise<OverviewDailyActivityResponseDto> {
    const { params } = this.resolveScope(query, actor);
    const lines = revenueLinesSql({ fromParam: '$2', toParam: '$3', branchesParam: '$4' });

    const [salesRows, debtRows, otherRows, [revenue], [cancelled]] = await Promise.all([
      this.dataSource.query<PaymentRow[]>(SALES_PAYMENTS_SQL, params),
      this.dataSource.query<PaymentRow[]>(DEBT_PAYMENTS_SQL, params),
      this.dataSource.query<PaymentRow[]>(OTHER_RECEIPTS_SQL, params),
      this.dataSource.query<Record<string, number>[]>(revenueSql(lines), params),
      this.dataSource.query<{ count: number; amount: number }[]>(
        CANCELLED_WITH_AMOUNT_SQL,
        params,
      ),
    ]);

    return {
      cashIn: {
        sales: splitOf(salesRows),
        debt: splitOf(debtRows),
        other: splitOf(otherRows),
      },
      revenue: {
        total: round2(revenue?.total ?? 0),
        invoiceCount: Number(revenue?.invoiceCount ?? 0),
        paidAmount: round2(revenue?.paidAmount ?? 0),
        paidCount: Number(revenue?.paidCount ?? 0),
        unpaidAmount: round2(revenue?.unpaidAmount ?? 0),
        unpaidCount: Number(revenue?.unpaidCount ?? 0),
      },
      cancelled: {
        count: Number(cancelled?.count ?? 0),
        amount: round2(cancelled?.amount ?? 0),
      },
    };
  }

  /**
   * Row 2 trái — doanh thu/chi phí/lợi nhuận từng cửa hàng. Danh sách cửa hàng
   * = `listMyBranches` (phân công ∩ ACTIVE, như báo cáo kinh doanh mobile) giao
   * với phạm vi đã xin; cửa hàng không phát sinh vẫn có cột 0.
   */
  async getRevenueCostProfit(
    query: RangeQuery,
    actor: ActorContext,
  ): Promise<OverviewRevenueCostProfitResponseDto> {
    const { branchIds } = this.resolveScope(query, actor);
    const wanted = new Set(branchIds);
    const mine = (await this.branches.listMyBranches(actor)).filter((b) => wanted.has(b.id));

    const cells = await this.queryCells(actor.organizationId, query, mine.map((b) => b.id));

    const stores = mine.map((branch) => {
      const own = cells.filter((c) => c.branchId === branch.id);
      const revenue = round2(own.reduce((sum, c) => sum + c.revenue, 0));
      const cost = round2(own.reduce((sum, c) => sum + c.cost, 0));
      return { branchId: branch.id, name: branch.name, revenue, cost, profit: round2(revenue - cost) };
    });
    stores.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, 'vi'));

    const revenue = round2(stores.reduce((sum, s) => sum + s.revenue, 0));
    const cost = round2(stores.reduce((sum, s) => sum + s.cost, 0));

    return { totals: { revenue, cost, profit: round2(revenue - cost) }, stores };
  }

  /** Row 2 phải — thu/chi quỹ tiền mặt theo mốc (chân movement của `LEGS_CTE`). */
  async getCashFlow(
    query: TimelineQuery,
    actor: ActorContext,
  ): Promise<OverviewCashFlowResponseDto> {
    const { params } = this.resolveScope(query, actor);

    // `TIME_BUCKET_SQL` đọc cột tên `issued_at` → đặt bí danh cho `created_at`
    // của movement thay vì chép lại sáu biểu thức mốc.
    const sql = `
      ${LEGS_CTE}
      SELECT
        ${TIME_BUCKET_SQL[query.unit]} AS bucket,
        COALESCE(SUM(CASE WHEN signed > 0 THEN  signed END), 0)::float AS "cashIn",
        COALESCE(SUM(CASE WHEN signed < 0 THEN -signed END), 0)::float AS "cashOut"
      FROM (
        SELECT signed, created_at AS issued_at FROM legs WHERE created_at >= $2::date
      ) period
      GROUP BY 1
      ORDER BY 1
    `;

    const rows = await this.dataSource.query<
      { bucket: string; cashIn: number; cashOut: number }[]
    >(sql, params);

    return {
      points: rows.map((r) => ({
        bucket: r.bucket,
        cashIn: round2(r.cashIn),
        cashOut: round2(r.cashOut),
      })),
    };
  }

  /** Row 3 phải "Doanh thu" — đúng câu `getTimeline` của doanh thu mobile, không lấp mốc. */
  async getRevenueTimeline(
    query: TimelineQuery,
    actor: ActorContext,
  ): Promise<OverviewRevenueTimelineResponseDto> {
    const { params } = this.resolveScope(query, actor);

    const sql = `
      WITH ${revenueLinesSql({ fromParam: '$2', toParam: '$3', branchesParam: '$4' })}
      SELECT
        ${TIME_BUCKET_SQL[query.unit]}    AS bucket,
        COALESCE(SUM(amount), 0)::float   AS revenue
      FROM lines
      GROUP BY 1
      ORDER BY 1
    `;

    const rows = await this.dataSource.query<{ bucket: string; revenue: number }[]>(sql, params);
    return { points: rows.map((r) => ({ bucket: r.bucket, revenue: round2(r.revenue) })) };
  }

  /** Row 3 phải "Doanh thu, chi phí, lợi nhuận" — ô tháng của `cellsSql`, cộng mọi chi nhánh. */
  async getRevenueCostProfitTimeline(
    query: RangeQuery,
    actor: ActorContext,
  ): Promise<OverviewRevenueCostProfitTimelineResponseDto> {
    const { branchIds } = this.resolveScope(query, actor);
    const cells = await this.queryCells(actor.organizationId, query, branchIds);

    const byMonth = new Map<string, { revenue: number; cost: number }>();
    for (const cell of cells) {
      const bucket = `${cell.year}-${pad2(cell.month)}-01T00:00:00`;
      const acc = byMonth.get(bucket) ?? { revenue: 0, cost: 0 };
      acc.revenue += cell.revenue;
      acc.cost += cell.cost;
      byMonth.set(bucket, acc);
    }

    const points = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, { revenue, cost }]) => ({
        bucket,
        revenue: round2(revenue),
        cost: round2(cost),
        profit: round2(revenue - cost),
      }));

    return { points };
  }

  /** Row 3 phải "Lợi nhuận hàng hoá" — doanh thu và giá vốn của CTE `lines`, theo mốc. */
  async getProductProfit(
    query: TimelineQuery & { categoryIds?: string[]; productIds?: string[]; itemIds?: string[] },
    actor: ActorContext,
  ): Promise<OverviewProductProfitResponseDto> {
    const { params, bind } = this.resolveScope(query, actor);

    const filters: string[] = [];
    if (query.categoryIds?.length) {
      filters.push(`category_id::text = ANY(${bind(query.categoryIds)}::text[])`);
    }
    if (query.productIds?.length) {
      filters.push(`subject_id::text = ANY(${bind(query.productIds)}::text[])`);
    }
    if (query.itemIds?.length) {
      filters.push(`item_id::text = ANY(${bind(query.itemIds)}::text[])`);
    }

    const sql = `
      WITH ${revenueLinesSql({ fromParam: '$2', toParam: '$3', branchesParam: '$4' })}
      SELECT
        ${TIME_BUCKET_SQL[query.unit]}    AS bucket,
        COALESCE(SUM(amount), 0)::float   AS revenue,
        COALESCE(SUM(cost), 0)::float     AS cogs
      FROM lines
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      GROUP BY 1
      ORDER BY 1
    `;

    const rows = await this.dataSource.query<{ bucket: string; revenue: number; cogs: number }[]>(
      sql,
      params,
    );

    return {
      points: rows.map((r) => ({
        bucket: r.bucket,
        revenue: round2(r.revenue),
        cogs: round2(r.cogs),
        profit: round2(r.revenue - r.cogs),
      })),
    };
  }

  /** Row 3 trái — doanh thu gộp theo nhóm hàng / mẫu mã / hàng hoá, giảm dần; client tự gộp Top-N. */
  async getProductShare(
    query: RangeQuery & { dimension: OverviewShareDimension; categoryId?: string; productId?: string },
    actor: ActorContext,
  ): Promise<OverviewSubjectListResponseDto> {
    const { select, groupBy } = SHARE_SELECT_SQL[query.dimension];
    const rows = await this.querySubjects(query, actor, select, groupBy, 'ORDER BY revenue DESC, name ASC, id ASC');
    return { rows };
  }

  /** Row 3 trái — hàng hoá bán chạy theo doanh thu hoặc số lượng. */
  async getTopProducts(
    query: RangeQuery & {
      sortBy: OverviewTopProductsSortBy;
      limit?: number;
      categoryId?: string;
      productId?: string;
    },
    actor: ActorContext,
  ): Promise<OverviewSubjectListResponseDto> {
    const { select, groupBy } = SHARE_SELECT_SQL[OverviewShareDimension.PRODUCT];
    const limit = Math.min(Math.max(Math.trunc(query.limit ?? 10), 1), 50);
    const rows = await this.querySubjects(
      query,
      actor,
      select,
      groupBy,
      `${TOP_ORDER_BY_SQL[query.sortBy]} LIMIT ${limit}`,
    );
    return { rows };
  }

  private async querySubjects(
    query: RangeQuery & { categoryId?: string; productId?: string },
    actor: ActorContext,
    select: string,
    groupBy: string,
    tail: string,
  ): Promise<OverviewSubjectRowDto[]> {
    const { params, bind } = this.resolveScope(query, actor);
    const categoryParam = query.categoryId ? bind(query.categoryId) : undefined;
    const subjectParam = query.productId ? bind(query.productId) : undefined;

    const sql = `
      WITH ${revenueLinesSql({ fromParam: '$2', toParam: '$3', branchesParam: '$4', categoryParam, subjectParam })}
      SELECT ${select}
      FROM lines
      ${groupBy}
      ${tail}
    `;

    const rows = await this.dataSource.query<OverviewSubjectRowDto[]>(sql, params);
    return rows.map((r) => ({
      ...r,
      quantity: round2(r.quantity),
      revenue: round2(r.revenue),
    }));
  }

  /** Ô `(chi nhánh, tháng)` của `cellsSql` trong `[from, to]`. */
  private queryCells(
    organizationId: string,
    range: RangeQuery,
    branchIds: string[],
  ): Promise<CellRow[]> {
    const branchClause = (alias: string): string => `AND ${alias}.branch_id = ANY($4::text[])`;
    return this.dataSource.query<CellRow[]>(cellsSql(branchClause), [
      organizationId,
      range.from,
      range.to,
      branchIds,
    ]);
  }

  /** `$1` org, `$2` from, `$3` to, `$4` chi nhánh — cùng thứ tự mọi mảnh SQL mobile. */
  private resolveScope(query: RangeQuery, actor: ActorContext): Scope {
    const branchIds = resolveReportBranchScope({ requested: query.branchIds, actor });
    const params: unknown[] = [actor.organizationId, query.from, query.to, branchIds];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };
    return { branchIds, params, bind };
  }
}
