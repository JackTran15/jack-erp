---
id: UOW-02
slug: users-me-cache
title: /admin/users/me đọc từ cache, invalidate khi ghi
demoable: true
duration: 1d
depends_on: []
requirements: [US-03]
verifies: [AC-08, AC-09, AC-10]
risk: medium
status: todo
rollback: một commit revert; không migration, không đổi hợp đồng API
---

# UOW-02 — `/admin/users/me` đọc từ cache

## Demo script

1. Đăng nhập backoffice, mở DevTools Network, tải lại trang → `GET /admin/users/me`.
2. Log API lần đầu: `Cache miss: cache:users-me:<userId>:<orgId>`. Tải lại trang →
   `Cache hit`, và **không có** truy vấn `users`/`user_roles`/`user_branch_assignments`
   nào trong log SQL (AC-08).
3. Mở tab admin thứ hai bằng tài khoản quản trị, gán thêm một vai trò cho tài khoản ở
   bước 1. Quay lại tab đầu, tải lại → vai trò mới hiện ra **ngay**, không chờ 15 phút,
   và log ghi `Cache invalidated: cache:users-me:…` (AC-09).
4. Lặp lại bước 3 cho: bỏ vai trò, gán chi nhánh, bỏ chi nhánh, sửa hồ sơ nhân sự.
5. `docker compose stop redis` → tải lại trang: `/admin/users/me` vẫn **200** với dữ liệu
   đúng, log có dòng lỗi cache nhưng không có 500 (AC-10). `docker compose start redis`.

## In scope

- `getMe` bọc trong `CacheService.getOrSet`, namespace `users-me`, khoá `<userId>:<orgId>`,
  TTL 15 phút (ADR-04).
- Bọc try/catch quanh đường cache để Redis chết không làm chết endpoint — `getOrSet`
  hiện **không** tự bọc.
- Invalidate ở mọi đường ghi chạm vào user / vai trò / chi nhánh / hồ sơ nhân sự.

## Not in scope

- `/branches/me` — đã có cache `my-branches` từ trước.
- `rbac:perms` — đã có cache riêng.
- Nguyên nhân thật của 641 ms (event loop bị `bcryptjs` chặn) — A-09, feature khác.

## Risks

| Risk | Mitigation |
|---|---|
| Bỏ sót một đường ghi → người dùng thấy quyền cũ | T-02-02 liệt kê từng đường thành checklist đối chiếu với kết quả grep, không dựa vào thử tay. TTL 15 phút là lưới đỡ (ADR-04) |
| Redis chết làm chết endpoint danh tính → không ai đăng nhập được | AC-10 có test riêng cho nhánh này |
| Cache lẫn giữa hai tổ chức của cùng một người | Khoá gồm cả `orgId`, giống hệt khuôn `my-branches` |

## Definition of done

- [x] AC-08, AC-09, AC-10 có test phủ
- [x] Năm kịch bản của Demo script được phủ bằng e2e thay vì bấm tay
      (`pnpm test:e2e -- users-me-cache` → 6/6), gồm cả nhánh Redis chết: unit test
      `reads through to the database when the cache throws` chứng minh endpoint vẫn trả
      đúng dữ liệu khi `getOrSet` ném
- [x] `pnpm --filter @erp/api test` — 4262 pass (2 fail có sẵn, xem UOW-01)
- [x] Không tiếng Việt trong source backend

## Còn lại (cần người chạy tay)

Bước 5 của Demo script — `docker compose stop redis` rồi tải lại trang backoffice thật.
E2E phủ nhánh "cache ném" bằng mock; nó không chứng minh hành vi khi Redis thật sự chết
giữa chừng (timeout khác với ném ngay).
