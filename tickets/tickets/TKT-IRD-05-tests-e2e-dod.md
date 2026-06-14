# TKT-IRD-05 Tests + E2E + DoD gate

## Epic

[EPIC-14062026 Chi tiết doanh thu theo hóa đơn và mặt hàng](../epics/EPIC-14062026-invoice-item-revenue-detail-report.md)

## Summary

Đảm bảo coverage unit + e2e round-trip cho report type thứ 3 và xác nhận 2 report type cũ không regress.

## Deliverables

- `apps/api/test/e2e/invoice-item-revenue-detail.e2e-spec.ts` (mới) — seed customer+group, employee_profile+user, items+category, provider+item_provider, 1 hóa đơn `paid` (2 dòng hàng) + 1 hóa đơn `cancelled` (1 dòng); round-trip `/types`, `/columns`, `/search`, `columnFilters`, 400.
- Unit specs (đã có ở TKT-IRD-02/03): columns, aggregator, report.

## Acceptance Criteria

- [ ] `/types` liệt kê 3 type (gồm label VI mới).
- [ ] `/columns?reportType=invoice-item-revenue-detail` trả catalog phẳng (`group: null` mọi cột), không cột `payment.method.*`.
- [ ] `/search` trả **một dòng / một dòng hàng**; dòng của hóa đơn `cancelled` bị loại; `lineAmount` = `quantity*unitPrice`; placeholder = 0/null; inline relations (itemCategory/supplier/customer/customerGroup/cashier/storeCode) đúng; `totals` tổng `quantity`/`lineAmount`/`lineRevenue`, `unitPrice`=null, `date`=null.
- [ ] `columnFilters` post-build thu hẹp đúng; thiếu `issuedAt.from` → 400; cột lạ → 400.
- [ ] `daily-sales-summary` + `invoice-order-listing` không regress.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- invoice-item-revenue invoice-report invoice-order-listing invoice-listing` xanh.
- [ ] `pnpm --filter @erp/api test:e2e -- invoice-item-revenue-detail` xanh.
- [ ] `pnpm --filter @erp/api build` xanh; OpenAPI đã regen + commit.

## Dependencies

- Depends on: TKT-IRD-02, TKT-IRD-04
