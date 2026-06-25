# TKT-CTW-02 Shared-interfaces: event fulfill + field hóa đơn + filter status dòng

## Epic

[EPIC-25062026 Checkout ↔ Kho tạm](../epics/EPIC-25062026-checkout-temp-warehouse-fulfillment.md)

## Summary

Khai báo hợp đồng dùng chung cho cả backend và pos-web: kiểu payload sự kiện fulfill mới, bổ sung field hóa đơn vào interface dòng kho tạm, và tham số filter `status`/`includeTransferred` cho lines query. pos-web tiêu thụ types này qua `@erp/shared-interfaces` (axios `http`), nên contract phải nằm ở đây trước khi wiring FE.

## Deliverables

- `packages/shared-interfaces/src/inventory/temp-warehouse.ts`:
  - `TempWarehouseLine` thêm `invoiceId?: string | null`, `invoiceNumber?: string | null`.
  - Lines-query params: thêm `includeTransferred?: boolean` **hoặc** `status?: TempWarehouseLineStatus | TempWarehouseLineStatus[]` cho `ListLinesRaw...` request type (cho phép trả ACTIVE + TRANSFERRED).
  - Bảo đảm `TempWarehouseLineStatus` đã export `TRANSFERRED`.
- `packages/shared-interfaces/src/events/...` (nơi khai báo `DomainEventType` + payload):
  - `DomainEventType.TEMP_WAREHOUSE_INVOICE_FULFILL_REQUESTED`.
  - `TempWarehouseInvoiceFulfillRequestedPayload { organizationId; branchId; invoiceId; invoiceNumber; actor; lines: Array<{ itemId: string; quantity: number }> }`.
- `ERP_TOPICS.TEMP_WAREHOUSE_INVOICE_FULFILL` (nếu topic khai báo trong shared) — hoặc tái dùng convention topic hiện có.
- Rebuild shared: `pnpm --filter @erp/shared-interfaces build` (postinstall cũng build).

## Acceptance Criteria

- [ ] `import type { TempWarehouseInvoiceFulfillRequestedPayload, TempWarehouseLine } from "@erp/shared-interfaces"` compile ở cả api và pos-web.
- [ ] `TempWarehouseLine.invoiceId/invoiceNumber` optional, không phá vỡ chỗ dùng hiện tại.
- [ ] Lines-query type cho phép yêu cầu kèm TRANSFERRED mà mặc định (không truyền) vẫn = chỉ ACTIVE (backward compatible).
- [ ] Enum `DomainEventType` + topic thêm đúng chỗ, không trùng giá trị.

## Definition of Done

- [ ] `pnpm --filter @erp/shared-interfaces build` pass; `pnpm --filter @erp/api test` + lint pass.
- [ ] Không Vietnamese trong type/identifier.
- [ ] Không đổi shape sẵn có ngoài phần thêm optional.

## Tech Approach

```ts
// temp-warehouse.ts
export interface TempWarehouseLine {
  // …existing…
  invoiceId?: string | null;
  invoiceNumber?: string | null;
}

export interface TempWarehouseInvoiceFulfillRequestedPayload {
  organizationId: string;
  branchId: string;
  invoiceId: string;
  invoiceNumber: string;
  actor: { userId: string; organizationId: string; branchId?: string };
  lines: Array<{ itemId: string; quantity: number }>;
}
```

## Testing Strategy

- Type-only; verify bằng build của shared-interfaces + api typecheck.

## Dependencies

- Depends on: TKT-CTW-01.
- Blocks: TKT-CTW-03, TKT-CTW-04, TKT-CTW-05.
