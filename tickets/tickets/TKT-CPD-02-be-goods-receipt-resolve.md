# TKT-CPD-02 BE: Nhập kho — resolve + trả Đối tượng cho cả 3 loại

## Epic

[EPIC-22062026 Hiển thị "Đối tượng" trên Nhập / Xuất / Chuyển kho](../epics/EPIC-22062026-counterparty-display-inventory-docs.md)

## Summary

Wire util CPD-01 vào `SearchGoodsReceiptsV2Handler` + đường detail của Nhập kho. Filter cột "Đối tượng" đổi từ `provider.name` (chỉ supplier) sang `counterpartyNameSql('gr')` (cả 3 loại); mỗi row search được inline `counterparty { kind, id, code, name }`. Giữ join `gr.provider` (không xoá — backward compat).

## Deliverables

- `apps/api/src/modules/inventory/goods-receipt/goods-receipt.entity.ts` — thêm transient field `counterparty?: CounterpartyDisplay | null` (mirror `transporter` của `StockTransferEntity`; **không** phải column).
- `apps/api/src/modules/inventory/goods-receipt/queries/search-goods-receipts-v2.handler.ts` — đổi party filter + `attachCounterparties` sau `getManyAndCount()`.
- `apps/api/src/modules/inventory/goods-receipt/goods-receipt.service.ts` — đường `findOne`/detail dùng cho mở lại phiếu: inline `counterparty` (nếu FE đọc detail GET thay vì row list).

## Acceptance Criteria

- [ ] Filter `dto.party` (`*` contains) khớp tên supplier **và** customer **và** employee, query toàn dataset, scope `organizationId` + `branchId` (giữ nhánh `actor.branchId`).
- [ ] Mỗi row trả `counterparty` inline; phiếu supplier vẫn trả `provider` như cũ (không regression); phiếu customer/employee không còn `—`.
- [ ] Resolve batch (≤ 1 query/kind/trang); `lines` + các eager relation cũ giữ nguyên (panel Chi tiết không đổi).
- [ ] Không Vietnamese trong source BE.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh.
- [ ] Handler spec cover supplier/customer/employee + filter — gộp CPD-08.
- [ ] Không sửa schema (chỉ transient field).

## Tech Approach

```ts
// search-goods-receipts-v2.handler.ts
import { attachCounterparties, counterpartyNameSql }
  from '../../location/services/counterparty-name.util';

new FilterBuilder(qb)
  .applyString('gr.documentNumber', dto.documentNumber)
  .applyString(counterpartyNameSql('gr'), dto.party) // was: 'provider.name'
  .applyString('gr.description', dto.description)
  .applyString('gr.reason', dto.reason)
  .applyEnum('gr.purpose', dto.purpose?.value)
  .applyDateRange('gr.receivedAt', dto.date)
  .applyCompare(TOTAL_AMOUNT_SUBQUERY, dto.totalAmount);

const [data, total] = await qb.getManyAndCount();
await attachCounterparties(this.repo.manager, data, actor.organizationId);
return { data, total, page, limit };
```

```ts
// goods-receipt.entity.ts (transient)
counterparty?: CounterpartyDisplay | null;
```

> Confirm lúc implement: FE form Nhập kho lấy `initial` từ row list search hay GET `/goods-receipts/:id`. Nếu từ row list → `counterparty` đã có sẵn (đủ cho rehydrate). Nếu có detail GET riêng → cũng `attachCounterparties` ở `findOne`.

## Dependencies

- Depends on: TKT-CPD-01.
- Blocks: TKT-CPD-05, TKT-CPD-06.
