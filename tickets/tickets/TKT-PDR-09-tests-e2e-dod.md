# TKT-PDR-09 Tests + E2E + verify + DoD

## Epic

[EPIC-27072026 Báo cáo theo ngày (POS Daily Report)](../epics/EPIC-27072026-pos-daily-report.md)

## Summary

Kiểm thử end-to-end toàn feature: unit BE, e2e round-trip endpoint, verify FE trên app thật (2 tab, filter, custom range, in/xuất), no-regress report cũ.

## Deliverables

- Unit BE: `get-pos-daily-summary.handler.spec.ts` (Thu/Chi/Công nợ/Hàng/KHÁC + sign + branch/org scope + cashier/salesperson filter); cập nhật `revenue-by-item.aggregator.spec.ts`/`report.spec.ts` cho `unitPrice`.
- E2E BE: `pnpm --filter @erp/api test:e2e` — seed invoices SALE/RETURN/EXCHANGE + payments + 1 debt + 1 debt-payment + 1 cash_payment (gồm refund); assert response `POST /reports/pos/daily-summary` khớp SQL thủ công.
- Verify FE (browser preview): `/daily-report` — 2 tab, filter Thu ngân/NVBH áp cả 2 tab, custom range đổi cả 2 tab, TAB 2 có cột Đơn giá + phân trang + dòng tổng, BÀN GIAO TIỀN không network write, In/Xuất tab Tổng hợp đúng layout/file mẫu (TAB 2 không In/Xuất).
- Checklist QA thủ công.

## Acceptance Criteria

- [ ] `pnpm --filter @erp/api test` + `test:e2e` + `lint` xanh.
- [ ] `pnpm --filter @erp/pos-web build` xanh.
- [ ] No-regress: 4 report type cũ + `daily-sales-summary` không đổi hành vi.
- [ ] Số liệu 5 nhóm đối chiếu khớp SQL trên data seed; scope không leak org/branch khác.
- [ ] In/Xuất khớp file mẫu; BÀN GIAO TIỀN FE-only.

## Definition of Done

- [ ] Tất cả spec pass; snapshot api-client committed (từ PDR-04).
- [ ] No Vietnamese trong source BE; FE strings tiếng Việt.
- [ ] Không TODO/FIXME ngoài các chỗ KHÁC counts (promoCodeCount/cardReceiptCount) đã ghi chú.

## Testing Strategy

- Unit + e2e chạy trên `erp_test`. Verify FE bằng `mcp` browser preview (network panel đối chiếu request/response). Đối chiếu số bằng query SQL trực tiếp (Adminer :18088).

## Dependencies

- Depends on: TKT-PDR-08 (và toàn bộ chuỗi PDR-01..08)
- Blocks: —
