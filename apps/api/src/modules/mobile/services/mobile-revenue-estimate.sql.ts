import { InvoicePromotionType } from '../../promotion/invoice-promotion.entity';
import { InvoiceStatus, InvoiceType } from '../../pos/entities/invoice.entity';
import { MobileInvoiceDateBasis } from '../dto/mobile-invoice-list.query.dto';
import {
  MobileRevenueEstimateGroupBy,
  MobileRevenueEstimateStaffRole,
} from '../dto/mobile-revenue-estimate.query.dto';
import { InvoiceDateColumn } from './mobile-revenue-report.sql';

/**
 * Mảnh SQL của `GET /mobile/reports/revenue-estimate`.
 *
 * Bốn chế độ `time`/`status`/`staff`/`channel` là bốn cách GROUP BY trên cùng
 * CTE `lines` của revenue-report (`revenueLinesSql`), nên chúng cộng ra cùng
 * một tổng và tổng đó bằng Tổng quan cùng kỳ (khi `dateBasis = issued`).
 * Chế độ `payment` KHÔNG đi qua dòng hàng — tiền của một phương thức là số
 * ghi ở `invoice_payments`/`invoice_promotions`/cột điểm của hoá đơn — nên
 * có câu riêng, và tổng của nó KHÁC bốn chế độ kia. Nó vẫn nhìn đúng tập hoá
 * đơn nhờ `invoiceScopeWhereSql`.
 *
 * Mọi hàm nhận TÊN THAM SỐ: `$1` org, `$2` from, `$3` to, `$4` mảng chi nhánh.
 */

/** `dateBasis` của query → cột lọc kỳ. Không có `completed_at`; "hoàn thành" là ngày ghi sổ. */
export const ESTIMATE_DATE_COLUMN: Record<MobileInvoiceDateBasis, InvoiceDateColumn> = {
  [MobileInvoiceDateBasis.CREATED]: 'created_at',
  [MobileInvoiceDateBasis.ISSUED]: 'issued_at',
};

/** Bucket cho hoá đơn KHÔNG gán nhân viên ở vai đang xem (`salesperson_id` NULL là ca thường gặp). */
export const UNASSIGNED_KEY = 'unassigned';

/** Bucket duy nhất của `channel` — hệ chưa có cột kênh bán, mọi hoá đơn đều từ POS. */
export const IN_STORE_KEY = 'in_store';

/**
 * Khoá của sáu bucket ở chế độ `payment`. Ba cái giữa là giá trị của
 * `invoice_payments.payment_method` (enum Postgres, nên `::text` khi làm
 * key); ba cái còn lại do câu SQL tự đặt.
 */
export const PAYMENT_UNPAID_KEY = 'unpaid';
export const PAYMENT_VOUCHER_KEY = 'voucher';
export const PAYMENT_POINTS_KEY = 'points';

/**
 * Cột nhân viên theo vai + cách tra tên. Ba vai là ba cột KHÁC KIỂU của
 * `invoices`, và đây là chỗ dễ vấp nhất:
 *
 * - `created_by` là VARCHAR (kế thừa `BaseEntity`) → phải `u.id::text = …`;
 *   so uuid với varchar không có operator, lỗi lúc CHẠY chứ tsc không thấy.
 * - `staff_id` là uuid → join thẳng `users`.
 * - `salesperson_id` là uuid của `employee_profiles` → qua `ep.user_id` mới
 *   tới `users`. `key` trả về vẫn là id của PROFILE (thứ hoá đơn giữ), không
 *   phải user id.
 *
 * Tên = `first_name` + ' ' + `last_name` (`users` không có `full_name`), rỗng
 * hoặc user đã xoá thì rơi về chính id — khuôn "tên = id khi mất danh mục"
 * của Tổng quan.
 */
const STAFF_SQL: Record<
  MobileRevenueEstimateStaffRole,
  { keyExpr: string; nullCheck: string; join: string; groupBy: string }
> = {
  [MobileRevenueEstimateStaffRole.CREATOR]: {
    keyExpr: 'l.created_by',
    nullCheck: 'l.created_by IS NULL',
    join: 'LEFT JOIN users u ON u.id::text = l.created_by',
    groupBy: 'l.created_by, u.first_name, u.last_name',
  },
  [MobileRevenueEstimateStaffRole.CASHIER]: {
    keyExpr: 'l.staff_id::text',
    nullCheck: 'l.staff_id IS NULL',
    join: 'LEFT JOIN users u ON u.id = l.staff_id',
    groupBy: 'l.staff_id, u.first_name, u.last_name',
  },
  [MobileRevenueEstimateStaffRole.SALESPERSON]: {
    keyExpr: 'l.salesperson_id::text',
    nullCheck: 'l.salesperson_id IS NULL',
    join: `LEFT JOIN employee_profiles ep ON ep.id = l.salesperson_id
      LEFT JOIN users u ON u.id = ep.user_id`,
    groupBy: 'l.salesperson_id, u.first_name, u.last_name',
  },
};

const BUCKET_MEASURES_SQL = `
      COUNT(DISTINCT l.invoice_id)::int  AS "orderCount",
      COALESCE(SUM(l.amount), 0)::float  AS revenue`;

/**
 * Câu SELECT trên CTE `lines` cho bốn chế độ không phải `payment`. Người gọi
 * ghép `WITH ${revenueLinesSql(...)}` phía trước.
 *
 * `time` gộp theo NGÀY của đúng cột đang lọc kỳ (`dateColumn`): thống kê
 * theo ngày tạo thì xếp vào ngày tạo. `to_char` chạy theo múi session
 * Postgres (Asia/Ho_Chi_Minh — `db-connection-timezone.e2e-spec.ts`), nên
 * `key` là ngày theo lịch người dùng, khớp `TIME_BUCKET_SQL.DAY`.
 */
export function estimateBucketSql(params: {
  groupBy: Exclude<MobileRevenueEstimateGroupBy, MobileRevenueEstimateGroupBy.PAYMENT>;
  dateColumn: InvoiceDateColumn;
  staffRole?: MobileRevenueEstimateStaffRole;
}): string {
  const { groupBy, dateColumn, staffRole } = params;

  switch (groupBy) {
    case MobileRevenueEstimateGroupBy.TIME:
      return `
      SELECT
        to_char(l.${dateColumn}, 'YYYY-MM-DD') AS key,
        NULL::text                             AS label,${BUCKET_MEASURES_SQL}
      FROM lines l
      GROUP BY 1
      ORDER BY key ASC`;

    case MobileRevenueEstimateGroupBy.STATUS:
      return `
      SELECT
        l.invoice_status::text AS key,
        NULL::text             AS label,${BUCKET_MEASURES_SQL}
      FROM lines l
      GROUP BY l.invoice_status
      ORDER BY revenue DESC, key ASC`;

    case MobileRevenueEstimateGroupBy.CHANNEL:
      // Một bucket gom trọn; `HAVING` để "không hoá đơn" ra RỖNG chứ không
      // phải một dòng 0 — cùng hợp đồng "chỉ bucket có phát sinh" của các
      // chế độ kia.
      return `
      SELECT
        '${IN_STORE_KEY}' AS key,
        NULL::text        AS label,${BUCKET_MEASURES_SQL}
      FROM lines l
      HAVING COUNT(*) > 0`;

    case MobileRevenueEstimateGroupBy.STAFF: {
      // Service đã chặn `staffRole` thiếu trước khi tới đây; mặc định chỉ
      // để kiểu không nullable, không phải một chính sách.
      const staff = STAFF_SQL[staffRole ?? MobileRevenueEstimateStaffRole.CREATOR];
      return `
      SELECT
        COALESCE(${staff.keyExpr}, '${UNASSIGNED_KEY}') AS key,
        CASE WHEN ${staff.nullCheck} THEN NULL
             ELSE COALESCE(
               NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
               ${staff.keyExpr}
             )
        END AS label,${BUCKET_MEASURES_SQL}
      FROM lines l
      ${staff.join}
      GROUP BY ${staff.groupBy}
      ORDER BY revenue DESC, label ASC NULLS LAST, key ASC`;
    }
  }
}

/**
 * Chế độ `payment` — gộp ở cấp HOÁ ĐƠN, bốn nguồn `UNION ALL`:
 *
 * - `unpaid`: phần còn nợ `GREATEST(amount_due − total_paid, 0)` của hoá đơn
 *   `debt`/`partial_debt` — đúng cột "Nợ" của web "Bảng kê hoá đơn"
 *   (`invoice-listing.aggregator.ts`, `computed === 'debt'`).
 * - `cash`/`card`/`bank_transfer`: `invoice_payments` theo phương thức, dấu
 *   −1 khi hoá đơn là RETURN — chép `SALES_PAYMENTS_SQL` của chi tiết cửa hàng.
 * - `voucher`: `invoice_promotions.discount_amount` loại voucher — cột
 *   "Voucher" của web.
 * - `points`: `points_discount_amount` của hoá đơn có dùng điểm.
 *
 * Số đơn của mỗi bucket là số hoá đơn CÓ phương thức đó; một hoá đơn trả
 * nửa tiền mặt nửa điểm được đếm ở cả hai. Vì thế Σ `orderCount` của chế độ
 * này không phải số hoá đơn — doc response đã nói.
 *
 * Hoá đơn KHÔNG có dòng hàng (nợ thuần) vẫn vào `unpaid` — khác bốn chế độ
 * kia (đếm trên CTE dòng hàng). Chấp nhận: đây là chế độ hỏi "tiền ở đâu",
 * không hỏi "bán gì".
 *
 * `scopeWhere` là `invoiceScopeWhereSql(...)` với alias `i` — cùng tập hoá
 * đơn với các chế độ kia. Enum Postgres nội suy literal, không bind.
 */
export function estimatePaymentSql(scopeWhere: string): string {
  return `
      WITH inv AS (
        SELECT i.id, i.type, i.status, i.amount_due, i.total_paid, i.points_discount_amount
        FROM invoices i
        WHERE ${scopeWhere}
      )
      SELECT '${PAYMENT_UNPAID_KEY}' AS key,
             COUNT(*)::int AS "orderCount",
             COALESCE(SUM(GREATEST(amount_due - total_paid, 0)), 0)::float AS revenue
      FROM inv
      WHERE status IN ('${InvoiceStatus.DEBT}', '${InvoiceStatus.PARTIAL_DEBT}')
      UNION ALL
      SELECT p.payment_method::text AS key,
             COUNT(DISTINCT p.invoice_id)::int AS "orderCount",
             COALESCE(SUM(p.amount * CASE WHEN inv.type = '${InvoiceType.RETURN}' THEN -1 ELSE 1 END), 0)::float AS revenue
      FROM invoice_payments p
      JOIN inv ON inv.id = p.invoice_id
      GROUP BY p.payment_method
      UNION ALL
      SELECT '${PAYMENT_VOUCHER_KEY}' AS key,
             COUNT(DISTINCT ip.invoice_id)::int AS "orderCount",
             COALESCE(SUM(ip.discount_amount), 0)::float AS revenue
      FROM invoice_promotions ip
      JOIN inv ON inv.id = ip.invoice_id
      WHERE ip.promotion_type = '${InvoicePromotionType.VOUCHER}'
      UNION ALL
      SELECT '${PAYMENT_POINTS_KEY}' AS key,
             COUNT(*)::int AS "orderCount",
             COALESCE(SUM(points_discount_amount), 0)::float AS revenue
      FROM inv
      WHERE points_discount_amount > 0`;
}
