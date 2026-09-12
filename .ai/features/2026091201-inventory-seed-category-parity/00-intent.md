---
feature: inventory-seed-category-parity
slug: 2026091201-inventory-seed-category-parity
owner: Akenzy
created: 2026-09-12
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — `seed:inventory` dựng org demo với danh mục thu/chi cũ

Nguồn: A-09 của `2026091104-cash-voucher-category-options`. Akenzy chốt ngày 12/09/2026 là mở plan dọn riêng
thay vì để làm nợ kỹ thuật.

## Problem

`inventory.seed.ts` khai **literal riêng** 28 mục thu/chi trong một khối `INSERT … VALUES`
(`inventory.seed.ts:638-676`), thay vì đọc `DEFAULT_CASH_VOUCHER_CATEGORIES` như
`org-baseline-seed.core.ts:330-350` đang làm.

Danh sách literal đó đã lệch hai lần:

- thiếu `BANK_FEE`, thêm vào constant từ commit `e52140b6`;
- thiếu 14 mục chi mới và 2 mục đổi tên của `2026091104` (12/09/2026).

Hệ quả: một DB dev dựng mới bằng `pnpm seed:inventory` **sau** khi chạy migration sẽ có org demo với 28 mục cũ —
migration backfill không cứu được, vì nó đã được ghi nhận là đã chạy trước khi org demo tồn tại. Người dev tiếp theo
sẽ thấy dropdown thiếu mục và không hiểu vì sao, trong khi org tạo qua ứng dụng thì đủ.

Đây là lỗi kiểu "hai nguồn sự thật cho cùng một danh sách", không phải lỗi dữ liệu prod.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Dev dựng DB mới | `seed:inventory` cho org demo 28 mục cũ, lệch với org tạo qua app | Org demo và org tạo qua app cùng một danh sách |
| Người sửa danh sách mặc định lần sau | Phải nhớ sửa hai chỗ; quên một chỗ thì không có gì báo | Sửa một chỗ; có test chặn nếu literal quay lại |

## Success signal

1. Dựng một DB trắng, chạy migration rồi `pnpm seed:inventory`: org demo có đúng 43 mục, khớp từng dòng
   `(code, name, direction, display_order)` với `DEFAULT_CASH_VOUCHER_CATEGORIES`.
2. `inventory.seed.ts` không còn chuỗi mã danh mục nào (`THU_…`, `CHI_…`, `BANK_FEE`), và có test chặn việc
   literal quay lại.

## Out of scope

- Các literal khác trong `inventory.seed.ts` (COA, payment accounts, items demo) — cùng bệnh nhưng chưa ai bị.
- Dữ liệu prod và org đang tồn tại — migration `1789930000000` đã xử lý xong.
- `seed:org`, `seed:new-org` — đã đọc constant.

## Constraints

| Kind | Detail |
| --- | --- |
| Phạm vi | Seed chỉ dùng cho dev/demo; không ảnh hưởng prod |
| Tương thích | Giữ nguyên `ON CONFLICT (organization_id, code) DO UPDATE`, nên chạy lại seed vẫn là upsert |
| Kiểm chứng | Dựng DB trắng cần quyền `CREATE DATABASE`; bộ phân loại quyền của Claude Code chặn `migration:run`, nên bước đó Akenzy tự chạy hoặc dùng test quét mã nguồn |
| Deadline | Không có |

## Existing surface touched

- `apps/api/src/database/seeds/inventory.seed.ts` — khối `cash_voucher_categories`.
- `DEFAULT_CASH_VOUCHER_CATEGORIES` (`cash-voucher-category.seeder.ts`) — chỉ đọc, không sửa.
- Khuôn có sẵn để bắt chước: `org-baseline-seed.core.ts:330-350`.
