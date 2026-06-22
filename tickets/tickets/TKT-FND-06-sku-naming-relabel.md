# TKT-FND-06 Chuẩn hoá nhãn SKU / Mẫu mã / Hàng hoá

## Epic

[EPIC-18062026 Inventory Foundation](../epics/EPIC-18062026-inventory-foundation.md)

## Layer

🟩 Frontend (đổi nhãn + bổ sung cột mẫu mã) + 🟦 shared-interfaces (hằng nhãn). **Không migration, không entity.**

## Summary

Làm rõ ngữ nghĩa 4 trường khi hiển thị, nhất quán toàn FE (feature 15):

| Nhãn | Nguồn | Ví dụ |
| --- | --- | --- |
| **Mã SKU mẫu mã** | `product.code` | `ABA2777` |
| **Tên mẫu mã** | `product.name` | `ABA2777` (tên hàng/khoá mẫu) |
| **Mã SKU** | `item.code` (≡ mã vạch variant) | `ABA2777-D-38` |
| **Tên hàng hoá** | `item.name` (tên variant) | `Giày nam ABA2777-D-38` |

Hằng nhãn Excel `INVENTORY_IMPORT_EXCEL_FIELD_LABELS` **đã đúng** (`MODEL_CODE='Mã SKU mẫu mã'`, `MODEL_NAME='Tên mẫu mã'`, `SKU_CODE='Mã SKU'`, `INVENTORY_ITEM_NAME='Tên hàng hóa'`) — ticket này đưa cùng bộ nhãn đó vào form/list/dialog item.

## Deliverables

- `packages/shared-interfaces/src/inventory/item-labels.ts` (mới) — export hằng nhãn dùng chung:
  ```ts
  export const ITEM_FIELD_LABELS = {
    modelSku: 'Mã SKU mẫu mã',
    modelName: 'Tên mẫu mã',
    variantSku: 'Mã SKU',
    variantName: 'Tên hàng hoá',
  } as const;
  ```
- `apps/api/src/modules/inventory/location/item-crud.service.ts` — `INVENTORY_ITEM_ENTITY_CONFIG`:
  - `code` → label **'Mã SKU'** (giữ), `name` → **'Tên hàng hoá'** (giữ/chuẩn hoá chính tả).
  - Thêm field hiển thị (readOnly) `productCode` label **'Mã SKU mẫu mã'**, `productName` label **'Tên mẫu mã'** (đã có `productName`; thêm `productCode`).
- `apps/backoffice-web/src/components/crud/inventory/InventoryItemCreateForm.tsx` — đổi nhãn các ô theo bảng trên; nơi hiển thị mẫu mã dùng `ITEM_FIELD_LABELS`.
- `apps/backoffice-web/src/components/crud/CrudListPage.tsx` (cột inventory-items) + bất kỳ bảng item nào — header cột dùng đúng nhãn.
- Dialog tìm hàng (TKT-FND-05) — cột hiển thị: "Mã SKU mẫu mã"/"Tên mẫu mã" ở cấp mẫu, "Mã SKU"/"Tên hàng hoá" ở cấp variant.

## Acceptance Criteria

- [ ] Form + list item + dialog tìm hàng dùng đúng 4 nhãn theo bảng; không còn nhãn cũ mơ hồ ("Tên sản phẩm" lẫn lộn).
- [ ] Nhãn tập trung ở `ITEM_FIELD_LABELS` (1 nguồn), không hardcode rải rác.
- [ ] Hiển thị cả mã/tên mẫu mã (product) lẫn mã/tên variant (item) ở nơi cần phân biệt.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass; không lỗi type.
- [ ] Rà soát visual: chụp trước/sau form + list item, mô tả diff.
- [ ] Không đụng backend logic/migration; chỉ nhãn + cột readOnly.

## Tech Approach

- Thuần đổi nhãn + thêm cột hiển thị; không đổi data shape API (productCode/productName lấy từ relation `product` đã eager hoặc bổ sung select readOnly).

## Dependencies

- Requires: không (độc lập).
- Blocks (mềm): TKT-FND-05 (dialog dùng cùng bộ nhãn) — nên land trước để dialog import nhãn.
