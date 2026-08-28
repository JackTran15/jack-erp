import type {
  InvoiceReportTemplateView,
  ReportTemplateColumn,
  TemplateScope,
} from "@erp/shared-interfaces";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../../../lib/erp-api";
import {
  getReportBackendKey,
  getReportBackendSource,
} from "../../../../constants/reports/report-type.constant";
import { STORE_TYPE } from "../../../../constants/store.constant";
import { useBranchStore } from "../../../../store/common/branch/branch.store";
import { useReportStore } from "../../../../store/page-stores/report/report.context";

type TemplateSource = "invoice" | "inventory" | "debt" | "profit";

const TEMPLATES_PATH: Record<
  TemplateSource,
  | "/reports/invoices/templates"
  | "/reports/inventory/templates"
  | "/reports/debts/templates"
  | "/reports/profit/templates"
> = {
  invoice: "/reports/invoices/templates",
  inventory: "/reports/inventory/templates",
  debt: "/reports/debts/templates",
  profit: "/reports/profit/templates",
};

// Tên template ngầm định (v1: 1 template / reportType, chưa có UI đặt tên).
const DEFAULT_TEMPLATE_NAME = "Mặc định";

export async function listReportTemplates(
  source: TemplateSource,
  reportType: string,
  scope: TemplateScope,
): Promise<InvoiceReportTemplateView[]> {
  return requireErpData(
    await erpApi.GET<InvoiceReportTemplateView[]>(TEMPLATES_PATH[source], {
      params: { query: { reportType, scope } },
    }),
  );
}

async function createReportTemplate(
  source: TemplateSource,
  reportType: string,
  columns: ReportTemplateColumn[],
  scope: TemplateScope,
): Promise<InvoiceReportTemplateView> {
  return requireErpData(
    await erpApi.POST<InvoiceReportTemplateView>(TEMPLATES_PATH[source], {
      body: {
        reportType,
        name: DEFAULT_TEMPLATE_NAME,
        columns,
        scope,
      } as unknown as Record<string, unknown>,
    }),
  );
}

async function updateReportTemplate(
  source: TemplateSource,
  id: string,
  columns: ReportTemplateColumn[],
  scope: TemplateScope,
): Promise<InvoiceReportTemplateView> {
  return requireErpData(
    await erpApi.PATCH<InvoiceReportTemplateView>(
      `${TEMPLATES_PATH[source]}/{id}` as never,
      {
        params: { path: { id } },
        body: { columns, scope } as unknown as Record<string, unknown>,
      } as never,
    ),
  );
}

/**
 * Template "Hiển thị cột" của report đang mở (v1: template ngầm định đầu tiên
 * theo reportType).
 *
 * Bật cho báo cáo kho + báo cáo bán hàng. Chưa bật cho `debt`/`profit`: bộ cột
 * của hai nguồn đó đổi theo filter "Thống kê theo", trong khi backend dựng
 * catalog để kiểm tra template bằng `buildColumns(actor)` không kèm filter —
 * lưu ở grain khác grain mặc định sẽ bị từ chối "Unknown report columns".
 */
const TEMPLATE_SOURCES: TemplateSource[] = ["inventory", "invoice"];

export function useReportColumnTemplate() {
  const reportType = useReportStore((s) => s.reportType);
  const source = getReportBackendSource(reportType);
  const backendKey = getReportBackendKey(reportType);
  const enabled = TEMPLATE_SOURCES.includes(source) && Boolean(backendKey);

  // Tầng lưu: bản riêng của chi nhánh, hay bản dùng chung cả chuỗi. Backend
  // không tự suy ra được — `api-axios` vẫn đính `X-Branch-Id` kể cả khi đang
  // xem theo chuỗi — nên FE phải khai tường minh.
  //
  // Lấy từ report store chứ không gọi `useIsChainSelected()` lần nữa:
  // `ReportPage` đã suy `branch` TỪ selector đó rồi bơm vào store, nên giá trị
  // này luôn khớp thứ người dùng đang nhìn — kể cả khi `canViewChain()` hạ
  // `isChain` thô trong localStorage xuống.
  const view = useReportStore((s) => s.branch);
  const scope: TemplateScope = view === STORE_TYPE.CHAIN ? "chain" : "branch";
  // Đổi chi nhánh có `window.location.reload()` nên cache rụng sạch, nhưng
  // `setView()` (chuỗi ↔ chi nhánh) thì không — khoá cache phải tự phân biệt.
  const branchId = useBranchStore((s) => s.branchId);

  const query = useQuery({
    queryKey: ["report-templates", source, backendKey, scope, branchId],
    queryFn: () => listReportTemplates(source, backendKey as string, scope),
    enabled,
    staleTime: 60_000,
  });

  const template = query.data?.[0] ?? null;

  const queryClient = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: async (columns: ReportTemplateColumn[]) =>
      template
        ? updateReportTemplate(source, template.id, columns, scope)
        : createReportTemplate(source, backendKey as string, columns, scope),
    onSuccess: () => {
      // Bắt buộc: khi chi nhánh đang kế thừa bản chuỗi, PATCH tách ra một bản
      // mới và trả về **id khác** id vừa gửi lên. Nạp lại danh sách là cách duy
      // nhất để `template.id` trỏ đúng bản của chi nhánh ở lần lưu kế tiếp —
      // thiếu bước này, lần lưu sau lại tách thêm một bản nữa.
      void queryClient.invalidateQueries({
        queryKey: ["report-templates", source, backendKey, scope, branchId],
      });
    },
  });

  return { enabled, template, isLoading: query.isLoading, saveMutation };
}

/** Trạng thái cột (order/visibility/pinning) từ template records ∪ catalog. */
export function mergeTemplateColumnsState(
  records: ReportTemplateColumn[],
  catalogCols: string[],
): {
  order: string[];
  visibility: Record<string, boolean>;
  pinning: { left: string[]; right: string[] };
} {
  const catalog = new Set(catalogCols);
  const sorted = [...records]
    .sort((a, b) => a.order - b.order)
    .filter((r) => catalog.has(r.col));
  const inTemplate = new Set(sorted.map((r) => r.col));
  // Cột mới trong catalog chưa có trong template → append, hiển thị mặc định.
  const appended = catalogCols.filter((c) => !inTemplate.has(c));

  const order = [...sorted.map((r) => r.col), ...appended];
  const visibility: Record<string, boolean> = {};
  for (const r of sorted) visibility[r.col] = r.visible;
  for (const c of appended) visibility[c] = true;
  const left = sorted.filter((r) => r.frozen).map((r) => r.col);
  return { order, visibility, pinning: { left, right: [] } };
}
