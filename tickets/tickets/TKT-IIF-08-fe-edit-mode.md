# TKT-IIF-08 FE edit mode wiring

## Epic

[EPIC-31052026 Inventory Item Form Refactor](../epics/EPIC-31052026-inventory-item-form-refactor.md)

## Summary

Hiện `/admin/inventory-items/:id/edit` rơi về generic grid (`CrudEditPage` chỉ special-case `inventory-providers`). Ticket này cho `inventory-items` dùng lại form giàu (create) ở chế độ edit: load item kèm `brand/brandId/providers[]/units[]` vào state form và PATCH full payload (BE reconcile từ TKT-IIF-03).

## Deliverables

- `apps/backoffice-web/src/components/crud/CrudEditPage.tsx` — special-case `entityKey === "inventory-items"`:
  - Render `InventoryItemCreateForm` (đổi tên thành `InventoryItemForm`, prop `mode: "create" | "edit"`).
  - Submit: `payload = { ...values }` (giống create) → `useCrudUpdate("inventory-items")` PATCH.
- `apps/backoffice-web/src/components/crud/inventory/InventoryItemCreateForm.tsx` → đổi tên file/component thành `InventoryItemForm.tsx` (named export `InventoryItemForm`); thêm prop `mode`:
  - `edit`: disable "Tồn kho ban đầu" + "Đơn giá nhập đầu kỳ"; SKU không auto-sinh.
  - hydrate state từ `record`: `brandId`, `providers[]` (từ record hoặc `GET /inventory/items/:id/providers`), `units[]` (từ record.units), conversion rows, extras.
- Cập nhật `CrudCreatePage` import theo tên mới (giữ hành vi create).

## Acceptance Criteria

- [ ] Mở edit 1 item có brand + 2 NCC + 2 đơn vị chuyển đổi → form hiển thị đúng toàn bộ.
- [ ] Đổi brand/providers/units + Lưu → reload thấy đúng (reconcile, không nhân bản, đúng primary/default).
- [ ] Field chỉ-tạo (Tồn kho ban đầu, đơn giá nhập đầu kỳ) bị disable ở edit.
- [ ] Create vẫn hoạt động y như cũ (không regression).
- [ ] Không sửa lung tung ngoài phạm vi (chỉ thêm mode + hydrate + special-case edit).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Named exports; `interface Props` tách riêng.
- [ ] Screenshot edit form + chứng minh reload sau khi sửa providers/units.

## Tech Approach

- Lấy lại pattern special-case ở `CrudCreatePage` (`if entityKey === "inventory-items" payload = {...values}`) áp cho `CrudEditPage`.
- Hydrate providers: nếu `record.providers` không có sẵn trong generic GET, gọi `GET /inventory/items/:id/providers` (endpoint M2M đã có từ EPIC-010) qua `erpApi`.
- Giữ `useEffect` sync extras/unitRows/providerRows → `values` cho cả 2 mode.

## Testing Strategy

- Manual: create → edit → sửa nested → reload; verify DB qua list.
- E2E: thuộc TKT-IIF-09.

## Dependencies

- Depends on: TKT-IIF-03 (update reconcile), TKT-IIF-06 (form), TKT-IIF-07 (provider table).
- Blocks: TKT-IIF-09.
