# TKT-ILP-04 Tích hợp ProductSelectDialog vào Xuất kho (GoodsIssuePage)

## Epic

[EPIC-19062026 Dialog chọn hàng + gỡ trang v2](../epics/EPIC-19062026-inventory-line-product-picker.md)

## Summary

Như TKT-ILP-03 nhưng cho trang v1 **Xuất kho** (`GoodsIssuePage.tsx`, route `/inventory/goods-issues`). Icon search/dòng mở `ProductSelectDialog`; thêm N dòng; điền kho xuất theo "Chọn kho" (`ChooseWarehouseDialog` đã có); autofill vị trí; Đơn giá mặc định lấy theo **giá vốn bình quân** (`getInstantAverageCost`) — fallback `sellingPrice` nếu không có.

## Deliverables

- `apps/backoffice-web/src/pages/goods-issue/GoodsIssuePage.tsx`:
  - Cột **Mã SKU**: thêm icon search mở `ProductSelectDialog`.
  - `addLinesFromPicker`: map `SelectedLine[]` → `FormLine` (shape Xuất kho: `storageId/locationId` mỗi dòng), dedupe `itemId`, điền `storageId` từ "Chọn kho"/kho mặc định, `fillPreferredShelf`, `ensureTrailingBlankLine`.
  - Mở dialog với `showQuantityPrice`; prefill Đơn giá = `getInstantAverageCost(itemId)` (resolve sau khi thêm dòng nếu cần) hoặc `defaultUnitPriceSource="sellingPrice"`.

## Acceptance Criteria

- [ ] Icon search/dòng → dialog multi-select → thêm đúng số dòng với Số lượng/Đơn giá.
- [ ] Dedupe theo `itemId`.
- [ ] "Nhập nhanh" áp Số lượng/Đơn giá cho mọi hàng đã chọn.
- [ ] "Chọn kho" (`ChooseWarehouseDialog`) điền kho xuất cho dòng mới; vị trí autofill; gõ inline + "+" tạo nhanh vẫn chạy.
- [ ] Lưu/post dùng endpoint hiện tại; ledger GOODS_ISSUE + giá vốn không đổi.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Verify thủ công: thêm nhiều dòng → Nhập nhanh → Chọn kho → lưu + xuất kho thành công; chặn xuất quá tồn (OverstockConfirm) vẫn hoạt động.
- [ ] Không phá luồng nguồn từ phiếu điều chuyển (`SelectTransferOrderDialog`).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

- Tái dùng `addLinesFromPicker` pattern của ILP-03, đổi shape `FormLine` (Xuất kho dùng `storageId/locationId`, `quantity`/`unitPrice`).
- Prefill Đơn giá: gọi `getInstantAverageCost` cho từng `itemId` mới (như onSelect hiện tại), hoặc set `defaultUnitPriceSource` rồi cho phép sửa.

## Testing Strategy

- Verify thủ công (không unit test FE).

## Dependencies

- Depends on: TKT-ILP-02
- Blocks: TKT-ILP-06
