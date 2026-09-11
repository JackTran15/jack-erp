---
id: UOW-02
slug: store-picker-scroll
title: Danh sách "Chọn cửa hàng" cuộn được bằng chuột
demoable: true
duration: 1d
depends_on: []
requirements: [US-02]
verifies: [AC-08, AC-09, AC-10]
risk: low
status: todo
rollback: revert packages/ui/src/components/multi-select-chips.tsx
---

# UOW-02 — Danh sách "Chọn cửa hàng" cuộn được bằng chuột

Một thay đổi trong component dùng chung `MultiSelectChips` (ADR-02). Hai nơi dùng — báo cáo và form Chương
trình khuyến mãi — được sửa cùng lúc.

## Demo script

Môi trường `local-backoffice`, tổ chức My Company (8 chi nhánh).

1. Header chọn **Chuỗi cửa hàng**.
2. Báo cáo > Bán hàng > "Doanh thu theo mặt hàng" → "Chọn báo cáo" → dòng "Cửa hàng" chọn **"Theo nhóm cửa hàng"**.
3. Bấm ô "Chọn cửa hàng" khi chưa chọn cửa hàng nào → rê chuột lên danh sách, lăn xuống → danh sách cuộn tới
   chi nhánh cuối; bấm chọn được chi nhánh đó.
4. Mở lại danh sách, nhấn ArrowDown liên tục tới mục cuối → mục đang chọn tự cuộn vào khung nhìn.
5. Khuyến mãi > Chương trình > tạo mới → phần cửa hàng áp dụng chọn chế độ chọn từng cửa hàng → mở danh sách →
   lăn chuột cuộn được.

## In scope

- Thay `ScrollArea` bằng `div` `max-h-60 overflow-y-auto overscroll-contain` trong `MultiSelectChips`.

## Not in scope

- Component `ScrollArea` dùng chung.
- `multi-select.tsx:79`, `SearchListingInput.tsx:190` — cùng mẫu nhưng chưa có báo lỗi.

## Risks

| Risk | Mitigation |
| --- | --- |
| My Company chỉ có 8 chi nhánh, danh sách có thể chỉ tràn khoảng một mục nên demo local khó thấy | Ở bước 3 kiểm thêm bằng DevTools `scrollHeight > clientHeight` của danh sách; nếu vẫn vừa khít, chạy lại bước 1–3 trên staging (tổ chức MT, nhiều chi nhánh hơn) |
| Không có test DOM (không có jsdom/RTL) | AC-08 … AC-10 nghiệm thu bằng demo |

## Definition of done

- [x] AC-08, AC-09, AC-10 pass
- [x] `tsc --noEmit` của `apps/backoffice-web` sạch (`@erp/ui` dùng từ source)
- [x] Không còn import `ScrollArea` thừa trong `multi-select-chips.tsx`
- [x] Demo script chạy đầu-cuối và được nghiệm thu ở G4

Demo chạy ngày 2026-09-11 trong Chrome của Akenzy (backoffice local, tổ chức MT — 15 chi nhánh nên danh sách tràn rõ,
không cần staging); số đo và ảnh ghi ở T-02-01. Akenzy accept T-02-01 cùng ngày.
