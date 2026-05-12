# TKT-065 Backoffice item form rebuild (3 tabs)

## Epic

[EPIC-010 Item Management Enhancement](../epics/EPIC-010-item-management-enhancement.md)

## Summary

Rebuild màn hình `/admin/inventory-items/new` (và `/edit/:id`) theo 3 tab Phase 1:
- **Thông tin cơ bản** — name/code/unit/category/giá/provider list/active/posVisible/barcode list.
- **Thông tin bổ sung** — physical specs (trọng lượng, kích thước, năm sx, thành phần, mô tả).
- **Thông tin kho** — định mức tồn min/max (default).

Tab "Hoa hồng" tạm hidden hoặc disabled. Tab "Đơn vị chuyển đổi", tab "Nhà cung cấp" (riêng) gộp vào tab Cơ bản dưới dạng sub-section "Nhà cung cấp".

## Deliverables

- React component `ItemFormPage` thay thế trang `/admin/inventory-items/new` hiện tại (đang dùng generic CRUD auto-render).
- Component con:
  - `ItemBasicTab` — form cơ bản + sub-grid Nhà cung cấp (M2M) + sub-grid Barcode.
  - `ItemAdditionalTab` — physical specs.
  - `ItemStorageTab` — min/max.
- Hook TanStack Query: `useCreateItem`, `useUpdateItem`, `useItemProviders`, `useItemBarcodes`, `useItemThresholds`.
- Picker "Danh mục" với search + nút "+" mở modal tạo category inline.
- Picker "Nhà cung cấp" với search + nút "+" mở modal tạo provider inline.
- Toolbar dưới form: `Lưu`, `Lưu và nhân bản`, `Lưu và thêm mới`, `Huỷ bỏ` (giữ pattern hiện có).

## Acceptance Criteria

- [ ] Form load đúng toàn bộ field 3 tab.
- [ ] Tạo mới item + thêm 2 NCC (1 primary) + 1 barcode + min/max → tất cả lưu thành công trong "Lưu".
- [ ] Edit item: load đúng providers/barcodes/thresholds hiện có.
- [ ] Search category/provider chạy debounce (300ms).
- [ ] Tạo category/provider inline reload picker mà không mất state form.
- [ ] Validation client-side: required field hiển thị lỗi đỏ, button "Lưu" disable khi form invalid.
- [ ] "Lưu và nhân bản" tạo item mới, copy mọi field trừ `code` (yêu cầu user nhập lại).
- [ ] "Lưu và thêm mới" tạo item rồi reset form về trống.

## Definition of Done

- [ ] PR có file UI mới + storybook (nếu pattern đang dùng) hoặc demo screenshot.
- [ ] Test E2E happy path tạo item full + edit + tạo inline category/provider.
- [ ] Code review từ team UX.
- [ ] Vietnamese label đúng.

## Tech Approach

### Order các API call khi "Lưu"

Vì có 3 bảng phụ (providers/barcodes/thresholds) → form không thể chỉ 1 POST. Đề xuất sequential:

```
1. POST /inventory/items                    → itemId
2. POST /inventory/items/:id/providers   × N  (N NCC)
3. POST /inventory/items/:id/barcodes    × M  (M barcode)
4. PATCH /inventory/items/:id/thresholds/default
```

Nếu bước 2/3/4 fail → hiện toast lỗi, item đã tạo ở step 1 không rollback (acceptable, user có thể edit). Hoặc cho phép "saga compensation": delete item nếu bất kỳ bước phụ fail. **Chọn approach đơn giản: không rollback, hiện partial-success message.**

### Inline-create modal

```tsx
function CategoryPicker({ value, onChange }) {
  const { data } = useSearch('inventory-item-categories', searchTerm);
  return (
    <PickerWithCreate
      options={data}
      onCreate={async (name) => {
        const cat = await createCategory({ name });
        onChange(cat.id);  // auto-select vừa tạo
      }}
    />
  );
}
```

### State management

Form state dùng `react-hook-form` (theo pattern hiện có). Server cache dùng TanStack Query. Không dùng Zustand cho form data.

## Testing Strategy

- E2E (Playwright?): tạo item full → check DB có đúng row trong items + item_providers + item_barcodes + item_stock_thresholds.
- Visual regression cho 3 tab.

## Dependencies

- Phụ thuộc: TKT-060 (item DTO), TKT-061 (provider API), TKT-062 (provider POST), TKT-063 (barcode API), TKT-064 (threshold API).
- Blocks: TKT-066.
