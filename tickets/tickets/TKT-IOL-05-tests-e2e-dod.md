# TKT-IOL-05 Tests + E2E + DoD gate

## Epic

[EPIC-14062026 Bảng kê hóa đơn và đơn hàng](../epics/EPIC-14062026-invoice-order-listing-report.md)

## Summary

Khóa chất lượng end-to-end: e2e round-trip cho report type `invoice-order-listing` qua các endpoint sẵn có, + đảm bảo `daily-sales-summary` không regress. Unit specs đã nằm ở TKT-IOL-02/03; ticket này gom DoD và bổ sung e2e + các case scope/permission.

## Deliverables

- `apps/api/test/e2e/...invoice-order-listing.e2e-spec.ts` (mới) — chạy trên `erp_test` (`pnpm --filter @erp/api test:e2e`).
- Bổ sung/điều chỉnh specs liên quan nếu thiếu coverage (columns validation, status filter, totals).

## Acceptance Criteria (E2E)

- [ ] `GET /reports/invoices/types` → chứa `{ key: 'invoice-order-listing', name: 'Bảng kê hóa đơn và đơn hàng' }` (và vẫn có `daily-sales-summary`).
- [ ] `GET /reports/invoices/columns?reportType=invoice-order-listing` → `headers` chứa cột nền (date/time/invoiceCode/status), 3 band (`revenue`/`customerPayment`/`platform`), cột placeholder (revenue.fee, platform.*, salesChannel, payment.bankAccount), và cột động `payment.method.<id>` cho payment-account đã seed.
- [ ] `POST /reports/invoices/search` `{ reportType:'invoice-order-listing', columns:['date','time','invoiceCode','status','revenue.total','payment.cash','platform.fee','customer'], filters:{ issuedAt:{from,to} }, page,limit }` → `dataRaw` = **một dòng / một hóa đơn** (đúng số hóa đơn `status != cancelled` trong khoảng); `platform.fee` = 0, `customer` = tên KH inline; `totals` cộng cột tiền.
- [ ] Thiếu `filters.issuedAt` → **400**; `columns` chứa key lạ hoặc `payment.method.<uuid-không-thuộc-org>` → **400**.
- [ ] Hóa đơn `status = cancelled` **không** xuất hiện trong `dataRaw`.
- [ ] `columnFilters: [{ col:'revenue.total', gte: X }]` → chỉ trả hóa đơn thỏa; `totals` tính lại trên tập đã lọc.
- [ ] Scope: actor không có `reporting.invoice.consolidated.read` + truyền `branchId` khác → **403**; có quyền + bỏ trống `branchId` → gộp toàn chuỗi.
- [ ] Template: `POST /reports/invoices/templates { reportType:'invoice-order-listing', columns, filters }` → `GET /reports/invoices/templates?reportType=invoice-order-listing` trả lại; load → search dựng đúng.
- [ ] Tenant isolation: actor org A không thấy hóa đơn/payment-account org B.

## Definition of Done (gate toàn epic)

- [ ] `pnpm --filter @erp/api test` xanh (unit: columns + aggregator + report; daily-sales **không regress**).
- [ ] `pnpm --filter @erp/api test:e2e` xanh (đọc output thật, không tin "suite failed" giả do teardown Kafka — memory `project_e2e_test_db_setup`).
- [ ] `pnpm --filter @erp/api lint` xanh.
- [ ] Không schema change (không migration); `synchronize` false.
- [ ] `openapi:generate` đã chạy; snapshot/schema commit nếu có diff (kỳ vọng none).
- [ ] Không tiếng Việt trong source backend (errors/comments/Swagger/logs); nhãn VI chỉ ở `shared-interfaces`.
- [ ] Không TODO/FIXME ngoài kế hoạch; cột placeholder có comment chỉ rõ "awaiting backing data (future epic)".

## Testing Strategy

- E2E seed: org + branch + payment-account(s) + vài hóa đơn (gồm 1 `cancelled`, 1 có payment cash, 1 debt) → assert mapping cell + loại cancelled + totals + 400/403 cases.
- Unit (đã ở TKT-IOL-02/03): chạy gộp ở gate này.

## Dependencies

- Depends on: TKT-IOL-02, TKT-IOL-04
- Blocks: —
