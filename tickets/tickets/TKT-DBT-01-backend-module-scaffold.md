# TKT-DBT-01 Backend module scaffold + DebtPeriodService

## Epic

[EPIC-15072026 Báo cáo công nợ (Debt Reports)](../epics/EPIC-15072026-debt-reports.md)

## Summary

Tạo module `apps/api/src/modules/reporting/debt-report/` theo đúng cấu trúc của
`apps/api/src/modules/reporting/invoice-report/` (dùng chung
`reporting/report-core/`), cùng service dùng chung `DebtPeriodService` tính sổ
công nợ theo kỳ (đầu kỳ/tăng/giảm/cuối kỳ) — dùng cho cả báo cáo #1 (khách hàng)
và #3 (nhà cung cấp). Đây là ticket nền tảng, không có endpoint thật nào công khai
ở ticket này (4 report definition thật nằm ở TKT-DBT-02..05).

## Deliverables

- `apps/api/src/modules/reporting/debt-report/debt-report.module.ts` — đăng ký ở
  `app.module.ts`, import `CqrsModule` (theo pattern `invoice-report.module.ts`).
- `apps/api/src/modules/reporting/debt-report/debt-report.controller.ts` — 4 route
  chung (`GET /reports/debts/columns`, `POST /reports/debts/search`,
  `GET /reports/debts/filter-options`, `GET/POST/PATCH/DELETE /reports/debts/templates[/:id]`),
  dispatch theo `reportType` qua `DebtReportRegistry` (mirror
  `InvoiceReportRegistry`/`InventoryReportRegistry`).
- `apps/api/src/modules/reporting/debt-report/report/debt-report-definition.ts` —
  `DebtReportRegistry` implement `ReportRegistry<TDef>` từ `report-core/`.
- `apps/api/src/modules/reporting/debt-report/services/debt-period.service.ts` —
  `DebtPeriodService`:
  - Input: `{ organizationId, branchIds?, fromDate, toDate, groupByEntityId: "customer" | "supplier" }`.
  - CTE 3 phần (mirror cấu trúc `stock-period.service.ts`):
    1. `opening` — tổng `originalAmount` (increase source) trừ tổng `amount`
       (payment source) của mọi giao dịch **trước** `fromDate`, group theo
       customer/supplier.
    2. `movement` — tổng `originalAmount` phát sinh trong `[fromDate, toDate]`
       (increase) và tổng `amount` thanh toán trong khoảng đó (decrease).
    3. `closing = opening + movement.increase - movement.decrease`.
  - Tham số hoá nguồn dữ liệu qua 1 interface `DebtLedgerSource`:
    ```ts
    interface DebtLedgerSource {
      increaseTable: 'invoice_debts' | 'supplier_debts';
      decreaseTable: 'debt_payments' | 'supplier_debt_payments';
      partyIdColumn: 'customer_id' | 'supplier_id';
    }
    ```
    → TKT-DBT-02 gọi với `invoice_debts`/`debt_payments`, TKT-DBT-04 gọi với
    `supplier_debts`/`supplier_debt_payments`. Không tham chiếu `ReceivableEntity`
    ở service này (xem TKT-DBT-02 — cách gộp `InvoiceDebtEntity` + `ReceivableEntity`
    xử lý riêng ở report definition #1, không phải trong `DebtPeriodService` dùng
    chung).
- `apps/api/src/modules/rbac/permissions.seed.ts` — thêm permission
  `reporting.debts.read` (theo mẫu `inventory.reports.read`).

## Acceptance Criteria

- [ ] Mọi query trong `DebtPeriodService` filter theo `organizationId`; nhận
      `branchIds?: string[]` optional để hỗ trợ filter phụ "Cửa hàng" (TKT-DBT-04),
      không branch-scope khi không truyền (TKT-DBT-02/03 dùng không truyền —
      luôn gộp toàn tổ chức).
- [ ] `DebtReportController` áp `@UseGuards(AuthGuard, PermissionGuard)` +
      `@RequirePermission("reporting.debts.read")`; **không** `@RequireBranchScope()`
      ở class level (báo cáo cross-branch theo thiết kế).
- [ ] Controller/registry compile được dù chưa có report definition thật (test
      bằng 1 definition rỗng/stub nếu cần) — TKT-DBT-02..05 chỉ cần "cắm" định
      nghĩa mới vào registry, không sửa controller.
- [ ] Permission `reporting.debts.read` xuất hiện trong seed, gán được cho role
      admin qua `pnpm seed:sync-admin-permissions`.

## Definition of Done

- [ ] PR passes `pnpm --filter @erp/api test` và `pnpm --filter @erp/api lint`.
- [ ] `debt-period.service.spec.ts`: unit test CTE với dữ liệu giả lập — verify
      opening/increase/decrease/closing đúng công thức cho ít nhất 2 kỳ liên tiếp
      (kỳ sau kế thừa đúng "Nợ đầu kỳ" = "Nợ cuối kỳ" kỳ trước).
- [ ] Không có schema change (không migration).
- [ ] Không tiếng Việt trong code/comment/log backend.

## Tech Approach

```ts
// debt-period.service.ts (khung, không phải final)
export class DebtPeriodService {
  async getPeriodLedger(
    source: DebtLedgerSource,
    params: { organizationId: string; branchIds?: string[]; fromDate: string; toDate: string },
  ): Promise<Array<{ partyId: string; opening: number; increase: number; decrease: number; closing: number }>> {
    // CTE: opening AS (SELECT party_id, SUM(original_amount) - <matching payments before fromDate> ...)
    //      movement AS (SELECT party_id, SUM(CASE WHEN issued_at BETWEEN ... THEN original_amount END) AS increase, ...)
    // SELECT party_id, opening, increase, decrease, opening + increase - decrease AS closing
  }
}
```

Tham khảo trực tiếp cấu trúc CTE trong
`apps/api/src/modules/inventory-reports/services/stock-period.service.ts` khi
viết, giữ cùng convention đặt tên CTE.

## Testing Strategy

- Unit (`debt-period.service.spec.ts`): seed in-memory rows cho 1 party, 2 kỳ liên
  tiếp, assert đúng opening/increase/decrease/closing từng kỳ.

## Dependencies

- Depends on: không có.
- Blocks: TKT-DBT-02, TKT-DBT-03, TKT-DBT-04, TKT-DBT-05.
