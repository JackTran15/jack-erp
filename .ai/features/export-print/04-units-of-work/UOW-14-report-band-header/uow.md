---
id: UOW-14
slug: report-band-header
title: Tiêu đề nhóm cột (Heading Group) lên cả bản in và file Excel báo cáo
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-02]
requirements: [US-08]
verifies: [AC-36]
risk: medium
status: todo
rollback: Revert `group` khỏi `DocumentColumn` và khỏi `resolveColumns`; hai renderer thấy không cột nào có band nên tự quay về đúng một hàng tiêu đề — không cần revert riêng
---

# UOW-14 — Heading Group lên bản in và Excel báo cáo

## Demo script

1. Mở `/reports/sales` (miền invoice — miền **có** nhóm cột thật), chọn tập cột có
   "Doanh thu" và "Khách hàng thanh toán"
2. Bấm "Xuất khẩu" → mở file .xlsx: trên hàng nhãn cột có **một hàng nhóm**; ô "Doanh thu"
   gộp ngang đúng những cột thuộc nhóm; cột `Ngày` (không nhóm) gộp **dọc** qua cả hai hàng,
   không để ô trống phía trên; cả hai hàng đều nền cam nhạt và có viền bốn cạnh
3. Bấm "In" → bảng in có đúng hai hàng tiêu đề, khớp với bảng đang thấy trên màn hình
4. Mở `/reports/debts` (miền **không** phát nhóm cột nào) → xuất và in: tiêu đề vẫn là
   **đúng một hàng**, y hệt trước khi sửa
5. Lặp bước 2–3 với `/reports/inventory` (nhóm `in` / `out`)

## In scope

- `DocumentColumn.group` — nhãn nhóm đã resolve
- `buildColumnBands()` — hàm gộp cột liền nhau, dùng chung cho hai renderer
- `resolveColumns()` mang `header.group.name` qua mặt cắt payload
- `XlsxStreamWriter` — hai hàng tiêu đề + merge ngang/dọc
- `renderReportTableHtml` — hai hàng `<thead>` + `colspan`/`rowspan`

## Not in scope

- `renderRevenueByItemPrintHtml` của pos-web — người dùng chốt phạm vi không gồm POS (A-29)
- Chứng từ (`VoucherXlsxWriter`, `renderVoucherHtml`) — không cột nào của phiếu thuộc nhóm
- Phát nhóm cột cho miền debt / profit — hai miền này chưa khai `group` ở catalog; việc đó là
  quyết định nghiệp vụ, không phải việc của đường xuất/in
- Nhóm **dòng** (`statBy` / `groupBy`) — thứ đó đã chạy đúng qua `subtitleLines`

## Risks

| Risk | Mitigation |
|---|---|
| `WorkbookWriter` stream có thể không merge nổi qua hai hàng — comment `xlsx-stream.writer.ts:199-202` khẳng định là không | Đã đọc source `worksheet-writer.js:431-454`: ràng buộc thật là "đã commit", không phải "nhiều hàng" (A-28). T-14-02 phải khẳng định bằng test đọc `<mergeCells>` của file thật, không tin comment lẫn không tin suy luận |
| Hồi quy cho miền không có nhóm (debt/profit) — thêm một hàng rỗng vào mọi file đang chạy | Nhánh "không cột nào có `group`" là nhánh mặc định và có test riêng ở cả hai renderer; Demo script bước 4 kiểm bằng file thật |
| Ô gộp mất viền ở phần đuôi vì chỉ style ô đầu | Bài học đã ghi ở T-12-01: style **mọi** ô vật lý của vùng merge, không chỉ ô master |
| Hai renderer gộp band khác nhau → in một kiểu, file một kiểu | Một hàm `buildColumnBands` duy nhất ở `@erp/shared-interfaces` (ADR-12); không renderer nào được tự gộp |

## Definition of done

- [x] AC-36 pass ở tầng render: file .xlsx đọc lại có hàng band merge đúng cụm cột + merge dọc
      cho cột không nhóm (test đọc `<mergeCells>` của file thật); bản in dựng từ payload dạng
      "Doanh thu theo mặt hàng" mở trong Chrome cho đúng hai hàng tiêu đề — `Doanh thu` phủ 4 cột,
      `Khách hàng thanh toán` phủ 2, 5 cột không nhóm `rowspan="2"`, ký hiệu công thức còn nguyên
- [x] Miền không có nhóm cột ra đúng một hàng tiêu đề — có test riêng ở **cả hai** renderer
- [x] `pnpm --filter @erp/api test` xanh — 205 suite / 1768 pass, 1 skip
- [x] `tsc --noEmit` + `pnpm --filter @erp/backoffice-web build` sạch; 14 assertion của
      `render-report-table-html.test.ts` chạy qua driver, 14 pass / 0 fail
- [ ] **Còn thiếu:** Demo script bước 2–5 trên UI thật (`/reports/sales`, `/reports/inventory`,
      `/reports/debts`) với API đang chạy — chưa bấm nút Xuất khẩu/In lần nào. Nghiệm thu hiện tại
      dừng ở payload dựng tay đúng hình dạng catalog, chưa phải dữ liệu qua HTTP
