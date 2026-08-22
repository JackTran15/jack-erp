import { Injectable } from '@nestjs/common';
import type { ReportTotals } from '@erp/shared-interfaces';
import { DataSource } from 'typeorm';
import {
  buildReportColumnFilter,
  type ReportColumnFilters,
  type ReportColumnSpecs,
} from './report-column-filter.util';

/**
 * Báo cáo — Hàng hóa xuất kho tạm (temp-warehouse out goods).
 *
 * Mỗi dòng = một **cặp xuất↔trả đã ghép** (data-cleaning), KHÔNG phải per-line.
 * Hệ thống ghép lần xuất (warehouse_to_showroom) với lần trả
 * (showroom_to_warehouse) của **cùng item + cùng người vận chuyển (carrier)**,
 * ghép FIFO theo thời gian (`row_number` theo `created_at`).
 *
 * `temp_warehouse_lines` chuyển sang status TRANSFERRED (+ `transfer_id` tới
 * `stock_transfers`) qua 2 luồng độc lập (xem `TempWarehouseService`):
 *   - POS checkout tiêu thụ dòng xuất đang staged → set CẢ `transfer_id` LẪN
 *     `invoice_id`/`invoice_number` cùng lúc.
 *   - Nút "Xử lý chuyển kho" (tab Xuất đi / Trả lại) → chỉ set `transfer_id`,
 *     `invoice_id` luôn NULL. Vì vậy `invoice_id IS NOT NULL` mới là tín hiệu
 *     "đã bán" đáng tin cậy; `transfer_id IS NOT NULL` (khi đã loại bán hàng)
 *     nghĩa là dòng đó được xử lý chuyển kho thủ công, không phải nhập/trả
 *     bình thường.
 *
 * HAI NGUỒN, hợp ở CTE `movements`:
 *   1. `paired`   — cặp xuất↔trả ghép FIFO từ `temp_warehouse_lines` (mô tả trên).
 *   2. `showroom` — hàng ĐÃ trưng sẵn ở showroom, bán ra. Nghiệp vụ này KHÔNG
 *      sinh dòng `temp_warehouse_lines` nào: POS trừ tồn thẳng từ vị trí showroom
 *      (`resolveBranchItemLocations(..., { showroomOnly: true })`) và
 *      `fulfillInvoiceFromTempWarehouse` thoát sớm khi không có dòng nào staged.
 *      Nên nó chỉ lộ ra như PHẦN DƯ của dòng `invoice_items`, sau khi trừ đi SL
 *      mà kho tạm đã nhận cho cùng (invoice_id, item_id) — CTE `tw_claimed`.
 *      Chỉ tính hóa đơn đã chốt (`is_draft = FALSE`, status khác `cancelled`) và
 *      dòng `direction = 'OUT'`; trả hàng của khách nằm ngoài phạm vi báo cáo này.
 *
 * ⚠ Nguồn showroom chiếm phần LỚN số dòng: trên `erp_dev` kỳ 08/2026 là 64/71
 * dòng, tức 90% nội dung của một báo cáo tên "xuất kho tạm" là hàng chưa từng
 * vào kho tạm. Đây là đánh đổi CÓ CHỦ ĐÍCH của chủ sở hữu để báo cáo phủ đủ cả
 * hai luồng bán và tổng SL bán khớp hóa đơn. Lịch sử quyết định (từng gỡ rồi
 * khôi phục) ở `.ai/features/temp-warehouse-sale-status/03-logical-design.md`.
 *
 * Trạng thái (ưu tiên theo thứ tự, dừng ở nhánh khớp đầu tiên). THỨ TỰ NHÁNH LÀ
 * RÀNG BUỘC ĐÚNG-ĐẮN, không phải phong cách:
 *   - Dòng nguồn showroom               → "Bán hàng trưng bày". PHẢI xét đầu
 *     tiên: dòng này có out_qty = return_qty = 0 nên nhánh cân bằng
 *     (`return_qty = out_qty`) sẽ nuốt nó và gán chuỗi rỗng nếu đặt sau.
 *   - Dòng xuất có invoice_id           → "Bán hàng kho tạm" (hàng lấy từ kho,
 *     scan vào kho tạm rồi mới bán). Chỉ `fulfillInvoiceFromTempWarehouse` ghi
 *     cột đó và nó chỉ tiêu thụ dòng `warehouse_to_showroom`, nên trên nguồn kho
 *     tạm nhánh này KHÔNG BAO GIỜ là hàng trưng bày.
 *   - Dòng xuất có transfer_id (không bán) → "Chuyển kho xuất đi".
 *   - Dòng trả có transfer_id           → "Chuyển kho trả lại" (kiểm tra
 *     trước cả nhánh cân bằng, vì 1 cặp ghép FIFO có thể vẫn "cân bằng" số
 *     lượng dù phía trả đã được xử lý chuyển kho thay vì trả thường).
 *   - Ghép cặp cân bằng (SL trả === SL xuất, không cờ nào ở trên) → rỗng.
 *   - Trả lẻ (không khớp xuất nào)      → "Trả hàng trưng bày".
 *   - Còn lại (xuất chưa trả, chưa bán, chưa chuyển) → "Xuất không bán".
 *
 * Mapping cột → dữ liệu:
 *   - date/time    : thời điểm xuất (COALESCE xuất → trả).
 *   - location     : vị trí kho lưu trữ (non-showroom) HIỆN TẠI của item
 *                    trong chi nhánh của dòng xuất — KHÔNG dùng snapshot
 *                    `warehouse_location_id` lưu trên session (vị trí đó có
 *                    thể đã bị xếp lại / ngừng theo dõi từ lúc xuất tới nay).
 *                    Resolve lại mỗi lần load, cùng logic với
 *                    `ProfitByItemReport.loadItemLocations` /
 *                    `RevenueByItemReport.loadItemLocations`: ưu tiên vị trí
 *                    "mặc định" của item tại kho (`item_storage_locations`),
 *                    fallback về vị trí có tồn kho cao nhất đang
 *                    "Đang theo dõi" (`stock_balances.is_tracked = true`).
 *                    Chỉ xét các location đang hoạt động (`is_active = true`)
 *                    thuộc storage không phải showroom (`is_main_storage =
 *                    false`, `is_active = true`). Không tìm được vị trí nào
 *                    thỏa (mọi vị trí đều ngừng hoạt động / ngừng theo dõi /
 *                    hết hàng) → để trống.
 *   - remainingQty : số đơn vị còn ĐANG TREO ở kho tạm — đã dịch chuyển vật lý
 *                    nhưng chưa hạch toán sổ sách =
 *                    SL xuất − SL trả − SL bán − SL đã chuyển kho.
 *                    Kho tạm KHÔNG có tồn kho riêng (không có location nào đại
 *                    diện cho nó trong stock_balances): chừng nào phiếu chuyển
 *                    kho chưa post thì sổ vẫn ghi hàng ở kho nguồn. Vì vậy dòng
 *                    đã bán HOẶC đã "Xử lý chuyển kho" đều về 0 — hàng đã hạch
 *                    toán xong, hết treo.
 *                    LƯU Ý có thể âm ở dòng "Trả hàng trưng bày" trả lẻ (lần xuất
 *                    tương ứng nằm ngoài kỳ lọc) — đúng về mặt net, để tổng cân bằng.
 *                    Dòng nguồn showroom luôn = 0 (hàng chưa từng vào kho tạm).
 *   - staff        : carrier (`users.first_name + last_name`); với dòng nguồn
 *                    showroom là `invoices.staff_id`.
 *
 * saleQty / invoice: điền từ liên kết hóa đơn của dòng xuất đã bán
 * (TRANSFERRED-by-sale, mang `invoice_id`/`invoice_number`). Dòng xuất chưa bán
 * giữ saleQty=0 / invoice=''.
 *
 * Lọc: `status NOT IN ('DELETED','AUTO_BALANCED')` (loại dòng cân bằng tự động
 * vì không có carrier / không phải sự kiện xuất-trả thực; giữ ACTIVE/TRANSFERRED)
 * + chỉ 2 chiều xuất/trả + `created_at IN [startDate, endDate)`.
 *
 * ⚠ BIÊN KỲ LỆCH THEO MÚI GIỜ TIẾN TRÌNH (defect có sẵn, chưa sửa).
 * `created_at` là `timestamp WITHOUT time zone` giữ giờ UTC, nhưng `$2`/`$3` là
 * `Date` của JS. node-postgres gửi Date kèm offset local (`...+07:00`), Postgres
 * bỏ offset và giữ giờ tường ⇒ biên kỳ dịch đúng bằng offset múi giờ của tiến
 * trình API. Bằng 0 trong container UTC, 7 giờ trên máy dev Asia/Saigon. Đo được:
 *   ($1::timestamp)::text với param 2026-08-01T00:00:00Z  →  2026-08-01 07:00:00
 * Không đụng tới trong tính năng này (vị từ có trước); sửa thì ép rõ kiểu ở cả
 * hai phía và soát các service báo cáo khác dùng cùng khuôn.
 *
 * BẤT ĐỐI XỨNG VỀ `status` HÓA ĐƠN (defect có sẵn, chưa sửa). Nhánh showroom lọc
 * `inv.status <> 'cancelled'`, nhưng nhánh kho tạm không hề join `invoices` —
 * tín hiệu "đã bán" chỉ là `invoice_id IS NOT NULL` trên chính dòng kho tạm, mà
 * `cancel-invoice.service.ts` không đụng `temp_warehouse_lines`. Nên một hóa đơn
 * bị HỦY sau khi đã tiêu thụ kho tạm bị nhánh showroom loại nhưng nhánh kho tạm
 * vẫn tính là "Bán hàng kho tạm". Có test e2e khóa hành vi hiện tại để lần sửa
 * sau là có chủ đích.
 */

export interface TempWarehouseIssueRow {
  sku: string;
  name: string;
  unit: string;
  location: string | null;
  /** dd/MM/yyyy theo giờ Asia/Ho_Chi_Minh */
  date: string;
  /** HH:mm:ss theo giờ Asia/Ho_Chi_Minh */
  time: string;
  staff: string;
  outQty: number;
  returnQty: number;
  /** 1 when the issue was consumed by a sale (line carries an invoiceId), else 0. */
  saleQty: number;
  remainingQty: number;
  status: string;
  /** Consuming invoice number for sale-consumed issues, else ''. */
  invoice: string;
}

export interface TempWarehouseReportQuery {
  organizationId: string;
  startDate: Date;
  endDate: Date;
  branchIds?: string[];
  categoryIds?: string[];
  search?: string;
  page: number;
  pageSize: number;
  /** Lọc theo cột, áp phía server nên tác dụng trên toàn tập. */
  columnFilters?: ReportColumnFilters;
}

export interface TempWarehouseReportResult {
  data: TempWarehouseIssueRow[];
  total: number;
  /**
   * SUM của từng cột số trên **toàn bộ** kết quả lọc, không phải trang hiện
   * tại. Khoá trùng tên field của dòng để lưới ánh xạ thẳng vào footer.
   */
  totals: ReportTotals;
}

/**
 * Cột nào lọc được và ánh xạ sang biểu thức nào ở tầng `enriched`.
 * Khoá = tên field của `TempWarehouseIssueRow` mà lưới render.
 */
const TEMP_WAREHOUSE_COLUMN_SPECS: ReportColumnSpecs = {
  sku: { sql: 'sku', kind: 'text' },
  name: { sql: 'name', kind: 'text' },
  unit: { sql: 'unit', kind: 'text' },
  location: { sql: 'location', kind: 'text' },
  date: { sql: 'date', kind: 'text' },
  time: { sql: 'time', kind: 'text' },
  staff: { sql: 'staff', kind: 'text' },
  status: { sql: 'status', kind: 'text' },
  invoice: { sql: 'invoice', kind: 'text' },
  outQty: { sql: 'out_qty', kind: 'number' },
  returnQty: { sql: 'return_qty', kind: 'number' },
  saleQty: { sql: 'sale_qty', kind: 'number' },
  remainingQty: { sql: 'remaining_qty', kind: 'number' },
};

interface RawRow {
  sku: string;
  name: string;
  unit: string;
  location: string | null;
  date: string;
  time: string;
  staff: string;
  out_qty: string;
  return_qty: string;
  sale_qty: string;
  remaining_qty: string;
  status: string;
  invoice: string;
  /** Tổng của TOÀN TẬP đã lọc, tính bằng window nên dòng nào cũng mang. */
  w_total: number;
  w_out_qty: string;
  w_return_qty: string;
  w_sale_qty: string;
  w_remaining_qty: string;
}

@Injectable()
export class TempWarehouseReportService {
  constructor(private readonly dataSource: DataSource) {}

  async list(
    query: TempWarehouseReportQuery,
  ): Promise<TempWarehouseReportResult> {
    const branchIds =
      query.branchIds && query.branchIds.length > 0 ? query.branchIds : null;
    const categoryIds =
      query.categoryIds && query.categoryIds.length > 0
        ? query.categoryIds
        : null;
    const search =
      query.search && query.search.trim().length > 0
        ? query.search.trim()
        : null;

    const page = Math.max(1, query.page);
    const pageSize = Math.max(1, query.pageSize);
    const offset = (page - 1) * pageSize;

    // CTE chain shared by both the count and the data query.
    //   base   — relevant lines (only the two real directions; AUTO_BALANCED
    //            and DELETED dropped) with the session's showroom location.
    //   exp/ret — issues / returns, each numbered FIFO within (item, carrier).
    //   paired  — FULL JOIN exp↔ret on the same (item, carrier, sequence) so
    //            the n-th issue pairs with the n-th return. NULL on a side =
    //            an unmatched issue (chưa trả) or unmatched return (trả lẻ).
    const pairedCte = `
      WITH base AS (
        SELECT
          l.id,
          l.item_id,
          l.carrier_user_id,
          l.created_at,
          l.direction,
          l.invoice_id,
          l.invoice_number,
          l.transfer_id,
          l.branch_id
        FROM temp_warehouse_lines l
        JOIN temp_warehouse_sessions s ON s.id = l.session_id
        JOIN items i
          ON i.id = l.item_id AND i.organization_id = l.organization_id
        WHERE l.organization_id = $1
          AND l.created_at >= $2
          AND l.created_at < $3
          AND l.status NOT IN ('DELETED', 'AUTO_BALANCED')
          AND l.direction IN ('warehouse_to_showroom', 'showroom_to_warehouse')
          AND ($4::text[] IS NULL OR l.branch_id = ANY($4::text[]))
          AND ($5::uuid[] IS NULL OR i.category_id = ANY($5::uuid[]))
          AND ($6::text IS NULL OR i.code ILIKE '%' || $6 || '%' OR i.name ILIKE '%' || $6 || '%')
      ),
      exp AS (
        SELECT *, row_number() OVER (
          PARTITION BY item_id, carrier_user_id ORDER BY created_at, id
        ) AS rn
        FROM base WHERE direction = 'warehouse_to_showroom'
      ),
      ret AS (
        SELECT *, row_number() OVER (
          PARTITION BY item_id, carrier_user_id ORDER BY created_at, id
        ) AS rn
        FROM base WHERE direction = 'showroom_to_warehouse'
      ),
      paired AS (
        SELECT
          COALESCE(e.item_id, r.item_id) AS item_id,
          COALESCE(e.carrier_user_id, r.carrier_user_id) AS carrier_user_id,
          COALESCE(e.branch_id, r.branch_id) AS branch_id,
          COALESCE(e.created_at, r.created_at) AS event_at,
          (e.id IS NOT NULL)::int AS out_qty,
          (r.id IS NOT NULL)::int AS return_qty,
          (e.invoice_id IS NOT NULL)::int AS sale_qty,
          -- SL tồn = SL xuất − SL trả − SL bán − SL đã chuyển kho. Đây là số còn
          -- ĐANG TREO ở kho tạm: đã dịch chuyển vật lý nhưng chưa hạch toán sổ
          -- sách. KHÔNG phải tồn kho hiện tại của mặt hàng.
          --
          -- Vế cuối cần thiết vì kho tạm không có tồn kho riêng: chừng nào phiếu
          -- chuyển kho chưa post thì sổ vẫn ghi hàng ở kho nguồn. Khi "Xử lý
          -- chuyển kho" post phiếu, hàng hạch toán xong và không còn treo nữa —
          -- trước đây dòng đó vẫn báo SL tồn = 1, tức nhãn nói đã chuyển đi mà
          -- con số nói còn trong kho tạm.
          -- "AND e.invoice_id IS NULL" để không trừ hai lần: dòng đã bán mang CẢ
          -- transfer_id LẪN invoice_id (fulfillInvoiceFromTempWarehouse ghi cùng lúc).
          --
          -- Có thể âm với dòng trả lẻ (lần xuất tương ứng nằm ngoài kỳ lọc) —
          -- đúng về mặt net, để tổng cân bằng.
          (
            (e.id IS NOT NULL)::int
            - (r.id IS NOT NULL)::int
            - (e.invoice_id IS NOT NULL)::int
            - (e.transfer_id IS NOT NULL AND e.invoice_id IS NULL)::int
          ) AS remaining_qty,
          -- Only an issue (warehouse_to_showroom) carries the consuming invoice.
          e.invoice_id AS invoice_id,
          e.invoice_number AS invoice_number,
          -- transfer_id is set on EITHER side by "Xử lý chuyển kho"; tracked
          -- separately per side since it distinguishes chuyển-kho-xuất-đi
          -- (exp side) from chuyển-kho-trả-lại (ret side).
          e.transfer_id AS exp_transfer_id,
          r.transfer_id AS ret_transfer_id,
          'temp'::text AS source
        FROM exp e
        FULL OUTER JOIN ret r
          ON e.item_id = r.item_id
          AND e.carrier_user_id IS NOT DISTINCT FROM r.carrier_user_id
          AND e.rn = r.rn
      ),
      -- Những hóa đơn thuộc phạm vi báo cáo. Khai một lần rồi dùng cho CẢ
      -- tw_claimed lẫn showroom: hai bên buộc phải nói về cùng một tập hóa đơn,
      -- và trước đây vị từ này được chép hai chỗ — lệch một chữ là đếm trùng.
      scoped_invoices AS (
        SELECT inv.id
        FROM invoices inv
        WHERE inv.organization_id = $1
          AND inv.is_draft = FALSE
          AND inv.status <> 'cancelled'
          AND COALESCE(inv.issued_at, inv.created_at) >= $2
          AND COALESCE(inv.issued_at, inv.created_at) < $3
          AND ($4::text[] IS NULL OR inv.branch_id = ANY($4::text[]))
      ),
      -- SL của mỗi (hóa đơn, mặt hàng) mà kho tạm ĐÃ nhận. KHÔNG chặn theo
      -- created_at của chính dòng kho tạm: fulfillInvoiceFromTempWarehouse lấy
      -- dòng ACTIVE theo FIFO bất kể ngày stage, nên một dòng stage trước kỳ vẫn
      -- có thể mang invoice_id của hóa đơn trong kỳ. Chặn theo ngày stage sẽ để
      -- lọt phần đó xuống nhánh showroom → đếm trùng.
      --
      -- Chặn theo HÓA ĐƠN thì khác hẳn và an toàn: dòng mang hóa đơn ngoài phạm
      -- vi vốn không join được với gì trong "showroom", nên loại sớm không đổi
      -- kết quả — chỉ thôi quét toàn bộ lịch sử kho tạm của tổ chức ở mỗi lần
      -- mở báo cáo. Giữ "invoice_id IS NOT NULL" tường minh dù JOIN đã hàm ý:
      -- index partial (idx_twl_claimed_by_invoice) chỉ dùng được khi vị từ của
      -- nó xuất hiện thành câu chữ.
      --
      -- RÀNG BUỘC LIÊN MODULE: ở đây cộng "quantity", còn nhánh kho tạm phát
      -- sale_qty = 1 cho mỗi dòng. Hai bên chỉ khớp vì mọi dòng kho tạm luôn có
      -- quantity 1.00 — addLine hard-code (temp-warehouse.service.ts:352) và
      -- không DTO nào cho nhập số lượng. Nếu điều đó đổi, nhánh kho tạm phải
      -- chuyển từ cờ 0/1 sang chính "quantity", nếu không sẽ thiếu SL bán ngầm.
      tw_claimed AS (
        SELECT l.invoice_id, l.item_id, SUM(l.quantity) AS qty
        FROM temp_warehouse_lines l
        JOIN scoped_invoices si ON si.id = l.invoice_id
        WHERE l.organization_id = $1
          AND l.invoice_id IS NOT NULL
          AND l.direction = 'warehouse_to_showroom'
          AND l.status NOT IN ('DELETED', 'AUTO_BALANCED')
        GROUP BY l.invoice_id, l.item_id
      ),
      -- Nguồn thứ hai: hàng ĐÃ trưng sẵn ở showroom, bán ra. Nghiệp vụ này
      -- không sinh dòng temp_warehouse_lines nào (POS trừ tồn thẳng từ vị trí
      -- showroom), nên nó chỉ hiện ra như PHẦN DƯ của dòng hóa đơn sau khi trừ
      -- đi những gì kho tạm đã nhận.
      showroom AS (
        SELECT
          ii.item_id,
          inv.staff_id AS carrier_user_id,
          inv.branch_id,
          -- PHẢI ép về timestamp KHÔNG timezone. temp_warehouse_lines.created_at
          -- là naive-UTC, còn invoices.issued_at là timestamptz; để nguyên thì
          -- UNION ALL nâng CẢ HAI nhánh lên timestamptz, và biểu thức render ở
          -- tầng enriched (AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')
          -- đổi sang overload khác — trừ 7h thay vì cộng 7h. Sai ngày/giờ của
          -- MỌI dòng, kể cả dòng kho tạm.
          COALESCE(inv.issued_at, inv.created_at) AT TIME ZONE 'UTC' AS event_at,
          -- Hàng chưa từng đi qua kho tạm ⇒ không có sự kiện xuất/trả, và SL tồn
          -- (còn trưng bày ở kho tạm) là 0 chứ không phải −SL bán.
          0::numeric AS out_qty,
          0::numeric AS return_qty,
          -- Gộp theo (hóa đơn, mặt hàng) TRƯỚC khi trừ. Nút "Tách dòng" ở POS
          -- cố ý tạo nhiều dòng giỏ cho cùng itemId; LEFT JOIN gắn c.qty vào
          -- TỪNG dòng, nên không gộp thì phần kho tạm đã nhận bị trừ một lần
          -- cho mỗi dòng → thiếu SL bán. MAX an toàn vì c.qty phụ thuộc hàm
          -- vào đúng (invoice_id, item_id) đang gộp.
          SUM(ii.quantity) - COALESCE(MAX(c.qty), 0) AS sale_qty,
          0::numeric AS remaining_qty,
          inv.id AS invoice_id,
          inv.code AS invoice_number,
          NULL::uuid AS exp_transfer_id,
          NULL::uuid AS ret_transfer_id,
          'showroom'::text AS source
        FROM invoice_items ii
        JOIN scoped_invoices si ON si.id = ii.invoice_id
        -- Vẫn join thẳng bảng "invoices" (không lấy các cột này qua CTE): chỉ
        -- khi "inv" là bảng thật thì Postgres mới biết "inv.id" là khóa chính,
        -- và GROUP BY dưới kia mới được phép chọn staff_id/branch_id/code mà
        -- không liệt kê chúng ra.
        JOIN invoices inv ON inv.id = ii.invoice_id
        JOIN items i
          ON i.id = ii.item_id AND i.organization_id = $1
        LEFT JOIN tw_claimed c
          ON c.invoice_id = ii.invoice_id AND c.item_id = ii.item_id
        WHERE ii.organization_id = $1
          AND ii.direction = 'OUT'
          AND ($5::uuid[] IS NULL OR i.category_id = ANY($5::uuid[]))
          AND ($6::text IS NULL OR i.code ILIKE '%' || $6 || '%' OR i.name ILIKE '%' || $6 || '%')
        -- inv.id là khóa chính nên chọn được staff_id/branch_id/code/issued_at
        -- mà không phải liệt kê (phụ thuộc hàm).
        GROUP BY ii.item_id, inv.id
        HAVING SUM(ii.quantity) - COALESCE(MAX(c.qty), 0) > 0
      ),
      -- Danh sách cột khai TƯỜNG MINH: UNION ALL khớp theo vị trí, và nhiều cột
      -- ở đây cùng kiểu (uuid, numeric), nên một nhánh sắp sai thứ tự sẽ hoán
      -- cột âm thầm. Ép numeric ngay tại đây để hai nhánh cùng kiểu, thay vì
      -- sửa biểu thức bên trong paired.
      movements (
        item_id, carrier_user_id, branch_id, event_at,
        out_qty, return_qty, sale_qty, remaining_qty,
        invoice_id, invoice_number, exp_transfer_id, ret_transfer_id, source
      ) AS (
        SELECT
          item_id, carrier_user_id, branch_id, event_at,
          out_qty::numeric, return_qty::numeric,
          sale_qty::numeric, remaining_qty::numeric,
          invoice_id, invoice_number, exp_transfer_id, ret_transfer_id, source
        FROM paired
        UNION ALL
        SELECT
          item_id, carrier_user_id, branch_id, event_at,
          out_qty, return_qty, sale_qty, remaining_qty,
          invoice_id, invoice_number, exp_transfer_id, ret_transfer_id, source
        FROM showroom
      )
    `;

    const baseParams = [
      query.organizationId,
      query.startDate,
      query.endDate,
      branchIds,
      categoryIds,
      search,
    ];

    // One outer stage shared by the rows, count and totals queries — every
    // displayed column EXCEPT `location`, which is deliberately absent here.
    //
    // Resolving the shelf costs two LATERALs per row and they are 65% of the
    // report's buffers (measured: 3079 → 1355 shared hits on an 80-row period).
    // Keeping them out of `enriched` means the count/totals query never pays
    // for them at all, and the rows query pays only for the page it returns —
    // the sort key is `event_at`, which does not depend on the shelf, so the
    // LIMIT can be applied before the shelf is looked up.
    const enrichedCte = `
      ${pairedCte},
      enriched AS (
      SELECT
        i.code AS sku,
        i.name AS name,
        i.unit AS unit,
        to_char(p.event_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') AS date,
        to_char(p.event_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI:SS') AS time,
        TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS staff,
        p.out_qty AS out_qty,
        p.return_qty AS return_qty,
        p.sale_qty AS sale_qty,
        p.remaining_qty AS remaining_qty,
        CASE
          WHEN p.source = 'showroom' THEN 'Bán hàng trưng bày'
          WHEN p.invoice_id IS NOT NULL THEN 'Bán hàng kho tạm'
          WHEN p.exp_transfer_id IS NOT NULL THEN 'Chuyển kho xuất đi'
          WHEN p.ret_transfer_id IS NOT NULL THEN 'Chuyển kho trả lại'
          WHEN p.return_qty = p.out_qty THEN ''
          WHEN p.return_qty = 1 THEN 'Trả hàng trưng bày'
          ELSE 'Xuất không bán'
        END AS status,
        COALESCE(p.invoice_number, '') AS invoice,
        p.event_at AS event_at,
        p.item_id AS item_id,
        p.branch_id AS branch_id
      FROM movements p
      JOIN items i ON i.id = p.item_id AND i.organization_id = $1
      LEFT JOIN users u ON u.id = p.carrier_user_id
      )
    `;

    // Adds `location` to any relation that carries `item_id` + `branch_id`.
    // Applied to a 20-row page in the normal case; only applied to the whole
    // set when the user filters ON the shelf, which the filter cannot see
    // otherwise.
    const withShelf = (src: string) => `
      SELECT src.*, COALESCE(preferred.code, fallback.code) AS location
      FROM ${src} src
      -- Item's current default shelf in a non-showroom warehouse of the
      -- line's branch — same priority order as loadItemLocations in
      -- profit-by-item/revenue-by-item: preferred shelf first.
      LEFT JOIN LATERAL (
        SELECT loc.code
        FROM item_storage_locations isl
        JOIN storages st ON st.id = isl.storage_id
        JOIN locations loc ON loc.id = isl.location_id
        LEFT JOIN stock_balances sb
          ON sb.item_id = isl.item_id
          AND sb.location_id = isl.location_id
          AND sb.organization_id = $1
        WHERE isl.item_id = src.item_id
          AND isl.organization_id = $1
          AND st.branch_id::text = src.branch_id
          AND st.is_main_storage = FALSE
          AND st.is_active = TRUE
          AND loc.is_active = TRUE
          AND COALESCE(sb.is_tracked, TRUE) = TRUE
        LIMIT 1
      ) preferred ON TRUE
      -- Fallback: highest-stock tracked location among the branch's
      -- non-showroom warehouses, when no preferred shelf resolved.
      LEFT JOIN LATERAL (
        SELECT loc.code
        FROM stock_balances sb
        JOIN locations loc ON loc.id = sb.location_id
        JOIN storages st ON st.id = loc.storage_id
        WHERE sb.item_id = src.item_id
          AND sb.organization_id = $1
          AND sb.quantity > 0
          AND sb.is_tracked = TRUE
          AND st.branch_id::text = src.branch_id
          AND st.is_main_storage = FALSE
          AND st.is_active = TRUE
          AND loc.is_active = TRUE
        ORDER BY sb.quantity DESC
        LIMIT 1
      ) fallback ON preferred.code IS NULL
    `;

    // Column filters are applied to the stage where the row the user sees
    // exists. Rows, count and totals all read from the same one, so the footer
    // cannot describe a different set than the grid.
    const columnFilter = buildReportColumnFilter(
      query.columnFilters,
      TEMP_WAREHOUSE_COLUMN_SPECS,
      baseParams.length,
    );
    const filterWhere = columnFilter.where ? `WHERE ${columnFilter.where}` : '';
    const filteredParams = [...baseParams, ...columnFilter.params];

    // `location` is a filterable column, and it is the one column the cheap
    // stage does not have. When it is filtered on, the shelf must be resolved
    // before the filter runs — so the whole set pays, as it did before.
    const filtersOnShelf = query.columnFilters?.location !== undefined;
    const filterable = filtersOnShelf ? `(${withShelf('enriched')}) e` : 'enriched';

    // The footer's four sums and the row count ride along on every row, as
    // window functions over the filtered set. Windows are evaluated after WHERE
    // and before ORDER BY/LIMIT, so each row of the page carries the totals of
    // the WHOLE set — which is exactly what the footer means. It also means the
    // CTE chain (base → paired, showroom, movements) is built once per request
    // instead of twice; that chain, not the page, is what grows with the data.
    const windowTotals = `
      COUNT(*) OVER ()::int AS w_total,
      SUM(out_qty) OVER ()::numeric AS w_out_qty,
      SUM(return_qty) OVER ()::numeric AS w_return_qty,
      SUM(sale_qty) OVER ()::numeric AS w_sale_qty,
      SUM(remaining_qty) OVER ()::numeric AS w_remaining_qty
    `;

    const limitOffset = `LIMIT $${filteredParams.length + 1} OFFSET $${filteredParams.length + 2}`;
    const paged = `
      SELECT * FROM (
        SELECT *, ${windowTotals} FROM ${filterable} ${filterWhere}
      ) f
      ORDER BY event_at DESC
      ${limitOffset}
    `;
    // Normal path: page first, resolve the shelf for those rows only. When the
    // shelf itself is filtered on, `filterable` already carries it.
    const pagedWithShelf = filtersOnShelf ? paged : withShelf(`(${paged})`);

    const rows: RawRow[] = await this.dataSource.query(
      `
      ${enrichedCte}
      SELECT sku, name, unit, location, date, time, staff,
             out_qty, return_qty, sale_qty, remaining_qty, status, invoice,
             w_total, w_out_qty, w_return_qty, w_sale_qty, w_remaining_qty
      FROM (${pagedWithShelf}) page
      ORDER BY event_at DESC
      `,
      [...filteredParams, pageSize, offset],
    );

    let total = Number(rows[0]?.w_total ?? 0);
    let totals = {
      outQty: Number(rows[0]?.w_out_qty ?? 0),
      returnQty: Number(rows[0]?.w_return_qty ?? 0),
      saleQty: Number(rows[0]?.w_sale_qty ?? 0),
      remainingQty: Number(rows[0]?.w_remaining_qty ?? 0),
    };

    // An empty page past the end (user was on page 4, then filtered down to one
    // page) has no row to carry the totals — but the set is not empty, and the
    // footer still has to describe it. Only then does the count cost anything.
    if (rows.length === 0 && offset > 0) {
      const [aggregate]: Array<{
        total: string;
        out_qty: string;
        return_qty: string;
        sale_qty: string;
        remaining_qty: string;
      }> = await this.dataSource.query(
        `${enrichedCte}
         SELECT COUNT(*)::int AS total,
                COALESCE(SUM(out_qty), 0)::numeric AS out_qty,
                COALESCE(SUM(return_qty), 0)::numeric AS return_qty,
                COALESCE(SUM(sale_qty), 0)::numeric AS sale_qty,
                COALESCE(SUM(remaining_qty), 0)::numeric AS remaining_qty
         FROM ${filterable} ${filterWhere}`,
        filteredParams,
      );
      total = Number(aggregate?.total ?? 0);
      totals = {
        outQty: Number(aggregate?.out_qty ?? 0),
        returnQty: Number(aggregate?.return_qty ?? 0),
        saleQty: Number(aggregate?.sale_qty ?? 0),
        remainingQty: Number(aggregate?.remaining_qty ?? 0),
      };
    }

    const data: TempWarehouseIssueRow[] = rows.map((r) => ({
      sku: r.sku,
      name: r.name,
      unit: r.unit,
      location: r.location,
      date: r.date,
      time: r.time,
      staff: r.staff,
      outQty: Number(r.out_qty),
      returnQty: Number(r.return_qty),
      saleQty: Number(r.sale_qty),
      remainingQty: Number(r.remaining_qty),
      status: r.status,
      invoice: r.invoice,
    }));

    return { data, total, totals };
  }
}
