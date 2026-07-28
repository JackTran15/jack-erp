---
id: UOW-06
slug: export-pipeline
title: Export đi qua pipeline thay được, trần chặn trước khi nạp
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-06]
verifies: [AC-19, AC-05]
risk: medium
status: todo
rollback: Trả `ReportExportService` về chuỗi `buildPayload` → `buildReportWorkbook` → `sendXlsx` (đúng bản UOW-01); route và hợp đồng không đổi nên FE không phải sửa gì
---

# UOW-06 — Export đi qua pipeline thay được, trần chặn trước khi nạp

## Demo script

1. Mở Báo cáo → Kho → Tổng hợp nhập xuất tồn kho, đặt kỳ rộng cho ra > 50.000 dòng
2. Bấm "Xuất khẩu" → nhận 400 "vượt trần dòng"; xem log API: `COUNT` chạy, `buildData`
   **không** chạy — trước bản này server đã nạp xong 50.000 dòng rồi mới báo lỗi
3. Làm lại bước 1–2 trên báo cáo Lợi nhuận và Công nợ → cùng hành vi. Trước bản này hai
   miền đó không có trần nào cả, kỳ rộng chỉ đơn giản là nuốt RAM
4. Xuất một báo cáo bình thường ở cả bốn miền → file .xlsx đúng như trước, cùng cột, cùng
   dòng tổng; đối chiếu với file đã tải ở demo UOW-01 thấy không khác
5. Xem log: `path=single-shot`, và byte đầu tiên rời server trước khi workbook dựng xong

## In scope

- `ExportPipeline` + ba interface `ExportFetcher` / `ExportWriter` / `ExportSink`
- `SingleShotFetcher` — giữ nguyên hành vi lấy dữ liệu của UOW-01
- `XlsxStreamWriter` (`WorkbookWriter`) + `HttpResponseSink`
- Bốn route export chuyển sang pipeline, hợp đồng route không đổi
- `countRows` + `COUNT` chặn trần trước materialize, áp cho cả bốn miền

## Not in scope

- Keyset và phân mảnh thời gian — UOW-07
- Export bất đồng bộ + S3 (A-02); `ExportSink` để ngỏ cho việc đó
- Đường in (UOW-02..04) — không đi qua pipeline này
- 7 exporter cũ ngoài nền tảng báo cáo v2

## Risks

| Risk | Mitigation |
|---|---|
| Đã stream thì lỗi giữa chừng không đổi thành mã HTTP được | Mọi kiểm tra (reportType, cột, trần dòng) chạy trước khi mở writer; T-06-03 giữ ranh giới đó và có unit test cho nó |
| `WorkbookWriter` không sửa được ô đã ghi ⇒ bố cục lệch so với bản buffer | T-06-02 chuyển bề rộng/căn lề sang `sheet.columns` đặt trước dòng đầu, và đọc lại file bằng exceljs trong test thay vì tin vào code |
| Đổi cả 4 controller cùng lúc dễ vỡ | Hợp đồng route không đổi ⇒ e2e của T-01-08 là lưới an toàn; nó phải xanh mà không sửa một dòng test nào |
| `countRows` dựng query lệch với `buildData` ⇒ trần bắn sai | T-06-04 bắt buộc `getCount()` chạy trên đúng query `buildData` dựng, không viết lại điều kiện lọc |

## Definition of done

- [x] AC-19, AC-05 pass — với một sai lệch đã ghi rõ ở T-06-04: 2/4 miền đếm trước được,
      2 miền còn lại đã bị SQL chặn lượng nạp nên giữ cap sau aggregate
- [x] `pnpm --filter @erp/api test` xanh, không giảm số test so với UOW-01 (206 suite /
      1623 test, UOW-01 kết ở 205/1606)
- [x] E2E `report-export.e2e-spec.ts` (T-01-08) còn xanh nguyên, không sửa — 7/7
- [x] Không thêm dependency nào vào `@erp/api`
- [ ] Demo script chạy trước người thật ở gate G4 — **chưa chạy**: bước 1–3 cần một org có
      hơn 50.000 dòng trong kỳ, chưa có dữ liệu đó ở máy dev
