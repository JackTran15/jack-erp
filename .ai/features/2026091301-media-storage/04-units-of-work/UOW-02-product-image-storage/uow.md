---
id: UOW-02
slug: product-image-storage
title: Ảnh hàng hoá lưu thật và hiện lại ở màn sửa hàng hoá
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-01, US-02]
verifies: [AC-01, AC-02, AC-04, AC-08]
risk: medium
status: todo
rollback: Revert các commit của UoW. Service cũ bỏ qua `imageIds` trong payload; dòng `media_objects` đã `ATTACHED` còn lại vô hại vì không còn đường đọc nào dùng tới
---

# UOW-02 — Ảnh hàng hoá lưu thật và hiện lại ở màn sửa hàng hoá

## Demo script
1. Backoffice → tạo hàng hoá có màu và size, chọn 3 ảnh, lưu
2. Tải lại, mở màn sửa hàng hoá đó → đúng 3 ảnh, đúng thứ tự
3. Tạo hàng hoá **không** có màu/size với 1 ảnh → tải lại, ảnh vẫn hiện (A-25)
4. Ở hàng hoá đầu, xoá 1 ảnh, lưu → tải lại còn 2 ảnh
5. Mở URL một ảnh trong cửa sổ ẩn danh, không đăng nhập → ảnh hiện
6. Chọn ảnh 3 MB → "Mỗi ảnh tối đa 2MB"; chọn ảnh thứ 11 → "Tối đa 10 ảnh"
7. Chạy `pnpm --filter @erp/api test:e2e -- media-product-images` → xanh, gồm ca dùng `mediaId` của tổ chức khác bị 404

## In scope
- `InventoryItemCrudService`: nhận `imageIds`, trả `images`, gỡ ảnh khi xoá
- Form hàng hoá dùng luồng tải lên thật cho cả tạo và sửa

## Not in scope
- URL ảnh trong POS và API đối tác (UOW-03)
- Ảnh theo màu/size (A-08)
- Kéo thả sắp xếp ảnh (Out of scope của intent)

## Risks

| Risk | Mitigation |
|---|---|
| `createProductWithVariants` / `updateProductWithVariants` không có transaction (`item-crud.service.ts:826-837,974`): sản phẩm lưu xong nhưng gắn ảnh lỗi | FE báo lỗi rõ; media còn `UPLOADED` và bị job dọn (T-05-01). Không bọc transaction quanh luồng cũ (ngoài phạm vi) |
| Body CRUD là `Record<string, any>`, không có DTO để validate `imageIds` | T-02-01 tự kiểm mảng UUID ≤ 10 trước mọi thao tác ghi |
| `imageIds` lọt vào `productRepo.update` hoặc `hasProductLevelPatch` | T-02-01 tách `imageIds` khỏi payload ngay đầu `create`/`update`; có test khẳng định |

## Definition of done
- [ ] AC-01, AC-02, AC-04, AC-08 pass
- [ ] Cả hai nhánh (có biến thể / không biến thể) được demo
- [ ] Payload lưu hàng hoá chỉ chứa `imageIds`, không chứa `File` hay data URL
- [x] `pnpm --filter @erp/api test` và `pnpm --filter @erp/backoffice-web build` xanh
  - 2026-09-15, sau commit `02188595` (sửa resolution của rebase lên `origin/main` 75165d50): unit 398/398 suite, 5493 test pass; backoffice `✓ built in 5.21s`, exit 0, build sau khi `@erp/api-client` được sinh lại (lần build trước dùng `dist/` cũ).
- [ ] Demo và nghiệm thu tại gate G4
- [x] **Trước merge — e2e** (T-02-03): chạy toàn bộ e2e trên `main` và trên nhánh, cùng lượt với UOW-01; không suite nào PASS trên `main` mà FAIL trên nhánh.
  - Lượt nhánh: xem ghi chú cùng ngày ở UOW-01 (50 PASS · 38 FAIL · 1 skipped; `media-product-images` PASS).
  - 2026-09-16, baseline `origin/main` 75165d50 trong worktree riêng, cùng env (`MEDIA_S3_ENDPOINT=http://127.0.0.1:1`, không API dev, `--max-old-space-size=8192`, 8 520 s): 86 suite → 31 PASS · 54 FAIL · 1 skipped. Nhánh (`02188595`): 89 suite → 50 PASS · 38 FAIL · 1 skipped. Đối chiếu từng suite: **PASS trên `main` → FAIL trên nhánh: không có** — suite duy nhất nghi ngờ là `checkout-saga-promotion` (FAIL vì `Exceeded timeout of 180000 ms for a hook`, suite thứ 84 ngay trước khi lượt nhánh chết OOM), chạy lại một mình trên nhánh → PASS 13/13 trong 84 s (main: 90 s). FAIL trên `main` → PASS trên nhánh: 17 suite (api-key-admin, api-key-guard, checkout-saga-voucher, checkout-voucher-party, deposit-fund-spending, identity-cache, inventory-item-out-of-stock, inventory-item-search-v2, partner-catalog, stock-transfer-line-no, stock-transfer-lines-search, transfer-order-line-no, transfer-order-lines-search, treasury-voucher-address, untracked-location-visibility, user-branch-scope, voucher-revision-projection). 3 suite chỉ có trên nhánh (`media-upload`, `media-product-images`, `media-attachments`) đều PASS.
- [ ] **Trước merge — trình duyệt** (T-02-02): với phiên đăng nhập có `inventory.write`: AC-01 tạo hàng hoá 3 ảnh rồi mở lại thấy đúng 3 ảnh; AC-02 file không phải ảnh, ảnh > 2 MB, ảnh thứ 11 bị chặn với đúng thông báo cũ; AC-04 xoá 1 ảnh, lưu, mở lại còn 2; "Lưu và nhân bản" tạo bản sao không kèm ảnh.
