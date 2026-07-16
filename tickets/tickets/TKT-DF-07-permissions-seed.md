# TKT-DF-07 Permissions seed + COA 112x verify

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Nền tảng](../epics/EPIC-15072026-deposit-fund-foundation.md)

## Summary

Seed các permission `accounting.*` cho quỹ tiền gửi (mirror bộ permission tiền mặt ở TKT-CV-07) để controller generic
CRUD + `/deposit-ledger` gate được `@RequirePermission(...)`, và verify COA 112x (`112`/`1121`) đã seed để làm
`deposit_accounts.account_id`. Không seed dữ liệu nghiệp vụ (tài khoản/ payment policy) — đó là việc nhập tay của kế toán.

## Deliverables

- `apps/api/src/modules/rbac/seeders/*` (hoặc file seed permission accounting hiện hành) — thêm permission keys mới alongside `accounting.cash_*`.
- Verify `apps/api/src/modules/accounting/seeders/coa-seeder.service.ts` seed TK `112` / `1121` (Tiền gửi ngân hàng) — nếu thiếu thì bổ sung (idempotent seeder).
- Gán permission mới vào role mặc định (admin/accountant) theo cách các permission accounting hiện có được gán.

**Permission keys (catalog):**
- `accounting.deposit_account.read` / `.create` / `.update` / `.delete`
- `accounting.deposit_payment_policy.read` / `.create` / `.update` / `.delete`
- `accounting.deposit_ledger.read`
- `accounting.bank.read` / `.create` / `.update` / `.delete`

## Acceptance Criteria

- [ ] Tất cả permission keys trên được seed idempotent (chạy lại không nhân đôi); mô tả tiếng Việt cho label FE (nếu bảng permission có cột label) — key/identifier tiếng Anh.
- [ ] Permission gán vào role admin (+ accountant nếu role đó tồn tại) theo pattern các permission `accounting.cash_*` hiện có.
- [ ] Generic CRUD config (DF-03) tham chiếu đúng key (`deposit_accounts` → `accounting.deposit_account.*`; `banks` → `accounting.bank.*`; `deposit_payment_policy` → `accounting.deposit_payment_policy.*`); `/deposit-ledger` → `accounting.deposit_ledger.read`.
- [ ] COA `112`/`1121` (ASSET, Tiền gửi ngân hàng) tồn tại sau seed — dùng làm `deposit_accounts.account_id` (contra/debit của bút toán tiền gửi).
- [ ] Không seed row nghiệp vụ (deposit account, payment policy) — chỉ catalog permission + COA.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Seed chạy 2 lần → không lỗi, không duplicate (idempotent verify).
- [ ] Không đổi schema; `synchronize` giữ false.
- [ ] Không có tiếng Việt trong backend source (trừ label FE nếu schema permission tách label khỏi key).
- [ ] Không có TODO/FIXME ngoài kế hoạch.

## Tech Approach

Tìm nơi seed permission accounting hiện tại (grep `accounting.cash_receipt` trong seeders/rbac) và thêm block mirror.
Mirror cách TKT-CV-07 seed `accounting.cash_receipt.*` / `accounting.cash_ledger.read`. COA verify: reuse
`coa-seeder.service.ts` — check TK 112/1121 (ASSET) có trong `DEFAULT_COA` chưa; thiếu thì thêm entry idempotent.

```ts
const DEPOSIT_PERMISSIONS = [
  'accounting.deposit_account.read', 'accounting.deposit_account.create',
  'accounting.deposit_account.update', 'accounting.deposit_account.delete',
  'accounting.deposit_payment_policy.read', 'accounting.deposit_payment_policy.create',
  'accounting.deposit_payment_policy.update', 'accounting.deposit_payment_policy.delete',
  'accounting.deposit_ledger.read',
  'accounting.bank.read', 'accounting.bank.create', 'accounting.bank.update', 'accounting.bank.delete',
];
```

## Testing Strategy

- **Unit / integration** (seeder spec nếu có pattern): chạy seed → assert các permission key tồn tại + gán role admin; chạy lại → count không đổi (idempotent).
- COA verify: assert `accounts` có code `112`/`1121` sau seed.
- Gate 403 khi thiếu permission verify gián tiếp qua E2E controller ở DF-11 (login role có/không permission).

## Dependencies

- Depends on: TKT-DF-03 (CRUD config + controller tham chiếu key).
- Blocks: TKT-DF-08 (BE hoàn chỉnh trước openapi regen), TKT-DF-11 (E2E cần permission seed).
