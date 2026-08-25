---
id: UOW-02
slug: viewport-fit
title: Trang trong vỏ POS vừa đúng chiều cao vỏ chừa lại
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-02]
verifies: [AC-07, AC-08, AC-09, AC-10]
risk: low
status: todo
rollback: đổi hai class gốc trang về `h-screen`. Hai dòng, hai file
---

# UOW-02 — Trang vừa khung nhìn

## Demo script

1. Đăng nhập POS (`localhost:3001`), đặt cửa sổ ở **1440×900**
2. Mở **Danh sách hoá đơn** (`/invoices`) với đủ dòng để lưới tràn
3. Thanh phân trang hiện **đủ**: nút lật trang, chuỗi `x-y/z kết quả`, ô chọn số dòng/trang.
   Dòng **Tổng tiền:** hiện đủ chiều cao — so với ảnh chụp prod ở `00-intent.md`, nơi cả hai bị cắt
4. Thu cửa sổ xuống **1440×720** → thanh phân trang vẫn đủ, vùng bảng co lại và cuộn bên trong
5. Bấm được nút trang kế tiếp và đổi được số dòng/trang → chứng minh chúng không chỉ *hiện*
   mà còn *bấm được*
6. Sang **Đổi trả hàng** (`/return-goods`) ở cả hai kích thước → tương tự, và bố cục bên
   trong trang không đổi gì khác
7. Ở cả hai trang, chạy trong Console:
   `document.scrollingElement.scrollHeight <= window.innerHeight` → `true`

## In scope

- `InvoiceListPage.tsx` — container gốc: `h-screen` → `min-h-0 flex-1`
- `ReturnGoodsPage.tsx` — cùng một đổi
- Đo sống đóng A-01 trước khi sửa

## Not in scope

- `PosDataTable` / `PosPaginationBar` — không đụng (ADR-03)
- `PosLayout` — `h-[100dvh]` và `overflow-hidden` giữ nguyên
- `DailyReportPage` / `FastStockTransferPage` — đã đúng pattern
- Mobile layout — cả hai app đều là vỏ desktop

## Risks

| Risk | Mitigation |
|---|---|
| A-01 sai, nguyên nhân thật nằm ở `PosDataTable.fillHeight` | T-02-01 **đo trước khi sửa**; số đo không khớp thì dừng và `aidlc reopen G2`, không sửa mò |
| `min-h-0 flex-1` làm vùng bảng co về 0 ở viewport rất thấp | Bước 4 của demo ở 1440×720; vùng bảng có `overflow-auto` sẵn nên co là cuộn, không phải mất |
| Trang đổi trả có cấu trúc bên trong khác | A-08 + bước 6: đối chiếu ảnh trước/sau |

## Definition of done

- [x] AC-07 … AC-10 pass
- [x] A-01 đóng bằng **số đo**, không phải suy luận — ghi ở T-02-01. Độ tràn = **+53px**,
      bằng đúng chiều cao header, ở cả hai viewport và trên cả hai trang
- [x] `PosDataTable.tsx`, `PosPaginationBar.tsx`, `PosLayout.tsx` không có dòng nào thay đổi
      — `git diff --stat apps/pos-web/src/components/` rỗng
- [x] Ảnh chụp 2 trang × 2 viewport, trước và sau
- [x] `pnpm --filter @erp/pos-web build` xanh

## Bằng chứng sống

| Trang | Viewport | | `available` | `pageH` | `overflowPx` | phân trang vs đáy vỏ | `docScrolls` |
|---|---|---|---|---|---|---|---|
| `/invoices` (86 dòng) | 1440×900 | trước | 847 | 900 | **+53** | dưới 37px | `true` |
| `/invoices` | 1440×900 | sau | 847 | 847 | **0** | trên 16px | `false` |
| `/invoices` | 1440×720 | trước | 667 | 720 | **+53** | dưới 37px | `true` |
| `/invoices` | 1440×720 | sau | 667 | 667 | **0** | trên 16px | `false` |
| `/return-goods` (42 dòng) | 1440×900 | trước | 847 | 900 | **+53** | dưới 37px | `true` |
| `/return-goods` | 1440×900 | sau | 847 | 847 | **0** | trên 16px | `false` |
| `/return-goods` | 1440×720 | trước | 667 | 720 | **+53** | dưới 37px | `true` |
| `/return-goods` | 1440×720 | sau | 667 | 667 | **0** | trên 16px | `false` |

## Bẫy đã gặp khi đo — đọc trước khi đo lại

1. **Lưới rỗng không tái hiện lỗi.** Lần đo đầu trả `overflowPx = 0` và suýt bác bỏ A-01 nhầm.
   Bộ lọc mặc định là "Hôm nay" và `erp_dev` không có hoá đơn nào của hôm nay; trang rỗng thì
   co vừa được. Phải mở sang "Toàn bộ" mới thấy.
2. **Popover khoảng thời gian chỉ áp dụng khi bấm "Áp dụng".** Chọn radio không đủ.
3. **`reload()` đưa bộ lọc về mặc định** — nó nằm trong React state, không persist.
4. **`header.nextElementSibling` KHÔNG phải trang.** `PosLayout` chèn một div `sr-only`
   aria-live và ba dialog giữa `<header>` và `<Outlet/>`. Bám từ `<table>` đi ngược lên tới
   con trực tiếp của vỏ mới đúng.
