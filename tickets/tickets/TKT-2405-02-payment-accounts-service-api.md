# TKT-2405-02 Payment accounts service, API & line validation

## Epic

[EPIC2405 payment_accounts + auto-resolve revenueAccountId](../EPIC2405.md)

## Layer

🟦 Backend only.

## Summary

`PaymentAccountService` + controller `@Controller('payment-accounts')` cung cấp: (1) endpoint đọc cho POS dựng dropdown "Tài khoản thu", (2) CRUD cho admin cấu hình tài khoản nhận tiền (ngân hàng/số TK → COA), (3) `validatePaymentLines` — whitelist đồng bộ để chặn lỗi accountId rác (`f29226ef...`) ngay tại checkout thay vì rơi DLQ.

## Deliverables

- `payment-account.service.ts`:
  - `listForPos(organizationId, branchId, method?)` → flat `PaymentAccountEntity[]`, chỉ active, `ORDER BY sort_order, label`. Dùng `createQueryBuilder` org + branchId **explicit** + optional method — **không** dùng BaseCrudService branch-scoping (vì nó ép `actor.branchId`).
  - `create/update/softDelete(...)` cho admin (mirror `CashService.createAccount`).
  - `validatePaymentLines(lines:{accountId, paymentMethod}[], organizationId, branchId)` — **1 query** lấy active `payment_accounts` JOIN `accounts` (cả 2 `is_active`) cho branch → build `Set<"method:accountId">` → `BadRequestException` cho line không khớp.
- `payment-account.controller.ts` — guards/interceptor như `cash.controller.ts` (`AuditInterceptor`, `PermissionGuard`, `BranchScopeGuard`, `@RequireBranchScope()`):
  - `GET /payment-accounts?branchId=&method=` → `listForPos` (perm `accounting.payment_account.read`).
  - `POST /payment-accounts` / `PATCH /:id` / `DELETE /:id` (perms `accounting.payment_account.{create,update,delete}`).
- `dto/create-payment-account.dto.ts`, `dto/update-payment-account.dto.ts` — class-validator + `@ApiProperty`.
- Thêm `PaymentAccountService` vào providers + exports của `payment-accounts.module.ts`.

## Acceptance Criteria

- [ ] `GET /payment-accounts` trả flat list active theo branch, lọc optional `method`, sort theo `sort_order` rồi `label`.
- [ ] CRUD org+branch scoped; DELETE là soft-delete (`deleted_at`).
- [ ] `validatePaymentLines`: line `accountId` không thuộc whitelist `(org, branch, method)` → 400; account inactive (ở `payment_accounts` **hoặc** COA `accounts`) → 400; nhiều line chỉ 1 query.
- [ ] Source tiếng Anh; Swagger mô tả endpoint + DTO.

## Definition of Done

- [ ] PR service + controller + DTO; build pass.
- [ ] Unit test `payment-account.service.spec.ts`: `listForPos` lọc/đúng thứ tự; `validatePaymentLines` happy + 400 (sai method, account lạ, inactive).

## Tech Approach

- Mirror module `accounting/cash`.
- `branchId` lấy **explicit từ query** (thu ngân có thể xem branch khác actor scope — kiểm soát ở permission/branch-scope guard).
- Validate in-memory sau 1 query (không N+1).

## Dependencies

- Requires: TKT-2405-01.
- Blocks: TKT-2405-04 (checkout gọi `validatePaymentLines`), TKT-2405-06/07 (FE đọc endpoint).
