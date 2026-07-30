---
id: UOW-02
slug: formula-header-plumbing
title: Ký hiệu công thức xuống tới file Excel và trang in
demoable: true
duration: 1d
depends_on: []
requirements: [US-02]
verifies: [AC-07, AC-08, AC-09, AC-10, AC-11]
risk: medium
status: todo
rollback: revert 1 commit — `desc?` là field optional, không có dữ liệu nào đã ghi phụ thuộc
---

# UOW-02 — Ký hiệu công thức xuống tới file Excel và trang in

## Demo script

Demo được **độc lập với UOW-01**, dùng báo cáo `daily-sales-summary` — báo cáo đó đã khai
`INVOICE_REPORT_COLUMN_DESCS` và `buildColumns` của nó đã trả `desc` thật
(`daily-sales-summary.report.ts:76`), nhưng ký hiệu chưa từng ra khỏi màn hình.

1. Mở **Chuỗi cửa hàng → Báo cáo → Doanh thu theo ngày**, chọn kỳ có dữ liệu
2. Trên màn hình, dưới nhãn `Tổng` đã thấy `(1)=(3)-(5)-(14)` (hành vi có sẵn)
3. **Trước UOW này:** bấm Xuất khẩu → mở file → ô header chỉ có `Tổng`
4. **Sau UOW này:** bấm Xuất khẩu → mở file → ô header có `Tổng` và `(1)=(3)-(5)-(14)`
   trên 2 dòng trong cùng một ô, dòng header cao hơn
5. Bấm In → trang in cũng có 2 dòng trong cùng ô tiêu đề
6. In một **Phiếu nhập kho** → tiêu đề bảng vẫn 1 dòng, không đổi gì

## In scope

- `desc?: string | null` trên `DocumentColumn`
- `ReportExportService.resolveColumns` mang `desc` từ catalog sang payload
- `XlsxStreamWriter.writeHeaderRow` ghi `label\ndesc` trong một ô + hằng số chiều cao mới
- `renderReportTableHtml` render `<th>` 2 dòng

## Not in scope

- Giá trị `desc` của `revenue-by-item` — do UOW-01 sinh ra; UOW này chỉ mở đường
- `VoucherXlsxWriter` — chứng từ không có ký hiệu công thức; AC-11 là hàng rào chống hồi quy

## Risks

| Risk | Mitigation |
|---|---|
| `xlsx-style.ts` + `xlsx-stream.writer.ts` cũng thuộc `UOW-09-report-xlsx-house-style` của feature `export-print` đang ở G3 (A-15) | T-02-02 kiểm `git status` 2 file đó TRƯỚC khi sửa; nếu đang dirty thì hỏi trước, không merge mù |
| Side effect có chủ ý: `daily-sales-summary` bỗng có ký hiệu trong file Excel dù không ai yêu cầu | Đó là ký hiệu báo cáo đó **đã khai** và đã hiện trên màn hình — file bám theo màn hình mới là đúng (ADR-01 của `export-print`). Ghi vào PR description để không ai coi là hồi quy |
| `columnLabels` người dùng tự đặt làm mất ký hiệu | AC-09 khóa hành vi: `desc` độc lập với `label` |

## Definition of done

- [x] AC-07..AC-11 pass
- [x] `pnpm --filter @erp/api test` xanh (gồm `voucher-xlsx.writer.spec.ts` không đổi) — 20/20 voucher tests, file spec không sửa
- [x] `pnpm --filter @erp/backoffice-web build` xanh, `render-report-table-html.test.ts` xanh — 8/8 qua `npx vitest run`
- [~] Mở file thật bằng Excel/LibreOffice — CHƯA làm: môi trường build không có Excel/LibreOffice. Đã sinh file mẫu và gửi Akenzy tự kiểm (T-02-02); trên UI thật (T-05-02) đã xác nhận ký hiệu hiện đúng trên màn hình (cùng payload nguồn, ADR-01) nhưng chưa mở chính file `.xlsx` bằng ứng dụng Excel
- [x] Demoed và accepted ở gate G4 — solo, `done --no-review`
