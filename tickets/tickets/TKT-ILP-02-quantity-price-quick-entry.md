# TKT-ILP-02 Thêm cột Số lượng/Đơn giá + "Nhập nhanh" vào ProductSelectDialog

## Epic

[EPIC-19062026 Dialog chọn hàng + gỡ trang v2](../epics/EPIC-19062026-inventory-line-product-picker.md)

## Summary

Bổ sung cho `ProductSelectDialog` 2 cột **Số lượng** + **Đơn giá** (sửa được, theo ảnh #3/#4) và tính năng **"Nhập nhanh"**: mở sub-dialog "Nhập nhanh cho tất cả hàng hoá" (Số lượng + Đơn giá → "Đồng ý") đặt đồng loạt cho **mọi hàng đang chọn**. `onConfirm` trả kèm `quantity` + `unitPrice` từng hàng. Trang inventory export tắt 2 cột này để giữ chế độ chỉ-đọc.

## Deliverables

- `apps/backoffice-web/src/components/shared/product-select/ProductSelectDialog.tsx` — thêm cột Số lượng/Đơn giá (ô nhập) + nút/menu "Nhập nhanh" + sub-dialog quick-entry.
- `apps/backoffice-web/src/components/shared/product-select/QuickEntryDialog.tsx` (mới, hoặc inline) — form "Nhập nhanh cho tất cả hàng hoá": Số lượng + Đơn giá, "Đồng ý"/"Hủy bỏ".
- `apps/backoffice-web/src/pages/inventory/InventoryItemsPage.tsx` — truyền `showQuantityPrice={false}` để export giữ nguyên.

## Acceptance Criteria

- [ ] Props mới: `showQuantityPrice?: boolean` (default `false`), `defaultUnitPriceSource?: 'purchasePrice' | 'sellingPrice' | 'none'` (default `'none'`), `defaultQuantity?: number` (default `1`).
- [ ] Khi `showQuantityPrice`: mỗi hàng đã chọn có ô **Số lượng** (mặc định `defaultQuantity`) và **Đơn giá** (prefill theo `defaultUnitPriceSource`); sửa được.
- [ ] "Nhập nhanh" mở sub-dialog; "Đồng ý" set Số lượng/Đơn giá cho **tất cả hàng đang chọn** (gồm variant của mẫu mã chọn-tất-cả; nếu chưa lazy-load thì load rồi áp).
- [ ] `onConfirm` trả `SelectedProduct & { quantity: number; unitPrice: number }` cho từng hàng.
- [ ] `showQuantityPrice=false` (export): không render 2 cột/Nhập nhanh; hành vi ILP-01 giữ nguyên.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Verify thủ công: bật `showQuantityPrice` trong storybook/harness tạm hoặc trực tiếp ở ILP-03; "Nhập nhanh" áp đúng cho mọi hàng đã chọn; export vẫn chỉ-đọc.
- [ ] Số/tiền format bằng `Intl` `vi-VN` cho hiển thị (ô nhập giữ kiểu số thuần).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
interface ProductSelectDialogProps {
  // ...ILP-01 props
  showQuantityPrice?: boolean;                 // default false
  defaultUnitPriceSource?: 'purchasePrice' | 'sellingPrice' | 'none';
  defaultQuantity?: number;                    // default 1
  onConfirm: (selected: SelectedLine[]) => void;
}
export interface SelectedLine extends SelectedProduct {
  quantity: number;
  unitPrice: number;
}
```

- State đầu vào: `Map<itemId, { quantity; unitPrice }>` đồng bộ theo tập đang chọn; prefill `unitPrice` theo source khi 1 hàng được chọn.
- "Nhập nhanh": resolve toàn bộ `itemId` đang chọn (ép lazy-load variant của mẫu mã `autoSelectIds` trước khi áp), set đồng loạt.

## Testing Strategy

- Verify thủ công (không unit test FE).

## Dependencies

- Depends on: TKT-ILP-01
- Blocks: TKT-ILP-03, TKT-ILP-04, TKT-ILP-05
