# TKT-SDS-02 E2E: SALE_ISSUE tại showroom + net tồn đúng sau auto-chuyển kho tạm

> **Status: DROPPED (2026-06-27).** Unit coverage ở TKT-SDS-01 đủ: `invoice.service.spec.ts` khẳng định `invoice_items.location_id` = shelf showroom (+ fallback), resolver thực được phủ bởi `resolve-branch-item-locations.spec.ts`, và mapping `invoice_items.location_id → SALE_ISSUE` là code **không đổi** + đã xác nhận trực tiếp trên DB live (cùng `e9150d16`). E2E `temp-warehouse-fulfillment` gọi thẳng `fulfillInvoiceFromTempWarehouse` nên không sinh `SALE_ISSUE` → không host được assertion này; một e2e checkout async đầy đủ là quá nặng/flaky cho một thay đổi 1 dòng. Giữ ticket làm dấu vết quyết định.

## Epic

[EPIC-27062026 POS bán hàng — SALE_ISSUE phải trừ tại showroom](../epics/EPIC-27062026-pos-sale-deduct-showroom.md)

## Summary

Chốt hồi quy end-to-end: item ở kho lưu trữ (Warehouse A) được stage vào kho tạm (w2s → showroom), bán 1 đơn vị qua checkout → đúng 3 ledger move (`SALE_ISSUE @ showroom`, `TRANSFER_OUT @ kho lưu trữ`, `TRANSFER_IN @ showroom`), net **kho lưu trữ chỉ −qtyTransfer (không bị SALE_ISSUE)** và **showroom = 0**. Ngăn tái diễn double-trừ kho lưu trữ.

## Deliverables

- `apps/api/test/e2e/temp-warehouse-fulfillment.e2e-spec.ts` (mở rộng) — thêm assertion về `location_id` của `SALE_ISSUE` và net balance theo location.

## Acceptance Criteria

- [ ] Sau checkout: tồn tại đúng 1 `SALE_ISSUE` với `location_id` = **location showroom** (`is_main_storage = true`), KHÔNG nằm ở location kho lưu trữ.
- [ ] `TRANSFER_OUT` ở location kho lưu trữ, `TRANSFER_IN` ở location showroom (do auto-chuyển).
- [ ] Net theo location: kho lưu trữ = `quant:start − qtyTransfer` (chỉ TRANSFER_OUT, không SALE_ISSUE); showroom = `+qtyTransfer (TRANSFER_IN) − qtySale (SALE_ISSUE)` = 0 khi `qtySale = qtyTransfer`.
- [ ] Replay event fulfill (cùng `invoiceId`) không sinh thêm transfer/ledger (idempotent) — giữ assertion cũ nếu đã có.
- [ ] Item KHÔNG có shelf showroom (nếu thêm case): `SALE_ISSUE` rơi về `item.locationId` (không null).

## Definition of Done

- [ ] `pnpm --filter @erp/api test:e2e -- temp-warehouse-fulfillment` xanh (chạy với `erp_test`, đọc env DB tường minh).
- [ ] Đọc đúng output test, không tin riêng exit message (teardown Kafka có thể treo — xem CLAUDE.md).
- [ ] Không schema change; không đổi endpoint shape → KHÔNG `openapi:generate`.
- [ ] No Vietnamese trong backend source.

## Tech Approach

Mở rộng spec sẵn có: sau bước checkout + chờ consumer xử lý, query `stock_ledger_entries` cho item và assert theo `movement_type` + `location_id`.

```ts
const moves = await ledgerRepo.find({ where: { itemId, organizationId } });
const sale = moves.filter((m) => m.movementType === StockMovementType.SALE_ISSUE);
expect(sale).toHaveLength(1);
expect(sale[0].locationId).toBe(showroomLocationId);      // NOT warehouseLocationId
const net = (loc: string) =>
  moves.filter((m) => m.locationId === loc)
       .reduce((s, m) => s + Number(m.quantity), 0);
expect(net(showroomLocationId)).toBe(0);                  // +1 transfer −1 sale
// kho lưu trữ chỉ chịu TRANSFER_OUT (−qty), không thêm SALE_ISSUE
```

Lưu ý chờ consumer (event-driven) hoàn tất trước khi assert (poll/`await` theo pattern e2e hiện có của spec này).

## Testing Strategy

- E2E (`temp-warehouse-fulfillment.e2e-spec.ts`): seed kho lưu trữ + showroom + phiên kho tạm w2s, stage line, checkout, assert ledger theo location + net balance.

## Dependencies

- Depends on: TKT-SDS-01
- Blocks: —
