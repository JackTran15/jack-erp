---
id: UOW-01
slug: update-image-page
title: Tiện ích → Cập nhật ảnh — lọc hàng theo trạng thái ảnh và Tải ảnh trên từng dòng
demoable: true
duration: 1.5d
depends_on: []
requirements: [US-01, US-02]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10]
risk: medium
status: todo
rollback: Revert các commit của UoW. Không có migration; hai endpoint mới biến mất, `media_objects` đã gắn qua `set-images` vẫn hợp lệ vì cùng `syncOwner` với form Sửa
---

# UOW-01 — Tiện ích → Cập nhật ảnh

## Demo script
1. Đăng nhập backoffice bằng tài khoản có `inventory.write`, vào Danh mục → Hàng hoá → Tiện ích → **Cập nhật ảnh**
2. Trang mở với *Hàng hóa chưa cập nhật ảnh* / nhóm *Tất cả*: chân trang "Hiển thị 1 - 50 trên 2446 kết quả"; không thấy `AAA-MEDIA-A`, `AAA-MEDIA-B`
3. Đổi sang *đã cập nhật ảnh* → Lấy dữ liệu → đúng 2 dòng A, B với thumbnail; *Tất cả* → 2448
4. Chọn nhóm cha "GIÀY DÉP" → Lấy dữ liệu → chỉ hàng thuộc các nhóm con; cột Nhóm hàng hóa của A ghi "Giày nữ"
5. Gõ mã biến thể của A (khác hoa/thường) → Lấy dữ liệu → có A
6. Bấm **Tải ảnh** trên dòng C, chọn 2 ảnh → thumbnail hiện ngay; mở form Sửa của C → đúng 2 ảnh theo thứ tự
7. Bấm Tải ảnh, chọn file 3 MB → "Mỗi ảnh tối đa 2MB", không có request `/media/uploads` (tab Network)
8. `pnpm --filter @erp/api test:e2e -- product-image-search inventory-item-set-images` → xanh, gồm ca id tổ chức khác vào `failed`

## In scope
- `POST /v2/inventory-items/images/search` (handler riêng bọc `buildCombinedCte()`, ADR-01)
- `POST /inventory/items/set-images` (bulk, partial success, ADR-02)
- Trang `/admin/inventory-items/images`: bộ lọc, bảng, phân trang, Quay lại, hai mục menu Tiện ích
- Helper `uploadGoodsImages` dùng chung với UOW-02

## Not in scope
- Trang Cập nhật ảnh nhanh (UOW-02) — route và mục menu của nó được T-02-02 thêm
- Xoá/sắp xếp từng ảnh (form Sửa)
- Sinh lại `schema.ts` (T-02-04, một lần cho cả ba endpoint)

## Risks

| Risk | Mitigation |
| --- | --- |
| Truy vấn `images/search` chậm trên 2.507 nhóm vì subquery đếm media + LATERAL nhóm | Subquery media chạy trên `IDX_media_objects_owner_attached` (partial index `status='ATTACHED'`); nhóm qua `IDX_items_org_active_category`. T-01-01 ghi `EXPLAIN ANALYZE` trên `erp_dev` vào done-when, mục tiêu < 300 ms |
| `buildCombinedCte()` đổi sau này (mobile) làm vỡ cột `type`/`code` mà handler mới dựa vào | Handler chỉ dùng `type, id, code, name, "isActive"` — bốn cột đầu là contract đã được comment trong file gốc; spec khẳng định câu SQL chứa `buildCombinedCte()` nguyên văn |
| `syncOwner` ngoài transaction xoá object storage ngay | T-01-02 luôn truyền `manager` (quy tắc skill), spec khẳng định tham số thứ 5 là `manager` |
| Menu Tiện ích `disabled` khi `selectedCount === 0` — với danh mục rỗng không vào được trang | Chấp nhận (không có gì để cập nhật); ghi ở intent |

## Definition of done
- [x] AC-01..AC-10 pass (AC-01 phần "Cập nhật ảnh nhanh" hoàn tất ở T-02-02)
  - 2026-09-16: AC-01..05 evidence S1–S9 (+S10/S11 cho mục ảnh nhanh); AC-06 e2e `product-image-search` + `inventory-item-set-images`; AC-07/08 `verify-t0104.py`; AC-09/10 e2e `inventory-item-set-images`.
- [x] `EXPLAIN ANALYZE` của `images/search` (MISSING, không nhóm, không từ khoá) trên `erp_dev` < 300 ms, ghi số vào T-01-01
  - 2026-09-16: data 147 ms, count 107 ms (T-01-01).
- [x] Mỗi trang phát đúng 2 truy vấn SQL + 1 `resolvePublicUrls` (spec đếm)
  - 2026-09-16: `search-product-images.handler.spec.ts` đếm `manager.query` = 2 và `resolvePublicUrls` = 1 với đúng id của trang.
- [x] Không chuỗi tiếng Việt trong `apps/api`; không `MediaSummary` bị spread vào response
  - 2026-09-16: quét non-ASCII các file mới — chỉ em-dash trong comment tiếng Anh; e2e `product-image-search` khẳng định tập khoá chính xác của từng dòng (không có bucket/objectKey).
- [x] `pnpm --filter @erp/api test` và `pnpm --filter @erp/backoffice-web build` xanh
  - 2026-09-16, sau T-01-04: unit 402/402 suite, 5545 pass, 1 skipped (31,7 s); backoffice `tsc --noEmit` + `vite build` xanh (T-01-04). E2E mới: `product-image-search` 15/15, `inventory-item-set-images` 6/6.
- [ ] Demo và nghiệm thu tại gate G4
