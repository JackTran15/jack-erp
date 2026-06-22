# TKT-CPD-03 BE: Xuất kho — resolve + trả Đối tượng cho cả 3 loại (giữ fallback targetBranch)

## Epic

[EPIC-22062026 Hiển thị "Đối tượng" trên Nhập / Xuất / Chuyển kho](../epics/EPIC-22062026-counterparty-display-inventory-docs.md)

## Summary

Mirror CPD-02 cho Xuất kho. `SearchGoodsIssuesV2Handler` hiện dùng `PARTY_EXPRESSION = COALESCE(provider.name, targetBranch.name)` — đổi sang `COALESCE(counterpartyNameSql('gi'), targetBranch.name)` để: (1) resolve cả 3 loại đối tượng, (2) **giữ fallback** sang `targetBranch.name` cho phiếu `purpose = TRANSFER_OUT` (xuất điều chuyển sang chi nhánh khác — đối tượng là chi nhánh đích, không phải counterparty). Inline `counterparty` per row.

## Deliverables

- `apps/api/src/modules/inventory/goods-issue/goods-issue.entity.ts` — transient `counterparty?: CounterpartyDisplay | null`.
- `apps/api/src/modules/inventory/goods-issue/queries/search-goods-issues-v2.handler.ts` — party filter mới + `attachCounterparties`.
- `apps/api/src/modules/inventory/goods-issue/goods-issue.service.ts` — `findOne`/detail inline `counterparty` (nếu FE dùng detail GET).

## Acceptance Criteria

- [ ] Filter `dto.party` khớp supplier/customer/employee **và** vẫn khớp tên chi nhánh đích cho TRANSFER_OUT.
- [ ] Row TRANSFER_OUT (đối tượng = chi nhánh) vẫn hiện `targetBranch.name`; row có counterparty hiện tên đối tượng; không còn `—` cho customer/employee.
- [ ] Inline `counterparty` per row; scope `organizationId` + `branchId`; hide `CANCELLED` giữ nguyên.
- [ ] Không Vietnamese trong source BE.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh.
- [ ] Handler spec cover 3 loại + TRANSFER_OUT fallback — gộp CPD-08.
- [ ] Không sửa schema.

## Tech Approach

```ts
// search-goods-issues-v2.handler.ts
import { attachCounterparties, counterpartyNameSql }
  from '../../location/services/counterparty-name.util';

// Đối tượng (party) — counterparty (3 kinds), else the transfer target branch.
const PARTY_EXPRESSION = `COALESCE(${counterpartyNameSql('gi')}, targetBranch.name)`;

new FilterBuilder(qb)
  .applyString('gi.documentNumber', dto.documentNumber)
  .applyString(PARTY_EXPRESSION, dto.party)
  .applyString('gi.notes', dto.notes)
  // … unchanged …

const [data, total] = await qb.getManyAndCount();
await attachCounterparties(this.repo.manager, data, actor.organizationId);
return { data, total, page, limit };
```

> FE Xuất kho render cột Đối tượng nên ưu tiên `row.counterparty?.name`, fallback `row.targetBranch?.name` cho TRANSFER_OUT (xử lý ở CPD-06).

## Dependencies

- Depends on: TKT-CPD-01.
- Blocks: TKT-CPD-05, TKT-CPD-06.
