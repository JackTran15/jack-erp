# TKT-035 Backoffice product & ma trận UI

## Epic

[EPIC-006 Product variants & catalog](../epics/EPIC-006-product-variants-catalog.md)

## Summary

Màn hình Backoffice tạo/sửa **Product**, cấu hình **attributes + options**, sinh **biến thể** (gọi TKT-030), hiển thị **ma trận tồn kho** theo biến thể.

## Deliverables

- Page `apps/backoffice-web/src/pages/products/ProductsPage.tsx` (list, create, edit).
- Form: tạo product → thêm attribute definitions + options inline → button "Sinh biến thể" → call API TKT-030.
- Matrix view: hiển thị bảng Size × Màu, mỗi ô = biến thể (code, tồn, location).
- Integrate API TKT-028 (product CRUD), TKT-029 (attribute), TKT-030 (generate), TKT-033 (stock display).

## Acceptance Criteria

- [ ] Danh sách product (table paginate) + search.
- [ ] Tạo product: form name, description, isActive, defaultProviderId → submit → tạo.
- [ ] Thêm attribute: input "Size" → thêm options "39, 40, 43"; "Màu" → "Nâu, Đen" → submit.
- [ ] Button "Sinh biến thể" → call POST `/products/:id/generate-variants` (TKT-030) → hiển thị count biến thể tạo ra.
- [ ] Matrix view: table Size (hàng) × Màu (cột); mỗi ô hiển thị `item.code`, tồn (từ TKT-033 API), location (từ TKT-032).
- [ ] Edit product / attribute → re-generate (hoặc warning nếu đã có biến thể).

## Definition of Done

- [ ] PR: page + components; sử dụng API TKT-028–030, TKT-033; tests (Playwright hoặc Vitest component test).
- [ ] Manual test: tạo product → 2 chiều × 6 options → sinh → matrix hiển thị 6 ô; nhập kho 1 biến thể → matrix update tồn.
- [ ] DoD: UI tuân rule tiếng Việt (vietnamese-ui.mdc); responsive mobile OK.

## Tech Approach

### Layout

- Danh sách: `CrudListPage` pattern hoặc custom table; columns: product name, description, isActive, created.
- Chi tiết: tabs "Thông tin chung" / "Thuộc tính" / "Biến thể & tồn kho".

### Form product

- `ProductForm` component: name (required), description (textarea), isActive (checkbox), defaultProviderId (select provider).

### Attributes inline

- `AttributeDefinitionsForm`: mảng `[{ name, options: [{valueLabel, codeSuffix}] }]` → dynamic add/remove.
- Submit → POST `/products/:id/attributes` (TKT-029) → foreach definition, foreach option → API calls (hoặc batch).

### Sinh biến thể

- Button "Sinh biến thể" → confirmation modal (hiển thị count N×M×K) → POST `/products/:id/generate-variants` → loading → success toast + refresh matrix.

### Matrix view

- Fetch `/products/:id/variants` (custom endpoint hoặc `/items?productId=...`) → group theo attribute combo → render table 2D.
- Mỗi cell: `item.code`, tồn (aggregate từ `stock_balances`), location (từ `product_storage_locations`).
- Click cell → navigate `/items/:id` detail (CRUD item).

### Integration

- API client: `backoffice-web/src/api/products.ts` → wrapper fetch `/api/v1/products/...`.

## Testing Strategy

- Unit: component test form validation (name required).
- E2e (Playwright): tạo product → thêm Size(39,40) + Màu(Nâu) → generate → matrix 2×1 = 2 cell → check.
- Manual: nhập liệu thực tế sản phẩm giày → sinh 10 biến thể → kiểm tra tồn kho.

## Dependencies

- Depends on: TKT-030 (variant API), TKT-033 (stock display).
- Blocks: TKT-037 (e2e UI test).

