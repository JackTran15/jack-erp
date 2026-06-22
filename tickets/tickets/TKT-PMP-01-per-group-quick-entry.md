# TKT-PMP-01 Per-group "Nhập nhanh" trong ProductSelectDialog

## Epic

[EPIC-21062026 ProductSelectDialog: per-row multi + per-group Nhập nhanh](../epics/EPIC-21062026-product-picker-multi-quick-entry.md)

## Summary

Thêm link "Nhập nhanh" trên mỗi **product group row** (chỉ khi `showQuantityPrice`). Bấm → mở `QuickEntryDialog` → "Đồng ý" áp Số lượng/Đơn giá cho các **variant đã chọn trong nhóm đó** (variant chưa chọn giữ nguyên). Không đụng "Nhập nhanh" toàn cục (toolbar).

## Deliverables

- `apps/backoffice-web/src/components/shared/product-select/ProductSelectDialog.tsx`:
  - Thêm `quickEntryGroup` state (productId đang mở Nhập nhanh, hoặc null).
  - Render link "Nhập nhanh" trong product group row (vùng cột qty/price), chỉ khi `showQuantityPrice`.
  - Hàm `applyGroupQuickEntry(productId, qty, price)`: tìm itemId thuộc nhóm ∩ `selectedItemIds` → `setLineValues` cho từng id; nếu nhóm đang `autoSelect` (chọn cả nhóm chưa bung) → `ensureAllVariants(productId)` trước rồi áp cho variant đã chọn.
- `apps/backoffice-web/src/components/shared/product-select/QuickEntryDialog.tsx`:
  - Thêm prop optional `title?: string` (default giữ "Nhập nhanh cho tất cả hàng hoá"); per-group truyền title theo nhóm.

## Acceptance Criteria

- [ ] Link "Nhập nhanh" hiện trên mỗi group row khi `showQuantityPrice`; không hiện ở orphan/variant row.
- [ ] Áp đúng cho variant **đã chọn** trong nhóm; variant chưa chọn không đổi; nhóm khác không đổi.
- [ ] Nhóm chọn-cả-nhóm (autoSelect, chưa bung): resolve variant rồi áp cho toàn bộ (vì tất cả đang được chọn).
- [ ] "Nhập nhanh" toolbar (toàn cục) vẫn áp cho tất cả variant đã chọn — không hồi quy.
- [ ] `getQty/getPrice` ưu tiên `lineValues` (per-id) → đúng giá trị vừa nhập.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Chỉ chạm `ProductSelectDialog.tsx` + `QuickEntryDialog.tsx`.

## Tech Approach

```tsx
// QuickEntryDialog: title configurable
interface Props { open; onOpenChange; onApply; title?: string }
// ...title = "Nhập nhanh cho tất cả hàng hoá" mặc định

// ProductSelectDialog
const [quickEntryGroup, setQuickEntryGroup] = useState<string | null>(null);

async function applyGroupQuickEntry(productId: string, quantity: number, unitPrice: number) {
  let variants = variantCache.current.get(productId) ?? [];
  if (autoSelectIds.has(productId) && variants.length === 0) {
    variants = await ensureAllVariants(productId);     // resolve trước khi áp
  }
  const ids = variants.map((v) => v.id).filter((id) => selectedItemIds.has(id));
  if (ids.length === 0) return;
  setLineValues((prev) => {
    const next = new Map(prev);
    ids.forEach((id) => next.set(id, { quantity, unitPrice }));
    return next;
  });
}

// group row (product branch), thay 2 <td/> placeholder qty/price khi showQuantityPrice:
{showQuantityPrice && (
  <td colSpan={2} className="px-3 py-2 text-right">
    <button type="button" className="text-primary text-sm inline-flex items-center gap-1"
      onClick={() => setQuickEntryGroup(row.id)}>
      <Zap className="h-3.5 w-3.5" /> Nhập nhanh
    </button>
  </td>
)}

// 1 QuickEntryDialog cho per-group (ngoài cái global)
{quickEntryGroup && (
  <QuickEntryDialog open onOpenChange={() => setQuickEntryGroup(null)}
    title="Nhập nhanh cho hàng đã chọn trong nhóm"
    onApply={(q, p) => { void applyGroupQuickEntry(quickEntryGroup, q, p); setQuickEntryGroup(null); }} />
)}
```

> Lưu ý: link Nhập nhanh đặt trong `ProductOrOrphanRow` cần callback `onGroupQuickEntry(productId)` truyền xuống (giống các callback row khác), vì state nằm ở component cha.

## Testing Strategy

- Build + kiểm tay: tick vài variant → Nhập nhanh nhóm → đúng variant đổi qty/price.

## Dependencies

- Depends on: —
- Blocks: TKT-PMP-02, TKT-PMP-03
