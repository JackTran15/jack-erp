---
id: UOW-09
slug: report-xlsx-house-style
title: File Excel báo cáo theo đúng house style MISA
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-06]
requirements: [US-07]
verifies: [AC-26, AC-33]
risk: medium
status: todo
rollback: Revert `xlsx-style.ts` + `xlsx-stream.writer.ts` về commit trước; không có state, không có migration, không đổi hợp đồng HTTP
---

# UOW-09 — File Excel báo cáo theo đúng house style MISA

## Demo script

1. Mở `/reports/sales`, chọn báo cáo "Doanh thu theo mặt hàng", đặt kỳ 01/01/2026–31/12/2026
2. Bấm "Xuất khẩu" → file `.xlsx` tải về
3. Mở file cạnh `examples/ERP/export_Doanh_thu_theo_mat_hang.xlsx`: cùng khối 3 dòng chi nhánh,
   cùng tiêu đề bold 18 căn giữa, cùng dòng kỳ và dòng bộ lọc in nghiêng căn giữa, cùng hàng
   tiêu đề cột nền kem chữ đen có viền, cùng viền ô dữ liệu, cùng `#,##0`
4. Kéo xuống cuối: dòng tổng in đậm, nền kem, có viền
5. Bấm vào một ô bất kỳ ở hàng tiêu đề → **không** có nút lọc; cuộn xuống → hàng tiêu đề
   **không** dính lại đầu bảng
6. Lặp bước 2 ở `/reports/inventory`, `/reports/debts`, `/reports/profit` → cả ba tải file OK
   và cùng một kiểu trình bày

## In scope

- `export/xlsx-style.ts` — hằng số + helper trình bày dùng chung (ADR-11)
- `XlsxStreamWriter` đổi sang house style: viền, nền `FFFDE9D9` chữ đen, tiêu đề 18 căn giữa,
  subtitle italic căn giữa, dòng trống trước header, dòng tổng có nền + viền, `#,##0`,
  bỏ autoFilter + freeze pane, `pageSetup` portrait
- Dòng kỳ đúng định dạng `Từ ngày: dd/mm/yyyy Đến ngày: dd/mm/yyyy`
- Dòng tóm tắt bộ lọc cho cả 4 miền báo cáo (hôm nay chỉ `inventory-reports` có)

## Not in scope

- Chứng từ kho — UOW-10 (Writer khác, ADR-10)
- Bản in HTML — UOW-11
- ~15 exporter buffered cũ ngoài `ExportPipeline` (A-23)
- Đổi nhãn cột sang dạng có chú thích công thức của MISA — thuộc về catalog, không thuộc Writer (ADR-04)

## Risks

| Risk | Mitigation |
|---|---|
| Đổi Writer dùng chung làm hỏng file của 8 endpoint đang chạy | `xlsx-stream.writer.spec.ts` đã load lại workbook và khẳng định từng ô; mở rộng nó **trước** khi sửa Writer, và demo script bước 6 kiểm tra hồi quy 3 miền còn lại |
| `WorkbookWriter` không quay lại ô đã commit (ADR-08) | Mọi style + merge đặt trước `row.commit()`; viền ô dữ liệu khai ở `sheet.columns[].style`, không gán sau |
| Bỏ freeze pane làm người dùng khó đọc báo cáo dài | Mẫu MISA không có, và người dùng chọn "giống mẫu" — nếu phản hồi ngược lại thì đây là 1 dòng trong `xlsx-style.ts` |

## Definition of done

- [x] AC-26 pass — script đối chiếu byte-level với `export_Doanh_thu_theo_mat_hang.xlsx`: 42/43
      thuộc tính khớp, 1 lệch có chủ ý (A-22). Chi tiết ở T-09-04
- [x] AC-33 pass — cả 4 miền có dòng kỳ + dòng bộ lọc (`document-subtitle.spec.ts`, 18 test)
- [x] `pnpm --filter @erp/api test` xanh — 196 suite / 1600 pass, 1 skip
- [x] Xuất khẩu thật trên API chạy ở :4000 với DB thật: `POST /reports/invoices/export`
      (`revenue-by-item`, kỳ 01/01–31/12/2026) → **HTTP 200**,
      `filename="doanh-thu-theo-mat-hang.xlsx"`, file hợp lệ. Dump ra: R1 chi nhánh → R2 địa chỉ →
      R3 điện thoại (trần) → R4 tiêu đề → R5 `Từ ngày: 01/01/2026 Đến ngày: 31/12/2026` →
      R6 dòng bộ lọc → R7 trống → R8 tiêu đề cột → R9+ dữ liệu → R34 dòng tổng; không autofilter,
      không freeze, portrait
- [x] Đối chiếu byte-level **file live** với mẫu MISA: **42/43 khớp**, 1 lệch có chủ ý (A-22)
- [ ] Bấm nút "Xuất khẩu" trên UI backoffice — **chưa chạy**. Đã kiểm toàn bộ đường server
      (controller → handler → pipeline → writer → sink) bằng request thật; phần chưa phủ là
      `ReportPageToolbar` gọi `downloadReportExcel`, vốn không bị feature này đụng tới
