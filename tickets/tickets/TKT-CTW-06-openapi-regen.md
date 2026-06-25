# TKT-CTW-06 openapi:generate + commit api-client snapshot

## Epic

[EPIC-25062026 Checkout ↔ Kho tạm](../epics/EPIC-25062026-checkout-temp-warehouse-fulfillment.md)

## Summary

Sau khi đổi DTO/endpoint backend (lines query thêm `includeTransferred`, response thêm field hóa đơn), chạy `openapi:generate` và commit snapshot theo quy ước repo. Lưu ý: pos-web `FastStockTransfer` tiêu thụ types qua `@erp/shared-interfaces` + axios `http` (không qua api-client generated), nên ticket này chủ yếu giữ snapshot khớp contract cho consumer dùng api-client; FE wiring (CTW-07) phụ thuộc CTW-02, không phụ thuộc trực tiếp ticket này.

## Deliverables

- Chạy API trên :4000, rồi `pnpm openapi:generate`.
- Commit `apps/api/openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` (không hand-edit).

## Acceptance Criteria

- [ ] Snapshot phản ánh tham số `includeTransferred` + field `invoiceId`/`invoiceNumber` trên lines endpoint.
- [ ] `git diff` chỉ chạm file generated + snapshot (không sửa tay).
- [ ] Build `@erp/api-client` pass.

## Definition of Done

- [ ] `pnpm build` (shared + api-client) pass.
- [ ] Snapshot committed.

## Tech Approach

```bash
make dev-api            # hoặc pnpm --filter @erp/api start:dev
pnpm openapi:generate
git add apps/api/openapi.snapshot.json packages/api-client/src/generated/schema.ts
```

## Testing Strategy

- Diff review: chỉ thay đổi do contract mới.

## Dependencies

- Depends on: TKT-CTW-05.
- Blocks: TKT-CTW-07.
