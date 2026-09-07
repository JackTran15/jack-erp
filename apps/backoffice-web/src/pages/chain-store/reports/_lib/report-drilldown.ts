/**
 * Which report cells are clickable, and what a click opens.
 *
 * Pure module — no React import — so the rules stay testable the day
 * `backoffice-web` grows a test runner.
 *
 * The backend's `link` flag says only "render this blue"; it is keyed by column
 * NAME, so `date` exists on three sales reports and `itemName` on two, while a
 * click is meaningful on exactly one of each. That is why clickability lives
 * here, keyed by (backendKey, columnKey), instead of on the flag (ADR-02).
 */
import { REPORT_ROW_BRANCH_ID, REPORT_ROW_INVOICE_ID } from "@erp/shared-interfaces";
import { REPORT_FILTERS_LINE } from "../../../../constants/reports/report-filters.constant";
import { REPORT_TYPE_INVENTORY, REPORT_TYPE_SALES } from "../../../../constants/reports/report-type.constant";
import type {
  InvoiceDetailTarget,
  ReportDrillDown,
  ReportFilterValues,
} from "../../../../store/page-stores/report/report.interface";
import type { ReportRow } from "../_api/invoice-report.api";

export type DrillDownAction =
  | { kind: "invoiceDetail"; target: InvoiceDetailTarget }
  | { kind: "report"; drillDown: ReportDrillDown };

export interface DrillDownContext {
  /** Tên chi nhánh neo của dialog đang mở, nếu có. */
  anchorName?: string;
  /** Giá trị ô — `undefined` khi dòng không có khoá cột đó. */
  raw: ReportRow[string] | undefined;
  row: ReportRow;
  filters: Partial<ReportFilterValues>;
}

/** `null` = this cell is not clickable in this state. */
type DrillDownResolver = (ctx: DrillDownContext) => DrillDownAction | null;

const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
};

// Ô ngày của báo cáo đến từ `toBusinessDate` nên luôn là YYYY-MM-DD.
const isoDate = (value: unknown): string | null => {
  const s = text(value);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const formatVnDate = (iso: string): string => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const invoiceDetail: DrillDownResolver = ({ raw, row }) => {
  const code = text(raw);
  if (!code) return null;
  return {
    kind: "invoiceDetail",
    target: { code, id: text(row[REPORT_ROW_INVOICE_ID]) },
  };
};

/**
 * "Bảng kê hóa đơn" của một ngày.
 *
 * Kế thừa filter bằng allow-list tường minh, không spread: báo cáo đích không
 * nhận `statistic_by_brand`, nhưng `invoiceFilterSummary` phía backend vẫn in nó
 * lên phụ đề file xuất khẩu — lọt sang là in ra một dòng sai.
 *
 * Cố tình KHÔNG set `stat_date_type`: `daily-sales-summary` gộp cứng theo
 * `issuedAt` còn `invoice-order-listing` thì tôn trọng filter này. Để trống thì
 * cả hai dùng cùng một cột ngày, nên dòng tổng của dialog khớp dòng vừa click.
 */
const invoiceListingForDay: DrillDownResolver = ({ raw, filters }) => {
  const day = isoDate(raw);
  if (!day) return null;

  return {
    kind: "report",
    drillDown: {
      reportType: REPORT_TYPE_SALES.INVOICE_AND_ORDER_LIST,
      title: "BẢNG KÊ HÓA ĐƠN",
      subtitle: `Ngày ${formatVnDate(day)}`,
      filters: {
        [REPORT_FILTERS_LINE.STORE]: filters[REPORT_FILTERS_LINE.STORE],
        [REPORT_FILTERS_LINE.REPORT_PERIOD]: "custom",
        [REPORT_FILTERS_LINE.RANGE_DATE]: { fromDate: day, toDate: day },
      },
    },
  };
};

/**
 * "Chi tiết doanh thu mặt hàng theo hoá đơn" của một SKU.
 *
 * Ba trạng thái mà drill-down sẽ cho số không khớp dòng vừa click, nên ô KHÔNG
 * phải link thay vì mở ra rồi lệch:
 *
 * - Grain không phải mặt hàng (Mẫu mã / Nhóm hàng / Nhãn hiệu): ô `sku` khi đó
 *   là mã cha hoặc rỗng, lọc theo nó sẽ bắt nhầm hoặc trượt hoàn toàn.
 * - `statistic_by_brand`: cùng lý do — `itemName` mang nhãn nhãn hiệu.
 * - `allocate_combo_revenue`: báo cáo cha chia doanh thu combo cho các thành
 *   phần, báo cáo chi tiết thì không, nên tổng trong dialog sẽ không cộng về
 *   dòng vừa click.
 *
 * Phụ đề cố ý không có phần "Mẫu mã <tên sản phẩm cha>" của MISA: dòng báo cáo
 * không mang tên sản phẩm cha và không có endpoint nào trả nó. Đã chốt bỏ.
 */
const itemRevenueDetailForSku: DrillDownResolver = ({ row, filters }) => {
  const sku = text(row["sku"]);
  if (!sku) return null;

  const statBy = filters[REPORT_FILTERS_LINE.STATISTIC_BY];
  if (statBy && statBy !== "item") return null;
  if (filters[REPORT_FILTERS_LINE.CHECKBOX_STATISTIC_BY_BRAND]) return null;
  if (filters[REPORT_FILTERS_LINE.CHECKBOX_ALLOCATE_COMBO]) return null;

  const range = filters[REPORT_FILTERS_LINE.RANGE_DATE];
  const period =
    range?.fromDate && range?.toDate
      ? ` Từ ${formatVnDate(range.fromDate)} đến ${formatVnDate(range.toDate)}`
      : "";

  return {
    kind: "report",
    drillDown: {
      reportType: REPORT_TYPE_SALES.REVENUE_DETAIL_BY_INVOICE_AND_PRODUCT,
      title: "CHI TIẾT DOANH THU MẶT HÀNG THEO HÓA ĐƠN",
      subtitle: `Mã SKU ${sku}${period}`,
      filters: {
        [REPORT_FILTERS_LINE.STORE]: filters[REPORT_FILTERS_LINE.STORE],
        [REPORT_FILTERS_LINE.REPORT_PERIOD]:
          filters[REPORT_FILTERS_LINE.REPORT_PERIOD],
        [REPORT_FILTERS_LINE.RANGE_DATE]: range,
        // Đích có hỗ trợ `categoryId`; brand / productType / statBy /
        // statisticByBrand / allocateCombo thì không, và lọt sang sẽ khiến
        // invoiceFilterSummary in một dòng phụ đề sai lên file xuất khẩu.
        [REPORT_FILTERS_LINE.PRODUCT_GROUP]:
          filters[REPORT_FILTERS_LINE.PRODUCT_GROUP],
        [REPORT_FILTERS_LINE.SKU]: sku,
      },
    },
  };
};

/**
 * "Chi tiết nhập xuất điều chuyển theo cửa hàng" của một chi nhánh (L1).
 *
 * Neo bằng `_branchId` chứ không phải tên: `branchCode` rỗng ở ít nhất một chi
 * nhánh thật, còn `branchName` không có ràng buộc duy nhất nào.
 *
 * `STORE` bị THAY THẾ chứ không kế thừa — phạm vi của dialog là đúng một chi
 * nhánh vừa click, còn filter cửa hàng của báo cáo cha có thể đang là "tất cả".
 * Kế thừa bằng allow-list tường minh, không spread: báo cáo đích không nhận mọi
 * dòng filter, và filter lọt sang sẽ được backend in lên phụ đề file xuất khẩu.
 */
/**
 * Dòng của L1 là các chi nhánh ĐỐI ỨNG, nên tên chi nhánh neo không có trên
 * dòng nào cả — nó nằm ở phụ đề của chính dialog. Không có nguồn nào khác, nên
 * phụ đề của L2 gọi nó là "cửa hàng đang xem" thay vì bịa một cái tên.
 */
const ANCHOR_LABEL = "cửa hàng đang xem";   // chỉ dùng khi neo tới đây bằng đường khác

const transferByCounterpart: DrillDownResolver = ({ row, filters }) => {
  const branchId = text(row[REPORT_ROW_BRANCH_ID]);
  const branchName = text(row["branchName"]);
  if (!branchId) return null;

  const range = filters[REPORT_FILTERS_LINE.RANGE_DATE];
  const period =
    range?.fromDate && range?.toDate
      ? ` Từ ${formatVnDate(range.fromDate)} đến ${formatVnDate(range.toDate)}`
      : "";

  return {
    kind: "report",
    drillDown: {
      reportType: REPORT_TYPE_INVENTORY.TRANSFER_DETAIL_BY_STORE,
      // Chở tên neo xuống: dòng của dialog này là các chi nhánh đối ứng, nên
      // tên chi nhánh neo không có trên dòng nào ở tầng dưới.
      anchorName: branchName || undefined,
      title: "CHI TIẾT NHẬP XUẤT ĐIỀU CHUYỂN THEO CỬA HÀNG",
      subtitle: `Cửa hàng ${branchName}${period}`,
      filters: {
        [REPORT_FILTERS_LINE.STORE]: { scope: "group", storeIds: [branchId] },
        [REPORT_FILTERS_LINE.REPORT_PERIOD]:
          filters[REPORT_FILTERS_LINE.REPORT_PERIOD],
        [REPORT_FILTERS_LINE.RANGE_DATE]: range,
      },
    },
  };
};

/**
 * L2 — "Chi tiết phiếu nhập xuất điều chuyển theo cửa hàng và chứng từ".
 *
 * Mở từ một trong ba ô số lượng của dialog L1. **Toàn bộ logic đảo chiều nằm ở
 * đây và chỉ ở đây**: backend nhận một cặp có thứ tự (`sourceStoreId` xuất,
 * `receivingStoreIds[0]` nhập) và không biết người dùng đã click cột nào.
 *
 * - cột "Nhập kho điều chuyển" ⇒ đối ứng xuất, neo nhập
 * - "Xuất" và "thực nhận"      ⇒ neo xuất, đối ứng nhập
 *
 * Neo lấy từ `STORE` của chính dialog L1 — đó là chi nhánh đã mở ra nó.
 * KHÔNG chuyển `STORE` xuống L2: cặp chi nhánh đã quyết định phạm vi, gửi kèm
 * một scope nữa là mời gọi mâu thuẫn.
 */
const transferDocs =
  (leg: "in" | "out" | "received"): DrillDownResolver =>
  ({ raw, row, filters, anchorName }) => {
    // Ô bằng 0 thì dialog sẽ rỗng — để nó là chữ thường còn hơn mở ra một bảng
    // trắng khiến người dùng nghi ngờ dữ liệu.
    if (!Number(raw)) return null;

    const counterpartId = text(row[REPORT_ROW_BRANCH_ID]);
    const counterpartName = text(row["branchName"]);
    const store = filters[REPORT_FILTERS_LINE.STORE];
    const anchorId = store?.storeIds?.[0];
    if (!counterpartId || !anchorId) return null;

    const issuerId = leg === "in" ? counterpartId : anchorId;
    const receiverId = leg === "in" ? anchorId : counterpartId;
    const anchor = anchorName ?? ANCHOR_LABEL;
    const issuerName = leg === "in" ? counterpartName : anchor;
    const receiverName = leg === "in" ? anchor : counterpartName;

    return {
      kind: "report",
      drillDown: {
        reportType: REPORT_TYPE_INVENTORY.TRANSFER_DETAIL_BY_DOCUMENT,
        title: "CHI TIẾT PHIẾU NHẬP XUẤT ĐIỀU CHUYỂN THEO CỬA HÀNG VÀ CHỨNG TỪ",
        subtitle: `Cửa hàng xuất ${issuerName}  Cửa hàng nhập ${receiverName}`,
        filters: {
          [REPORT_FILTERS_LINE.SOURCE_STORE]: issuerId,
          [REPORT_FILTERS_LINE.RECEIVING_STORE]: receiverId,
          [REPORT_FILTERS_LINE.TRANSFER_LEG]: leg,
          [REPORT_FILTERS_LINE.REPORT_PERIOD]:
            filters[REPORT_FILTERS_LINE.REPORT_PERIOD],
          [REPORT_FILTERS_LINE.RANGE_DATE]: filters[REPORT_FILTERS_LINE.RANGE_DATE],
        },
      },
    };
  };

/**
 * L3 — "Chi tiết chênh lệch điều chuyển".
 *
 * Cùng hình dạng với `transferDocs` nhưng không có biến thể đảo chiều: chênh
 * lệch luôn nói về hàng chi nhánh NEO đã xuất đi mà chưa ai xác nhận nhận, nên
 * neo luôn là nơi xuất.
 */
const transferDifferenceDetail: DrillDownResolver = ({ raw, row, filters, anchorName }) => {
  if (!Number(raw)) return null;

  const counterpartId = text(row[REPORT_ROW_BRANCH_ID]);
  const counterpartName = text(row["branchName"]);
  const anchorId = filters[REPORT_FILTERS_LINE.STORE]?.storeIds?.[0];
  if (!counterpartId || !anchorId) return null;

  return {
    kind: "report",
    drillDown: {
      reportType: REPORT_TYPE_INVENTORY.TRANSFER_DIFFERENCE_DETAIL,
      title: "CHI TIẾT CHÊNH LỆCH ĐIỀU CHUYỂN",
      subtitle: `Cửa hàng xuất ${anchorName ?? ANCHOR_LABEL}  Cửa hàng nhập ${counterpartName}`,
      filters: {
        [REPORT_FILTERS_LINE.SOURCE_STORE]: anchorId,
        [REPORT_FILTERS_LINE.RECEIVING_STORE]: counterpartId,
        [REPORT_FILTERS_LINE.TRANSFER_LEG]: "unmatched",
        [REPORT_FILTERS_LINE.REPORT_PERIOD]:
          filters[REPORT_FILTERS_LINE.REPORT_PERIOD],
        [REPORT_FILTERS_LINE.RANGE_DATE]: filters[REPORT_FILTERS_LINE.RANGE_DATE],
      },
    },
  };
};

const DRILL_DOWNS: Record<string, Record<string, DrillDownResolver>> = {
  // Giữ nguyên hành vi sẵn có: đây là hai báo cáo duy nhất có cột `invoiceCode`.
  "invoice-order-listing": { invoiceCode: invoiceDetail },
  "invoice-item-revenue-detail": { invoiceCode: invoiceDetail },
  "daily-sales-summary": { date: invoiceListingForDay },
  "revenue-by-item": { itemName: itemRevenueDetailForSku },
  // `diffQty` của báo cáo cha CỐ Ý không click được: một dòng cha gộp nhiều chi
  // nhánh đối ứng nên dialog chênh lệch sẽ không gọi tên được "cửa hàng nhập".
  // Nó mở từ tầng L1 bên dưới.
  "inventory-transfer-summary": { branchName: transferByCounterpart },
  "inventory-transfer-summary-by-counterpart": {
    inQty: transferDocs("in"),
    outQty: transferDocs("out"),
    receivedQty: transferDocs("received"),
    diffQty: transferDifferenceDetail,
  },
};

export function resolveDrillDown(
  backendKey: string | undefined,
  columnKey: string,
  ctx: DrillDownContext,
): DrillDownAction | null {
  if (!backendKey) return null;
  return DRILL_DOWNS[backendKey]?.[columnKey]?.(ctx) ?? null;
}
