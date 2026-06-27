# TKT-SDS-01 BE: dòng hóa đơn bán resolve location về showroom (đảo precedence)

## Epic

[EPIC-27062026 POS bán hàng — SALE_ISSUE phải trừ tại showroom](../epics/EPIC-27062026-pos-sale-deduct-showroom.md)

## Summary

Dòng hóa đơn bán POS hiện lưu `locationId = item.locationId ?? showroomResolved`, nên shelf kho lưu trữ do FE gửi (vd `A001`) thắng kết quả giải showroom. Khi item đó cũng nằm trong kho tạm, auto-chuyển kho (`TRANSFER_OUT`) đã trừ kho lưu trữ một lần, `SALE_ISSUE` trừ thêm lần nữa → kho lưu trữ bị trừ kép, showroom dư. Đảo thứ tự ưu tiên: **showroom thắng**, `item.locationId` chỉ là fallback khi item chưa có shelf showroom. Áp dụng cho cả tạo hóa đơn và cập nhật draft.

## Deliverables

- `apps/api/src/modules/pos/services/invoice.service.ts`:
  - `:177-178` (tạo hóa đơn): đổi `item.locationId ?? itemLocationMap.get(item.itemId)` → `itemLocationMap.get(item.itemId) ?? item.locationId`.
  - `:334-335` (cập nhật draft): đổi tương tự.
  - Thêm comment ngắn (English) giải thích vì sao showroom phải thắng (tránh double-trừ kho lưu trữ khi auto-chuyển kho tạm).
- `apps/api/src/modules/pos/services/invoice.service.spec.ts` (mới hoặc mở rộng) — unit spec cho precedence.

> KHÔNG đụng `create-exchange-invoice.service.ts:170` (đổi/trả OUT cố ý không `showroomOnly`).

## Acceptance Criteria

- [ ] Item có shelf showroom + FE gửi `item.locationId` = shelf kho lưu trữ (non-main) → `invoice_items.location_id` = **shelf showroom** (kết quả `resolveItemLocations`).
- [ ] Item có shelf showroom + FE không gửi `item.locationId` → vẫn = shelf showroom (không đổi hành vi cũ).
- [ ] Item KHÔNG có shelf showroom + FE gửi `item.locationId` → fallback = `item.locationId` (không null, không vỡ luồng).
- [ ] Áp dụng cả `createInvoice` và `updateInvoice` (draft).
- [ ] All queries vẫn filter `actor.organizationId` (+ `branchId`); không rò chéo tenant.
- [ ] Không đổi `create-exchange-invoice.service.ts`; không đổi consumer/posting.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- invoice.service.spec.ts` xanh; `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ 3 nhánh: showroom-thắng (FE warehouse), không có FE location, fallback (không shelf showroom).
- [ ] Không schema change, `synchronize` vẫn false.
- [ ] Không đổi endpoint shape → KHÔNG cần `openapi:generate`.
- [ ] No Vietnamese trong backend source (comment/log/swagger English).
- [ ] No TODO/FIXME ngoài kế hoạch.

## Tech Approach

Điểm sửa (giữ nguyên `resolveItemLocations` dùng `showroomOnly: true`):

```ts
// invoice.service.ts (createInvoice ~:177, updateInvoice ~:334)
// POS sales must deduct from the showroom. An FE-supplied warehouse shelf must
// not win over the showroom resolution: when the same line is also auto-transferred
// out of that warehouse (temp-warehouse fulfill), letting it win double-debits the
// warehouse. Fall back to the FE location only when the item has no showroom shelf.
const resolvedLocationId =
  itemLocationMap.get(item.itemId) ?? item.locationId;
```

Lưu ý: `resolveItemLocations` → `resolveBranchItemLocations(..., { showroomOnly: true })` đã lọc shelf kho lưu trữ (non-main) và rơi về shelf/`DEFAULT` của showroom; map chỉ thiếu key khi item hoàn toàn không có shelf showroom — đúng nhánh fallback.

Spec skeleton (mock `resolveBranchItemLocations` hoặc seed item_storage_locations):

```ts
it('sale line deducts from showroom even when FE sends a warehouse shelf', async () => {
  // item has showroom shelf SHOWROOM_LOC; FE sends warehouse shelf WH_LOC
  // expect saved InvoiceItemEntity.locationId === SHOWROOM_LOC
});
it('falls back to FE location when item has no showroom shelf', async () => {
  // resolver returns empty for item; FE sends WH_LOC
  // expect saved locationId === WH_LOC
});
```

## Testing Strategy

- Unit (`invoice.service.spec.ts`): assert `InvoiceItemEntity.locationId` cho 3 nhánh ở AC.
- E2E end-to-end ledger để ở TKT-SDS-02.

## Dependencies

- Depends on: —
- Blocks: TKT-SDS-02
