---
id: UOW-01
slug: seed-reads-shared-list
title: DB dev dựng mới có đúng 43 mục thu/chi như org tạo qua ứng dụng
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03]
risk: low
status: todo
rollback: revert đúng một file `inventory.seed.ts` cùng spec mới; không có migration, không có dữ liệu nào bị đụng
---

# UOW-01 — `seed:inventory` đọc danh sách mặc định dùng chung

Một lát cắt, một ticket: đổi khối `cash_voucher_categories` của `inventory.seed.ts` sang đọc
`DEFAULT_CASH_VOUCHER_CATEGORIES`, kèm spec chặn literal quay lại.

## Demo script

1. `grep -n "THU_BAN_HANG\|CHI_KHAC\|BANK_FEE" apps/api/src/database/seeds/inventory.seed.ts` → không còn dòng nào.
2. `pnpm --filter @erp/api test -- inventory-seed-categories.spec.ts` → xanh; thử chèn tạm một dòng literal vào
   file rồi chạy lại → **đỏ**; bỏ dòng đó ra → xanh lại. (Bước này chứng minh spec thật sự chặn, không chỉ chạy qua.)
3. **Akenzy chạy** (Claude bị chặn quyền `migration:run`):
   `createdb erp_seed_check && DB_NAME=erp_seed_check pnpm --filter @erp/api migration:run && DB_NAME=erp_seed_check pnpm --filter @erp/api seed:inventory`
4. SQL trên `erp_seed_check`: `select count(*) from cash_voucher_categories` → **43**; và
   `select code, name, direction, display_order from cash_voucher_categories order by display_order` khớp từng dòng
   với bảng "Danh sách đích" của `2026091104/03-logical-design.md`.
5. Chạy lại `seed:inventory` lần hai → vẫn 43 dòng, không trùng mã (AC-02).
6. `dropdb erp_seed_check`.

Nếu Akenzy không muốn dựng DB trắng, AC-01 và AC-02 dừng ở mức đọc mã cộng spec quét mã nguồn — ghi rõ điều đó vào
ticket thay vì tick bừa (A-05).

## In scope

- Khối `cash_voucher_categories` trong `inventory.seed.ts`.
- Spec mới quét mã nguồn của file seed đó.

## Not in scope

- Các khối seed khác trong cùng file (COA, payment accounts, items demo).
- `seed:org`, `seed:new-org` — đã đọc constant.
- Dữ liệu prod và org đang tồn tại (migration `1789930000000` đã xử lý).

## Risks

| Risk | Mitigation |
| --- | --- |
| Seed đang được dùng làm fixture ngầm trong test (A-01) | Kiểm `grep -rn "inventory.seed"` trước khi sửa; nếu có, mở rộng phạm vi và ghi lại |
| Không dựng được DB trắng ⇒ AC-01 thiếu bằng chứng chạy thật | Ghi rõ mức bằng chứng thực tế vào ticket; spec quét mã nguồn vẫn chặn được hồi quy |

## Definition of done

- [ ] AC-01, AC-02, AC-03 pass (hoặc ghi rõ mức bằng chứng nếu không dựng DB trắng)
- [ ] `inventory.seed.ts` không còn mã danh mục literal nào
- [ ] `pnpm --filter @erp/api test -- inventory-seed-categories.spec.ts` xanh, và đã thử làm nó đỏ có chủ đích
- [ ] `npx tsc --noEmit -p apps/api/tsconfig.json` sạch
- [ ] Demo script chạy đầu-cuối và được nghiệm thu ở G4
