# TKT-DEP-02 OpenAPI regen + snapshot

## Epic

[EPIC-19072026 Deposit Screens — Branch Scope & MISA Parity](../epics/EPIC-19072026-deposit-screens-branch-scope.md)

## Summary

`DepositLedgerQueryDto.depositAccountId` chuyển từ bắt buộc sang tuỳ chọn ở [TKT-DEP-01](./TKT-DEP-01-deposit-ledger-branch-scope.md), và mỗi dòng có thể mang thêm `depositAccountName`. Regen `@erp/api-client` để FE dùng type đúng.

## Deliverables

- `packages/api-client/openapi.snapshot.json` — regen.
- `packages/api-client/src/generated/schema.ts` — regen, **không sửa tay**.

## Acceptance Criteria

- [ ] API chạy trên `:4000`, chạy `pnpm openapi:generate`, commit cả hai file.
- [ ] Trong snapshot, tham số `depositAccountId` của `/deposit-ledger` và `/deposit-ledger/export` có `required: false`.
- [ ] `pnpm --filter @erp/api-client build` pass.
- [ ] Diff chỉ chứa thay đổi liên quan; nếu snapshot kéo theo endpoint của công việc khác đang dở, **tách commit riêng** và ghi rõ trong PR.

## Definition of Done

- [ ] `schema.ts` không bị sửa tay.
- [ ] `pnpm build` toàn workspace pass.

## Tech Approach

```bash
make dev-api            # API phải đang chạy trên :4000
pnpm openapi:generate
pnpm --filter @erp/api-client build
git add packages/api-client/openapi.snapshot.json packages/api-client/src/generated/schema.ts
```

> Lưu ý đã gặp trong thực tế: endpoint nào khai `@ApiOkResponse({ description })` mà **không** có `type:` thì Swagger không sinh schema response, nên field mới sẽ không xuất hiện trong client. Nếu FE cần type response của `/deposit-ledger` từ `@erp/api-client` (thay vì type khai tay trong `hooks/treasury/`), phải đổi shape response thành class có `@ApiProperty` — kiểm tra trước, nếu cần thì mở ticket riêng chứ đừng lặng lẽ mở rộng phạm vi ticket này.

## Testing Strategy

- Không có test tự động. Kiểm bằng cách grep `depositAccountId` trong snapshot và xác nhận `required: false`.

## Dependencies

- Depends on: [TKT-DEP-01](./TKT-DEP-01-deposit-ledger-branch-scope.md)
- Blocks: [TKT-DEP-05](./TKT-DEP-05-fe-ledger-all-accounts.md)
