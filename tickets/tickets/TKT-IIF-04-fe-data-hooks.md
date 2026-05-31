# TKT-IIF-04 FE data layer: brand/category/unit/provider hooks

## Epic

[EPIC-31052026 Inventory Item Form Refactor](../epics/EPIC-31052026-inventory-item-form-refactor.md)

## Summary

Cung cấp tầng data FE cho các picker/dialog của form: list + quick-create cho **Thương hiệu**, **Nhóm hàng hóa**, **Đơn vị tính**, và list provider. Tái dùng generic CRUD hooks hiện có (`useCrudRecords`/`useCrudCreate`/`useCrudDelete` trong `useCrudApi.ts`) thay vì viết client mới; bỏ data hardcode (`BRAND_SUGGESTIONS`, `GROUP_SUGGESTIONS`).

## Deliverables

- `apps/backoffice-web/src/components/crud/inventory/item-create/hooks.ts` (new) — thin wrappers:
  - `useBrands(search)` → `useCrudRecords("inventory-brands", { page, pageSize, search })`.
  - `useCreateBrand()` → `useCrudCreate("inventory-brands")`; `useDeleteBrand()` → `useCrudDelete("inventory-brands")`.
  - `useItemCategories(search)` / `useCreateItemCategory()` → `inventory-item-categories` (create body gồm `code/name/parentGroupId/description/commissions[]`).
  - `useItemUnits(search)` / `useCreateItemUnit()` → `inventory-item-units` (body `name`/`description`).
  - `useProviders(search)` → `inventory-providers` (reuse pattern providerFetch hiện có).
- `apps/backoffice-web/src/components/crud/inventory/item-create/constants.ts` — xóa `BRAND_SUGGESTIONS`, `GROUP_SUGGESTIONS` (và mọi import của chúng).
- Đảm bảo queryKey theo convention: `["crud","inventory-brands","records", search, page]` (prefix resource) để invalidate đúng sau create/delete.

## Acceptance Criteria

- [ ] Hooks gọi đúng endpoint generic CRUD qua `erpApi` + `requireErpData`; tự gắn `Authorization`/`X-Branch-Id`.
- [ ] Create/delete invalidate đúng prefix queryKey → list refresh ngay.
- [ ] Không còn reference tới `BRAND_SUGGESTIONS`/`GROUP_SUGGESTIONS` trong toàn `backoffice-web` (grep sạch).
- [ ] Server data chỉ nằm trong TanStack Query (không nhét vào Zustand).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass (typecheck sạch).
- [ ] Không tạo client mới trùng `erpApi`; named exports only.
- [ ] FE label tiếng Việt; identifier/hook tiếng Anh.

## Tech Approach

```ts
export function useBrands(search: string) {
  return useCrudRecords(
    "inventory-brands",
    { page: 1, pageSize: 50, sortBy: undefined, sortOrder: "desc", search, filters: {} },
    true,
  );
}
export function useCreateBrand() { return useCrudCreate("inventory-brands"); }
export function useDeleteBrand() { return useCrudDelete("inventory-brands"); }
```

> `useCrudDelete` đã tồn tại trong `useCrudApi.ts` (kiểm tra; nếu thiếu thì bổ sung theo cùng pattern `useCrudCreate`).

## Testing Strategy

- Manual: mở mỗi picker → list trả dữ liệu; quick-create → item mới xuất hiện không cần reload.

## Dependencies

- Depends on: TKT-IIF-01, TKT-IIF-02 (endpoint brand/category mở rộng).
- Blocks: TKT-IIF-05, TKT-IIF-06, TKT-IIF-07.
