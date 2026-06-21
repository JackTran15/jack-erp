# TKT-LIG-02 Nhập kho (pilot): áp min-width tuned cho lineColumns

## Epic

[EPIC-21062026 LineItemGrid Column Min-Width + Horizontal Scroll](../epics/EPIC-21062026-line-item-grid-min-width.md)

## Summary

Pilot: áp bộ **min-width tuned theo nội dung** cho bảng CHI TIẾT của form Nhập kho (`GoodsReceiptFormDialog` trong `PurchaseOrdersPage.tsx`), dùng `minWidth` mới từ TKT-LIG-01. Sau ticket này bảng Nhập kho không còn cắt chữ ở ô search/select và scroll ngang khi cần.

## Deliverables

- `apps/backoffice-web/src/pages/purchase-orders/PurchaseOrdersPage.tsx` — trong `lineColumns: LineColumn<FormLine>[]` của `GoodsReceiptFormDialog`, thêm `minWidth` cho từng cột theo bảng dưới (giữ/đồng bộ `width` cho hợp lý ở layout rộng):

| Cột | Key (tham khảo) | minWidth (px) |
| --- | --- | --- |
| Mã SKU | sku/code | 360 |
| Tên hàng hóa | name | 280 |
| Kho | storage | 220 |
| Vị trí | location | 220 |
| Đơn vị tính | unit | 100 |
| Số lượng | quantity | 110 |
| Đơn giá | unitPrice | 140 |
| Thành tiền | amount | 150 |
| Ghi chú | note | 200 |

## Acceptance Criteria

- [ ] Mở "Thêm mới Nhập kho": ô "Tìm mã hàng…" (Mã SKU), "Chọn kho" (Kho), "Chọn vị trí" (Vị trí) **không bị cắt chữ** ở bề rộng dialog mặc định.
- [ ] Khi tổng bề rộng cột > container, bảng **scroll ngang**; header dính khi cuộn dọc.
- [ ] Các cột số (Số lượng/Đơn giá/Thành tiền/Đơn vị tính) gọn đúng min-width, không thừa chỗ.
- [ ] Không hồi quy hành vi nhập liệu/tính Thành tiền của bảng.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Verify trực quan: screenshot bảng CHI TIẾT Nhập kho trước/sau (ô input đủ rộng, có thanh scroll ngang khi thu hẹp). Mô tả diff.
- [ ] Strings UI giữ tiếng Việt; không đổi nhãn cột.

## Tech Approach

- Chỉ bổ sung `minWidth` vào các object cột trong mảng `lineColumns` hiện có; không đổi `renderEditor`, `getValue`, `type`, `align`.
- Nếu cột nào đang có `width` nhỏ hơn `minWidth` tuned, cập nhật `width` lên bằng `minWidth` để layout rộng cũng cân đối (min-width vẫn là sàn quyết định khi hẹp).

## Testing Strategy

- Manual trên `make dev-backoffice`: mở form Nhập kho (route `/inventory/purchase-orders`), thêm dòng, kiểm tra ô input + scroll ngang ở các bề rộng cửa sổ khác nhau.

## Dependencies

- Depends on: TKT-LIG-01 (field `minWidth` trong `LineItemGrid`)
- Blocks: TKT-LIG-03 (roll-out copy pattern từ pilot đã duyệt)
