---
feature: cash-voucher-category-tree
slug: 2026091801-cash-voucher-category-tree
owner: Akenzy
created: 2026-09-18
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Danh mục thu chi cấu hình trên UI, dạng cây như Nhóm hàng hoá

Nguồn: Akenzy, 18/09/2026 — "Danh mục thu chi user want to setting it on UI, and the Danh mục thu chi should be
tree level same category product." Bốn quyết định chốt cùng ngày (D1–D4 trong `01-assumptions.md`).

## Problem

Danh mục thu chi (`cash_voucher_categories`, "Mục thu / Mục chi") đã là bảng theo org, đăng ký trên nền CRUD chung
với đủ bốn quyền `accounting.cash_voucher_category.{create,read,update,delete}`, seed 43 mục mặc định. Nhưng:

1. **Không có lối vào trên UI.** `/admin/cash-voucher-categories` chỉ render qua route bắt-tất-cả
   `/admin/:entityKey` → `CrudListPage`; `navConfig.ts` không trỏ tới nó nên người dùng phải gõ URL. Form chung
   mặc định "Đang hoạt động" = `false` (mục mới tạo ra bị tắt) và cột Loại hiện `IN`/`OUT` thô.
2. **Danh mục phẳng.** Hệ thống nguồn mà người dùng chép danh sách (feature `2026091104`, ảnh 1–6) có nhóm tiêu
   đề; A-02 của feature đó cố ý giữ phẳng. Nay người dùng muốn cây cha → con như Nhóm hàng hoá
   (`inventory-item-categories`): tạo nhóm, đưa mục vào nhóm, thu gọn / mở rộng, và dropdown trên phiếu hiện mục
   con thụt lề dưới mục cha.

Đối chiếu hai mô hình hiện có trong repo (18/09/2026):

- Nhóm hàng hoá: cột `parent_group_id` tự tham chiếu (`ON DELETE SET NULL`), đọc cây bằng CQRS
  `POST /v2/inventory/item-categories/tree` dựng cây trong bộ nhớ, `CrudListPage` render bảng thụt lề có chevron
  — nhưng **gắn cứng** `entityKey === "inventory-item-categories"` ở 11 chỗ.
- Nhóm NCC (`provider-groups`): cùng mô hình cột, có thêm `assertNoCycle` chặn vòng mọi tầng (Nhóm hàng hoá
  không có).
- Danh mục thu chi xoá **mềm** (`DeletionPolicy.SOFT`) nên FK `SET NULL` không bao giờ chạy — không thể chép
  nguyên hành vi "xoá cha, con lên gốc" của Nhóm hàng hoá.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Quản lý / kế toán trưởng cấu hình danh mục | Gõ tay URL `/admin/cash-voucher-categories`; bảng phẳng; tạo mục mới bị tắt vì form mặc định "Đang hoạt động" = không | Menu Danh mục › THU, CHI › Danh mục thu chi; bảng dạng cây, tạo nhóm và chọn "Mục cha"; mục mới mặc định đang hoạt động |
| Kế toán / thu ngân lập phiếu thu, chi (tiền mặt, tiền gửi) | Dropdown Mục thu / Mục chi là danh sách phẳng theo `display_order` | Dropdown theo thứ tự cây, mục con thụt lề dưới mục cha; chọn được cả cha lẫn con |
| Người dùng Nhóm hàng hoá | Bảng cây hoạt động như hiện tại | Không đổi gì sau khi tổng quát hoá chế độ cây |

## Success signal

Trên `local-backoffice` (DB `erp_dev_3008`) sau `migration:run`, không sửa DB bằng tay:

1. Menu Danh mục › THU, CHI có "Danh mục thu chi"; tài khoản không có `accounting.cash_voucher_category.read`
   không thấy mục menu và bị chặn khi vào thẳng URL.
2. Tạo nhóm "Chi phí vận hành" (Chi), tạo "Tiền điện" với Mục cha = nhóm đó → bảng hiện "Tiền điện" thụt lề dưới
   "Chi phí vận hành", thu gọn / mở rộng được; chọn Mục cha loại Thu cho mục Chi → bị từ chối; xoá nhóm đang có
   con → bị từ chối với thông báo tiếng Việt.
3. Phiếu chi tiền mặt → dropdown Mục chi hiện "Chi phí vận hành" rồi "Tiền điện" thụt lề ngay dưới; lưu phiếu với
   "Tiền điện", mở lại thấy đúng tên. Ba dialog còn lại tương tự.
4. `/admin/inventory-item-categories` hoạt động y như trước (cây, thu gọn, dialog sửa, "Lưu và thêm mới", nhập/xuất).

## Out of scope

- Seed sẵn nhóm cha cho 43 mục mặc định — giữ phẳng, người dùng tự nhóm trên UI (D4). Không có migration dữ liệu.
- Cộng dồn mục con vào mục cha trên báo cáo (`business-results.report.ts` vẫn một dòng mỗi mục).
- Kiểm tra `categoryId` của dòng phiếu ở BE (tồn tại / đúng org / đúng loại) — lỗ hổng có sẵn, không thuộc yêu cầu.
- Ẩn mục đã tắt khỏi dropdown — hook đang trả cả mục tắt để `useCategoryNameMap` còn hiện tên trên phiếu cũ.
- `inventory.seed.ts` (feature `2026091201` đang ở G3), POS và mobile (không có picker mục thu/chi).
- Giới hạn độ sâu cây (Nhóm hàng hoá cũng không giới hạn).

## Constraints

| Kind | Detail |
| --- | --- |
| Schema | Chỉ thêm cột `parent_group_id` + FK + index qua migration TypeORM; `synchronize: false`; `migration:generate` sau đó phải không ra diff |
| API | Endpoint đọc cây là endpoint **mới** theo CQRS (`@nestjs/cqrs`, `QueryBus`), không sửa hay tái dùng danh sách phẳng `/admin/entities/.../records` cho việc dựng cây (ghi chú của Akenzy trong `enddate.md`) |
| Frontend | Ưu tiên tái sử dụng: tổng quát hoá chế độ cây của `CrudListPage`, không viết trang riêng; giữ `queryKey`/body của Nhóm hàng hoá y nguyên để các `invalidateQueries` hiện có còn chạy |
| Quyền | Dùng bốn quyền đã seed; endpoint cây gác bằng `accounting.cash_voucher_category.read` — cùng quyền mà hook dropdown đang cần, nên không có vai trò nào mất dropdown |
| Môi trường local | `erp_dev_3008`: Claude từng bị chặn quyền chạy `migration:run` (T-01-03 của feature `2026091104`) — hỏi Akenzy trước khi chạy |
| Deadline | Không nêu |

## Existing surface touched

- `cash-voucher-category.entity.ts`, `cash-voucher-categories.service.ts` (+ `CASH_VOUCHER_CATEGORY_ENTITY_CONFIG`),
  `cash-vouchers.module.ts` — thêm cột, luật cha/con, endpoint cây.
- `CrudListPage.tsx`, `useCrudApi.ts`, `itemCategoryTree.ts`, `CrudFormDialog.tsx`, `TreeSelectInput.tsx`,
  `CrudFieldInput.tsx`, `navConfig.ts` — tổng quát hoá chế độ cây và mở lối vào.
- `useCashVoucherCategories` → 4 dialog: Phiếu thu/chi tiền mặt, Phiếu thu/chi tiền gửi — đổi nguồn sang endpoint
  cây, thụt lề option.
- `packages/api-client` — sinh lại sau khi thêm endpoint (`pnpm openapi:generate`).
