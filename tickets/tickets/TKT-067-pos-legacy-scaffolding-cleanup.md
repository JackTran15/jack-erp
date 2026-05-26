# TKT-067 POS legacy scaffolding cleanup

## Epic

[EPIC-011 POS Return & Exchange](../epics/EPIC-011-pos-return-exchange.md)

## Summary

Xoá legacy code (`SaleEntity` / `ReturnEntity` / `ReturnService` / `ExchangeService` / `CheckoutService` cũ) dựa trên data model `sales` / `sale_lines` không kết nối với `InvoiceEntity` hiện hữu. Mục tiêu: zero behavior change, tránh hai parallel model khi implement luồng mới trên `InvoiceEntity`.

Tham chiếu: [plan-return-exchange.md Step 1](../../docs/plan-return-exchange.md#step-1--legacy-cleanup-zero-behavior-change).

## Deliverables

- Xoá 12 file entity/service/dto liệt kê dưới.
- Cập nhật `pos.module.ts`, `pos.controller.ts`, các `index.ts` re-export.
- `pnpm --filter @erp/api build` pass; `pnpm --filter @erp/api test` pass.
- `grep -rn "SaleEntity\|ReturnEntity\|PaymentEntity\|ReturnService\|ExchangeService" apps/api/src` returns 0 hits.

## Acceptance Criteria

- [ ] 12 file legacy đã xoá (xem danh sách Tech Approach).
- [ ] `pos.module.ts` không còn reference các entity/service đã xoá (drop `TypeOrmModule.forFeature`, providers, exports).
- [ ] `pos.controller.ts` không còn route `POST /sales/:id/return`, `POST /sales/:id/exchange`.
- [ ] Search toàn repo (cả `apps/api`, `apps/pos-web`, `apps/backoffice-web`, `packages/api-client`) không còn import từ các file đã xoá.
- [ ] Test suite `pnpm --filter @erp/api test` không có spec nào fail do thay đổi này (spec liên quan đã xoá cùng implementation).
- [ ] Build pass, không circular dependency mới.

## Definition of Done

- [ ] PR review xác nhận không endpoint cũ nào còn được gọi (search FE `@erp/api-client` cũng clean).
- [ ] OpenAPI snapshot regenerate cho thấy 2 endpoint cũ biến mất khỏi `/docs-json`.
- [ ] Smoke test: tạo SALE invoice → checkout → vẫn pass (regression).

## Tech Approach

### Files to delete

```
apps/api/src/modules/pos/entities/sale.entity.ts
apps/api/src/modules/pos/entities/sale-line.entity.ts
apps/api/src/modules/pos/entities/payment.entity.ts
apps/api/src/modules/pos/entities/return.entity.ts
apps/api/src/modules/pos/entities/return-line.entity.ts
apps/api/src/modules/pos/services/return.service.ts
apps/api/src/modules/pos/services/exchange.service.ts
apps/api/src/modules/pos/services/checkout.service.ts
apps/api/src/modules/pos/services/checkout.service.spec.ts
apps/api/src/modules/pos/dto/return.dto.ts
apps/api/src/modules/pos/dto/exchange.dto.ts
apps/api/src/modules/pos/dto/checkout.dto.ts
```

### Files to modify

- `apps/api/src/modules/pos/pos.module.ts` — drop providers / exports / `TypeOrmModule.forFeature` cho các entity bị xoá.
- `apps/api/src/modules/pos/pos.controller.ts` — xoá routes `POST /sales/:id/return`, `POST /sales/:id/exchange`.
- `apps/api/src/modules/pos/entities/index.ts`, `services/index.ts`, `dto/index.ts` — drop re-export liên quan.

### Migration safety

Trước khi xoá entity, verify trạng thái bảng trong DB:
- Nếu chưa có migration tạo bảng (`sales`, `sale_lines`, `returns`, `return_lines`, `payments`) → xoá entity an toàn, không cần migration mới.
- Nếu bảng tồn tại (kể cả empty) → option:
  - (A) Thêm migration `DROP TABLE` kèm trong PR này.
  - (B) Defer vào TKT-068 (gộp cùng đợt migration return/exchange).

Chạy `pnpm migration:show` trên staging trước khi quyết định.

## Testing Strategy

- Build pass: `pnpm --filter @erp/api build`.
- Test cũ pass: `pnpm --filter @erp/api test`.
- Smoke: `make dev-api` lên, tạo invoice + checkout qua REST → ok.
- OpenAPI snapshot diff confirm 2 endpoint cũ biến mất.

## Dependencies

- Phụ thuộc: EPIC-007, EPIC-008 (luồng SALE invoice mới đã ổn định, không còn FE call `/sales/:id/...`).
- Blocks: [TKT-068](./TKT-068-return-exchange-schema-migrations.md).
