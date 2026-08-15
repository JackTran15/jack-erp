import { Injectable } from '@nestjs/common';
import type { ReportTotals } from '@erp/shared-interfaces';
import { DataSource } from 'typeorm';
import type { ReportColumnFilterDto } from '../dto/report-column-filter.dto';
import {
  buildReportColumnFilter,
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
 * PHẠM VI: báo cáo chỉ đọc `temp_warehouse_lines`. Hàng ĐÃ trưng sẵn ở showroom
 * khi bán KHÔNG có mặt ở đây — nghiệp vụ đó không sinh dòng nào trong bảng này
 * (POS trừ tồn thẳng từ vị trí showroom qua
 * `resolveBranchItemLocations(..., { showroomOnly: true })`, và
 * `fulfillInvoiceFromTempWarehouse` thoát sớm khi không có dòng nào staged).
 * Một nguồn thứ hai lấy từ `invoice_items` đã được cài rồi GỠ: nó chiếm 64/71
 * dòng trên dữ liệu thật, tức 90% nội dung của một báo cáo tên "xuất kho tạm"
 * lại là hàng không xuất kho tạm. Xem ADR-05 trong
 * `.ai/features/temp-warehouse-sale-status/03-logical-design.md`. Cần con số bán
 * hàng trưng bày thì dùng báo cáo doanh thu, không phải báo cáo này.
 *
 * Trạng thái (ưu tiên theo thứ tự, dừng ở nhánh khớp đầu tiên). THỨ TỰ NHÁNH LÀ
 * RÀNG BUỘC ĐÚNG-ĐẮN, không phải phong cách:
 *   - Dòng xuất có invoice_id           → "Bán hàng kho tạm" (hàng lấy từ kho,
 *     scan vào kho tạm rồi mới bán). Chỉ `fulfillInvoiceFromTempWarehouse` ghi
 *     cột đó và nó chỉ tiêu thụ dòng `warehouse_to_showroom`, nên nhánh này
 *     KHÔNG BAO GIỜ là hàng trưng bày — đó là lý do nhãn cũ ("Bán hàng trưng
 *     bày") sai và đã đổi.
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
 *   - remainingQty : số còn lại ở kho tạm (trưng bày) của cặp ghép =
 *                    SL xuất − SL trả − SL bán (Nhập−Xuất−Tồn kiểu MISA). Tổng
 *                    cột = số hàng còn trưng bày thực tế trong kỳ. LƯU Ý có thể
 *                    âm ở dòng "Trả hàng trưng bày" trả lẻ (lần xuất tương ứng
 *                    nằm ngoài kỳ lọc) — đúng về mặt net, để tổng cân bằng.
 *   - staff        : carrier (`users.first_name + last_name`).
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
 * Báo cáo KHÔNG join `invoices`: tín hiệu "đã bán" chỉ là `invoice_id IS NOT NULL`
 * trên chính dòng kho tạm. Nên hóa đơn bị HỦY sau khi đã tiêu thụ kho tạm vẫn
 * hiện là "Bán hàng kho tạm" — `cancel-invoice.service.ts` không đụng
 * `temp_warehouse_lines`. Defect có sẵn, chưa sửa; có test e2e khóa hành vi hiện
 * tại để lần sửa sau là có chủ đích.
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
  columnFilters?: Record<string, ReportColumnFilterDto>;
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
          -- Only an issue (warehouse_to_showroom) carries the consuming invoice.
          e.invoice_id AS invoice_id,
          e.invoice_number AS invoice_number,
          -- transfer_id is set on EITHER side by "Xử lý chuyển kho"; tracked
          -- separately per side since it distinguishes chuyển-kho-xuất-đi
          -- (exp side) from chuyển-kho-trả-lại (ret side).
          e.transfer_id AS exp_transfer_id,
          r.transfer_id AS ret_transfer_id
        FROM exp e
        FULL OUTER JOIN ret r
          ON e.item_id = r.item_id
          AND e.carrier_user_id IS NOT DISTINCT FROM r.carrier_user_id
          AND e.rn = r.rn
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

    // One outer stage shared by the rows, count and totals queries. The two
    // LATERALs resolve the item's shelf; they already ran for the whole matching
    // set before (ORDER BY + LIMIT forces a full sort), so hoisting them here
    // costs the rows query nothing and lets the footer see the same columns.
    const enrichedCte = `
      ${pairedCte},
      enriched AS (
      SELECT
        i.code AS sku,
        i.name AS name,
        i.unit AS unit,
        COALESCE(preferred.code, fallback.code) AS location,
        to_char(p.event_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') AS date,
        to_char(p.event_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI:SS') AS time,
        TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS staff,
        p.out_qty AS out_qty,
        p.return_qty AS return_qty,
        (p.invoice_id IS NOT NULL)::int AS sale_qty,
        -- SL tồn = SL xuất − SL trả − SL bán (còn trưng bày ở kho tạm), KHÔNG
        -- phải tồn kho hiện tại của mặt hàng. Có thể âm với dòng trả lẻ.
        (p.out_qty - p.return_qty - (p.invoice_id IS NOT NULL)::int) AS remaining_qty,
        CASE
          WHEN p.invoice_id IS NOT NULL THEN 'Bán hàng kho tạm'
          WHEN p.exp_transfer_id IS NOT NULL THEN 'Chuyển kho xuất đi'
          WHEN p.ret_transfer_id IS NOT NULL THEN 'Chuyển kho trả lại'
          WHEN p.return_qty = p.out_qty THEN ''
          WHEN p.return_qty = 1 THEN 'Trả hàng trưng bày'
          ELSE 'Xuất không bán'
        END AS status,
        COALESCE(p.invoice_number, '') AS invoice,
        p.event_at AS event_at
      FROM paired p
      JOIN items i ON i.id = p.item_id AND i.organization_id = $1
      LEFT JOIN users u ON u.id = p.carrier_user_id
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
        WHERE isl.item_id = p.item_id
          AND isl.organization_id = $1
          AND st.branch_id::text = p.branch_id
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
        WHERE sb.item_id = p.item_id
          AND sb.organization_id = $1
          AND sb.quantity > 0
          AND sb.is_tracked = TRUE
          AND st.branch_id::text = p.branch_id
          AND st.is_main_storage = FALSE
          AND st.is_active = TRUE
          AND loc.is_active = TRUE
        ORDER BY sb.quantity DESC
        LIMIT 1
      ) fallback ON preferred.code IS NULL
      )
    `;

    // Column filters are applied to `enriched`, the one stage where the row the
    // user sees exists. Rows, count and totals all read from it, so the footer
    // cannot describe a different set than the grid.
    const columnFilter = buildReportColumnFilter(
      query.columnFilters,
      TEMP_WAREHOUSE_COLUMN_SPECS,
      baseParams.length,
    );
    const filterWhere = columnFilter.where ? `WHERE ${columnFilter.where}` : '';
    const filteredParams = [...baseParams, ...columnFilter.params];

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
       FROM enriched ${filterWhere}`,
      filteredParams,
    );
    const total = Number(aggregate?.total ?? 0);
    const totals = {
      outQty: Number(aggregate?.out_qty ?? 0),
      returnQty: Number(aggregate?.return_qty ?? 0),
      saleQty: Number(aggregate?.sale_qty ?? 0),
      remainingQty: Number(aggregate?.remaining_qty ?? 0),
    };

    if (total === 0) {
      return { data: [], total: 0, totals };
    }

    const rows: RawRow[] = await this.dataSource.query(
      `
      ${enrichedCte}
      SELECT sku, name, unit, location, date, time, staff,
             out_qty, return_qty, sale_qty, remaining_qty, status, invoice
      FROM enriched
      ${filterWhere}
      ORDER BY event_at DESC
      LIMIT $${filteredParams.length + 1} OFFSET $${filteredParams.length + 2}
      `,
      [...filteredParams, pageSize, offset],
    );

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
