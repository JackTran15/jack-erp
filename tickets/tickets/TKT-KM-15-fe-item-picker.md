# TKT-KM-15 FE dialog chọn hàng hóa (FR-024) — tái dùng ProductSelectDialog

## Epic

[EPIC-22072026 Khuyến mại — schema chuẩn hóa, domain engine & evaluate API](../epics/EPIC-22072026-promotion-programs-engine.md)

## Summary

FR-024 mô tả một dialog chọn hàng hóa: lọc theo nhóm hàng hóa, tìm theo mã SKU/tên, mở rộng dòng cha để chọn từng mẫu mã, bộ đếm `n mẫu mã (m hàng hóa)`, phân trang, chọn nhiều dòng trong một lần mở.

**Dialog này đã tồn tại** — `apps/backoffice-web/src/components/shared/product-select/ProductSelectDialog.tsx` (34K) làm đúng ngần đó: có `categoryFilter`, có mở rộng product → variant với `variantCache`, có `SelectedProduct { itemId, code, name, unit, categoryName, variantLabel }`, có `ProductSelectResult` phân biệt "chọn cả hàng hóa" với "chọn từng mẫu mã". Nó chạy trên `POST /v2/inventory-items/search`.

Ticket này **nối dialog có sẵn vào 6 lưới của form CTKM**, không dựng dialog mới.

> Quy ước đã chốt của repo: tích hợp vào màn/component có sẵn, không scaffold bản `-v2` song song.

## Deliverables

Sửa các lưới dưới `apps/backoffice-web/src/pages/promotions/programs/ProgramFormPage/PromotionVariant/_PromotionSections/`:

| Lưới | Hình thức | Chế độ chọn |
| ---- | --------- | ----------- |
| `GoodsDiscountPromotionSection/GoodsDiscountGrid` | `ITEM_DISCOUNT` | `PRODUCT` hoặc `ITEM`, và **`CATEGORY`** khi `goodsDiscountScope = GROUP` |
| `TieredDiscountPromotionSection/ProductSelectionGrid` | `TIERED_DISCOUNT` | `PRODUCT` / `ITEM` / `CATEGORY` theo `tierTarget` |
| `GiftPromotionSection/GiftProductGrid` | `GIFT_ITEM` | `ITEM` |
| `BuyGetPromotionSection/BuyGetProductGrid` (×2: điều kiện mua + hàng được tặng) | `BUY_M_GET_N` | theo `buyGetPurchaseTarget` |
| `ConditionPromotionSection/ApplicableGoodsGrid` | điều kiện `SPECIFIC_QUANTITY` | `ITEM` |

Có thể phát sinh:
- `promotions/components/PromotionTargetPicker/PromotionTargetPicker.tsx` — wrapper mỏng trên `ProductSelectDialog` chuẩn hóa `ProductSelectResult` → `PromotionLine`-shape, để 6 chỗ gọi không lặp code map (folder-per-component theo convention của backoffice).
- Chế độ chọn **nhóm hàng hóa** (`CATEGORY`): `ProductSelectDialog` hiện chọn *hàng hóa/mẫu mã*, chưa chọn *nhóm*. Cần bổ sung — xem Tech Approach.

## Acceptance Criteria

- [ ] **Không tạo dialog chọn hàng hóa mới.** Mọi lưới gọi `ProductSelectDialog` (qua wrapper).
- [ ] Chọn nhiều dòng trong một lần mở; đóng dialog thêm hết vào lưới, không ghi đè dòng đã có.
- [ ] Chọn ở **cấp hàng hóa** (product) và **cấp mẫu mã** (item) đều được, và phân biệt được — map sang `targetType: PRODUCT` vs `ITEM`.
- [ ] Bộ đếm `n mẫu mã (m hàng hóa) đã chọn` hiển thị realtime (kiểm tra `ProductSelectDialog` đã có; nếu chưa thì bổ sung).
- [ ] Chế độ `CATEGORY` chọn được nhóm hàng hóa từ cây `inventory_item_categories` (≥ 2 cấp), map sang `targetType: CATEGORY`.
- [ ] Dòng đã có trong lưới hiện trạng thái đã chọn khi mở lại dialog (không cho chọn trùng).
- [ ] Lưới `GoodsDiscountGrid` tính **Giá khuyến mại** tự động từ `Giá bán` và mức giảm — AC-01: `685.000` với 30% → `479.500`, làm tròn về đồng. Ô nhập giá trị ở đầu khối **áp hàng loạt** cho mọi dòng trong lưới (FR-031).
- [ ] Cột lưới đổi theo lựa chọn đúng bảng FR-031:
  - `GROUP` → Mã nhóm · Tên nhóm · % giảm giá
  - `PRODUCT`/`ITEM` + `PERCENT`/`AMOUNT` → Mã SKU · Tên · ĐVT · Giá bán · % giảm giá · Giá khuyến mại
  - `PRODUCT`/`ITEM` + `FIXED_PRICE` → bỏ cột % giảm giá
- [ ] `GiftProductGrid` giữ 2 cột đặc thù `Giá bán ≤` và `Số lượng ≤` (map sang `maxUnitPrice` và `quantity`).
- [ ] Xóa dòng khỏi lưới hoạt động; lưới rỗng hợp lệ với `INVOICE_DISCOUNT` và `TIERED_DISCOUNT` + `INVOICE_VALUE`, còn lại chặn lưu (BR-004, lỗi trả từ BE gắn vào lưới).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Click-through: mở dialog từ **cả 6 lưới**, chọn hỗn hợp hàng hóa + mẫu mã, lưu, mở lại → đúng dòng đã chọn.
- [ ] Không có component dialog chọn hàng hóa nào mới dưới `pages/promotions/`.
- [ ] Chuỗi tiếng Việt; primitive từ `@erp/ui`; icon `lucide-react`.
- [ ] Nếu có sửa `ProductSelectDialog` dùng chung: **không** làm hỏng các nơi gọi hiện tại — liệt kê và kiểm tra từng nơi trong PR description.

## Tech Approach

Bước 1 — khảo sát `ProductSelectDialog` trước khi viết code: đọc `interface Props` (`:45`), `ProductSelectResult` (`:32`), `useProductSearch.ts`, và **liệt kê mọi nơi đang gọi nó**. Mọi thay đổi lên component dùng chung phải kiểm tra ngược các nơi đó.

Bước 2 — wrapper map kết quả:

```ts
// PromotionTargetPicker.tsx
export function toPromotionLines(
  result: ProductSelectResult,
  role: PromotionLineRole,
): PromotionLineDraft[] {
  // productIds chọn-cả-hàng-hóa  → targetType: PRODUCT
  // itemIds chọn-lẻ-mẫu-mã       → targetType: ITEM
}
```

Bước 3 — chế độ `CATEGORY`. `ProductSelectDialog` chọn hàng hóa, không chọn nhóm. Hai lựa chọn, **ưu tiên (a)**:

- **(a)** Thêm prop `mode?: 'PRODUCT' | 'CATEGORY'` vào `ProductSelectDialog`; ở `CATEGORY` nó hiển thị chính cây nhóm đang dùng làm bộ lọc (`categoryFilter`) dưới dạng danh sách chọn được. Tái dùng dữ liệu cây đã nạp, không thêm API.
- **(b)** Nếu (a) làm component phình quá mức, tách `CategorySelectDialog` riêng dùng chung nguồn dữ liệu cây. Chỉ chọn (b) khi (a) đã thử và thấy rối.

Bước 4 — công thức Giá khuyến mại đặt ở **một** helper dùng chung, không rải trong JSX:

```ts
export function promoPrice(sellingPrice: number, mode: PromotionDiscountMode, value: number): number {
  switch (mode) {
    case 'PERCENT':     return Math.round(sellingPrice * (1 - value / 100));
    case 'AMOUNT':      return Math.max(0, Math.round(sellingPrice - value));
    case 'FIXED_PRICE': return Math.round(value);
  }
}
```

Cùng quy tắc làm tròn với `roundVnd` của domain — hai bên lệch nhau thì con số trên form khác con số BE tính, đây là loại bug rất khó truy.

## Testing Strategy

- Unit cho `toPromotionLines` và `promoPrice` (đặt cạnh file, `.spec.ts`).
- `promoPrice` bắt buộc có case AC-01: `promoPrice(685000, 'PERCENT', 30) === 479500`.
- Còn lại là click-through thủ công theo checklist ở Definition of Done.

## Dependencies

- Depends on: TKT-KM-12
- Blocks: TKT-KM-16
