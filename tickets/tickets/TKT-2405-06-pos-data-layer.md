# TKT-2405-06 POS data layer for /payment-accounts

## Epic

[EPIC2405 payment_accounts + auto-resolve revenueAccountId](../EPIC2405.md)

## Layer

🟩 Frontend only (pos-web).

## Summary

Tầng dữ liệu pos-web tiêu thụ endpoint mới `GET /payment-accounts` (interface/dto/service/hook/query-key), và bỏ phần resolve `revenueAccountId` phía FE (BE tự lo). Tuân chặt `apps/pos-web/CLAUDE.md` (no `index.ts`, named export, đúng layer).

## Deliverables

- `interfaces/account.interface.ts` — thêm `PaymentAccountRow { id; paymentMethod: ApiPaymentMethod; accountId: string; bankName?: string; bankCode?: string; accountNumber?: string; label?: string; isActive: boolean; sortOrder: number }`.
- `dtos/account.dto.ts` — thêm `ListPaymentAccountsParams { branchId: string; method?: ApiPaymentMethod }`.
- `services/account.service.ts` — đổi `listPaymentAccounts` sang `GET /payment-accounts?branchId=&method=` trả `Promise<PaymentAccountRow[]>`. Giữ `listAccounts` (còn dùng cho receivable).
- `constants/react-query-key.constant.ts` — `ACCOUNT_KEYS.PAYMENT` → `(branchId) => ['accounts','payment',branchId]`; **xóa** `REVENUE`; giữ `RECEIVABLE`.
- `hooks/react-query/use-query-account.ts` — `usePaymentAccountsQuery(branchId)` tham số hóa; **xóa** `useRevenueAccountsQuery`; giữ `useReceivableAccountsQuery` + `pickAccountByCodePrefix`.

## Acceptance Criteria

- [ ] `usePaymentAccountsQuery(branchId)` gọi `/payment-accounts?branchId=...`; queryKey gồm `branchId`.
- [ ] `useRevenueAccountsQuery` + `ACCOUNT_KEYS.REVENUE` bị xóa, không còn reference nào trong repo.
- [ ] Endpoint cũ sai (`/accounts?type=ASSET` cho payment) không còn dùng cho payment dropdown.
- [ ] Tuân `apps/pos-web/CLAUDE.md`: service trong `src/services`, hook trong `src/hooks/react-query`, key tập trung, không `index.ts`, named export.

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` pass.
- [ ] Grep không còn `useRevenueAccountsQuery`.

## Tech Approach

- `branchId` lấy từ active branch hiện tại của POS (header `X-Branch-Id` / store).
- BE trả flat array → service trả thẳng `PaymentAccountRow[]` (không envelope phân trang).

## Dependencies

- Requires: TKT-2405-02 (endpoint `GET /payment-accounts`).
- Blocks: TKT-2405-07.
