---
id: UOW-01
slug: cash-voucher-category-options
title: Kế toán chọn được 14 mục chi mới, đúng thứ tự ảnh, trên org đang có và org tạo mới
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-02, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08]
risk: medium
status: todo
rollback: revert commit hook FE ⇒ dropdown về thứ tự ngày tạo; down() của migration là no-op — mục đã chèn tắt bằng "Đang hoạt động" = không, tên/thứ tự sửa lại trên màn danh mục /admin/cash-voucher-categories
---

# UOW-01 — Mục chi mới trên phiếu thu chi

Một danh sách mặc định cho org tạo mới, một migration dữ liệu đưa mọi org đang có về cùng danh sách đó mà không
đè chỉnh sửa của org, và dropdown của 4 loại phiếu sắp theo `display_order`. Ba quyết định Akenzy chốt ngày
11/09/2026: bổ sung org cũ bằng migration (A-03), đổi tên tại chỗ (A-04), thứ tự theo ảnh (A-05).

## Demo script

Môi trường `local-backoffice` (Chrome của Akenzy, org MT), DB `erp_dev_3008`.

1. Kiểm DB đích: `SELECT DISTINCT datname FROM pg_stat_activity WHERE usename = 'erp_user'` có `erp_dev_3008`;
   `DB_NAME=erp_dev_3008 pnpm --filter @erp/api migration:show` (chỉ đọc) — ghi lại các migration đang chờ.
2. Trước migration (SQL chỉ đọc): số mục theo org × loại — MT 9 thu / 20 chi; My Company 9 thu / 19 chi (thiếu
   `BANK_FEE`). Ghi id của `CHI_TIEN_NUOC` và `CHI_CCDC` ở org MT.
3. **Hỏi Akenzy trước**, rồi `DB_NAME=erp_dev_3008 pnpm --filter @erp/api migration:run` — lệnh này áp luôn các
   migration đang chờ ở bước 1.
4. Sau migration (SQL): cả hai org 9 thu / 34 chi; `CHI_TIEN_NUOC` = "Tiền nước sinh hoạt", `CHI_CCDC` = "Mua đồ
   dùng, công cụ, dụng cụ", id hai dòng đó giống bước 2; My Company có `BANK_FEE` với `display_order` 43.
5. Backoffice: Quỹ tiền › Thu chi tiền mặt → thêm Phiếu chi → dòng chi tiết, mở dropdown mục chi → 34 mục theo
   đúng thứ tự AC-06: "Tiền điện", "Tiền điện thoại", … "Tiền ăn", "Tiền nước uống", "Chi trả nợ nhà cung cấp",
   "Phí ngân hàng". Chụp ảnh. Đóng, không lưu.
6. Quỹ tiền › Thu chi tiền gửi → Phiếu chi tiền gửi → cùng thứ tự. Phiếu thu tiền mặt → mục thu "Thu từ bán hàng"
   … "Thu nhận tiền gửi vào ngân hàng", "Thu nợ khách hàng". Chụp ảnh. Đóng, không lưu.
7. DevTools › Network: request `…/admin/entities/cash-voucher-categories/records` mang
   `sortBy=displayOrder&sortOrder=asc`.
8. SQL tìm một dòng phiếu chi của org MT có `category_id` = id `CHI_TIEN_NUOC`. Có thì mở phiếu đó ở chế độ xem →
   cột mục chi hiện "Tiền nước sinh hoạt". Không có thì ghi "không có dữ liệu" — AC-02 đã có e2e.

## In scope

- `DEFAULT_CASH_VOUCHER_CATEGORIES`: 14 mục chi mới, 2 mục đổi tên, `display_order` mục chi đánh lại theo ảnh (T-01-01).
- Migration `1789930000000-BackfillCashVoucherCategoryOptions` và e2e trên `erp_test` (T-01-02).
- `useCashVoucherCategories` gửi `sortBy=displayOrder&sortOrder=asc` (T-01-03).

## Not in scope

- Nhóm mục có tiêu đề (A-02).
- Ẩn hoặc xoá 3 mục hệ thống không có trong ảnh: code resolve theo mã.
- `inventory.seed.ts` (A-09).
- POS: không có dropdown mục thu/chi; phiếu POS gắn mã cố định.

## Risks

| Risk | Mitigation |
| --- | --- |
| Migration trên prod đè tên/thứ tự org đã tự sửa | Mọi UPDATE có điều kiện "giá trị vẫn là mặc định cũ"; e2e có org đã tuỳ biến (AC-03) |
| INSERT vỡ UNIQUE `(organization_id, code)` vì dòng đã xoá mềm | NOT EXISTS theo `(organization_id, code)` không lọc `deleted_at`; e2e (AC-04) |
| Guard trùng tên (A-06) so `lower(btrim(name))`; nếu DB dùng `lc_ctype` C thì chữ có dấu khác hoa/thường không bị hạ | Chỉ lọt trường hợp org tự tạo mục trùng tên nhưng khác hoa/thường có dấu; xử lý tay bằng tắt một mục |
| `migration:run` local áp cả migration khác đang chờ | Bước 3 hỏi Akenzy trước khi chạy |

## Definition of done

- [x] AC-01 … AC-08 pass
- [x] `pnpm --filter @erp/api test -- cash-voucher-category.seeder.spec.ts` xanh (cùng `organization.service.spec.ts`: 23/23)
- [x] `pnpm --filter @erp/api test:e2e -- cash-voucher-category-backfill` xanh (7/7)
- [x] `tsc --noEmit` của `apps/api` và `apps/backoffice-web` sạch
- [x] Demo script chạy đầu-cuối và được nghiệm thu ở G4 — Akenzy nghiệm thu ngày 12/09/2026, chấp nhận hai điểm chệch: bước 8 không có dữ liệu để chạy, bước 7 đổi cách kiểm

Trạng thái 2026-09-12: demo đã chạy trên `erp_dev_3008` sau khi Akenzy tự chạy `migration:run` — cả 4 dialog
(thu/chi tiền mặt, thu/chi tiền gửi) hiện đúng danh sách và thứ tự, ảnh chụp và số liệu SQL ghi ở T-01-03.
Bước 8 không chạy được vì org MT không có phiếu nào gắn hai mục đổi tên; bước 7 đổi cách kiểm (xem T-01-03).
Ô nghiệm thu để trống cho tới khi Akenzy chốt hai điểm chệch này.
