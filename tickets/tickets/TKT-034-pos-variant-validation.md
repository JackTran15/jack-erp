# TKT-034 POS variant validation (checkout)

## Epic

[EPIC-006 Product variants & catalog](../epics/EPIC-006-product-variants-catalog.md)

## Summary

Validate POS checkout line: nếu `item.productId` tồn tại → check item có junction attribute hợp lệ (không phải product trống không có variant). Optional: UI POS chọn product → thuộc tính → resolve `itemId`.

## Deliverables

- `PosService.checkout` / `createSale`: validate `itemId` có `productId` → nếu có → item phải có `item_attribute_values` rows (hoặc trường hợp legacy cho phép).
- Optional: endpoint `/api/v1/pos/products/:id/variants` để POS UI chọn biến thể (theo combo thuộc tính).

## Acceptance Criteria

- [ ] POST `/api/v1/pos/sales/checkout` với line `itemId` = biến thể (có productId) → OK; trừ kho theo `itemId` + `locationId`.
- [ ] Nếu `itemId` trỏ product nhưng không có junction (lỗi data) → 400 bad request hoặc warning log.
- [ ] Legacy item (không productId) → vẫn bán được (quy tắc cũ).
- [ ] Optional: GET `/api/v1/products/:id/variants?size=39&color=Nâu` → trả `itemId` resolve.

## Definition of Done

- [ ] PR: thêm validation logic trong `PosService`; tests pass.
- [ ] E2E: product + variant → POS checkout → sale line ghi `itemId`, stock balance giảm.
- [ ] Edge: checkout item `productId` nhưng không junction → 400; hoặc log warning + allow (tuỳ business rule).
- [ ] DoD: không regression POS cũ (sale item không product).

## Tech Approach

- Trong `PosService.checkout` (hoặc helper `validateSaleLines`):
  - Foreach line: query `item` → nếu `item.productId` not null → query `item_attribute_values count(*)` → nếu = 0 → throw BadRequestException("Biến thể không hợp lệ").
  - Hoặc: trust data sinh từ TKT-030 → không check (nếu TKT-030 đảm bảo luôn có junction).
- Optional endpoint `/products/:id/variants`:
  - Body/query: `{ size: "39", color: "Nâu" }` → service.resolveVariant(productId, combo) → trả `itemId`.
  - Dùng trong UI POS: chọn product → dropdown thuộc tính → call resolve → nhận `itemId` → add to cart.

## Testing Strategy

- Unit: mock item + product; test validate logic.
- E2E: product + variant → POS checkout → success; check ledger entry `itemId` đúng.
- Edge: item có `productId` nhưng không junction (thủ công insert) → checkout → 400 hoặc warning.
- Manual: UI POS (nếu có) → chọn product → pick size/color → add → checkout → OK.

## Dependencies

- Depends on: TKT-031 (Item.productId), TKT-030 (variant generation → itemId).
- Blocks: TKT-037 (e2e POS flow test).

