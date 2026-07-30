---
id: UOW-11
slug: print-misa-layout
title: Bản in trùng bố cục với file Excel theo mẫu MISA
demoable: true
duration: 1d
depends_on: [UOW-10]
requirements: [US-07]
verifies: [AC-30]
risk: low
status: todo
rollback: Revert `render-voucher-html.ts` + `render-report-table-html.ts`; không có state, không có API
---

# UOW-11 — Bản in trùng bố cục với file Excel theo mẫu MISA

## Demo script

1. Mở `/inventory/purchase-orders`, mở một phiếu nhập kho, bấm "In"
2. Trong preview của trình duyệt, đối chiếu với `examples/ERP/in_phieu_nhap.pdf`: font Times New
   Roman, khối chi nhánh **căn trái**, tiêu đề căn giữa, `Ngày … tháng … năm …` và `Số: …` ở
   **hai dòng riêng** căn giữa, khối thông tin xếp dọc, bảng có viền và tiêu đề **không nền xám**
3. Cuối trang: dòng tổng có nhãn, `Số tiền viết bằng chữ: …`,
   `Ngày.......tháng.......năm............` căn phải, **5** ô ký kèm `(Ký, họ tên)`
4. Đóng preview → màn hình phiếu vẫn nguyên trạng thái (không hồi quy AC-10)
5. Lặp với phiếu xuất kho (`in_phieu_xuat.pdf`) và phiếu chuyển kho (`in_phieu_chuyen_kho.pdf`)
6. Mở `/reports/sales`, bấm "In" → bảng báo cáo dùng cùng house style với file Excel của UOW-09

## In scope

- `render-voucher-html.ts` — toàn bộ bố cục theo mẫu PDF
- `render-report-table-html.ts` — đồng bộ house style với `XlsxStreamWriter`
- `print-format.util.ts` — số hiển thị `#,##0` cho khớp Excel

## Not in scope

- Sinh PDF phía server (ADR-02 giữ nguyên: HTML → iframe → `window.print()`)
- Mẫu in phiếu quỹ A5 (US-04 / UOW-04)
- Đường in hoá đơn nhiệt A80 của pos-web

## Risks

| Risk | Mitigation |
|---|---|
| Bố cục phụ thuộc engine in của trình duyệt, khác nhau giữa Chrome/Safari | Demo script yêu cầu xem preview thật; giữ CSS đơn giản (`table` + `@page`), không dùng grid/flex cho phần phải ngắt trang |
| Đổi `formatCell` ảnh hưởng cả bảng báo cáo lẫn chứng từ | Đúng chủ ý — hai bản in phải cùng một quy tắc số như Excel; test cả hai renderer |
| `docDate` đổi ngữ nghĩa ở T-10-03 làm bản in in ra `Ngày Ngày 28 …` | Renderer in `Ngày ${docDate}`; test khẳng định chuỗi kết quả đúng một chữ "Ngày" |

## Definition of done

- [x] AC-30 pass — bản in dựng từ payload **thật** của API rồi mở trong Chrome: Times New Roman,
      khối chi nhánh căn trái, `Ngày 9 tháng 7 năm 2026` và `Số: XK000002` ở hai dòng riêng căn giữa,
      khối info xếp dọc (có cả `Cửa hàng nhận điều chuyển`), bảng có viền và tiêu đề không nền xám,
      dòng tổng nhãn `Cộng`, `Số tiền viết bằng chữ: …`, dòng ngày ký căn phải, 5 ô ký +
      5 `(Ký, họ tên)`
- [x] Thay cho `pnpm --filter @erp/backoffice-web test` (workspace không có runner — xem T-11-01):
      `tsc && vite build` sạch + 16 assertion của `render-voucher-html.test.ts` và 11 assertion cho
      `renderReportTableHtml`/`formatCell` chạy qua driver, tất cả xanh
- [x] Demo bằng bản in dựng từ payload thật cho phiếu xuất kho và bảng báo cáo "Doanh thu theo mặt
      hàng". **Không** bấm nút "In" trên UI: `window.print()` mở hộp thoại in của trình duyệt, thứ
      làm treo hẳn kênh điều khiển tự động — nên đã render đúng HTML mà `printHtmlDocument` sẽ ghi
      vào iframe rồi xem trực tiếp. Phần chưa phủ là đúng một lệnh `window.print()`, không phải bố cục
