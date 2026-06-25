# TKT-CTW-05 BE: lines query trả dòng TRANSFERRED-by-sale + field hóa đơn

## Epic

[EPIC-25062026 Checkout ↔ Kho tạm](../epics/EPIC-25062026-checkout-temp-warehouse-fulfillment.md)

## Summary

Hiện `GET /inventory/temp-warehouse/lines` chỉ trả dòng `status=ACTIVE` (TRANSFERRED bị hard-exclude). Để trang Chuyển kho tạm hiện lại dòng đã sale khi bỏ tích checkbox, endpoint cần tùy chọn trả thêm dòng TRANSFERRED-by-sale (có `invoiceId`) kèm field hóa đơn. Mặc định (không truyền cờ) giữ nguyên = chỉ ACTIVE.

## Deliverables

- `apps/api/src/modules/inventory/temp-warehouse/dto/list-lines.query.dto.ts` — thêm `includeTransferred?: boolean` (hoặc `status?: TempWarehouseLineStatus[]`). Class-validator + `@ApiProperty`.
- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse.service.ts` (list lines) — khi `includeTransferred`, nới điều kiện `status IN (ACTIVE, TRANSFERRED)` **và** chỉ TRANSFERRED có `invoiceId IS NOT NULL` (TRANSFERRED-by-sale, loại trừ transfer thủ công nếu cần — chốt: chỉ surface dòng có `invoiceId`). Trả kèm `invoiceId`/`invoiceNumber` trong row.
- `temp-warehouse.controller.ts` — pass cờ; giữ guard/permission hiện có.

## Acceptance Criteria

- [ ] Không truyền cờ → response y hệt hôm nay (chỉ ACTIVE), backward compatible.
- [ ] `includeTransferred=true` → trả thêm dòng TRANSFERRED có `invoiceId`, mỗi row mang `invoiceId`/`invoiceNumber`.
- [ ] Dòng TRANSFERRED do transfer thủ công (không `invoiceId`) **không** lọt vào (tránh nhiễu trang Chuyển kho tạm).
- [ ] Phân trang/filter (direction, branch) vẫn áp dụng đồng nhất cho cả ACTIVE và TRANSFERRED.
- [ ] Scope `organizationId` + `branchId`.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + lint pass; spec phủ default vs includeTransferred + loại transfer thủ công.
- [ ] No Vietnamese trong source.
- [ ] DTO khai báo mọi field (global `whitelist:true`).

## Tech Approach

```ts
const statuses = q.includeTransferred
  ? [TempWarehouseLineStatus.ACTIVE, TempWarehouseLineStatus.TRANSFERRED]
  : [TempWarehouseLineStatus.ACTIVE];
qb.andWhere('line.status IN (:...statuses)', { statuses });
if (q.includeTransferred) {
  qb.andWhere('(line.status = :active OR line.invoiceId IS NOT NULL)', {
    active: TempWarehouseLineStatus.ACTIVE,
  });
}
// select line.invoiceId, line.invoiceNumber trong projection
```

## Testing Strategy

- Unit (`temp-warehouse.service.spec.ts`): seed ACTIVE + TRANSFERRED(invoiceId) + TRANSFERRED(manual); assert 3 trường hợp cờ.

## Dependencies

- Depends on: TKT-CTW-01, TKT-CTW-02.
- Blocks: TKT-CTW-06.
