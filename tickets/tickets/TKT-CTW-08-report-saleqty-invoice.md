# TKT-CTW-08 (tùy chọn) Report kho tạm: điền saleQty/invoice từ liên kết hóa đơn

## Epic

[EPIC-25062026 Checkout ↔ Kho tạm](../epics/EPIC-25062026-checkout-temp-warehouse-fulfillment.md)

## Summary

**Tùy chọn — có thể bỏ nếu không cần.** Report `temporaryWarehouseOutGoods` hiện luôn trả `saleQty=0`/`invoice=''` vì trước đây không có liên kết temp-warehouse ↔ hóa đơn. Sau CTW-01/04, dòng TRANSFERRED-by-sale đã có `invoiceId`/`invoiceNumber` → có thể điền 2 cột này.

## Deliverables

- `apps/api/src/modules/inventory-reports/services/temp-warehouse-report.service.ts` — bổ sung vào CTE: `saleQty` = số lượng dòng TRANSFERRED-by-sale (có `invoiceId`), `invoice` = `invoice_number`. Cập nhật comment "Giới hạn đã biết" (bỏ ghi chú không có nguồn dữ liệu).
- Cập nhật mapping response nếu cần (`TempWarehouseIssueRow.saleQty/invoice`).

## Acceptance Criteria

- [ ] Dòng đã sale: `saleQty` > 0 và `invoice` = số hóa đơn; dòng chưa sale giữ `saleQty=0`/`invoice=''`.
- [ ] Không đổi các cột/ngữ nghĩa khác của report (outQty/returnQty/remainingQty/status giữ nguyên).
- [ ] Scope org + filter sẵn có (preset/branch/category/location/search/paging) không đổi.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + lint pass; spec phủ saleQty/invoice cho dòng có và không có `invoiceId`.
- [ ] No Vietnamese trong source backend (chuỗi report là dữ liệu, không phải log/error).
- [ ] Theo lưu ý aggregate: ưu tiên tính trên rows đã fetch nếu phù hợp; nếu mở rộng CTE thì giữ tối thiểu.

## Tech Approach

- Join/aggregate `invoice_id`/`invoice_number` của dòng TRANSFERRED-by-sale vào nhánh issue của CTE; map sang `saleQty`/`invoice`.

## Testing Strategy

- Unit/integration cho report service: seed phiên + dòng (có & không có invoiceId); assert 2 cột.

## Dependencies

- Depends on: TKT-CTW-04.
- Blocks: — (tùy chọn, không chặn epic).
