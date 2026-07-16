import type {
  InvoiceReportTemplateView,
  ReportTemplateColumn,
} from "@erp/shared-interfaces";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../../../lib/erp-api";
import {
  getReportBackendKey,
  getReportBackendSource,
} from "../../../../constants/reports/report-type.constant";
import { useReportStore } from "../../../../store/page-stores/report/report.context";

type TemplateSource = "invoice" | "inventory" | "debt";

const TEMPLATES_PATH: Record<
  TemplateSource,
  "/reports/invoices/templates" | "/reports/inventory/templates" | "/reports/debts/templates"
> = {
  invoice: "/reports/invoices/templates",
  inventory: "/reports/inventory/templates",
  debt: "/reports/debts/templates",
};

// Tên template ngầm định (v1: 1 template / reportType, chưa có UI đặt tên).
const DEFAULT_TEMPLATE_NAME = "Mặc định";

export async function listReportTemplates(
  source: TemplateSource,
  reportType: string,
): Promise<InvoiceReportTemplateView[]> {
  return requireErpData(
    await erpApi.GET<InvoiceReportTemplateView[]>(TEMPLATES_PATH[source], {
      params: { query: { reportType } },
    }),
  );
}

async function createReportTemplate(
  source: TemplateSource,
  reportType: string,
  columns: ReportTemplateColumn[],
): Promise<InvoiceReportTemplateView> {
  return requireErpData(
    await erpApi.POST<InvoiceReportTemplateView>(TEMPLATES_PATH[source], {
      body: {
        reportType,
        name: DEFAULT_TEMPLATE_NAME,
        columns,
      } as unknown as Record<string, unknown>,
    }),
  );
}

async function updateReportTemplate(
  source: TemplateSource,
  id: string,
  columns: ReportTemplateColumn[],
): Promise<InvoiceReportTemplateView> {
  return requireErpData(
    await erpApi.PATCH<InvoiceReportTemplateView>(
      `${TEMPLATES_PATH[source]}/{id}` as never,
      {
        params: { path: { id } },
        body: { columns } as unknown as Record<string, unknown>,
      } as never,
    ),
  );
}

/**
 * Template "Hiển thị cột" của report đang mở (v1: template ngầm định đầu tiên
 * theo reportType). Hiện chỉ bật cho báo cáo kho (backendSource inventory) —
 * báo cáo bán hàng adopt sau.
 */
export function useReportColumnTemplate() {
  const reportType = useReportStore((s) => s.reportType);
  const source = getReportBackendSource(reportType);
  const backendKey = getReportBackendKey(reportType);
  const enabled = source === "inventory" && Boolean(backendKey);

  const query = useQuery({
    queryKey: ["report-templates", source, backendKey],
    queryFn: () => listReportTemplates(source, backendKey as string),
    enabled,
    staleTime: 60_000,
  });

  const template = query.data?.[0] ?? null;

  const queryClient = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: async (columns: ReportTemplateColumn[]) =>
      template
        ? updateReportTemplate(source, template.id, columns)
        : createReportTemplate(source, backendKey as string, columns),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["report-templates", source, backendKey],
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
