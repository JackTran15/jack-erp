# TKT-PRF-06 FE data layer + backendSource "profit" wiring

## Epic

[EPIC-16072026 Báo cáo lợi nhuận (Profit Reports)](../epics/EPIC-16072026-profit-reports.md)

## Summary

Thêm `"profit"` làm giá trị thứ 4 của `ReportBackendSource` (hiện có
`"invoice"`/`"inventory"`/`"debt"`) và implement branch tương ứng ở **4 chỗ hardcode** —
epic debt-reports chỉ phát hiện điểm thứ 4 (`ReportTableConfigSync.tsx`) muộn trong quá
trình implement; ticket này đưa thẳng cả 4 điểm vào scope từ đầu:
`_api/report-data-source.ts`, `_api/report-filter-options.api.ts`,
`_api/report-template.api.ts`,
`ReportTableConfigSync/ReportTableConfigSync.tsx`. Viết API wrapper mới
`api/profit-reports.ts` theo mẫu `api/debt-reports.ts`.

**Quan trọng**: `ReportTableConfigSync` ưu tiên cột từ backend
(`GET /reports/profit/columns`), chỉ fallback sang FE registry khi BE trả rỗng — vì vậy 3
report definition ở TKT-PRF-02..04 phải trả `buildColumns()` đầy đủ (VI label, `filterKind`,
`pinned`, `align`, `width`, `group`); registry FE ở TKT-PRF-08 chỉ là lưới an toàn dự
phòng.

## Deliverables

- `apps/backoffice-web/src/constants/reports/report.interface.ts` — mở rộng
  `ReportBackendSource` thành `"invoice" | "inventory" | "debt" | "profit"`.
- `apps/backoffice-web/src/api/profit-reports.ts` (mới) — theo đúng cấu trúc
  `debt-reports.ts`: filter types (bao gồm `statBy` cho `profit-by-item`, `previousPeriod`/
  `currentPeriod` cho `business-results`), row types theo 3 báo cáo, response envelope
  `{ rows, totals, total }`, wrapper functions qua `erpApi`/`requireErpData` cho các
  endpoint `columns`/`search`/`filter-options`/`templates`.
- `apps/backoffice-web/src/pages/chain-store/reports/_api/report-data-source.ts` — thêm
  `profitDataFetcher` (import từ `api/profit-reports.ts`), thêm nhánh
  `"profit" → profitDataFetcher` trong `getReportDataFetcher()`.
- `apps/backoffice-web/src/pages/chain-store/reports/_api/report-filter-options.api.ts` —
  thêm entry `"profit"` vào `OPTIONS_PATH` (trỏ `/reports/profit/filter-options`).
- `apps/backoffice-web/src/pages/chain-store/reports/_api/report-template.api.ts` — thêm
  entry `"profit"` vào `TEMPLATES_PATH` (trỏ `/reports/profit/templates`).
- `apps/backoffice-web/src/pages/chain-store/reports/ReportTableConfigSync/ReportTableConfigSync.tsx`
  — thêm nhánh `backendSource === "profit"` gọi `fetchProfitReportColumns` (truyền `statBy`
  làm param bổ sung, giống cách `"debt"` truyền `groupBy`).

## Acceptance Criteria

- [ ] `getReportBackendSource(reportType)` trả `"profit"` khi metadata khai báo vậy (chưa
      cần wire thật ở ticket này — TKT-PRF-08 sẽ set `backendSource: "profit"` cho 3 report
      type); code compile & type-check pass với giá trị mới.
- [ ] `profitDataFetcher` gọi đúng `api/profit-reports.ts`, map filter UI → query params
      giống cách `debtDataFetcher` làm.
- [ ] `ReportTableConfigSync` gọi đúng `fetchProfitReportColumns(backendKey, statBy)` khi
      `backendSource === "profit"`.
- [ ] Không phá vỡ hành vi hiện tại của `"invoice"`/`"inventory"`/`"debt"` (regression check
      thủ công: mở lại 1 báo cáo sales, 1 báo cáo kho, 1 báo cáo công nợ, xác nhận vẫn chạy
      đúng).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` (hoặc tương đương type-check) pass.
- [ ] Test thủ công trong preview: gọi `profitDataFetcher` với endpoint thật từ TKT-PRF-05,
      trả về đúng shape cho cả 3 report type.

## Tech Approach

```ts
// report.interface.ts
export type ReportBackendSource = "invoice" | "inventory" | "debt" | "profit";
```

```ts
// _api/report-data-source.ts
export function getReportDataFetcher(reportType: string): ReportDataFetcher | undefined {
  if (!getReportBackendKey(reportType)) return undefined;
  const source = getReportBackendSource(reportType);
  if (source === "inventory") return inventoryDataFetcher;
  if (source === "debt") return debtDataFetcher;
  if (source === "profit") return profitDataFetcher;
  return invoiceDataFetcher;
}
```

```ts
// ReportTableConfigSync.tsx
if (backendSource === "profit") {
  return fetchProfitReportColumns(backendKey as string, statBy as ReportGroupBy | undefined);
}
```

`api/profit-reports.ts` theo khung đã khảo sát từ `api/debt-reports.ts`:

```ts
export interface ProfitReportFilters {
  reportPeriod?: string;
  fromDate?: string;
  toDate?: string;
  previousFromDate?: string; // business-results only
  previousToDate?: string;   // business-results only
  branchId?: string;
  categoryId?: string;
  statBy?: "item" | "parent" | "group"; // profit-by-item only
  page?: number;
  pageSize?: number;
}

export async function searchProfitReport(reportType: string, filters: ProfitReportFilters) {
  return requireErpData(
    await erpApi.POST("/reports/profit/search", { body: { reportType, ...buildBaseQuery(filters) } }),
  );
}
```

## Testing Strategy

- Không cần unit test riêng cho wrapper mỏng — verify qua build/type-check + test thủ công
  trong preview.

## Dependencies

- Depends on: TKT-PRF-05.
- Blocks: TKT-PRF-07.
