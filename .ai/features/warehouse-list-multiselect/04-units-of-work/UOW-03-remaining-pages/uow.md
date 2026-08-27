---
id: UOW-03
slug: remaining-pages
title: Đưa multi-select sang Xuất kho, Chuyển kho, Lệnh điều chuyển
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-02]
requirements: [US-01, US-02, US-03, US-04]
verifies: [AC-01, AC-03, AC-05, AC-12, AC-13]
risk: low
status: todo
rollback: revert 1 commit — mỗi trang là một thay đổi độc lập, revert lẻ được từng trang
---

# UOW-03 — Đưa multi-select sang Xuất kho, Chuyển kho, Lệnh điều chuyển

## Demo script

1. `/inventory/goods-issues` với Network lọc `goods-issues`: tick 3 dòng liên tiếp →
   Network trống, panel "Chi tiết" không đổi. Click cột "Đối tượng" một dòng khác →
   panel đổi, tick giữ nguyên
2. Vẫn ở Xuất kho: tick 2 phiếu, bấm "In tem mã" → trang In tem mã mở với lines của
   cả hai phiếu, đã gộp trùng
3. Bỏ tick hết, bấm "In tem mã" → in theo dòng đang xem (hành vi cũ)
4. `/inventory/stock-transfers`: tick nhiều dòng, ô header Chọn tất cả tick hết 20 dòng
   đang hiển thị, click lần nữa sạch tick. Panel "Chi tiết" chỉ đổi khi click ngoài ô tick
5. `/inventory/transfer-orders` với Network lọc `transfer-orders`: tick nhiều dòng →
   Network trống. Ô header Chọn tất cả hoạt động. Click cột "Lý do" → panel nạp chi tiết
6. Cả ba trang: đổi bộ lọc hoặc bấm "Nạp" → sạch tick; lật trang rồi quay lại → giữ tick

## In scope

- `GoodsIssuePage`: multi-select + ô header + tô dòng đang xem + xóa tick + "In tem mã"
  gom nhiều phiếu (dùng `GET /inventory/goods-issues/{id}`)
- `StockTransferPage`: multi-select + ô header + tô dòng đang xem + xóa tick
- `TransferOrdersPage`: multi-select + ô header + tô dòng đang xem + xóa tick

## Not in scope

- Thêm nút "In tem mã" cho Chuyển kho và Lệnh điều chuyển (A-01 — người dùng đã loại)
- `TransferInPage`, `StockTakesPage` và các trang Treasury dùng chung `BaseDataTable`

## Risks

| Risk | Mitigation |
| --- | --- |
| `StockTransferPage` dùng `activeRecord` (row danh sách) chứ không dùng `selectedId` để nuôi panel — dễ sửa nhầm chỗ | A-07 đã ghi rõ; T-03-02 chỉ động vào `leadingColumn` và state tick, không chạm `activeRecord` |
| Ba trang có state bộ lọc tên khác nhau → gắn nhầm dependency của effect xóa tick | Mỗi ticket có bước "đọc `loadRecords` deps, trừ đi `pagination`" trong done-when |
| Shape dòng hàng của Xuất kho khác Nhập kho (`line.itemCode`, `line.unit` fallback) | Giữ nguyên mapping đang có ở `GoodsIssuePage.tsx:463`, chỉ đổi nguồn dòng hàng |

## Definition of done

- [x] Demo 6 bước ở trên chạy được trên máy dev
- [x] `pnpm --filter @erp/backoffice-web build` xanh
- [x] Ảnh chụp bằng /ai-dlc-verify cho cả ba trang
- [x] Chuyển kho và Lệnh điều chuyển **không** mọc thêm nút "In tem mã"

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
