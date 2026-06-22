# TKT-CPD-04 BE: Chuyển kho — thêm Đối tượng (migration + entity + DTO + service + search-v2)

## Epic

[EPIC-22062026 Hiển thị "Đối tượng" trên Nhập / Xuất / Chuyển kho](../epics/EPIC-22062026-counterparty-display-inventory-docs.md)

## Summary

Chuyển kho hiện **không có** counterparty — cột "Đối tượng" là Người vận chuyển (`transporter_user_id`). Theo yêu cầu, đổi "Đối tượng" sang **picker counterparty** (NCC/KH/NV) như Nhập/Xuất kho. Cần thêm 2 cột vào `stock_transfers`, validate qua `resolveDocCounterparty`, và đổi resolve cột "Đối tượng" trong search-v2. **Giữ** `transporter_user_id` (không drop) để: (a) không mất dữ liệu phiếu cũ, (b) fallback hiển thị transporter cho phiếu legacy chưa có counterparty.

## Deliverables

- `apps/api/src/database/migrations/<timestamp>-AddCounterpartyToStockTransfers.ts` (new, hand-written) — `ALTER TABLE stock_transfers ADD COLUMN counterparty_kind doc_counterparty_kind_enum NULL`, `ADD COLUMN counterparty_id uuid NULL`. Enum `doc_counterparty_kind_enum` **đã tồn tại** → chỉ ADD COLUMN (không CREATE TYPE).
- `apps/api/src/modules/inventory/transfer/stock-transfer.entity.ts` — 2 column mới (`counterpartyKind`, `counterpartyId`) + transient `counterparty?: CounterpartyDisplay | null`.
- `apps/api/src/modules/inventory/transfer/dto/create-stock-transfer-v2.dto.ts` (+ update DTO nếu có) — thêm `counterpartyKind?` + `counterpartyId?` (mirror `create-goods-receipt-v2.dto.ts`).
- `apps/api/src/modules/inventory/transfer/stock-transfer.service.ts` — create/update gọi `resolveDocCounterparty`, persist `counterpartyKind` + `counterpartyId`.
- `apps/api/src/modules/inventory/transfer/queries/search-stock-transfers-v2.handler.ts` — party filter + display fallback transporter; `attachCounterparties`.

## Acceptance Criteria

- [ ] Migration ADD COLUMN nullable (không backfill cần thiết); `migration:run` xanh; phiếu cũ `counterparty_*` = NULL.
- [ ] Tạo/sửa Chuyển kho với `{ counterpartyKind, counterpartyId }` → `resolveDocCounterparty` validate tồn tại trong org (supplier/customer/employee), persist `counterparty_kind` + `counterparty_id` (transfer **không** có `provider_id` → bỏ qua trường `providerId` trả về từ resolver).
- [ ] Filter cột "Đối tượng" = `COALESCE(counterpartyNameSql('st'), TRANSPORTER_NAME_SUBQUERY)` → khớp counterparty (3 loại) cho phiếu mới **và** transporter cho phiếu legacy.
- [ ] Mỗi row search inline `counterparty` (mới) + giữ inline `transporter` (legacy fallback) + `totalAmount` + `lines` như cũ.
- [ ] Mutation idempotent (interceptor sẵn có); scope `organizationId` + `branchId`.
- [ ] Không Vietnamese trong source BE.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh; `migration:run` + `migration:revert` chạy được.
- [ ] Handler spec + service spec (counterparty persist + fallback) — gộp CPD-08.
- [ ] `synchronize` false; chỉ 1 migration; không drop `transporter_user_id`.

## Tech Approach

```ts
// migration (hand-written)
export class AddCounterpartyToStockTransfers... {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE "stock_transfers"
      ADD COLUMN "counterparty_kind" "doc_counterparty_kind_enum",
      ADD COLUMN "counterparty_id" uuid`);
  }
  async down(q: QueryRunner) {
    await q.query(`ALTER TABLE "stock_transfers"
      DROP COLUMN "counterparty_id", DROP COLUMN "counterparty_kind"`);
  }
}
```

```ts
// stock-transfer.entity.ts — mirror goods-receipt.entity columns
@Column({ name: 'counterparty_kind', type: 'enum', enum: DocCounterpartyKind,
  enumName: 'doc_counterparty_kind_enum', nullable: true })
counterpartyKind?: DocCounterpartyKind | null;

@Column({ name: 'counterparty_id', type: 'uuid', nullable: true })
counterpartyId?: string | null;

counterparty?: CounterpartyDisplay | null; // transient
```

```ts
// stock-transfer.service.ts (create/update)
const cp = await resolveDocCounterparty(manager, dto, actor.organizationId);
transfer.counterpartyKind = cp.counterpartyKind;   // ignore cp.providerId (no column)
transfer.counterpartyId = cp.counterpartyId;
```

```ts
// search-stock-transfers-v2.handler.ts
import { attachCounterparties, counterpartyNameSql }
  from '../../location/services/counterparty-name.util';

// party = counterparty (3 kinds) else legacy transporter name
const PARTY_EXPRESSION = `COALESCE(${counterpartyNameSql('st')}, ${TRANSPORTER_NAME_SUBQUERY})`;
new FilterBuilder(qb).applyString(PARTY_EXPRESSION, dto.party) /* … rest unchanged … */;
// after getManyAndCount + existing transporter/totalAmount inline:
await attachCounterparties(this.repo.manager, data, actor.organizationId);
```

> FE (CPD-07) render: `row.counterparty?.name ?? row.transporter?.fullName ?? '—'`.

## Dependencies

- Depends on: TKT-CPD-01.
- Blocks: TKT-CPD-05, TKT-CPD-07.
