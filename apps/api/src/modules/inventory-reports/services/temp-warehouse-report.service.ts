import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Báo cáo — Hàng hóa xuất kho tạm (temp-warehouse out goods).
 *
 * Mỗi dòng = một **cặp xuất↔trả đã ghép** (data-cleaning), KHÔNG phải per-line.
 * Hệ thống ghép lần xuất (warehouse_to_showroom) với lần trả
 * (showroom_to_warehouse) của **cùng item + cùng người vận chuyển (carrier)**,
 * ghép FIFO theo thời gian (`row_number` theo `created_at`):
 *   - Xuất chưa trả        → outQty=1, returnQty=0, status "Xuất không bán".
 *   - Xuất đã được trả lại → outQty=1, returnQty=1, status rỗng (cân bằng,
 *     SL trả === SL xuất nên không gắn label trạng thái).
 *   - Trả lẻ (không khớp xuất nào) → outQty=0, returnQty=1, status "Trả hàng trưng bày".
 *
 * Mapping cột → dữ liệu:
 *   - date/time    : thời điểm xuất (COALESCE xuất → trả).
 *   - location     : `locations.code` của showroom (vị trí trưng bày).
 *   - remainingQty : tồn hiện tại (`stock_balances`) tại showroom location.
 *   - staff        : carrier (`users.first_name + last_name`).
 *
 * Giới hạn đã biết (không có nguồn dữ liệu trong hệ thống hiện tại):
 *   - saleQty / invoice: KHÔNG có liên kết temp-warehouse ↔ hóa đơn POS, nên
 *     luôn trả 0 / '' (giống file Excel mẫu). Cần bổ sung quan hệ ở backend
 *     nếu muốn số bán hàng chính xác.
 *
 * Lọc: `status NOT IN ('DELETED','AUTO_BALANCED')` (loại dòng cân bằng tự động
 * vì không có carrier / không phải sự kiện xuất-trả thực; giữ ACTIVE/TRANSFERRED)
 * + chỉ 2 chiều xuất/trả + `created_at IN [startDate, endDate)`.
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
  /** Luôn 0 — không có nguồn liên kết hóa đơn POS. */
  saleQty: number;
  remainingQty: number;
  status: string;
  /** Luôn '' — không có nguồn liên kết hóa đơn POS. */
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
}

export interface TempWarehouseReportResult {
  data: TempWarehouseIssueRow[];
  total: number;
}

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
          s.showroom_location_id
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
          COALESCE(e.showroom_location_id, r.showroom_location_id) AS showroom_location_id,
          COALESCE(e.created_at, r.created_at) AS event_at,
          (e.id IS NOT NULL)::int AS out_qty,
          (r.id IS NOT NULL)::int AS return_qty
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

    const countRows: Array<{ total: string }> = await this.dataSource.query(
      `${pairedCte} SELECT COUNT(*)::int AS total FROM paired`,
      baseParams,
    );
    const total = Number(countRows[0]?.total ?? 0);

    if (total === 0) {
      return { data: [], total: 0 };
    }

    const rows: RawRow[] = await this.dataSource.query(
      `
      ${pairedCte}
      SELECT
        i.code AS sku,
        i.name AS name,
        i.unit AS unit,
        loc.code AS location,
        to_char(p.event_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') AS date,
        to_char(p.event_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI:SS') AS time,
        TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS staff,
        p.out_qty AS out_qty,
        p.return_qty AS return_qty,
        0 AS sale_qty,
        COALESCE(sb.quantity, 0) AS remaining_qty,
        CASE
          WHEN p.return_qty = p.out_qty THEN ''
          WHEN p.return_qty = 1 THEN 'Trả hàng trưng bày'
          ELSE 'Xuất không bán'
        END AS status,
        '' AS invoice
      FROM paired p
      JOIN items i ON i.id = p.item_id AND i.organization_id = $1
      LEFT JOIN users u ON u.id = p.carrier_user_id
      LEFT JOIN locations loc ON loc.id = p.showroom_location_id
      LEFT JOIN stock_balances sb
        ON sb.item_id = p.item_id
        AND sb.organization_id = $1
        AND sb.location_id = p.showroom_location_id
      ORDER BY p.event_at DESC
      LIMIT $7 OFFSET $8
      `,
      [...baseParams, pageSize, offset],
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

    return { data, total };
  }
}
