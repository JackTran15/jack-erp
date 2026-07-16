# TKT-DF-08 OpenAPI regen — snapshot + generated schema.ts (BE gate)

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Nền tảng](../epics/EPIC-15072026-deposit-fund-foundation.md)

## Summary

Cổng chốt backend: sau khi DF-03/04/05/06/07 thêm endpoint (generic CRUD `banks`/`deposit_accounts`/`deposit_payment_policy`,
`GET /deposit-ledger`) và topic mới, chạy `pnpm openapi:generate` để regenerate `@erp/api-client` rồi commit
`openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts`. Đây là ranh giới BE↔FE: FE (DF-09/10) chỉ
consume type sau khi client được regen. **Không hand-edit** file generated.

## Deliverables

- `openapi.snapshot.json` (repo root / vị trí snapshot hiện hành) — cập nhật.
- `packages/api-client/src/generated/schema.ts` — regenerate (không sửa tay).
- Không file source mới — ticket này chỉ regen + commit artifact.

## Acceptance Criteria

- [ ] API chạy trên :4000 (`make dev-api`), `pnpm openapi:generate` chạy sạch, không lỗi.
- [ ] `schema.ts` chứa các path/schema mới: `/admin/entities/deposit_accounts/records`, `/admin/entities/banks/records`, `/admin/entities/deposit_payment_policy/records`, `GET /deposit-ledger` (+ `/export`) và DTO/response tương ứng (`DepositAccount`, `DepositPaymentPolicy`, `DepositLedgerResponse`…).
- [ ] Diff snapshot **chỉ** chứa thay đổi liên quan deposit (không nhiễu endpoint khác — nếu có drift lạ thì điều tra trước khi commit).
- [ ] `pnpm --filter @erp/api-client build` (hoặc `pnpm build:shared`) xanh với schema mới.
- [ ] Enum trong schema khớp `@erp/shared-interfaces` (DF-02) — `DepositMovementType`, `TargetFund`, `ReconStatus`…

## Definition of Done

- [ ] `pnpm openapi:generate` chạy; `openapi.snapshot.json` + `schema.ts` committed.
- [ ] `pnpm --filter @erp/api test` + `pnpm build` (workspace) xanh.
- [ ] Không hand-edit `schema.ts`.
- [ ] Không có TODO/FIXME ngoài kế hoạch.

## Tech Approach

Theo CLAUDE.md: chạy API, rồi `pnpm openapi:generate` (regen `packages/api-client` từ `/docs-json`). Commit cả snapshot
lẫn generated schema. Nếu diff có drift không liên quan (do endpoint khác đổi ngoài epic) → tách/điều tra, không commit
mù. Gate này chặn: FE data layer (DF-09) import `@erp/api-client` cần type mới.

```bash
make dev-api                 # API :4000 (rebuild shared trước)
pnpm openapi:generate        # regen packages/api-client từ /docs-json
git add openapi.snapshot.json packages/api-client/src/generated/schema.ts
```

## Testing Strategy

- Verification là build gate: `pnpm build` + `pnpm --filter @erp/api test` sau regen phải xanh. FE (DF-09) compile với client mới là xác nhận cuối.
- Không unit test riêng cho artifact generated.

## Dependencies

- Depends on: TKT-DF-05, TKT-DF-06, TKT-DF-07 (toàn bộ endpoint + permission BE hoàn tất).
- Blocks: TKT-DF-09 (FE data layer consume client mới).
