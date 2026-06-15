# TKT-IRB-07 FE: Data layer (hooks columns/search/template)

> **Trạng thái:** KHÔNG implement FE (theo chỉ đạo). Phần tích hợp FE (endpoints, types, hooks/query-key gợi ý, quy tắc render generic, filter mapping) được giao dưới dạng **tài liệu**: [`docs/invoice-report-fe-api-integration.md`](../../docs/invoice-report-fe-api-integration.md). Ticket này giữ làm tham chiếu thiết kế; không có code FE trong scope.

## Epic

[EPIC-11062026 Báo cáo tổng hợp bán hàng theo ngày](../epics/EPIC-11062026-invoice-report-builder.md)

## Summary

Lớp data `backoffice-web` cho feature: wrapper `erpApi`/`requireErpData` + hooks TanStack Query cho catalog cột, search báo cáo, và CRUD template — tất cả dùng type sinh từ `@erp/api-client` (sau TKT-06). Không đặt server-data vào Zustand.

## Deliverables

- `apps/backoffice-web/src/api/invoice-report.ts` — hàm:
  - `fetchInvoiceReportColumns()` → `GET /reports/invoices/columns`
  - `searchInvoiceReport(payload)` → `POST /reports/invoices/search`
  - `listInvoiceReportTemplates()` / `getInvoiceReportTemplate(id)` / `createInvoiceReportTemplate(payload)` / `updateInvoiceReportTemplate(id, payload)` / `deleteInvoiceReportTemplate(id)`
  - Dùng `requireErpData` (đọc) / `requireErpSuccess` (DELETE).
- `apps/backoffice-web/src/hooks/use-invoice-report.ts`:
  - `useInvoiceReportColumns()` — `queryKey: ['invoice-report-columns', activeBranchId]` (catalog **phụ thuộc scope** vì cột động sinh từ payment-account org/branch — không cache vô hạn theo key tĩnh).
  - `useInvoiceReportSearch(payload)` — `queryKey: ['invoice-report-search', payload]`, `enabled` khi `columns.length > 0` **và** có `filters.issuedAt` (khoảng ngày bắt buộc).
  - `useInvoiceReportTemplates()` — `queryKey: ['invoice-report-templates']`.
  - `useCreate/Update/DeleteInvoiceReportTemplate()` — mutation, `invalidateQueries(['invoice-report-templates'])` on success.
- `apps/backoffice-web/src/lib/invoice-report.ts` (hoặc trong hook) — helpers:
  - `groupHeaders(headers)` → gom `ReportColumnHeader[]` theo `group.id` thành các band (colspan) cho header 2 tầng + cột không band (`group:null`) đứng đầu.
  - `formatCell(cell)` → format `Intl` `vi-VN` theo **`cell.type`** (CURRENCY → `₫`/grouping, PERCENT → `%`, DATE/DATETIME, NUMBER, STRING). Cell đã self-describing (`{col,type,value}`) → **không cần `resolveCell`/path lookup**.

## Acceptance Criteria

- [ ] Hooks dùng type sinh từ `@erp/api-client`; không định nghĩa lại shape đã có ở `@erp/shared-interfaces`.
- [ ] `erpApi` tự gắn `Authorization`/`X-Branch-Id`/`X-Request-Id`/`X-Idempotency-Key` (không tự set tay).
- [ ] `queryKey` bắt đầu bằng tên resource + chứa **mọi** tham số ảnh hưởng kết quả (columns, filters, branchId, page); catalog key chứa branch; invalidate template theo prefix.
- [ ] Search hook không chạy khi chưa chọn cột **hoặc** chưa có khoảng ngày (`enabled`); đổi filter/cột/ngày → refetch.
- [ ] `formatCell` dùng locale `vi-VN` theo `cell.type`; CURRENCY/PERCENT/DATE đúng định dạng VN (phân biệt tiền vs % vs số thường).

## Definition of Done

- [ ] `backoffice-web` build/typecheck xanh.
- [ ] UI string (sau ở TKT-08) tiếng Việt; tên hàm/biến tiếng Anh.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
export function useInvoiceReportSearch(payload: InvoiceReportSearchPayload) {
  return useQuery({
    queryKey: ['invoice-report-search', payload],
    enabled: (payload.columns?.length ?? 0) > 0 && !!payload.filters?.issuedAt?.from,
    queryFn: () => searchInvoiceReport(payload),
    placeholderData: keepPreviousData,
  });
}

// Cell đã tự mô tả — render trực tiếp, không lookup theo path.
export function formatCell(cell: ReportCell): string {
  if (cell.value == null) return '';
  switch (cell.type) {
    case ReportColumnDataType.CURRENCY:
      return new Intl.NumberFormat('vi-VN').format(Number(cell.value)); // ảnh dùng grouping, không ký hiệu ₫
    case ReportColumnDataType.PERCENT:
      return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(Number(cell.value))}%`;
    case ReportColumnDataType.DATE:
      return new Intl.DateTimeFormat('vi-VN').format(new Date(String(cell.value)));
    default:
      return String(cell.value);
  }
}

// Header 2 tầng: gom theo group.id để dựng band colspan.
export function groupHeaders(headers: ReportColumnHeader[]) {
  return headers.reduce<Array<{ band: ReportColumnGroup | null; cols: ReportColumnHeader[] }>>((acc, h) => {
    const last = acc[acc.length - 1];
    if (last && last.band?.id === h.group?.id) last.cols.push(h);
    else acc.push({ band: h.group, cols: [h] });
    return acc;
  }, []);
}
```

> **Hai nguồn tách biệt:** `headers` lấy từ `useInvoiceReportColumns()` (API columns — toàn bộ catalog), lọc về `selectedColumns` giữ thứ tự catalog + band; `dataRaw`/`totals` lấy từ `useInvoiceReportSearch()` (API search — **không** kèm headers). Cell tự mô tả nên ghép theo thứ tự cột đã chọn là đủ; `totals` render ở footer cùng `formatCell`. `columnFilters` (per-cột, từ filter row) đưa vào `payload.columnFilters` của search.

## Testing Strategy

- Typecheck + smoke render (TKT-08). Unit nhẹ cho `formatCell`/`groupHeaders` nếu repo có test FE (web app hiện `echo "test"` → có thể bỏ, verify bằng build).

## Dependencies

- Depends on: [TKT-IRB-06](./TKT-IRB-06-be-permissions-openapi.md) (api-client snapshot), [TKT-IRB-02](./TKT-IRB-02-shared-interfaces.md).
- Blocks: [TKT-IRB-08](./TKT-IRB-08-fe-report-page.md).
