# TKT-PSF-02 LookupField: dùng onSearchButtonClick (đã có sẵn) cho ô SKU sản phẩm

## Epic

[EPIC-21062026 Thay modal "Chọn hàng hóa" cũ bằng ProductSelectDialog (single-fill)](../epics/EPIC-21062026-product-picker-single-fill.md)

## Summary

> **Phát hiện khi đọc code:** `LookupField` **đã có sẵn** prop `onSearchButtonClick?: () => void` — "When set, the trailing search button calls this instead of opening the inline list or default modal." (đang dùng ở các trang treasury). → **Không cần thêm prop mới, không cần sửa `LookupField`.**

Ticket này chỉ là điểm tựa: các trang (PSF-03/04) chuyển ô SKU **sản phẩm** từ `enableSearchModal` (mở `LookupSearchModal`) sang `onSearchButtonClick` (mở `ProductSelectDialog` single). `LookupField` và `LookupSearchModal` giữ nguyên cho mọi lookup khác.

## Deliverables

- Không sửa file nào trong ticket này. Việc dùng `onSearchButtonClick` nằm ở PSF-03/04.

## Acceptance Criteria

- [ ] Xác nhận `onSearchButtonClick` khi được truyền: đóng dropdown inline và gọi callback, **không** mở `LookupSearchModal`, **không** mở inline list (`LookupField.tsx` nhánh nút "Tìm kiếm").
- [ ] `enableSearchModal`/`searchModalTitle`/`searchModalPlaceholder` vẫn hoạt động cho các lookup không phải sản phẩm.

## Definition of Done

- [ ] Không thay đổi `LookupField.tsx`.
- [ ] Hành vi xác nhận qua build + chạy tay ở PSF-03.

## Tech Approach

```tsx
// LookupField.tsx (đã có sẵn — chỉ tham chiếu):
onClick={() => {
  if (onSearchButtonClick) { setOpen(false); onSearchButtonClick(); return; }
  if (enableSearchModal) { setOpen(false); setSearchModalOpen(true); }
  else { openAndLoad(); }
}}
```

## Testing Strategy

- Không có thay đổi; xác minh gián tiếp qua PSF-03 build + chạy tay.

## Dependencies

- Depends on: —
- Blocks: TKT-PSF-03, TKT-PSF-04
