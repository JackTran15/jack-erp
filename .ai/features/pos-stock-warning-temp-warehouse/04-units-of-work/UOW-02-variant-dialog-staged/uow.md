---
id: UOW-02
slug: variant-dialog-staged
title: Dialog chọn biến thể hiện cùng ngưỡng tồn
demoable: true
duration: 0.5d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-08]
risk: low
status: todo
rollback: revert commit — chỉ đường đọc
---

# UOW-02 — Dialog chọn biến thể hiện cùng ngưỡng tồn

Lối thứ ba đưa hàng vào giỏ đi qua endpoint khác (`getProductDetail` → `loadBranchStock`),
không dùng chung điểm gom với UOW-01. Nếu bỏ lại, thu ngân chọn biến thể sẽ thấy một con số
khác với khi gõ tìm cùng mặt hàng đó.

## Demo script

Chuẩn bị: cùng dữ liệu demo của UOW-01 — SKU biến thể, tồn showroom 4, kho tạm w2s đang giữ 3.

1. POS → Bán hàng → bấm vào card sản phẩm cha (sản phẩm có nhiều biến thể).
2. Dialog chọn biến thể mở ra → dòng biến thể đó hiện `Tồn: 7`, không có cảnh báo hết hàng.
3. Chọn biến thể → dòng vào giỏ, nhập SL 7 → không cảnh báo; SL 8 → chấm đỏ.
4. Mở lại dialog, so với con số ở ô tìm kiếm khi gõ đúng SKU đó → hai chỗ cùng `7`.

## In scope

- `PosCatalogProductService.loadBranchStock` + `toVariantDto`: cộng delta kho tạm, đổi tên trường
- `PosProductVariantDto`
- FE: `VariantRow`, `use-checkout-variant-selection`, `catalog.interface.ts`

## Not in scope

- Ba đường đọc của `PosCatalogService` (UOW-01)
- Ô `direction` của Chuyển kho nhanh trong cùng service — không đụng

## Risks

| Risk                                                                                                                                       | Mitigation                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `loadBranchStock` có hai khái niệm "showroom" cùng tồn tại (`showrooms` cho `direction`, `is_main_storage` cho cảnh báo) — dễ sửa nhầm cái | T-02-01 chỉ đụng nhánh `mainStorageIds`; test giữ nguyên nhánh `direction` để chứng minh Chuyển kho nhanh không đổi |

## Definition of done

- [x] AC-08 pass
- [x] `pnpm --filter @erp/api test` xanh
- [x] `npx vitest run` trong `apps/pos-web` xanh, trừ 3 test đỏ **có sẵn trên HEAD** ở
      `src/lib/common/api-axios.test.ts` (feature `auth-token-auto-refresh`) — đã xác minh
      bằng `git stash` là đỏ y hệt khi không có diff của feature này, và nằm ngoài phạm vi
- [x] Dialog biến thể và ô gõ tìm cho cùng con số trên cùng SKU (bước 4 demo script)
- [x] Demoed and accepted at gate G4
