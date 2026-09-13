import { EXCLUDE_VOIDED_DOCS_SQL } from '../../inventory/ledger/stock-summary.service';
import { MobileInventoryKind } from '../dto/mobile-inventory-product-list.query.dto';

/**
 * Mảnh SQL dùng chung của hai service tồn kho mobile
 * (`MobileInventoryService` — màn chính; `MobileInventoryDrilldownService` —
 * chuỗi biến thể → cửa hàng → luồng/phiếu).
 *
 * Tách ra file riêng vì một lý do duy nhất: hai service phải nhìn CÙNG một tập
 * bút toán. Tổng của danh sách biến thể phải bằng dòng mặt hàng vừa chạm, tồn
 * cuối kỳ của luồng phải bằng số trên thẻ cửa hàng — và cách duy nhất giữ được
 * điều đó mà không cần ai nhớ là để mệnh đề FROM/JOIN/WHERE sống ở đúng một
 * chỗ. Tiền lệ tên file: `partner-catalog/partner-stock.sql.ts`.
 *
 * Mọi hàm ở đây nhận TÊN THAM SỐ (`$3`…) chứ không nhận giá trị: người gọi
 * đánh số tham số động (`$1` luôn là organizationId), mảnh SQL chỉ chèn tên.
 */

/**
 * Khối `FROM … WHERE …` của sổ cái đã thu về phạm vi: tổ chức, tới hết ngày
 * `asOf`, đúng tập chi nhánh, (tuỳ chọn) đúng tập item.
 *
 * MƯỢN đúng mệnh đề của `StockSummaryService.buildBaseQuery`: loại bút toán
 * của phiếu đã huỷ (`EXCLUDE_VOIDED_DOCS_SQL`, import chứ không chép), bỏ
 * kho/vị trí ngừng hoạt động, bỏ cặp item×vị trí đã ngừng theo dõi.
 *
 * `LEFT JOIN stock_balances` + `COALESCE(is_tracked, true)` chứ không INNER:
 * dữ liệu thật có cặp item×vị trí đã ghi sổ mà chưa có dòng số dư (đo được 2
 * cặp) — INNER JOIN là làm chúng biến mất im lặng.
 *
 * Chi nhánh lọc qua `storages.branch_id` (UUID), KHÔNG qua
 * `stock_ledger_entries.branch_id` (varchar di sản) — hai cột khác kiểu, và
 * kho mới là thứ định vị một bút toán trên màn tồn kho.
 *
 * Trả về chuỗi bắt đầu bằng `FROM` và kết thúc bằng WHERE hoàn chỉnh, nên
 * người gọi nối thêm điều kiện bằng `AND …`.
 */
export function ledgerScopeSql(params: {
  asOfParam: string;
  branchesParam: string;
  itemIdsParam?: string;
}): string {
  const { asOfParam, branchesParam, itemIdsParam } = params;
  const itemFilter = itemIdsParam
    ? `
        AND sle.item_id = ANY(${itemIdsParam}::uuid[])`
    : '';

  return `FROM stock_ledger_entries sle
      INNER JOIN locations loc ON loc.id = sle.location_id AND loc.is_active = true
      INNER JOIN storages  st  ON st.id  = loc.storage_id  AND st.is_active  = true
      LEFT  JOIN stock_balances sb
             ON sb.item_id = sle.item_id AND sb.location_id = sle.location_id
      WHERE sle.organization_id = $1
        AND sle.posted_at < (${asOfParam}::date + INTERVAL '1 day')
        AND st.branch_id = ANY(${branchesParam}::uuid[])${itemFilter}
        AND COALESCE(sb.is_tracked, true) = true
        ${EXCLUDE_VOIDED_DOCS_SQL}`;
}

/**
 * CTE `cells`: ô tồn (item × kho) từ SỔ CÁI, tính đến hết ngày `asOf`.
 *
 * Khác web ở MỘT điểm có chủ ý: nguồn là `stock_ledger_entries` chứ không
 * phải `stock_balances`, vì app hỏi "tồn TÍNH ĐẾN NGÀY" mà bảng số dư chỉ có
 * số hiện tại. Với `asOf` = hôm nay hai nguồn cho cùng một số (web cũng tính
 * closing = opening + in − out khi có kỳ).
 *
 * Giá trị = `SUM(line_value)` — giá vốn chụp lúc ghi sổ, cùng cách
 * `StockLedgerService.getInstantAverageCost` tính `inventoryValue`. Bút toán
 * cũ thiếu `line_value` bị `SUM` bỏ qua; giới hạn này đã biết.
 *
 * `monthStartParam` mở thêm ba cột theo KỲ (`opening_qty`, `period_in`,
 * `period_out`) — thẻ cửa hàng và dòng biến thể cần, danh sách mặt hàng thì
 * không.
 */
export function ledgerCellsSql(params: {
  asOfParam: string;
  branchesParam: string;
  itemIdsParam?: string;
  monthStartParam?: string;
}): string {
  const { monthStartParam, ...scope } = params;
  const periodColumns = monthStartParam
    ? `,
        SUM(CASE WHEN sle.posted_at < ${monthStartParam}::date
                 THEN sle.quantity ELSE 0 END)::float      AS opening_qty,
        SUM(CASE WHEN sle.posted_at >= ${monthStartParam}::date AND sle.quantity > 0
                 THEN sle.quantity ELSE 0 END)::float      AS period_in,
        SUM(CASE WHEN sle.posted_at >= ${monthStartParam}::date AND sle.quantity < 0
                 THEN ABS(sle.quantity) ELSE 0 END)::float AS period_out`
    : '';

  return `cells AS (
      SELECT
        sle.item_id,
        st.branch_id,
        st.id                                   AS storage_id,
        SUM(sle.quantity)::float                AS qty,
        COALESCE(SUM(sle.line_value), 0)::float AS value${periodColumns}
      ${ledgerScopeSql(scope)}
      GROUP BY sle.item_id, st.branch_id, st.id
    )`;
}

/**
 * Cột chi nhánh và biểu thức kho của một phiếu chuyển, theo LOẠI tồn pending.
 *
 * - `in_transit` ("đang chuyển đi"): hàng thuộc chi nhánh NGUỒN, ở kho nguồn —
 *   dòng ưu tiên, lùi về header (`COALESCE`), đúng cách web tính.
 * - `incoming` ("sắp nhận về"): hàng thuộc chi nhánh ĐÍCH; kho đích ở header
 *   và NULLABLE — phiếu chưa chỉ định kho thì gán về kho `is_default_receiving`
 *   của chi nhánh đích (ADR-07, `stock-period.service.ts` CTE `default_receiving`),
 *   để tổng các kho vẫn bằng tổng cửa hàng. Chi nhánh không có kho mặc định
 *   thì dòng rơi khỏi thẻ kho nhưng vẫn cộng vào tổng chi nhánh — ca không có
 *   trong seed nào, ghi ra để không ai tưởng là bug SQL.
 *
 * `transfer_orders.*_branch_id` là VARCHAR (di sản `BaseEntity`), khác
 * `storages.branch_id` uuid: mảng chi nhánh ép `::text[]` ở đây, và
 * `d.branch_id::text` khi so với nó.
 */
const PENDING_SIDE: Record<
  Exclude<MobileInventoryKind, MobileInventoryKind.ON_HAND>,
  { branchColumn: string; storageExpr: string }
> = {
  [MobileInventoryKind.IN_TRANSIT]: {
    branchColumn: 't.source_branch_id',
    storageExpr: 'COALESCE(l.source_storage_id, t.source_storage_id)',
  },
  [MobileInventoryKind.INCOMING]: {
    branchColumn: 't.destination_branch_id',
    storageExpr: `COALESCE(
          t.destination_storage_id,
          (SELECT d.id FROM storages d
            WHERE d.organization_id = t.organization_id
              AND d.branch_id::text = t.destination_branch_id
              AND d.is_default_receiving = true
            LIMIT 1)
        )`,
  },
};

/**
 * Khối `FROM … WHERE …` của PHIẾU CHUYỂN đang đi, đã thu về phạm vi tổ chức,
 * tập chi nhánh (theo phía của [kind]) và (tuỳ chọn) tập item.
 *
 * MƯỢN đúng định nghĩa của web (`StockSummaryService.pendingTransferQuery`):
 * `status = 'IN_PROGRESS'`, `deleted_at IS NULL`, số lượng là `requested_qty`
 * của dòng — enum chỉ có DRAFT/IN_PROGRESS/COMPLETED/CANCELLED và dòng không
 * có shipped/received, nên không có gì để trừ. Giá trị mượn của
 * `stock-period.service.ts`: đơn giá trên phiếu xuất của lượt chuyển
 * (`goods_issue_lines` của `export_goods_issue_id`), lùi về giá vốn của item.
 *
 * Không có `asOf`: một phiếu đang đi không có khái niệm "tính đến ngày".
 */
export function pendingScopeSql(params: {
  kind: Exclude<MobileInventoryKind, MobileInventoryKind.ON_HAND>;
  branchesParam: string;
  itemIdsParam?: string;
}): string {
  const { kind, branchesParam, itemIdsParam } = params;
  const side = PENDING_SIDE[kind];
  const itemFilter = itemIdsParam
    ? `
        AND l.item_id = ANY(${itemIdsParam}::uuid[])`
    : '';

  return `FROM transfer_orders t
      INNER JOIN transfer_order_lines l
              ON l.transfer_order_id = t.id AND l.organization_id = t.organization_id
      INNER JOIN items i
              ON i.id = l.item_id AND i.organization_id = t.organization_id
      LEFT  JOIN (
              SELECT gil.item_id, gil.goods_issue_id, MAX(gil.unit_price)::numeric AS unit_price
              FROM goods_issue_lines gil
              GROUP BY gil.item_id, gil.goods_issue_id
            ) export_price
              ON export_price.goods_issue_id = t.export_goods_issue_id
             AND export_price.item_id = l.item_id
      LEFT  JOIN storages st ON st.id = ${side.storageExpr}
      WHERE t.organization_id = $1
        AND t.status = 'IN_PROGRESS'
        AND t.deleted_at IS NULL
        AND ${side.branchColumn} = ANY(${branchesParam}::text[])${itemFilter}`;
}

/** Cột chi nhánh (đã ép uuid) của [pendingScopeSql] theo [kind]. */
export function pendingBranchColumn(
  kind: Exclude<MobileInventoryKind, MobileInventoryKind.ON_HAND>,
): string {
  return PENDING_SIDE[kind].branchColumn;
}

/** Biểu thức giá trị của một dòng phiếu chuyển — dùng chung cells và phiếu. */
export const PENDING_LINE_VALUE_SQL =
  'l.requested_qty * COALESCE(export_price.unit_price, i.purchase_price, 0)';

/**
 * CTE `cells` cho hai loại tồn pending — CÙNG tên, CÙNG cột với
 * [ledgerCellsSql], để mọi câu SQL đứng sau (`lines`, thẻ cửa hàng, biến thể)
 * không phải biết mình đang đọc sổ cái hay phiếu chuyển. Ba cột theo KỲ luôn
 * là 0: phiếu đang đi không có đầu kỳ, nhập kỳ, xuất kỳ.
 */
export function pendingCellsSql(params: {
  kind: Exclude<MobileInventoryKind, MobileInventoryKind.ON_HAND>;
  branchesParam: string;
  itemIdsParam?: string;
  withPeriod: boolean;
  /**
   * Tham số mà nhánh này KHÔNG dùng (`asOf`, `monthStart`) nhưng người gọi đã
   * bind. Postgres từ chối một câu lệnh có tham số không được tham chiếu
   * ("could not determine data type of parameter"), nên chúng được nhắc tới
   * bằng một mệnh đề luôn đúng — rẻ hơn là bắt mọi người gọi rẽ nhánh cách
   * bind theo `kind`.
   */
  unusedParams: string[];
}): string {
  const { withPeriod, unusedParams, ...scope } = params;
  const branchColumn = pendingBranchColumn(scope.kind);
  const periodColumns = withPeriod
    ? `,
        0::float                                AS opening_qty,
        0::float                                AS period_in,
        0::float                                AS period_out`
    : '';
  const touchUnused = unusedParams
    .map((param) => `
        AND ${param}::text IS NOT NULL`)
    .join('');

  return `cells AS (
      SELECT
        l.item_id,
        ${branchColumn}::uuid                    AS branch_id,
        st.id                                   AS storage_id,
        SUM(l.requested_qty)::float             AS qty,
        SUM(${PENDING_LINE_VALUE_SQL})::float   AS value${periodColumns}
      ${pendingScopeSql(scope)}${touchUnused}
      GROUP BY l.item_id, ${branchColumn}, st.id
    )`;
}

/**
 * Điểm rẽ DUY NHẤT theo loại tồn: `on_hand` đọc sổ cái, hai loại kia đọc phiếu
 * chuyển. Người gọi bind `asOf`/`monthStart` như nhau ở mọi nhánh — pending
 * không dùng chúng, nhưng giữ số tham số ổn định thì câu SQL và spec không
 * phải rẽ theo.
 */
export function cellsSql(params: {
  kind: MobileInventoryKind;
  asOfParam: string;
  branchesParam: string;
  itemIdsParam?: string;
  monthStartParam?: string;
}): string {
  const { kind, asOfParam, branchesParam, itemIdsParam, monthStartParam } =
    params;

  if (kind === MobileInventoryKind.ON_HAND) {
    return ledgerCellsSql({
      asOfParam,
      branchesParam,
      itemIdsParam,
      monthStartParam,
    });
  }

  return pendingCellsSql({
    kind,
    branchesParam,
    itemIdsParam,
    withPeriod: monthStartParam !== undefined,
    unusedParams: [asOfParam, ...(monthStartParam ? [monthStartParam] : [])],
  });
}

/** Hôm nay theo UTC của server — cùng giới hạn múi giờ với `to` của hoá đơn. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Đầu tháng của một ngày `YYYY-MM-DD` — mốc ĐẦU của kỳ nhập-xuất. */
export function monthStartOf(asOf: string): string {
  return `${asOf.slice(0, 8)}01`;
}
