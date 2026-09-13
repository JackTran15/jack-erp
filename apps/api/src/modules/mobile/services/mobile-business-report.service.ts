import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  CashPaymentReferenceType,
  CashReceiptReferenceType,
  CashVoucherCategoryDirection,
  CashVoucherStatus,
} from '../../accounting/cash-vouchers/enums';
import {
  BankPaymentReferenceType,
  BankReceiptReferenceType,
  BankVoucherStatus,
} from '../../accounting/deposit-vouchers/enums';
import { BranchService } from '../../branch/branch.service';
import { ItemDirection } from '../../pos/entities/invoice-item.entity';
import { InvoiceType } from '../../pos/entities/invoice.entity';
import {
  MobileBranchPerformanceDto,
  MobileBusinessMonthDto,
  MobileBusinessReportResponseDto,
} from '../dto/mobile-business-report.response.dto';

/**
 * Số tháng vẽ trên biểu đồ của mỗi thẻ chi nhánh — cửa sổ kết thúc ở tháng
 * của `to`. Là hằng của SERVER, không phải tham số query: app không được chọn,
 * để mọi bản app cùng vẽ một cửa sổ và đổi số này chỉ sửa đúng một chỗ.
 */
export const BUSINESS_CHART_MONTHS = 7;

/** Một chi nhánh trong phạm vi báo cáo — ba cột app cần, không hơn. */
interface BranchRow {
  id: string;
  name: string;
  address: string;
}

/**
 * Một ô `(chi nhánh, tháng)` sau khi gộp — `revenue`/`cost` là tổng phát sinh
 * của tháng đó, đã có dấu (trả hàng, KM đã trừ; hoàn giá vốn đã trừ).
 */
interface CellRow {
  branchId: string | null;
  year: number;
  month: number;
  revenue: number;
  cost: number;
}

/** Khoảng ngày trần `[from, to]`, hai đầu bao gồm, định dạng `yyyy-MM-dd`. */
interface DateRange {
  from: string;
  to: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Báo cáo "Tình hình kinh doanh" cho app mobile: ba chỉ số doanh thu / chi
 * phí / lợi nhuận của từng chi nhánh trong kỳ, cộng diễn biến theo tháng để
 * vẽ biểu đồ.
 *
 * **Công thức KHỚP web "Kết quả kinh doanh"** (`business-results.aggregator.ts`
 * và các câu truy vấn của `BusinessResultsReport`), để cùng kỳ cùng chi nhánh
 * thì hai bên ra cùng số:
 *
 *   revenue = (tiền hàng bán ra − trả lại) − (KM trên bán ra − KM trên trả lại) + thu khác   // mục II
 *   cost    = (giá vốn xuất bán − giá vốn nhập trả) + chi khác                               // mục III
 *   profit  = revenue − cost                                                                 // mục IV
 *
 * Không uỷ quyền cho `BusinessResultsReport` được: sáu câu truy vấn của nó là
 * private và gộp về MỘT số cho cả phạm vi; màn này cần nhóm theo chi nhánh ×
 * tháng. Nên chép ĐÚNG điều kiện của từng câu (trạng thái, `reference_type`
 * loại trừ, cờ `affect_*`, chiều danh mục) vào một câu `UNION ALL` ở
 * [cellsSql] — sửa điều kiện ở bên kia thì phải sửa cả ở đây.
 *
 * Hai điểm đi theo web có chủ ý, KHÔNG "sửa cho hợp lý" một mình phía này:
 * - Hoá đơn HUỶ vẫn được tính: web chỉ lọc theo `issued_at` (nháp tự rơi vì
 *   `issued_at` NULL). Loại hoá đơn huỷ là quyết định nghiệp vụ phải đổi ở cả
 *   hai nơi cùng lúc.
 * - Phạm vi chi nhánh = đúng tập PHÂN CÔNG (`listMyBranches`), KHÔNG có vế
 *   hợp nhất — mobile cố ý không chép `resolveReportBranchIds` ở điểm này
 *   (lý do ở doc `resolveReportBranchScope`): mọi màn của app cùng nhìn một
 *   danh sách cửa hàng. Không phân công là 403 — KHÔNG lặng lẽ trả rỗng, vì
 *   rỗng ở đây đọc ra là "toàn chuỗi không bán được gì".
 *
 * Cùng một câu SQL chạy HAI lượt với hai khoảng ngày: kỳ `[from, to]` cho
 * tổng của kỳ (cộng mọi ô theo chi nhánh — đúng cả khi kỳ cắt giữa tháng, vì
 * bộ lọc ngày đã cắt trước khi gộp), và cửa sổ [BUSINESS_CHART_MONTHS] tháng
 * kết thúc ở tháng của `to` cho biểu đồ. Không gộp làm một lượt: kỳ tuỳ chọn
 * cắt giữa tháng thì ô tháng của cửa sổ và tổng kỳ không cùng tập dòng.
 *
 * `@InjectDataSource` vì câu lệnh đụng tám bảng — cùng tiền lệ
 * `MobileInventoryService`. Session Postgres đã ở múi Asia/Ho_Chi_Minh
 * (`db-connection-timezone.e2e-spec.ts`) nên `date_trunc('month', …)` chia
 * tháng theo lịch của người dùng.
 */
@Injectable()
export class MobileBusinessReportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly branches: BranchService,
  ) {}

  async getReport(
    range: DateRange,
    actor: ActorContext,
  ): Promise<MobileBusinessReportResponseDto> {
    const scope = await this.resolveScope(actor);
    const branchIds = scope.map((b) => b.id);

    const [periodCells, chartCells] = await Promise.all([
      this.queryCells(actor.organizationId, branchIds, range),
      this.queryCells(actor.organizationId, branchIds, chartWindowOf(range.to)),
    ]);

    const months = chartMonthsOf(range.to);
    const branches = scope.map((branch) =>
      toBranchPerformance(branch, periodCells, chartCells, months),
    );
    // Doanh thu giảm dần, cùng doanh thu thì theo tên — thứ tự thẻ trên màn.
    branches.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, 'vi'));

    const revenue = round2(branches.reduce((sum, b) => sum + b.revenue, 0));
    const cost = round2(branches.reduce((sum, b) => sum + b.cost, 0));

    return {
      totals: { revenue, cost, profit: round2(revenue - cost) },
      branches,
    };
  }

  /**
   * Chi nhánh người dùng được xem, kèm tên và địa chỉ để dựng thẻ.
   *
   * `BranchService.listMyBranches`: giao của phân công với chi nhánh ACTIVE,
   * đúng nguồn `MobileBranchService` dùng — mọi màn của app phải nhìn cùng một
   * danh sách cửa hàng.
   */
  private async resolveScope(actor: ActorContext): Promise<BranchRow[]> {
    const mine = await this.branches.listMyBranches(actor);
    if (!mine.length) {
      throw new ForbiddenException('No branch access assigned');
    }

    return mine.map((b) => ({ id: b.id, name: b.name, address: b.address ?? '' }));
  }

  /**
   * Gộp phát sinh theo `(chi nhánh, tháng)` trong `[from, to]`.
   *
   * Số tiền `::float`: `numeric` qua driver `pg` về CHUỖI.
   */
  private async queryCells(
    organizationId: string,
    branchIds: string[],
    range: DateRange,
  ): Promise<CellRow[]> {
    const params: unknown[] = [organizationId, range.from, range.to, branchIds];

    // `branch_id` là VARCHAR ở mọi bảng đụng tới → `::text[]`, không `::uuid[]`.
    const branchClause = (alias: string): string =>
      `AND ${alias}.branch_id = ANY($4::text[])`;

    return this.dataSource.query<CellRow[]>(cellsSql(branchClause), params);
  }
}

/**
 * Câu `UNION ALL` sáu nguồn — mỗi nguồn ra `(branch_id, bucket, revenue, cost)`
 * với `bucket` là đầu tháng của mốc thời gian, rồi gộp theo chi nhánh × tháng.
 *
 * `$1` = organization_id, `$2` = from, `$3` = to (ngày trần; so `< to + 1 day`
 * để bao trọn ngày cuối, cùng cách `MobileInvoiceService`). Mệnh đề chi
 * nhánh do [branchClause] chèn theo alias của từng nguồn.
 *
 * Giá trị enum nội suy từ chính enum TypeScript chứ không bind: cột là kiểu
 * enum Postgres, so với `$n::text` là lỗi kiểu, còn literal thì Postgres tự ép.
 * Chúng là hằng của code, không phải dữ liệu người dùng.
 *
 * Từng nguồn chép điều kiện của câu tương ứng trong `BusinessResultsReport`:
 * 1. Dòng hàng — tiền hàng (qty × giá bán − KM dòng) và giá vốn (qty × giá
 *    vốn), chiều OUT cộng, IN trừ. Tương đương `goodsSoldOut − goodsReturnedIn
 *    − (lineDiscountOut − lineDiscountIn)` và `cogsOut − cogsReturnedIn`.
 * 2. KM đầu phiếu (`discount_amount + points_discount_amount`): SALE/EXCHANGE
 *    trừ khỏi doanh thu, RETURN cộng lại — EXCHANGE xếp cùng SALE theo quyết
 *    định TKT-PRF-04 đã ghi ở `queryHeaderPromo`.
 * 3. Phiếu thu tiền mặt POSTED, danh mục chiều IN hoặc không danh mục, loại
 *    `reference_type` đã được ghi nhận ở chỗ khác của P&L.
 * 4. Phiếu thu tiền gửi POSTED có `affect_revenue`, loại REVERSAL.
 * 5. Phiếu chi tiền mặt POSTED, danh mục chiều OUT hoặc không danh mục, loại
 *    `reference_type` là tài sản/công nợ chứ không phải chi phí.
 * 6. Phiếu chi tiền gửi POSTED có `affect_expense`, loại REVERSAL.
 */
function cellsSql(branchClause: (alias: string) => string): string {
  const invoiceWhere = `
      i.organization_id = $1
      AND i.issued_at >= $2::date
      AND i.issued_at < ($3::date + INTERVAL '1 day')
      ${branchClause('i')}`;
  const voucherWhere = (alias: string, status: string): string => `
      ${alias}.organization_id = $1
      AND ${alias}.status = '${status}'
      AND ${alias}.posted_at >= $2::date
      AND ${alias}.posted_at < ($3::date + INTERVAL '1 day')
      ${branchClause(alias)}`;
  const notIn = (values: string[]): string => values.map((v) => `'${v}'`).join(', ');

  const excludedReceiptRefs = notIn([
    CashReceiptReferenceType.INVOICE,
    CashReceiptReferenceType.INVOICE_DEBT,
    CashReceiptReferenceType.RECEIVABLE,
    CashReceiptReferenceType.REVERSAL,
  ]);
  const excludedPaymentRefs = notIn([
    CashPaymentReferenceType.REFUND,
    CashPaymentReferenceType.GOODS_RECEIPT,
    CashPaymentReferenceType.INVOICE_DEBT,
    CashPaymentReferenceType.REVERSAL,
  ]);

  return `
    SELECT
      cells.branch_id AS "branchId",
      EXTRACT(YEAR FROM cells.bucket)::int AS year,
      EXTRACT(MONTH FROM cells.bucket)::int AS month,
      COALESCE(SUM(cells.revenue), 0)::float AS revenue,
      COALESCE(SUM(cells.cost), 0)::float AS cost
    FROM (
      -- 1. dòng hàng: tiền hàng đã trừ KM dòng, và giá vốn — OUT cộng, IN trừ
      SELECT
        i.branch_id,
        date_trunc('month', i.issued_at) AS bucket,
        (CASE WHEN li.direction = '${ItemDirection.OUT}' THEN 1 ELSE -1 END)
          * (li.quantity * li.unit_price - li.line_discount) AS revenue,
        (CASE WHEN li.direction = '${ItemDirection.OUT}' THEN 1 ELSE -1 END)
          * (li.quantity * li.cost_price) AS cost
      FROM invoice_items li
      JOIN invoices i ON i.id = li.invoice_id
      WHERE ${invoiceWhere}

      UNION ALL

      -- 2. KM đầu phiếu: SALE/EXCHANGE trừ, RETURN cộng lại
      SELECT
        i.branch_id,
        date_trunc('month', i.issued_at) AS bucket,
        (CASE WHEN i.type = '${InvoiceType.RETURN}' THEN 1 ELSE -1 END)
          * (i.discount_amount + i.points_discount_amount) AS revenue,
        0 AS cost
      FROM invoices i
      WHERE ${invoiceWhere}

      UNION ALL

      -- 3. thu khác — phiếu thu tiền mặt
      SELECT r.branch_id, date_trunc('month', r.posted_at) AS bucket, l.amount AS revenue, 0 AS cost
      FROM cash_receipt_lines l
      JOIN cash_receipts r ON r.id = l.cash_receipt_id
      LEFT JOIN cash_voucher_categories c ON c.id = l.category_id
      WHERE ${voucherWhere('r', CashVoucherStatus.POSTED)}
        AND (l.category_id IS NULL OR c.direction = '${CashVoucherCategoryDirection.IN}')
        AND (r.reference_type IS NULL OR r.reference_type NOT IN (${excludedReceiptRefs}))

      UNION ALL

      -- 4. thu khác — phiếu thu tiền gửi
      SELECT r.branch_id, date_trunc('month', r.posted_at) AS bucket, l.amount AS revenue, 0 AS cost
      FROM bank_receipt_lines l
      JOIN bank_receipts r ON r.id = l.bank_receipt_id
      LEFT JOIN cash_voucher_categories c ON c.id = l.category_id
      WHERE ${voucherWhere('r', BankVoucherStatus.POSTED)}
        AND r.affect_revenue = true
        AND (l.category_id IS NULL OR c.direction = '${CashVoucherCategoryDirection.IN}')
        AND (r.reference_type IS NULL OR r.reference_type <> '${BankReceiptReferenceType.REVERSAL}')

      UNION ALL

      -- 5. chi khác — phiếu chi tiền mặt
      SELECT p.branch_id, date_trunc('month', p.posted_at) AS bucket, 0 AS revenue, l.amount AS cost
      FROM cash_payment_lines l
      JOIN cash_payments p ON p.id = l.cash_payment_id
      LEFT JOIN cash_voucher_categories c ON c.id = l.category_id
      WHERE ${voucherWhere('p', CashVoucherStatus.POSTED)}
        AND (l.category_id IS NULL OR c.direction = '${CashVoucherCategoryDirection.OUT}')
        AND (p.reference_type IS NULL OR p.reference_type NOT IN (${excludedPaymentRefs}))

      UNION ALL

      -- 6. chi khác — phiếu chi tiền gửi
      SELECT p.branch_id, date_trunc('month', p.posted_at) AS bucket, 0 AS revenue, l.amount AS cost
      FROM bank_payment_lines l
      JOIN bank_payments p ON p.id = l.bank_payment_id
      LEFT JOIN cash_voucher_categories c ON c.id = l.category_id
      WHERE ${voucherWhere('p', BankVoucherStatus.POSTED)}
        AND p.affect_expense = true
        AND (l.category_id IS NULL OR c.direction = '${CashVoucherCategoryDirection.OUT}')
        AND (p.reference_type IS NULL OR p.reference_type <> '${BankPaymentReferenceType.REVERSAL}')
    ) cells
    GROUP BY cells.branch_id, cells.bucket`;
}

/** `{year, month}` của ngày `yyyy-MM-dd` — đọc bằng cắt chuỗi, không qua `Date` để khỏi dính múi giờ. */
function yearMonthOf(isoDate: string): { year: number; month: number } {
  return { year: Number(isoDate.slice(0, 4)), month: Number(isoDate.slice(5, 7)) };
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Cửa sổ biểu đồ: [BUSINESS_CHART_MONTHS] tháng trọn, kết thúc ở tháng của
 * [to]. Ngày cuối lấy bằng "ngày 0 của tháng sau" — không tự đếm 28/30/31.
 * `Date.UTC` để phép cuộn tháng không phụ thuộc múi giờ của tiến trình.
 */
export function chartWindowOf(to: string): DateRange {
  const { year, month } = yearMonthOf(to);
  const first = new Date(Date.UTC(year, month - BUSINESS_CHART_MONTHS, 1));
  const last = new Date(Date.UTC(year, month, 0));

  return {
    from: `${first.getUTCFullYear()}-${pad2(first.getUTCMonth() + 1)}-01`,
    to: `${last.getUTCFullYear()}-${pad2(last.getUTCMonth() + 1)}-${pad2(last.getUTCDate())}`,
  };
}

/** Các mốc `{year, month}` của cửa sổ biểu đồ, tăng dần — trục hoành của app. */
export function chartMonthsOf(to: string): { year: number; month: number }[] {
  const { year, month } = yearMonthOf(to);

  return Array.from({ length: BUSINESS_CHART_MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(year, month - BUSINESS_CHART_MONTHS + i, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  });
}

/**
 * Ghép tổng kỳ và các tháng của MỘT chi nhánh. Tháng vắng trong kết quả truy
 * vấn là tháng không phát sinh → số 0, để `months` luôn đủ và đúng thứ tự.
 */
function toBranchPerformance(
  branch: BranchRow,
  periodCells: CellRow[],
  chartCells: CellRow[],
  months: { year: number; month: number }[],
): MobileBranchPerformanceDto {
  const own = (cells: CellRow[]) => cells.filter((c) => c.branchId === branch.id);

  const revenue = round2(own(periodCells).reduce((sum, c) => sum + c.revenue, 0));
  const cost = round2(own(periodCells).reduce((sum, c) => sum + c.cost, 0));

  const monthRows: MobileBusinessMonthDto[] = months.map(({ year, month }) => {
    const cell = own(chartCells).find((c) => c.year === year && c.month === month);
    const monthRevenue = round2(cell?.revenue ?? 0);
    const monthCost = round2(cell?.cost ?? 0);
    return { year, month, revenue: monthRevenue, cost: monthCost, profit: round2(monthRevenue - monthCost) };
  });

  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
    revenue,
    cost,
    profit: round2(revenue - cost),
    months: monthRows,
  };
}
