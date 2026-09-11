---
id: UOW-01
slug: edit-price-no-variant
title: Sửa được Giá mua / Giá bán của hàng hoá không có biến thể
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09]
risk: low
status: todo
rollback: revert diff của InventoryItemCreateForm.tsx (khôi phục điều kiện `!isEdit`) — không migration, không đổi API; test thêm ở T-01-02 giữ lại được
---

# UOW-01 — Sửa được Giá mua / Giá bán của hàng hoá không có biến thể

## Demo script

Backoffice local `http://localhost:3000` (env `local-backoffice`); API đang chạy trên DB
`erp_dev_3008` (xác nhận qua `pg_stat_activity`, 2026-09-11). Đăng nhập tổ chức **My Company**
(`f1000000-0000-4000-8000-000000000001`) — nơi có `AAA-AIDLC-ORPHAN` và `A02-TEST`. `DD1500`
thuộc tổ chức **MT**. Lưu ý: `LOCAL_BACKOFFICE_ORG_ID` trong `.ai/credentials.env` đang là
`10000000-0000-4000-8000-000000000001`, không tồn tại trong `erp_dev_3008` — sửa trước khi chạy
ai-dlc-verify ở G4.
Kiểm DB sau mỗi lần Lưu:
`docker exec erp-postgres psql -U erp_user -d erp_dev_3008 -Atc "SELECT code, purchase_price, selling_price FROM items WHERE code IN ('AAA-AIDLC-ORPHAN','AAA-AIDLC-SINGLE')"`.

Fixture `AAA-AIDLC-SINGLE` được seed cho feature này ngày 2026-09-11 (Akenzy chọn "Seed fixture
vào My Company"): product `11111111-0000-4000-8000-00000000ab03` + item
`11111111-0000-4000-8000-00000000aa03`, không `item_attribute_values`, 300.000 / 450.000.

1. Danh mục > Hàng hoá → tìm `AAA-AIDLC-ORPHAN` → Sửa
   (`/admin/inventory-items/11111111-0000-4000-8000-00000000aa01/edit`). Khối "Thông tin" có
   "Giá mua TB" = 100.000 và "Giá bán TB" = 190.000, sửa được; "Tồn kho ban đầu" và "Đơn giá nhập
   đầu kỳ" vẫn khoá. (AC-01)
2. Đổi thành 110.000 / 200.000 → Lưu → toast "Đã cập nhật Hàng hoá." → mở lại Sửa thấy giá mới;
   DB = 110000.00 / 200000.00. (AC-02)
3. Mở lại Sửa, xoá sạch ô "Giá mua TB" → ô hiện 0 → Lưu thành công → DB purchase_price = 0.00.
   Trả lại giá gốc 100.000 / 190.000 và Lưu. (AC-04)
4. Product một item không thuộc tính. Local chỉ có `DD1500`
   (`/admin/inventory-items/5bfc8542-ecd5-46ee-8487-1e432f8c9acc/edit`, 600.000 / 1.500.000),
   nhưng nó thuộc tổ chức `e60e5f49-304d-4eb1-9735-3a2d10ba288f` — khác tổ chức của fixture
   AIDLC và `A02-TEST` (`f1000000-0000-4000-8000-000000000001`). Ở G4 chọn một cách và ghi lại
   vào bằng chứng: đăng nhập tổ chức của DD1500, hoặc — khi Akenzy đồng ý — thêm fixture
   `AAA-AIDLC-SINGLE` (một `products` + một `items` trỏ `product_id`, không có
   `item_attribute_values`) vào tổ chức AIDLC. Rồi: hai ô giá có giá hiện tại → đổi "Giá bán TB"
   → Lưu → mở lại thấy giá mới; DB khớp. Trả lại giá gốc và Lưu. (AC-03)
5. Sửa product `A02-TEST` — 6 phiên bản
   (`/admin/inventory-items/8c404f7e-a395-4883-9dbe-44d8cb9c029d/edit`) → khối "Thông tin" không
   có ô giá chung; bảng "Danh sách phiên bản" vẫn sửa giá được. (AC-05)
6. Vẫn ở `A02-TEST`, xoá hết thẻ Màu sắc và Size → ô giá chung vẫn không hiện → Huỷ, không
   lưu. (AC-06)
7. Sửa lại `AAA-AIDLC-ORPHAN`, nhập Màu sắc "Đen" + Enter → bảng "Danh sách phiên bản" xuất
   hiện, hai ô giá chung ẩn → Huỷ, không lưu. (AC-07)
8. Hàng hoá → Thêm mới → hai ô giá hiện, sửa được → nhập Màu sắc "Đen" → hai ô vẫn hiện nhưng
   khoá → Huỷ. (AC-08)
9. Sửa product `AAA-AIDLC-MULTI` — 2 item không thuộc tính, seed 2026-09-11
   (`/admin/inventory-items/11111111-0000-4000-8000-00000000ab04/edit`) → khối "Thông tin" không
   có ô giá chung. Không Lưu. (AC-09)

## In scope

- Điều kiện hiển thị hai ô `purchasePrice` / `sellingPrice` trong `InventoryItemCreateForm`
  (ADR-02) và map ô trống → 0 ở màn sửa (ADR-03).
- Unit test khoá việc `update()` nhánh hàng lẻ giữ giá (T-01-02).

## Not in scope

- Backend, API, DTO, migration, `openapi:generate` (ADR-01).
- Đơn giá nhập đầu kỳ / Tồn kho ban đầu (A-01); đổi nhãn "TB" (A-02).
- Hàng lẻ có thuộc tính (A-05); cache danh mục POS (A-06).
- Lỗi san phẳng giá biến thể có sẵn khi xoá hết Màu/Size rồi Lưu (ghi ở `00-intent.md`).

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| TypeScript không thu hẹp kiểu qua `initialRecord?.colors` | Tách biến cục bộ trước khi `Array.isArray`; không dùng `as any` |
| Ô giá nhảy về "0" ngay khi xoá sạch, hơi lạ tay khi gõ lại | Đúng ngữ nghĩa "trống = 0" của form Thêm mới (A-04, non-blocking); đổi sang báo lỗi bắt buộc là sửa một hàm nếu người dùng không thích |
| Prod có product ≥2 item không thuộc tính (A-07) → một ô giá ghi nhiều item | 0 trên `erp_dev_3008`; kiểm lại trên bản clone prod trước khi merge nếu có |
| Demo đổi giá dữ liệu fixture dùng chung | Bước 3, 4 trả lại giá gốc; Done-when của T-01-01 kiểm lại bằng SQL |

## Definition of done

- [ ] AC-01..09 pass theo Demo script, có ảnh chụp bằng chứng (ai-dlc-verify, env `local-backoffice`)
- [ ] T-01-02 xanh: `pnpm --filter @erp/api test -- item-crud-update.service.spec.ts`
- [ ] `pnpm --filter @erp/backoffice-web build` không có lỗi mới
- [ ] Không đổi API / DTO / entity / migration
- [ ] Giá của `AAA-AIDLC-ORPHAN` và `DD1500` đã trả về giá gốc sau demo
- [ ] Demoed and accepted at gate G4

## Verification evidence
- [ ] `verify.py .ai/features/2026091101-product-no-variant-price-edit --write` green on every required environment
- [ ] Evidence exists for every AC in `verifies`, at every declared viewport
- [ ] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description
