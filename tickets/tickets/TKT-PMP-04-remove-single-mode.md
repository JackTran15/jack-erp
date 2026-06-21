# TKT-PMP-04 Gỡ dead single-mode + verify build

## Epic

[EPIC-21062026 ProductSelectDialog: per-row multi + per-group Nhập nhanh](../epics/EPIC-21062026-product-picker-multi-quick-entry.md)

## Summary

Sau khi 5 trang bỏ single-fill (PMP-02/03), `selectionMode`/`isSingle` trong `ProductSelectDialog` thành code chết. Gỡ và verify.

## Deliverables

- `apps/backoffice-web/src/components/shared/product-select/ProductSelectDialog.tsx`:
  - Gỡ prop `selectionMode`, biến `isSingle`, các nhánh `if (isSingle)` trong `toggleItem`, các `{!isSingle && …}` (header select-all, group checkbox), prop `isSingle` truyền xuống `ProductOrOrphanRow` + field trong interface.
  - **Giữ** fix default `title="Chọn hàng hóa"` và per-group Nhập nhanh (PMP-01).

## Acceptance Criteria

- [ ] `grep -rn "selectionMode\|isSingle" apps/backoffice-web/src` → 0 (ngoài lịch sử git).
- [ ] `grep -rn "selectionMode=\"single\"" apps/backoffice-web/src` → 0.
- [ ] Header select-all + group checkbox luôn render (multi là mặc định duy nhất).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Kiểm tay 5 trang: search/dòng → multi, group/header checkbox, per-group + global Nhập nhanh, thêm N dòng. Không còn single-fill.

## Tech Approach

```bash
grep -rn "selectionMode\|isSingle" apps/backoffice-web/src   # 0 sau khi gỡ
pnpm --filter @erp/backoffice-web build
```

## Testing Strategy

- Grep + build + kiểm tay 5 trang (4 yêu cầu của user: group select-all, header select-all, per-group Nhập nhanh áp variant đã chọn, thêm N dòng).

## Dependencies

- Depends on: TKT-PMP-02, TKT-PMP-03
- Blocks: —
