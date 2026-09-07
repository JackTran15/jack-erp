---
id: UOW-01
slug: multiselect-foundation
title: Tick nhiều phiếu mà không kéo dữ liệu dòng hàng — trang Nhập kho
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-02, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11]
risk: medium
status: todo
rollback: revert 1 commit — chỉ động vào apps/backoffice-web, không migration, không đổi API
---

# UOW-01 — Tick nhiều phiếu mà không kéo dữ liệu dòng hàng — trang Nhập kho

## Demo script

1. Mở DevTools tab Network, lọc `goods-receipts`, vào `/inventory/purchase-orders`
2. Trang tải xong: panel "Chi tiết" hiển thị lines của phiếu đầu (NK000430), **không ô
   checkbox nào được tick**, dòng đầu được tô nền phân biệt
3. Xóa log Network. Click vào **ô checkbox** dòng NK000428 → ô tick lên,
   **Network trống**, panel "Chi tiết" vẫn là NK000430
4. Tick tiếp NK000429 và NK000426 → cả 3 ô đều tick, Network vẫn trống
5. Click vào ô "Đối tượng" của dòng NK000428 → panel đổi sang lines của NK000428,
   Network xuất hiện `GET /goods-receipts/{id}` + `/lines`, và **cả 3 ô tick giữ nguyên**
6. Ô checkbox trên header đang ở trạng thái gạch ngang (indeterminate). Click nó →
   cả 16 dòng đều tick. Click lần nữa → sạch tick
7. Tick 2 phiếu, chuyển sang trang 2 rồi quay lại trang 1 → 2 phiếu vẫn tick
8. Bấm "Nạp" → sạch tick. Tick lại 2 phiếu, đổi "Từ ngày" rồi bấm "Lấy dữ liệu" → sạch tick
9. Lọc cho danh sách rỗng → ô checkbox header ở trạng thái disabled

## In scope

- `useRowMultiSelect` — hook giữ `Set<string>` id đã tick, tính `allOnPageChecked` /
  `someOnPageChecked` theo các dòng đang hiển thị
- `RowSelectCheckbox` + `SelectAllCheckbox` — ô tick dòng và ô tick header
  (`indeterminate` phải đặt qua DOM ref)
- `BaseDataTable` nhận prop tùy chọn `rowClassName`
- `PurchaseOrdersPage`: ô tick đọc/ghi vào tập đã tick thay vì `selectedId`; header có
  ô Chọn tất cả; dòng đang xem được tô nền; xóa tick khi đổi lọc và khi bấm "Nạp"

## Not in scope

- Nút "In tem mã" gom nhiều phiếu (UOW-02)
- Ba trang còn lại (UOW-03)
- Shift-click chọn theo khoảng

## Risks

| Risk | Mitigation |
| --- | --- |
| Thêm `rowClassName` làm hồi quy hơn hai chục trang khác đang dùng `BaseDataTable` | Prop tùy chọn, mặc định `undefined` → nhánh `cn()` cho ra chuỗi y hệt hôm nay. T-01-03 kiểm bằng `tsc` toàn app |
| `useEffect` xóa tick phụ thuộc nhầm `pagination` → lật trang là mất tick (thủng AC-09) | Demo bước 7 chính là bài kiểm; danh sách phụ thuộc chỉ gồm state bộ lọc, có comment nêu rõ lý do |
| `columnFilters` / `period` đổi identity mỗi lần render → xóa tick liên tục | Cả hai là `useState` object, chỉ đổi identity khi `setState`. Demo bước 4 (tick 3 dòng liên tiếp không mất) là bài kiểm |

## Definition of done

- [x] AC-01 → AC-11 pass
- [x] `pnpm --filter @erp/backoffice-web build` xanh (tsc + vite)
- [x] Ảnh chụp bằng /ai-dlc-verify cho các bước 2, 5, 6 của demo
- [x] Không trang nào ngoài `PurchaseOrdersPage` đổi hành vi

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
