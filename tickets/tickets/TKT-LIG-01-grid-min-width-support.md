# TKT-LIG-01 LineItemGrid: hỗ trợ minWidth + scroll ngang (@erp/ui)

## Epic

[EPIC-21062026 LineItemGrid Column Min-Width + Horizontal Scroll](../epics/EPIC-21062026-line-item-grid-min-width.md)

## Summary

Mở rộng component dùng chung `LineItemGrid` để mỗi cột có thể khai báo **min-width**, làm sàn bề rộng cột. Khi tổng min-width vượt bề rộng container, bảng giãn rộng và wrapper `overflow-auto` (đã có) cho **scroll ngang**; khi không vượt, bảng vẫn `w-full` và min-width chỉ là sàn để ô input/select không bị cắt chữ. Thay đổi là **opt-in**: cột không có `minWidth` giữ nguyên hành vi cũ.

## Deliverables

- `packages/ui/src/components/line-item-grid.tsx`:
  - Thêm `minWidth?: number | string` vào interface `LineColumn<R>` (cạnh `width`).
  - Áp `minWidth` vào inline `style` của **mọi cell** của cột đó: header non-grouped `<th>`, header grouped con `<th>`, header `rowSpan=2` `<th>` (cột không nhóm), và body `<td>`. (CSS `min-width` trên `<col>` không được trình duyệt áp dụng, nên phải đặt trên cell, không dùng `<colgroup>`.)
  - Giữ nguyên `<table className="w-full …">` và wrapper `overflow-auto` — với min-width trên cell, table tự giãn quá `w-full` khi cần và scroll ngang.

## Acceptance Criteria

- [ ] `LineColumn` có `minWidth?: number | string`; truyền `minWidth` → cột không nén dưới giá trị đó ở cả header lẫn body.
- [ ] `minWidth` **mặc định = `width`** khi không khai báo → mọi cột đã có `width` tự có sàn, không bị nén (đây là hành vi chung cho tất cả consumer, đúng yêu cầu "mọi bảng như nhau"). Cột **không** có `width` thì giữ nguyên (không có sàn).
- [ ] Khi Σ(minWidth) > container: bảng scroll ngang; header vẫn dính (`position: sticky`) khi cuộn dọc.
- [ ] Hoạt động cho cả bảng có grouped header lẫn không grouped (cả 2 nhánh render header).

## Definition of Done

- [ ] `pnpm --filter @erp/ui build` xanh; `pnpm --filter @erp/backoffice-web build` (tsc) xanh.
- [ ] Verify trực quan ở TKT-LIG-02 (component này không có trang độc lập để chụp riêng).
- [ ] Không đổi public API ngoài việc thêm field optional `minWidth`.

## Tech Approach

```tsx
export interface LineColumn<R> {
  // …
  width?: number | string;
  minWidth?: number | string; // NEW — floor width; column won't compress below this
  // …
}

// helper để gom style width/minWidth (dùng lại ở mọi nhánh th + td)
const sizeStyle = (col: LineColumn<R>): React.CSSProperties => ({
  ...(col.width ? { width: col.width } : {}),
  ...(col.minWidth ? { minWidth: col.minWidth } : {}),
});

// header non-grouped <th>
style={{ ...stickyHeaderStyle(0), ...sizeStyle(col) }}
// header rowSpan=2 (cột không nhóm) <th> → dùng group.columns[0]
// header grouped con <th> (hàng 2)
// body <td> → thêm sizeStyle(col) vào style của cell
```

- Body `<td>` hiện chưa có inline width style — thêm `style={sizeStyle(col)}` vào `<td>` để cột body cũng giữ sàn (auto layout lấy max của các cell trong cột; đặt cả header lẫn body cho chắc).
- Không cần đụng `overflow-auto` (đã có ở wrapper dòng 132). Không cần `table-fixed`.

## Testing Strategy

- Manual qua TKT-LIG-02 (Nhập kho) trên `make dev-backoffice`: thu nhỏ cửa sổ/dialog để xác nhận scroll ngang xuất hiện và ô input không bị cắt.
- Không có unit test riêng cho component UI thuần render (repo không có test cho `@erp/ui`).

## Dependencies

- Depends on: —
- Blocks: TKT-LIG-02, TKT-LIG-03
