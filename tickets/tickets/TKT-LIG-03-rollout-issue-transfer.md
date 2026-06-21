# TKT-LIG-03 Roll-out mọi bảng LineItemGrid

## Epic

[EPIC-21062026 LineItemGrid Column Min-Width + Horizontal Scroll](../epics/EPIC-21062026-line-item-grid-min-width.md)

## Summary

Sau khi pilot Nhập kho được duyệt, user yêu cầu **"apply each page the same"** → áp cho **mọi bảng dùng `LineItemGrid`** (8 bảng). Cách làm: `LineItemGrid` cho `minWidth` **mặc định = `width`** (TKT-LIG-01), nên mọi cột đã có `width` tự có sàn → bảng nào cũng scroll ngang thay vì nén. Riêng các bảng kho được bump `width` các cột chung lên bộ tuned để khớp Nhập kho.

Phạm vi:
- **Bảng kho** (bump width cột chung theo bộ tuned): Xuất kho (`GoodsIssuePage`), Chuyển kho (`TransferOrdersPage`), Phiếu chuyển kho (`StockTransferPage` — gồm Kho/Vị trí xuất & nhập = 220), Kiểm kho (`StockTakeFormDialog` — bump 4 cột nhập SKU/Tên/Vị trí/ĐVT; cột số/nhóm floor theo width sẵn có).
- **Bảng kho quỹ** (floor theo width sẵn có, không bump): Phiếu chi/Phiếu thu (Diễn giải 280 · Số tiền 140 · tài khoản 200) và Kiểm quỹ (Họ tên 220 · Chức danh 160 · Đại diện 180) — tự có sàn qua mặc định `minWidth = width`.

## Deliverables

- `pages/goods-issue/GoodsIssuePage.tsx` — bump width cột chung: SKU 360 · Tên 280 · Kho 220 · Vị trí 220 · ĐVT 100 · Số lượng 110 · Đơn giá 140.
- `pages/transfer-orders/TransferOrdersPage.tsx` — SKU 360 · Tên 280 · Kho 220 · ĐVT 100 · Số lượng (đã 110) · Ghi chú 200 (trước không có width).
- `pages/stock-transfer/StockTransferPage.tsx` — SKU 360 · Tên 280 · Kho xuất/Vị trí xuất/Kho nhập/Vị trí nhập 220 · ĐVT 100 · Số lượng 110 · Đơn giá 140 · Thành tiền 150 · Ghi chú 200.
- `pages/stock-takes/StockTakeFormDialog.tsx` — bump 4 cột nhập: SKU 360 · Tên 280 · Vị trí 220 · ĐVT 100 (cột số nhóm Số lượng/Giá trị + Nguyên nhân/Xử lý floor theo width sẵn có).
- Kho quỹ (Phiếu chi/thu/Kiểm quỹ): **không sửa file** — floor tự có nhờ mặc định `minWidth = width` (TKT-LIG-01).

## Acceptance Criteria

- [ ] Mọi bảng `LineItemGrid` không cắt chữ ở ô input/select; scroll ngang khi tổng width vượt container.
- [ ] Bộ width cột chung của các bảng kho khớp pilot Nhập kho.
- [ ] Không hồi quy nhập liệu của các form.

## Definition of Done

- [x] `@erp/ui` + `@erp/backoffice-web` tsc xanh.
- [ ] Verify trực quan: screenshot vài bảng (Xuất kho, Chuyển kho, Phiếu chuyển kho, Phiếu chi).
- [x] Strings UI giữ tiếng Việt; không đổi nhãn cột.

## Tech Approach

- Component `LineItemGrid` đã cho `minWidth ?? width` (TKT-LIG-01) → mọi cột có `width` tự có sàn. Các bảng kho chỉ cần bump `width` cột chung lên bộ tuned; kho quỹ không cần đụng.

## Testing Strategy

- Manual trên `make dev-backoffice`: mở Xuất kho (`/inventory/goods-issue`), Chuyển kho (`/inventory/transfer-orders`), Phiếu chuyển kho, Kiểm kho, và 1 phiếu kho quỹ — kiểm tra ô input + scroll ngang.

## Dependencies

- Depends on: TKT-LIG-01, TKT-LIG-02 (pilot đã duyệt)
- Blocks: —
