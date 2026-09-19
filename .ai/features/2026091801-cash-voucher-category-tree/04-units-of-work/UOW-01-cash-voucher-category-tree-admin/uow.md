---
id: UOW-01
slug: cash-voucher-category-tree-admin
title: Quản lý cấu hình được Danh mục thu chi từ menu, dạng cây cha → con, với luật cha/con do BE giữ
demoable: true
duration: 2d
depends_on: []
requirements: [US-01, US-02, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-09, AC-10]
risk: medium
status: todo
rollback: revert các commit FE ⇒ CrudListPage về nhánh gắn cứng, menu mất mục; `down()` của migration bỏ index, FK, cột `parent_group_id` (mất quan hệ cha/con đã cấu hình — cảnh báo trước khi revert trên DB có dữ liệu)
---

# UOW-01 — Cây danh mục thu chi trên backoffice

Một cột `parent_group_id`, luật cha/con trong service (cùng loại, không vòng, không xoá khi còn con), một endpoint
cây CQRS mới, và chế độ cây của `CrudListPage` được tổng quát hoá qua `CRUD_TREE_ENTITIES` để Danh mục thu chi dùng
chung với Nhóm hàng hoá. Lối vào: Danh mục › THU, CHI › Danh mục thu chi.

## Demo script

Môi trường `local-backoffice` (Chrome của Akenzy, org MT, chi nhánh `${LOCAL_BACKOFFICE_BRANCH_NAME}`), DB
`erp_dev_3008`, API :4000 + backoffice :3000 chạy từ nhánh feature.

1. `DB_NAME=erp_dev_3008 pnpm --filter @erp/api migration:show` (chỉ đọc) — ghi các migration đang chờ.
   **Hỏi Akenzy trước**, rồi `migration:run`. SQL sau đó: cột `parent_group_id` tồn tại, mọi dòng
   `cash_voucher_categories` có `parent_group_id IS NULL` (AC-09).
2. Menu Danh mục › THU, CHI → thấy "Danh mục thu chi"; bấm vào → `/admin/cash-voucher-categories`, breadcrumb
   "Danh mục › Danh mục thu chi"; bảng hiện 43 mục gốc, không có phân trang, thanh công cụ có "Mở rộng"/"Thu gọn"
   (AC-01, AC-02). Chụp ảnh.
3. "Thêm mới" → dialog: ô "Đang hoạt động" đang bật, ô Loại có "Thu"/"Chi" (AC-04). Nhập mã `CP_VAN_HANH`, tên
   "Chi phí vận hành", Loại = Chi, để trống Mục cha → Lưu.
4. "Thêm mới" → mã `TIEN_DIEN_VH`, tên "Tiền điện", Loại = Chi, mở picker Mục cha → chỉ thấy mục loại Chi, chọn
   "Chi phí vận hành" → Lưu. Bảng: "Tiền điện" thụt lề dưới "Chi phí vận hành", tên cha in đậm, có chevron; bấm
   chevron ẩn con; "Thu gọn"/"Mở rộng" toàn cây (AC-02, AC-03). Chụp ảnh.
5. Lọc cột Loại = Thu → cây chỉ còn mục thu; bỏ lọc, gõ "điện" vào lọc cột Tên → còn "Chi phí vận hành" ›
   "Tiền điện" mở sẵn (AC-02).
6. Sửa "Chi phí vận hành": picker Mục cha không hiện chính nó và "Tiền điện" (AC-03). Đổi Loại = Thu → Lưu → toast
   lỗi "Không thể đổi loại của mục đang có mục con" (AC-05). Huỷ.
7. Thêm mới: tên "Thu thử", Loại = Thu, gõ vào picker Mục cha → không thấy "Chi phí vận hành" (lọc theo loại);
   DevTools › Network: request `/records?…filters={"direction":"IN"}`. Gửi thẳng bằng curl
   `POST /admin/entities/cash-voucher-categories/records` với `direction: "IN", parentGroupId: <id CP_VAN_HANH>`
   → 400 "Mục cha phải cùng loại Thu/Chi" (AC-05).
8. Chọn "Chi phí vận hành" → Xoá → toast "Không thể xóa mục đang có mục con". Chọn "Tiền điện" → Xoá → thành công;
   chọn "Chi phí vận hành" → Xoá → thành công (AC-06). Chụp ảnh toast từ chối.
9. DevTools › Network trên bước 2–5: request `POST /v2/cash-voucher-categories/tree`, body `{ search?, direction?,
   isActive? }`, response `{ data: [...] }` lồng `children` (AC-07). Đăng nhập tài khoản không có
   `accounting.cash_voucher_category.read` (nếu có sẵn trên `erp_dev_3008`) → không thấy menu, vào URL bị chặn (AC-01).
10. Hồi quy: Danh mục › HÀNG HÓA › Nhóm hàng hoá → cây hiện như trước, thu gọn/mở rộng, bấm tên mở dialog sửa,
    "Lưu và thêm mới" có mặt, nút nhập/xuất còn; Network: `POST /v2/inventory/item-categories/tree` body `{}` hoặc
    `{ search }` (AC-10). Chụp ảnh.

## In scope

- Migration + entity + luật cha/con + config field (T-01-01).
- Endpoint cây CQRS + api-client (T-01-02).
- `CRUD_TREE_ENTITIES`, `useCrudTree`, `CrudListPage`/`useCrudApi` tổng quát hoá (T-01-03).
- `CrudFormDialog` defaults + picker lọc theo loại, `TreeSelectInput.filters`, `TREE_PICKER_CONFIG`, `navConfig` (T-01-04).

## Not in scope

- Dropdown trên 4 dialog phiếu (UOW-02).
- Seed nhóm mặc định (A-05), báo cáo cộng dồn (A-07), validate `categoryId` dòng phiếu.

## Risks

| Risk | Mitigation |
| --- | --- |
| Tổng quát hoá làm hỏng Nhóm hàng hoá | Giữ nguyên `path`/`queryKey`/body cho `inventory-item-categories`; AC-10 kiểm ở bước 10 demo; `tsc` sạch |
| `migration:run` local áp cả migration khác đang chờ | Bước 1 hỏi Akenzy trước khi chạy |
| Dữ liệu cũ có vòng cha/con | Không thể: cột mới, mọi dòng null; `assertNoCycle` vẫn dùng tập `seen` |
| `isActive` filter từ select cột là chuỗi `'true'/'false'` | `CrudListPage` đổi sang boolean trước khi gửi; DTO `@IsBoolean` |

## Definition of done

- [ ] AC-01 … AC-07, AC-09, AC-10 pass — từng AC đã có bằng chứng ở ticket (spec, e2e, Playwright); ô này tick khi demo dưới chạy xong
- [x] `pnpm --filter @erp/api test -- cash-voucher-categories.service.spec.ts search-cash-voucher-category-tree.handler.spec.ts` xanh; toàn bộ `pnpm --filter @erp/api test` xanh — 20/20 + 6/6; toàn bộ 410 suite / 5 686 test xanh (1 skipped có sẵn), 18/09/2026
- [x] `pnpm migration:generate` sau `migration:run` không sinh câu nào nhắc tới `parent_group_id`, FK hay index mới — tiêu chí gốc "không ra diff" được Akenzy đổi 18/09/2026 vì repo lệch entity ↔ migration từ trước (xem T-01-01)
- [x] `tsc --noEmit` của `apps/api` và `apps/backoffice-web` sạch — 18/09/2026
- [x] `packages/api-client/src/generated/schema.ts` + `openapi.snapshot.json` sinh lại và commit — a03de26f, ce6d973a
- [ ] Demo script chạy đầu-cuối và được nghiệm thu ở G4
