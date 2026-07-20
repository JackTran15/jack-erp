# TKT-DBT-04 Backend — Công nợ nhà cung cấp

## Epic

[EPIC-15072026 Báo cáo công nợ (Debt Reports)](../epics/EPIC-15072026-debt-reports.md)

## Summary

Report definition cho `SUPPLIER_DEBTS`: sổ công nợ nhà cung cấp theo kỳ, cấu trúc
giống hệt TKT-DBT-02 nhưng đơn giản hơn (6 cột, 1 nguồn dữ liệu duy nhất — không
gộp 2 nguồn như khách hàng vì NCC không có sổ kế toán song song). Mặc định gộp
toàn chuỗi/tổ chức, có filter phụ `branchId` để thu hẹp về 1 cửa hàng.

## Deliverables

- `apps/api/src/modules/reporting/debt-report/reports/supplier-debts.report.ts`.
- Gọi `DebtPeriodService.getPeriodLedger()` **1 lần** với nguồn
  `supplier_debts`/`supplier_debt_payments`, `partyIdColumn: 'supplier_id'`.
- Join `ProviderEntity` (code, name) — **chỉ 2 cột này**, không có nhóm/SĐT/địa chỉ
  (khác báo cáo #1). Không thêm `maxDebt`/hạn mức (quyết định chủ sản phẩm: Không).
- Filter accepted: `reportPeriod`/`fromDate`/`toDate`, `supplierGroupId` (optional,
  join `SupplierGroupEntity`), **`branchId` optional** — khi truyền, filter
  `SupplierDebtEntity`/`GoodsReceiptEntity` theo branch đó; khi không truyền, gộp
  toàn tổ chức (mặc định).
- Column catalog, đúng thứ tự đã chốt: `supplierCode`(pin, mặc định hiển thị),
  `supplierName`(pin, mặc định hiển thị), `openingDebt`, `increaseDebt`,
  `decreaseDebt`, `closingDebt` — 4 cột số **KHÔNG pin mặc định** (chỉ 2 cột đầu
  cố định theo xác nhận của chủ sản phẩm).

## Acceptance Criteria

- [ ] Không truyền `branchId` → kết quả gộp toàn tổ chức (test: seed data ở 2
      branch khác nhau của cùng NCC, verify tổng đúng cả 2).
- [ ] Truyền `branchId` → chỉ tính giao dịch của branch đó (test: cùng seed data,
      lọc theo 1 branch, verify chỉ ra đúng phần của branch đó — khớp ví dụ thật
      trong doc: NCC "ABA" tại "Chi nhánh 211 TP. Đà Nẵng" ra đúng 39.200.000).
- [ ] "Nợ cuối kỳ" = `Nợ đầu kỳ + Tăng trong kỳ - Giảm trong kỳ`, tính ở BE.
- [ ] Query filter theo `actor.organizationId`.

## Definition of Done

- [ ] `supplier-debts.report.spec.ts`: test không-branchId (gộp), có-branchId
      (thu hẹp), kỳ liên tiếp (đầu kỳ kế thừa đúng).
- [ ] `pnpm --filter @erp/api test` + `lint` pass.

## Tech Approach

```ts
export const supplierDebtsReport: ReportDefinition<SupplierDebtsFilterDto> = {
  key: 'supplier-debts',
  async search(dto, actor) {
    const ledger = await debtPeriodService.getPeriodLedger(
      { increaseTable: 'supplier_debts', decreaseTable: 'supplier_debt_payments', partyIdColumn: 'supplier_id' },
      { organizationId: actor.organizationId, branchIds: dto.branchId ? [dto.branchId] : undefined, fromDate: dto.fromDate, toDate: dto.toDate },
    );
    return this.attachProvider(ledger, dto.supplierGroupId);
  },
};
```

`DebtPeriodService.getPeriodLedger` (từ TKT-DBT-01) đã nhận `branchIds?` optional —
ticket này chỉ cần truyền đúng tham số, không cần sửa lại service dùng chung.

## Testing Strategy

- Unit: `supplier-debts.report.spec.ts`, fixture 1 NCC 2 branch, verify cả 2 case
  (gộp/thu hẹp).

## Dependencies

- Depends on: TKT-DBT-01.
- Blocks: TKT-DBT-06.
