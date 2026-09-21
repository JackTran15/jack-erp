import { ItemDirection } from '../../pos/entities/invoice-item.entity';
import { InvoiceStatus } from '../../pos/entities/invoice.entity';
import { MobileRevenueTimeUnit } from '../dto/mobile-revenue-report.query.dto';

/**
 * Mảnh SQL dùng chung của sáu endpoint `/mobile/reports/revenue/*`.
 *
 * Tách ra như `mobile-inventory-ledger.sql.ts` vì cùng một lý do: sáu câu phải
 * nhìn CÙNG một tập dòng hoá đơn. Tổng chi nhánh của một mặt hàng phải bằng
 * dòng mặt hàng vừa chạm, tổng chuỗi thời gian phải bằng tổng trang 1 — và
 * cách duy nhất giữ được điều đó mà không cần ai nhớ là để FROM/JOIN/WHERE và
 * công thức dấu sống ở đúng một chỗ.
 *
 * Mọi hàm ở đây nhận TÊN THAM SỐ (`$2`…) chứ không nhận giá trị: người gọi
 * đánh số động, `$1` luôn là organizationId.
 */

/**
 * CTE `lines` — mỗi dòng hoá đơn trong phạm vi, đã mang dấu và đủ mọi trục
 * gộp (mặt hàng, item, nhóm hàng, chi nhánh, thời điểm).
 *
 * **Công thức và điều kiện chép ĐÚNG web "Doanh thu theo mặt hàng"**
 * (`RevenueByItemReport` + `aggregateByItem`), để cùng kỳ cùng cửa hàng hai
 * bên ra cùng số:
 *
 * - Lọc theo `issued_at` (ngày ghi sổ; nháp tự rơi vì NULL), bao trọn ngày `to`.
 *   "Doanh thu ước tính" đổi cột sang `created_at` qua `dateColumn` — khi đó
 *   nháp KHÔNG tự rơi, nên `invoiceScopeWhereSql` loại tường minh bằng
 *   `is_draft = false` (no-op ở cột mặc định).
 * - **Loại hoá đơn HUỶ** — web `applyInvoiceStatusFilter` mặc định
 *   `status != 'cancelled'` khi không chọn trạng thái. KHÁC
 *   `MobileBusinessReportService` (báo cáo lợi nhuận, web KHÔNG loại huỷ):
 *   hai màn khớp hai báo cáo web khác nhau, đừng "đồng bộ" một bên.
 * - Dấu theo `direction` của DÒNG: `OUT` cộng, `IN` (chân trả hàng) trừ.
 *   KHÔNG nhân thêm dấu theo loại hoá đơn — RETURN toàn dòng IN, nhân hai
 *   lần là đảo ngược về dương.
 * - `amount = sign × (line_total − promotion_discount)`: `line_total` đã trừ
 *   giảm giá gõ tay nhưng CHƯA trừ khuyến mãi engine phân bổ (nó trừ ở cấp
 *   hoá đơn), nên trừ ở đây. Đây đúng là cột "Doanh thu" web đang hiện; web
 *   KHÔNG trừ điểm KM phân bổ vào cột đó, nên ở đây cũng không — nếu web đổi
 *   thì đổi cả hai.
 *
 * `invoice_id` có mặt để Tổng quan đếm `COUNT(DISTINCT invoice_id)` trên ĐÚNG
 * tập dòng này — số hoá đơn và doanh thu của màn đó phải cùng một tập, và
 * đếm trên bảng `invoices` bằng một WHERE chép lại là hai chỗ sẽ phân kỳ.
 * `invoice_status` và `customer_id` cũng vì lý do đó: màn chi tiết cửa hàng
 * tách doanh thu theo HĐ đã/chưa thanh toán và cộng tiền của khách mới trên
 * cùng tập dòng, để tổng của nó bằng đúng dòng chi nhánh ở Tổng quan.
 * `created_at`, `created_by`, `staff_id`, `salesperson_id` là các trục gộp
 * của "Doanh thu ước tính" (theo ngày tạo, theo nhân viên ba vai) — cùng
 * lập luận: gộp theo nhân viên trên đúng tập dòng mà chế độ theo ngày cộng.
 *
 * Grain MẶT HÀNG là mẫu mã (web `statBy=parent`): `subject_id =
 * COALESCE(items.product_id, item_id)`. `LEFT JOIN items` chứ không INNER:
 * item đã bị xoá khỏi catalogue vẫn có dòng hoá đơn, và web vẫn tính nó (rơi
 * về grain item với mã/tên snapshot trên dòng). Không lọc `is_active` — hàng
 * đã ngừng bán vẫn có doanh thu trong kỳ.
 *
 * `cost` = giá vốn của dòng (`quantity × cost_price`, cùng dấu `direction`) —
 * chỉ "Lợi nhuận hàng hoá" của Tổng quan web đọc; các màn mobile bỏ qua cột này.
 */
export function revenueLinesSql(params: {
  fromParam: string;
  toParam: string;
  /** Tham số mảng chi nhánh PHÂN CÔNG — luôn có (mobile không có vế hợp nhất). */
  branchesParam: string;
  /** Lọc đúng MỘT mặt hàng theo id hỗn hợp (mẫu mã hoặc item lẻ). */
  subjectParam?: string;
  /** Lọc đúng MỘT nhóm hàng. */
  categoryParam?: string;
  /**
   * Cột ngày để lọc kỳ. Mặc định `issued_at` (ngày ghi sổ) — ba service
   * revenue/overview/store-detail KHÔNG truyền nên câu SQL của chúng không
   * đổi. `created_at` chỉ có "Doanh thu ước tính" dùng ("thống kê theo ngày
   * tạo đơn"); xem `invoiceScopeWhereSql` về vì sao nháp phải loại tường minh
   * ở nhánh đó.
   */
  dateColumn?: InvoiceDateColumn;
}): string {
  const { fromParam, toParam, branchesParam, subjectParam, categoryParam } = params;

  const scope = invoiceScopeWhereSql({
    fromParam,
    toParam,
    branchesParam,
    dateColumn: params.dateColumn ?? 'issued_at',
  });
  const subjectClause = subjectParam
    ? `
      AND COALESCE(it.product_id, li.item_id) = ${subjectParam}::uuid`
    : '';
  const categoryClause = categoryParam
    ? `
      AND it.category_id = ${categoryParam}::uuid`
    : '';

  return `lines AS (
    SELECT
      COALESCE(it.product_id, li.item_id)      AS subject_id,
      COALESCE(p.code, li.item_code)           AS subject_code,
      COALESCE(p.name, p.code, li.item_name)   AS subject_name,
      li.item_id,
      li.item_code,
      li.item_name,
      li.unit,
      it.category_id,
      c.name                                   AS category_name,
      i.branch_id,
      i.issued_at,
      i.created_at,
      li.invoice_id,
      i.status                                 AS invoice_status,
      i.customer_id,
      i.created_by,
      i.staff_id,
      i.salesperson_id,
      (CASE WHEN li.direction = '${ItemDirection.OUT}' THEN 1 ELSE -1 END)
        * li.quantity                                          AS qty,
      (CASE WHEN li.direction = '${ItemDirection.OUT}' THEN 1 ELSE -1 END)
        * (li.line_total - li.promotion_discount)              AS amount,
      (CASE WHEN li.direction = '${ItemDirection.OUT}' THEN 1 ELSE -1 END)
        * li.quantity * li.cost_price                          AS cost
    FROM invoice_items li
    JOIN invoices i ON i.id = li.invoice_id
    LEFT JOIN items it ON it.id = li.item_id AND it.organization_id = $1
    LEFT JOIN products p ON p.id = it.product_id AND p.organization_id = $1
    LEFT JOIN inventory_item_categories c ON c.id = it.category_id
    WHERE ${scope}${subjectClause}${categoryClause}
  )`;
}

/** Cột ngày mà một báo cáo doanh thu mobile được phép lọc kỳ theo. */
export type InvoiceDateColumn = 'issued_at' | 'created_at';

/**
 * Mảnh WHERE "hoá đơn trong phạm vi" — tổ chức, loại huỷ, loại nháp, kỳ theo
 * [dateColumn], chi nhánh phân công. Tách khỏi [revenueLinesSql] để câu
 * thanh toán của "Doanh thu ước tính" (gộp ở cấp HOÁ ĐƠN, không qua dòng
 * hàng) nhìn ĐÚNG tập hoá đơn mà các chế độ xem khác của nó nhìn — cùng lý
 * do CTE `lines` tồn tại. Người gọi tự đặt alias `i` cho `invoices`.
 *
 * `is_draft = false` là no-op với `issued_at` (nháp có `issued_at` NULL nên
 * tự rơi) nhưng BẮT BUỘC với `created_at`: nháp có ngày tạo, và một hoá đơn
 * nháp không phải một đơn hàng. Đặt ở đây chứ không ở nhánh `created_at`
 * riêng để điều kiện là MỘT dù lọc theo cột nào.
 */
export function invoiceScopeWhereSql(params: {
  fromParam: string;
  toParam: string;
  branchesParam: string;
  dateColumn: InvoiceDateColumn;
}): string {
  const { fromParam, toParam, branchesParam, dateColumn } = params;

  // `branch_id` là VARCHAR ở `invoices` → `::text[]`, không `::uuid[]`.
  return `i.organization_id = $1
      AND i.status <> '${InvoiceStatus.CANCELLED}'
      AND i.is_draft = false
      AND i.${dateColumn} >= ${fromParam}::date
      AND i.${dateColumn} < (${toParam}::date + INTERVAL '1 day')
      AND i.branch_id = ANY(${branchesParam}::text[])`;
}

/**
 * Cột của MỘT dòng mặt hàng gộp từ `lines` — dùng ở `items` và
 * `categories/:id/items`, để hai màn cùng hình dạng dòng.
 *
 * `MAX(...)` cho mã/tên/đơn vị: sau `GROUP BY subject_id` các cột này phải qua
 * hàm gộp, và `MAX` cho kết quả ổn định giữa hai lượt gọi (web lấy của dòng
 * ĐẦU gặp — chỉ khác nhau ở ca hai dòng cùng mẫu mã khác đơn vị, chấp nhận).
 */
export const SUBJECT_ROW_SQL = `
      subject_id::text                  AS id,
      MAX(subject_code)                 AS code,
      MAX(subject_name)                 AS name,
      COALESCE(MAX(unit), '')           AS unit,
      COALESCE(SUM(qty), 0)::float      AS quantity,
      COALESCE(SUM(amount), 0)::float   AS revenue`;

/**
 * Mảnh WHERE của ô TÌM KIẾM trên `lines` — chỉ `GET /mobile/reports/revenue/items`
 * dùng. [param] là placeholder ĐÃ bind sẵn chuỗi `%từ khoá%`.
 *
 * Ba cột khớp ĐÚNG nhánh `parent` của web (`revenue-by-item.report.ts`):
 * `subject_code` ≡ `parentSku ?? itemCode`, `subject_name` ≡ `parentName ?? itemName`,
 * `category_name` ≡ `itemCategory`.
 *
 * `item_code`/`item_name` (mã/tên BIẾN THỂ) cố ý VẮNG: grain của đường này là
 * mẫu mã, và web loại hai cột đó ở đúng grain này vì một từ khoá ngắn khớp một
 * biến thể sẽ kéo nguyên mẫu mã lên. Đừng "thêm cho đủ".
 *
 * MỘT placeholder dùng lại ba lần — nhờ vậy câu dữ liệu và câu tổng chia nhau
 * đúng một tham số, và mảng tham số của hai câu không lệch nhau.
 */
export function searchMatchSql(param: string): string {
  return `subject_code ILIKE ${param}
         OR subject_name ILIKE ${param}
         OR category_name ILIKE ${param}`;
}

export const SUBJECT_GROUP_BY_SQL = 'GROUP BY subject_id';

/** Doanh thu giảm dần, hoà thì theo mã rồi id — thứ tự cố định, app không chọn. */
export const SUBJECT_ORDER_BY_SQL = 'ORDER BY revenue DESC, code ASC, id ASC';

/**
 * Biểu thức KHOÁ mốc theo mức, tính trên `issued_at` (timestamptz) theo múi
 * session Postgres — đã là Asia/Ho_Chi_Minh (`db-connection-timezone.e2e-spec.ts`),
 * nên giờ/ngày/tuần chia theo lịch của người dùng.
 *
 * Định dạng khoá phải KHỚP `bucketKeysOf` (`mobile-revenue-timeline.util.ts`):
 * `hour` → `'0'..'23'`, `weekday` → `'1'..'7'` (ISODOW, 1 = thứ Hai), còn lại →
 * `yyyy-MM-ddTHH:mm:ss` của đầu mốc. `date_trunc('week')` của Postgres bắt
 * đầu thứ Hai, khớp tuần ISO mà app dùng để đánh số.
 */
export const TIME_BUCKET_SQL: Record<MobileRevenueTimeUnit, string> = {
  [MobileRevenueTimeUnit.HOUR]: `EXTRACT(HOUR FROM issued_at)::int::text`,
  [MobileRevenueTimeUnit.WEEKDAY]: `EXTRACT(ISODOW FROM issued_at)::int::text`,
  [MobileRevenueTimeUnit.DAY]: `to_char(date_trunc('day', issued_at), 'YYYY-MM-DD"T"HH24:MI:SS')`,
  [MobileRevenueTimeUnit.WEEK]: `to_char(date_trunc('week', issued_at), 'YYYY-MM-DD"T"HH24:MI:SS')`,
  [MobileRevenueTimeUnit.MONTH]: `to_char(date_trunc('month', issued_at), 'YYYY-MM-DD"T"HH24:MI:SS')`,
  [MobileRevenueTimeUnit.YEAR]: `to_char(date_trunc('year', issued_at), 'YYYY-MM-DD"T"HH24:MI:SS')`,
};
