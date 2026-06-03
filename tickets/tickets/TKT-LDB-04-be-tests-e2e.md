# TKT-LDB-04 BE: Tests + E2E round-trip + DoD gate

## Epic

[EPIC-03062026 POS per-line discount breakdown + line note in read APIs](../epics/EPIC-03062026-pos-line-discount-breakdown.md)

## Summary

Cổng nghiệm thu của epic: unit cho compute helper, handler specs cho việc gắn line items, và một E2E round-trip create → read xác nhận breakdown KM dòng + `note` được lưu và trả về ở mọi đường đọc liên quan. Chốt DoD toàn epic.

## Deliverables

- `apps/api/src/modules/pos/services/invoice.service.spec.ts` — mở rộng cho `computeLineDiscount` (create + update).
- `apps/api/src/modules/pos/queries/search-invoices-v2.handler.spec.ts`, `search-returnable-invoices-v2.handler.spec.ts`, `search-purchase-history-v2.handler.spec.ts` — assert `items[]` attach + field mới (mở rộng spec sẵn có nếu có).
- `apps/api/test/e2e/<...>-invoice-line-discount.e2e-spec.ts` (new) — round-trip create draft → checkout → đọc qua detail + 3 search posted.

## Acceptance Criteria

- [ ] **Unit compute:** percent 10% trên dòng `qty=1, unitPrice=590000` ⇒ `lineDiscount=59000`, `lineTotal=531000`, `lineDiscountType='percent'`, `lineDiscountValue=10`, `lineDiscountReason='cc'`. amount-type lưu đúng. clamp `amount ≤ gross`. Thiếu `value`/`value<0` → 400; percent `>100` → 400. Legacy (chỉ `lineDiscount`, không `type`) giữ nguyên hành vi cũ. Áp cho **cả** `create()` và `update()`.
- [ ] **Subtotal:** invoice `subtotal` = tổng `lineTotal` sau chiết khấu ở cả create/update.
- [ ] **Handler attach:** mỗi handler posted trả `items[]` đúng `sortOrder`, có `lineDiscount*`+`note`, không rò tenant (seed 2 org / 2 branch).
- [ ] **E2E round-trip:** tạo draft với 1 dòng breakdown percent + `note` → `GET /invoices/:id` thấy đủ field; `POST /v2/invoices/drafts/search` thấy đủ; checkout → `POST /v2/invoices/search` + `.../returnable/search` + `.../purchase-history/search` đều trả dòng kèm breakdown + `note`.
- [ ] **Backward-compat đọc:** dòng cũ (3 cột mới NULL) đọc ra không lỗi serialize.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` xanh (unit + handler specs).
- [ ] `pnpm --filter @erp/api test:e2e` xanh trên `erp_test` (xem `project_e2e_test_db_setup` — env DB tường minh, đọc test output thật, bỏ qua "suite failed" giả do Kafka teardown treo).
- [ ] `pnpm --filter @erp/api lint` pass.
- [ ] `pnpm openapi:generate` đã chạy ở TKT-LDB-03; snapshot + `schema.ts` đã commit.
- [ ] Không Vietnamese trong source backend; không TODO/FIXME ngoài kế hoạch; migration là nguồn schema duy nhất, `synchronize` false.

## Tech Approach

E2E skeleton (chạy serial, theo cấu hình e2e hiện có):

```ts
// 1. login + chọn branch → token + X-Branch-Id
// 2. POST /invoices { sessionId, items: [{ ...giay, quantity:1, unitPrice:590000,
//      lineDiscountType:'percent', lineDiscountValue:10, lineDiscountReason:'cc', note:'hhh' }] }
//    → assert resp.items[0]: lineDiscount=59000, lineTotal=531000, breakdown + note
// 3. GET /invoices/:id → assert cùng breakdown + note
// 4. POST /v2/invoices/drafts/search → assert row.items[0] đủ field
// 5. checkout (POST /invoices/:id/checkout) → status paid
// 6. POST /v2/invoices/search → assert row.items[0] breakdown + note
// 7. POST /v2/invoices/returnable/search → assert items
// 8. POST /v2/invoices/purchase-history/search { customerId } → assert items
```

## Testing Strategy

- Unit: jest service + handler specs (seed repos in-memory/mock theo pattern spec hiện có trong module pos).
- E2E: chạy `pnpm --filter @erp/api test:e2e` với DB `erp_test` đã migrate (gồm migration TKT-LDB-01).

## Dependencies

- Depends on: TKT-LDB-02 (compute + DTO), TKT-LDB-03 (read attach + openapi).
- Blocks: none (cổng DoD cuối epic).
