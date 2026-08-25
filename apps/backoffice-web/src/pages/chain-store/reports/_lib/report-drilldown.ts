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
import { REPORT_ROW_INVOICE_ID } from "@erp/shared-interfaces";
import { REPORT_FILTERS_LINE } from "../../../../constants/reports/report-filters.constant";
import { REPORT_TYPE_SALES } from "../../../../constants/reports/report-type.constant";
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

const DRILL_DOWNS: Record<string, Record<string, DrillDownResolver>> = {
  // Giữ nguyên hành vi sẵn có: đây là hai báo cáo duy nhất có cột `invoiceCode`.
  "invoice-order-listing": { invoiceCode: invoiceDetail },
  "invoice-item-revenue-detail": { invoiceCode: invoiceDetail },
  "daily-sales-summary": { date: invoiceListingForDay },
  "revenue-by-item": { itemName: itemRevenueDetailForSku },
};

export function resolveDrillDown(
  backendKey: string | undefined,
  columnKey: string,
  ctx: DrillDownContext,
): DrillDownAction | null {
  if (!backendKey) return null;
  return DRILL_DOWNS[backendKey]?.[columnKey]?.(ctx) ?? null;
}
