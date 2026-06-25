# TKT-CTW-09 E2E + test plan + DoD gate

## Epic

[EPIC-25062026 Checkout ↔ Kho tạm](../epics/EPIC-25062026-checkout-temp-warehouse-fulfillment.md)

## Summary

Phủ end-to-end luồng checkout ↔ kho tạm (event-driven, cross-module) trên DB `erp_test`, và chốt DoD toàn epic.

## Deliverables

- E2E (`apps/api/test/e2e/...`) cho các kịch bản:
  1. **Split:** phiên ACTIVE có dòng W2S item X qty 5 → checkout bán X qty 2 → 1 phiếu CK `kho lưu trữ→showroom` qty 2 mang `invoiceId` + mô tả đúng template; dòng X còn 1 dòng ACTIVE qty 3 + 1 dòng TRANSFERRED qty 2 (invoiceId); SALE_ISSUE showroom -2 (ledger).
  2. **Full consume:** tempQty 1, bán 3 → transfer qty 1; phần thiếu không transfer.
  3. **No session / not staged:** không phiên ACTIVE hoặc item không có dòng W2S → không phiếu CK, checkout vẫn SALE_ISSUE bình thường.
  4. **Idempotent replay:** publish lại event cùng `invoiceId` → không phiếu CK thứ hai, không tách dòng lần hai.
  5. **Lines query:** `includeTransferred=true` trả dòng TRANSFERRED-by-sale (+invoiceNumber); transfer thủ công không lọt.

## Acceptance Criteria

- [ ] 5 kịch bản trên xanh trên `erp_test`.
- [ ] Không rò rỉ cross-tenant (org/branch khác không thấy phiếu/dòng).
- [ ] Suite chạy serial (maxWorkers:1, forceExit) ổn định; đọc output thực tế (consumer Kafka treo teardown ≠ fail thật).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `test:e2e` + lint pass.
- [ ] Mọi ticket CTW-01..07 đạt DoD; openapi snapshot committed.
- [ ] Verify trực quan FE (CTW-07) khớp ảnh #4/#6.
- [ ] No Vietnamese trong source backend; không TODO/FIXME ngoài plan.

## Testing Strategy

- E2E publish event qua bus thật (hoặc gọi consumer handler trực tiếp) + assert DB (`stock_transfers`, `temp_warehouse_lines`, `stock_ledger_entries`).
- Đợi consumer xử lý: poll trạng thái dòng/transfer với timeout.

## Dependencies

- Depends on: TKT-CTW-04, TKT-CTW-05, TKT-CTW-07.
- Blocks: — (gate cuối).
