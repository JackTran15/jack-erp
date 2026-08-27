---
id: UOW-05
slug: stock-take-multiselect
title: Kiểm kê kho — tick phiếu để gộp mà không kéo chi tiết
demoable: true
duration: 0.5d
depends_on: [UOW-01]
requirements: [US-01, US-02, US-03]
verifies: [AC-08]
risk: low
status: todo
rollback: revert 1 commit — ô tick quay lại gọi selectStockTake như cũ
---

# UOW-05 — Kiểm kê kho — tick phiếu để gộp mà không kéo chi tiết

## Demo script

1. Mở DevTools Network, lọc `stock-takes`, vào `/inventory/stock-takes`
2. Trang tải xong: **không phiếu nào được tick** (bản cũ tự tick dòng đầu qua `onAutoSelect`)
3. Xóa log. Tick 3 phiếu → cả 3 tick, **Network trống**, panel "Chi tiết" đứng yên
4. Bấm "Gộp phiếu" → xem trước gộp đúng 3 phiếu vừa tick
5. Click ra ngoài ô tick trên một dòng khác → Network có `GET /inventory/stock-takes/:id`,
   panel đổi, dòng đó được tô nền, tick không đổi
6. Ô header "Chọn tất cả phiếu có thể gộp" tick hết phiếu **chưa hủy và chưa gộp**;
   phiếu đã hủy/đã gộp không bị tick lây
7. Danh sách rỗng → ô header disabled
8. Lật trang giữ tick; bấm "Nạp" hoặc đổi bộ lọc thì sạch tick

## In scope

- `StockTakesPage` bỏ state `selectedIds: string[]` tự cài, chuyển sang `useRowMultiSelect`
- Ô tick không gọi `selectStockTake` nữa; `onRowClick` vẫn gọi
- Bỏ `onAutoSelect` — vào trang không tự tick phiếu nào
- `SelectAllCheckbox` nhận thêm prop `label` tùy chọn: phạm vi "tất cả" ở trang này hẹp
  hơn "mọi dòng đang hiển thị"
- Tô dòng đang xem; xóa tick khi đổi lọc / bấm "Nạp"

## Not in scope

- Nhân viên, Thu chi tiền mặt, Thu chi tiền gửi — cũng tick-là-fetch nhưng chỉ có
  single-select và chưa có thao tác hàng loạt nào, thêm multi-select là dựng UI không
  dùng vào việc gì
- `TransferInPage` — đã có multi-select riêng và vốn không fetch khi tick

## Risks

| Risk | Mitigation |
| --- | --- |
| Bỏ `onAutoSelect` làm hỏng luồng gộp | `canMerge` cần ≥ 2 phiếu, nên tự tick 1 phiếu vốn không giúp gì. Demo bước 4 là bài kiểm |
| Ô header tick lây phiếu đã hủy / đã gộp | Truyền `mergeEligibleRows` (không phải toàn bộ dòng) vào `useRowMultiSelect`, nên `toggleAllOnPage` và `allOnPageChecked` tính đúng trên tập gộp được. Demo bước 6 |
| `sourceIds` gửi lên BE sai kiểu | Hook trả `Set`, API cần mảng → `[...checkedIds]`; `tsc` bắt được nếu sai |

## Definition of done

- [x] Demo 8 bước chạy được trên máy dev
- [x] `pnpm --filter @erp/backoffice-web build` xanh
- [x] Bốn trang kho đã làm trước không đổi hành vi (nhãn ô header mặc định giữ nguyên)

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
