import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { MobileManagerInvoiceDateBasis } from '../dto/mobile-manager-invoice-list.query.dto';
import {
  MobileRevenueEstimateGroupBy,
  MobileRevenueEstimateStaffRole,
} from '../dto/mobile-revenue-estimate.query.dto';
import {
  MobileRevenueEstimateBucketDto,
  MobileRevenueEstimateResponseDto,
} from '../dto/mobile-revenue-estimate.response.dto';
import { resolveReportBranchScope } from './mobile-report-scope.util';
import {
  ESTIMATE_DATE_COLUMN,
  estimateBucketSql,
  estimatePaymentSql,
} from './mobile-revenue-estimate.sql';
import { invoiceScopeWhereSql, revenueLinesSql } from './mobile-revenue-report.sql';

/** Đúng hình dạng query sau validate. */
export interface RevenueEstimateQuery {
  from: string;
  to: string;
  branchIds?: string[];
  dateBasis: MobileManagerInvoiceDateBasis;
  groupBy: MobileRevenueEstimateGroupBy;
  staffRole?: MobileRevenueEstimateStaffRole;
}

/** Một dòng Postgres trả về — số tiền đã `::float`, đếm đã `::int`. */
interface BucketRow {
  key: string;
  label: string | null;
  orderCount: number;
  revenue: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Màn "Doanh thu ước tính" của app quản lý: số đơn + doanh thu trong kỳ, bổ
 * dọc theo MỘT trục do bộ lọc chọn (ngày / trạng thái HĐ / phương thức thanh
 * toán / nhân viên / kênh bán).
 *
 * Web KHÔNG có báo cáo này (`REVENUE_BY_TIME`, `REVENUE_BY_EMPLOYEE` còn
 * comment trong `report-type.constant.ts`), nên đây là một đường tự đọc,
 * công thức mượn của revenue-report: bốn chế độ đầu gộp trên CTE
 * `revenueLinesSql` (loại huỷ, loại nháp, dấu theo `direction`, trừ KM
 * engine) — cùng kỳ cùng chi nhánh với `dateBasis = issued` thì tổng ở đây
 * bằng thẻ tổng của Tổng quan. Chế độ `payment` có câu riêng, xem doc ở
 * `mobile-revenue-estimate.sql.ts`.
 *
 * Quyết định nghiệp vụ 2026-09-13, chốt với người dùng: LOẠI hoá đơn huỷ ở
 * mọi chế độ (khớp Tổng quan, khác báo cáo kinh doanh), nên chế độ `status`
 * không bao giờ có dòng `cancelled`; nháp cũng loại vì không phải đơn.
 *
 * Phạm vi chi nhánh = tập PHÂN CÔNG (`resolveReportBranchScope`).
 */
@Injectable()
export class MobileRevenueEstimateService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getReport(
    query: RevenueEstimateQuery,
    actor: ActorContext,
  ): Promise<MobileRevenueEstimateResponseDto> {
    assertStaffRole(query);

    const branchIds = resolveReportBranchScope({
      requested: query.branchIds,
      actor,
    });

    const params: unknown[] = [actor.organizationId, query.from, query.to, branchIds];
    const dateColumn = ESTIMATE_DATE_COLUMN[query.dateBasis];
    const scope = { fromParam: '$2', toParam: '$3', branchesParam: '$4' };

    const sql =
      query.groupBy === MobileRevenueEstimateGroupBy.PAYMENT
        ? estimatePaymentSql(invoiceScopeWhereSql({ ...scope, dateColumn }))
        : `WITH ${revenueLinesSql({ ...scope, dateColumn })}${estimateBucketSql({
            groupBy: query.groupBy,
            dateColumn,
            staffRole: query.staffRole,
          })}`;

    const rows = await this.dataSource.query<BucketRow[]>(sql, params);

    // Câu `payment` trả đủ nguồn kể cả khi một nguồn không có gì (`UNION ALL`
    // của các câu gộp không GROUP BY luôn ra một dòng 0) — lọc ở đây để giữ
    // hợp đồng "chỉ bucket có phát sinh" như bốn chế độ kia. Sắp cũng ở đây
    // vì `UNION ALL` không có ORDER BY chung; chế độ `time` giữ thứ tự SQL.
    let items: MobileRevenueEstimateBucketDto[] = rows
      .filter((r) => Number(r.orderCount ?? 0) > 0)
      .map((r) => ({
        key: r.key,
        label: r.label ?? null,
        orderCount: Number(r.orderCount ?? 0),
        revenue: round2(Number(r.revenue ?? 0)),
      }));

    if (query.groupBy === MobileRevenueEstimateGroupBy.PAYMENT) {
      items = items.sort(
        (a, b) => b.revenue - a.revenue || a.key.localeCompare(b.key),
      );
    }

    return {
      totals: {
        orderCount: items.reduce((s, b) => s + b.orderCount, 0),
        revenue: round2(items.reduce((s, b) => s + b.revenue, 0)),
      },
      items,
    };
  }
}

/**
 * `staffRole` đi ĐÔI với `groupBy = staff`, cả hai chiều. Chiều "thừa" cũng
 * 400 chứ không lặng lẽ bỏ: một khoá bị bỏ qua là một bộ lọc app tưởng đã
 * gửi — cùng tinh thần `forbidNonWhitelisted`.
 */
function assertStaffRole(query: RevenueEstimateQuery): void {
  const isStaff = query.groupBy === MobileRevenueEstimateGroupBy.STAFF;
  if (isStaff && query.staffRole === undefined) {
    throw new BadRequestException('Xem theo nhân viên phải có staffRole.');
  }
  if (!isStaff && query.staffRole !== undefined) {
    throw new BadRequestException('staffRole chỉ đi cùng groupBy=staff.');
  }
}
