# TKT-ILP-05 Tích hợp ProductSelectDialog vào Chuyển kho (StockTransferPage)

## Epic

[EPIC-19062026 Dialog chọn hàng + gỡ trang v2](../epics/EPIC-19062026-inventory-line-product-picker.md)

## Summary

Như ILP-03/04 nhưng cho trang v1 **Chuyển kho** (`StockTransferPage.tsx`, route `/inventory/stock-transfers`). Mỗi dòng có **kho/vị trí nguồn (xuất)** và **kho/vị trí đích (nhập)**. Icon search/dòng mở `ProductSelectDialog`; thêm N dòng; "Chọn kho" điền **kho nguồn** (`sourceStorageId`); kho đích để người dùng chọn. Đơn giá ở Chuyển kho là tuỳ chọn (server có thể tự tính) → dialog cho phép để trống.

## Deliverables

- `apps/backoffice-web/src/pages/stock-transfer/StockTransferPage.tsx`:
  - Cột **Mã SKU**: thêm icon search mở `ProductSelectDialog`.
  - `addLinesFromPicker`: map `SelectedLine[]` → `FormLine` (shape Chuyển kho: `sourceStorageId/sourceLocationId`, `destStorageId/destLocationId`, `unitPrice` kiểu string), dedupe `itemId`, điền `sourceStorageId` từ "Chọn kho"/kho mặc định, autofill vị trí nguồn, `normalizeLines`.
  - Mở dialog với `showQuantityPrice defaultUnitPriceSource="none"` (cho phép Đơn giá trống).

## Acceptance Criteria

- [ ] Icon search/dòng → dialog multi-select → thêm đúng số dòng với Số lượng (và Đơn giá nếu nhập).
- [ ] Dedupe theo `itemId`.
- [ ] "Nhập nhanh" áp Số lượng (+Đơn giá) cho mọi hàng đã chọn.
- [ ] "Chọn kho" điền `sourceStorageId` (kho nguồn) cho dòng mới; vị trí nguồn autofill; kho/vị trí đích vẫn nhập tay; gõ inline vẫn chạy.
- [ ] Lưu vẫn dùng endpoint hiện tại; Đơn giá để trống không gây lỗi (server tự tính).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Verify thủ công: thêm nhiều dòng → Nhập nhanh → Chọn kho điền kho nguồn → chọn kho/vị trí đích → lưu chuyển kho thành công.
- [ ] Không phá import Excel (`DocumentLineImportDialog`, template `NhapKhauChuyenKho.xls`).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

- `unitPrice` ở `StockTransfer` `FormLine` là `string` → map `s.unitPrice ? String(s.unitPrice) : ""`.
- "Chọn kho" hiện là nút thủ công set `sourceStorageId = defaultStorage`; giữ nguyên + đảm bảo áp cho dòng do dialog thêm.

## Testing Strategy

- Verify thủ công (không unit test FE).

## Dependencies

- Depends on: TKT-ILP-02
- Blocks: TKT-ILP-06
