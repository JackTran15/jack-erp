# TKT-2405-05 Permissions & seed for payment accounts + default revenue

## Epic

[EPIC2405 payment_accounts + auto-resolve revenueAccountId](../EPIC2405.md)

## Layer

🟦 Backend only (RBAC + seed).

## Summary

Thêm permission cho `payment_account` + `default_account`, và seed dữ liệu cấu hình cho branch demo. Vì validation là **fail-closed** (branch chưa có `payment_accounts` thì không checkout được), seed là tiền đề bắt buộc để flow chạy ngay sau khi triển khai.

## Deliverables

- `apps/api/src/modules/rbac/permissions.seed.ts` — thêm vào `PERMISSION_DEFINITIONS`: `accounting.payment_account.{read,create,update,delete}`, `accounting.default_account.{read,manage}`.
- `apps/api/src/database/seeds/org-role-permissions.ts` — cấp `accounting.payment_account.read` cho role POS (seed token dùng `inventory-admin`); verify sweep `key.startsWith('accounting.')` đã phủ các quyền còn lại cho admin role.
- `apps/api/src/database/seeds/inventory.seed.ts` (sau insert `cash_accounts` ~line 353):
  - `payment_accounts` cho `IDS.branch`: `cash` → `accountCash` (TK1111, label "Tiền mặt"); `bank_transfer` → `accountBank` (TK1121, demo `bank_name`/`bank_code`/`account_number`); `card` → `accountBank`.
  - `accounting_default_account`: role `REVENUE`, branch NULL, `accountRevenue` (TK5111).

## Acceptance Criteria

- [ ] `pnpm seed:inventory` idempotent (`ON CONFLICT DO NOTHING`), tạo `payment_accounts` + default revenue.
- [ ] Role POS gọi được `GET /payment-accounts` (không 403).
- [ ] `GET /payment-accounts?branchId=<demo>` trả ≥2 dòng (cash + bank) với label ghép đúng format.
- [ ] Resolver tìm được default revenue (TK5111) cho org demo.

## Definition of Done

- [ ] PR seed + permission updates; chạy `seed:inventory` sạch trên DB rỗng và DB đã seed (idempotent).
- [ ] Endpoint `GET /payment-accounts` trả data sau seed.

## Tech Approach

- INSERT parameterized `ON CONFLICT DO NOTHING` theo style hiện có trong `inventory.seed.ts`.
- **Rollout note:** branch chưa seed `payment_accounts` sẽ không checkout được (validation fail-closed) — ghi rõ trong PR; branch mới cần cấu hình payment account trước khi bán.

## Dependencies

- Requires: TKT-2405-01 (schema); TKT-2405-02 (read endpoint để verify quyền).
- Hỗ trợ verify: TKT-2405-04.
