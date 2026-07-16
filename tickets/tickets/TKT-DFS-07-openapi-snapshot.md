# TKT-DFS-07 OpenAPI regen + snapshot

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Giai đoạn 2: Chi tiêu](../epics/EPIC-15072026-deposit-fund-spending.md)

## Summary

Sau khi DFS-03..06 thêm endpoints mới (`bank-receipts`, `bank-payments`, `supplier-deposit-payment`, `fund-swaps`),
regenerate typed API client + OpenAPI snapshot để FE (DFS-08) consume qua `@erp/api-client` không cần hand-craft type.
Không có logic mới — chỉ chạy generator + commit output.

## Deliverables

- `apps/api/openapi.snapshot.json` — regenerated (chứa 4 nhóm endpoint mới + các DTO schema `CreateBankReceiptDto`, `CreateBankPaymentDto`, `CreateSupplierDepositPaymentDto`, `CreateFundSwapDto`, reverse/query DTOs).
- `packages/api-client/src/generated/schema.ts` — regenerated (**never hand-edit** — chỉ commit output của generator).

## Acceptance Criteria

- [ ] API chạy trên `:4000` (`make dev-api`), sau đó `pnpm openapi:generate` chạy thành công (đọc `/docs-json`).
- [ ] Snapshot chứa path: `POST /bank-receipts` + `{id}` + `/post` + `/reverse`; `POST /bank-payments` + `{id}` + `/post` + `/reverse`; `POST /supplier-deposit-payment`; `POST /fund-swaps`.
- [ ] Schema mới xuất hiện với `depositAccountId` required trên create Phiếu thu/chi (khớp DFS-02).
- [ ] `git diff` chỉ chạm 2 file generated ở trên (+ `openapi.snapshot.json`); không chạm source thủ công.
- [ ] Không có tiếng Việt trong Swagger (English enums/descriptions — verify từ snapshot).

## Definition of Done

- [ ] `pnpm openapi:generate` run; `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` committed.
- [ ] `pnpm --filter @erp/api-client build` xanh (generated client compile).
- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` vẫn xanh (không đổi source).
- [ ] Không đụng `synchronize` / migration.
- [ ] Không hand-edit file generated.

## Tech Approach

```bash
make dev-api                 # API on :4000 với DFS-01..06 merged
pnpm openapi:generate        # regenerate packages/api-client từ /docs-json
git add apps/api/openapi.snapshot.json packages/api-client/src/generated/schema.ts
```

Verify diff snapshot chỉ thêm (không xoá) path/schema hiện có — endpoints deposit là bổ sung thuần, không đổi contract cash.

## Testing Strategy

- Không unit test. Gate = generator chạy sạch + `@erp/api-client` build.
- Smoke: `grep -c "bank-receipts\|bank-payments\|fund-swaps\|supplier-deposit-payment" apps/api/openapi.snapshot.json` > 0.

## Dependencies

- Depends on: TKT-DFS-05, TKT-DFS-06 (mọi endpoint đã tồn tại).
- Blocks: TKT-DFS-08 (FE consume generated client).
