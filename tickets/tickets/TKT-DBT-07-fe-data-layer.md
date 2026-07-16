# TKT-DBT-07 FE data layer + backendSource "debt" wiring

## Epic

[EPIC-15072026 Báo cáo công nợ (Debt Reports)](../epics/EPIC-15072026-debt-reports.md)

## Summary

Thêm `"debt"` làm giá trị thứ 3 của `ReportBackendSource` (hiện chỉ có
`"invoice"`/`"inventory"`) và implement branch tương ứng ở **4 chỗ hardcode**
(đã xác nhận khi implement TKT-DBT-01 — điểm thứ 4 phát hiện thêm ngoài 3 điểm
khảo sát ban đầu):
`_api/report-data-source.ts`, `_api/report-filter-options.api.ts`,
`_api/report-template.api.ts`, và
**`pages/chain-store/reports/ReportTableConfigSync/ReportTableConfigSync.tsx`**
(dòng gọi `backendSource === "inventory" ? fetchInventoryReportColumns :
fetchReportColumns` — nếu không sửa, báo cáo công nợ sẽ vô tình gọi nhầm
`/reports/invoices/columns`). Viết API wrapper mới `api/debt-reports.ts` theo
mẫu `api/inventory-reports.ts`.

**Quan trọng**: `ReportTableConfigSync` ưu tiên cột từ backend
(`GET /reports/debts/columns`), chỉ fallback sang FE registry
(`getReportTableConfig`) khi BE trả rỗng. Vì vậy 4 report definition ở
TKT-DBT-02..05 phải trả `buildColumns()` đầy đủ (VI label, `filterKind`,
`pinned`, `align`, `width`, `link`, `group`) — không phải cột tối giản; registry
FE ở TKT-DBT-09 chỉ là lưới an toàn dự phòng.

## Deliverables

- `apps/backoffice-web/src/constants/reports/report.interface.ts` — mở rộng
  `ReportBackendSource` thành `"invoice" | "inventory" | "debt"`.
- `apps/backoffice-web/src/api/debt-reports.ts` (mới) — theo đúng cấu trúc
  `inventory-reports.ts`: filter types, row types theo 4 báo cáo, response
  envelope `{ rows, totals, total }`, wrapper functions qua `erpApi`/
  `requireErpData` cho 4 endpoint `columns`/`search`/`filter-options`/`templates`.
- `apps/backoffice-web/src/pages/chain-store/reports/_api/report-data-source.ts` —
  thêm `debtDataFetcher` (import từ `api/debt-reports.ts`), thêm nhánh
  `"debt" → debtDataFetcher` trong `getReportDataFetcher()`.
- `apps/backoffice-web/src/pages/chain-store/reports/_api/report-filter-options.api.ts` —
  thêm entry `"debt"` vào `OPTIONS_PATH` (trỏ `/reports/debts/filter-options`).
- `apps/backoffice-web/src/pages/chain-store/reports/_api/report-template.api.ts` —
  thêm entry `"debt"` vào `TEMPLATES_PATH` (trỏ `/reports/debts/templates`).
- `apps/backoffice-web/src/pages/chain-store/reports/ReportTableConfigSync/ReportTableConfigSync.tsx` —
  sửa ternary 2 nhánh thành switch 3 nhánh, thêm `fetchDebtReportColumns` (từ
  `api/debt-reports.ts`) cho `backendSource === "debt"`.

## Acceptance Criteria

- [ ] `getReportBackendSource(reportType)` trả `"debt"` khi metadata khai báo vậy
      (chưa cần wire thật ở ticket này — TKT-DBT-09 sẽ set `backendSource: "debt"`
      cho 4 report type); code compile & type-check pass với giá trị mới.
- [ ] `debtDataFetcher` gọi đúng `api/debt-reports.ts`, map filter UI → query params
      giống cách `inventoryDataFetcher` làm (xem `apiFilters.ts` pattern nếu có
      tương đương ở thư mục reports chain-store).
- [ ] Không phá vỡ hành vi hiện tại của `"invoice"`/`"inventory"` (regression check
      thủ công: mở lại 1 báo cáo sales, 1 báo cáo kho, xác nhận vẫn chạy đúng).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` (hoặc tương đương type-check) pass.
- [ ] Test thủ công trong preview: gọi `debtDataFetcher` với dữ liệu giả (mock hoặc
      trỏ tạm vào endpoint thật từ TKT-DBT-06) trả về đúng shape.

## Tech Approach

```ts
// report.interface.ts
export type ReportBackendSource = "invoice" | "inventory" | "debt";
```

```ts
// _api/report-data-source.ts
export function getReportDataFetcher(reportType: string): ReportDataFetcher | undefined {
  if (!getReportBackendKey(reportType)) return undefined;
  const source = getReportBackendSource(reportType);
  if (source === "inventory") return inventoryDataFetcher;
  if (source === "debt") return debtDataFetcher;
  return invoiceDataFetcher;
}
```

`api/debt-reports.ts` theo khung đã khảo sát từ `inventory-reports.ts`:

```ts
export interface DebtReportFilters {
  reportPeriod?: string;
  fromDate?: string;
  toDate?: string;
  branchId?: string;
  customerId?: string;
  supplierId?: string;
  customerGroupId?: string;
  supplierGroupId?: string;
  groupBy?: "item" | "productTemplate";
  page?: number;
  pageSize?: number;
}

export async function searchDebtReport(reportType: string, filters: DebtReportFilters) {
  return requireErpData(
    await erpApi.POST("/reports/debts/search", { body: { reportType, ...buildBaseQuery(filters) } }),
  );
}
```

## Testing Strategy

- Không cần unit test riêng cho wrapper mỏng — verify qua build/type-check + test
  thủ công trong preview (không viết test giả cho code chỉ forward request).

## Dependencies

- Depends on: TKT-DBT-06.
- Blocks: TKT-DBT-08.
