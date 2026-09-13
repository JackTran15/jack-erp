import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { BranchStatus } from '@erp/shared-interfaces';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  MobileOverviewBranchDto,
  MobileOverviewReportResponseDto,
} from '../dto/mobile-overview-report.response.dto';
import { resolveReportBranchScope } from './mobile-report-scope.util';
import { revenueLinesSql } from './mobile-revenue-report.sql';

/** Kỳ chính + chi nhánh + kỳ so sánh tuỳ chọn — đúng hình dạng query. */
interface OverviewQuery {
  from: string;
  to: string;
  branchIds?: string[];
  compareFrom?: string;
  compareTo?: string;
}

interface DateRange {
  from: string;
  to: string;
}

/** Một chi nhánh trong KHUNG: mọi chi nhánh ACTIVE của phạm vi, kể cả không phát sinh. */
interface FrameRow {
  id: string;
  name: string;
}

/** Một chi nhánh CÓ phát sinh trong một kỳ. */
interface AggregateRow extends FrameRow {
  invoiceCount: number;
  revenue: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Màn "Tổng quan" của app mobile: doanh thu + số hoá đơn của toàn phạm vi
 * trong kỳ, so với một kỳ khác, tách theo chi nhánh.
 *
 * Công thức doanh thu CHÉP ĐÚNG màn "Doanh thu theo mặt hàng" bằng cách dùng
 * chung CTE `revenueLinesSql` (loại hoá đơn huỷ, dấu theo `direction`, trừ
 * khuyến mãi engine): cùng kỳ cùng chi nhánh thì thẻ tổng ở đây và
 * `totalRevenue` của `/revenue/items` phải ra cùng số. Đây là quyết định
 * nghiệp vụ, KHÁC báo cáo kinh doanh (web không loại huỷ) — đừng "đồng bộ".
 *
 * Số hoá đơn là `COUNT(DISTINCT invoice_id)` trên chính CTE đó — mọi hoá đơn
 * đã ghi sổ trừ huỷ, tính cả phiếu trả/đổi (chúng cũng là hoá đơn). Đếm trên
 * cùng tập dòng để hai con số của thẻ không bao giờ nói về hai tập khác nhau.
 * Cái giá đã chấp nhận: hoá đơn ghi sổ mà không có dòng hàng nào thì không
 * được đếm — ca không xảy ra ở POS.
 *
 * Kỳ so sánh: chạy LẠI cùng câu gộp với hai mốc app gửi (`Promise.all`), mỗi
 * lượt một mảng tham số riêng — khuôn `MobileBusinessReportService`.
 *
 * Phạm vi chi nhánh = tập PHÂN CÔNG (`resolveReportBranchScope`, không có vế
 * hợp nhất trên mobile — lý do ở doc của util), cùng luật revenue-report vì
 * cùng số liệu, và cùng tập mà bộ lọc của app bày ra (`/mobile/branches`).
 */
@Injectable()
export class MobileOverviewReportService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getReport(
    query: OverviewQuery,
    actor: ActorContext,
  ): Promise<MobileOverviewReportResponseDto> {
    const compareRange = compareRangeOf(query);

    const branchIds = resolveReportBranchScope({
      requested: query.branchIds,
      actor,
    });

    const org = actor.organizationId;
    const [frame, current, compare] = await Promise.all([
      this.queryFrame(org, branchIds),
      this.queryAggregates(org, branchIds, { from: query.from, to: query.to }),
      compareRange
        ? this.queryAggregates(org, branchIds, compareRange)
        : Promise.resolve<AggregateRow[]>([]),
    ]);

    // Khung trước, phát sinh sau: chi nhánh ACTIVE không bán gì vẫn có mặt
    // với số 0; chi nhánh đã ngừng/xoá mà CÓ phát sinh thì nối thêm — để
    // `totals` = Σ `branches` = Σ mọi dòng trong phạm vi.
    const byId = new Map<string, MobileOverviewBranchDto>();
    const rowOf = (id: string, name: string): MobileOverviewBranchDto => {
      let row = byId.get(id);
      if (!row) {
        row = { id, name, revenue: 0, invoiceCount: 0, compareRevenue: 0 };
        byId.set(id, row);
      }
      return row;
    };

    for (const b of frame) rowOf(b.id, b.name);
    for (const r of current) {
      const row = rowOf(r.id, r.name);
      row.revenue = round2(Number(r.revenue ?? 0));
      row.invoiceCount = Number(r.invoiceCount ?? 0);
    }
    for (const r of compare) {
      rowOf(r.id, r.name).compareRevenue = round2(Number(r.revenue ?? 0));
    }

    const branches = [...byId.values()].sort(
      (a, b) =>
        b.revenue - a.revenue ||
        a.name.localeCompare(b.name, 'vi') ||
        a.id.localeCompare(b.id),
    );

    return {
      totals: {
        revenue: round2(branches.reduce((s, b) => s + b.revenue, 0)),
        invoiceCount: branches.reduce((s, b) => s + b.invoiceCount, 0),
        compareRevenue: round2(branches.reduce((s, b) => s + b.compareRevenue, 0)),
      },
      branches,
    };
  }

  /**
   * Mọi chi nhánh ACTIVE trong phạm vi, theo thứ tự tạo. `branches.id` là
   * uuid → `::uuid[]`, khác `invoices.branch_id` (varchar).
   */
  private queryFrame(
    organizationId: string,
    branchIds: string[],
  ): Promise<FrameRow[]> {
    return this.dataSource.query<FrameRow[]>(
      `SELECT id::text AS id, name
       FROM branches
       WHERE organization_id = $1 AND status = $2 AND id = ANY($3::uuid[])
       ORDER BY created_at ASC`,
      [organizationId, BranchStatus.ACTIVE, branchIds],
    );
  }

  /** Doanh thu + số hoá đơn gộp theo chi nhánh trong MỘT khoảng, chỉ chi nhánh có phát sinh. */
  private queryAggregates(
    organizationId: string,
    branchIds: string[],
    range: DateRange,
  ): Promise<AggregateRow[]> {
    const params: unknown[] = [organizationId, range.from, range.to, branchIds];
    const lines = revenueLinesSql({
      fromParam: '$2',
      toParam: '$3',
      branchesParam: '$4',
    });

    // Tên tra ngay ở đây (không chỉ ở khung): chi nhánh đã ngừng hoạt động
    // vẫn còn dòng trong `branches`, nên có tên thật; chỉ chi nhánh đã XOÁ
    // mới rơi về id — khuôn `listBranchesOfItem` của revenue-report.
    const sql = `
      WITH ${lines}
      SELECT
        l.branch_id                          AS id,
        COALESCE(b.name, l.branch_id)        AS name,
        COUNT(DISTINCT l.invoice_id)::int    AS "invoiceCount",
        COALESCE(SUM(l.amount), 0)::float    AS revenue
      FROM lines l
      LEFT JOIN branches b ON b.id::text = l.branch_id
      GROUP BY l.branch_id, b.name
    `;

    return this.dataSource.query<AggregateRow[]>(sql, params);
  }
}

/**
 * Kỳ so sánh từ query: cả hai vế → khoảng; không vế nào → `null`; một vế →
 * 400. Câu tiếng Việt, cùng luật mọi đường mobile.
 */
function compareRangeOf(query: OverviewQuery): DateRange | null {
  const { compareFrom, compareTo } = query;
  if (compareFrom === undefined && compareTo === undefined) return null;
  if (compareFrom === undefined || compareTo === undefined) {
    throw new BadRequestException('Kỳ so sánh phải có đủ compareFrom và compareTo.');
  }
  return { from: compareFrom, to: compareTo };
}
