---
feature: export-print
slug: export-print
created: 2026-07-27
source: docs/misa-eshop-export-print-survey.md (khảo sát MISA eShop, 2026-07-26)
---

# Intent — Xuất khẩu / In (export + print)

## Problem

Người dùng backoffice không lấy được dữ liệu ra khỏi hệ thống theo cách kế toán và
quản lý kho vẫn làm hằng ngày: **xuất Excel một báo cáo/sổ theo bộ lọc đang xem**, và
**in một chứng từ** để ký, giao hàng, lưu hồ sơ.

Hiện trạng thật (đã đối chiếu code, khác với khảo sát):

- Xuất Excel **đã có nhưng chắp vá** — 7 service tự dựng workbook riêng, chỉ dùng chung
  đúng một util 50 dòng (`applyWorkbookFont`). Khối tiêu đề chi nhánh, dòng tiêu đề
  báo cáo, style header, freeze pane, `numFmt`, và cặp header HTTP tải file bị chép lại
  ở từng chỗ. Thêm một báo cáo mới = chép lại lần thứ tám.
- Xuất Excel **chưa nối vào nền tảng báo cáo v2**. Bốn miền báo cáo (invoice, inventory,
  profit, debt) đã dùng chung `ReportDefinition` + `ReportRegistry` + `report_templates`,
  tức đã có sẵn catalog cột và dữ liệu dạng `{rows, totals}`, nhưng không có đường nào
  biến chúng thành file.
- Nút **"In" và "Xuất khẩu" đã hiện trên UI ở 6 chỗ nhưng chỉ bắn toast
  "sẽ được bổ sung"** — người dùng thấy chức năng, bấm vào, không có gì xảy ra.
- **In chứng từ chưa có** ở backoffice. POS đã có đường in hoá đơn nhiệt A80
  (`renderInvoiceHtml` → iframe → `window.print()`), nhưng không chứng từ kho/quỹ nào
  dùng lại được.

Ảnh hưởng: kế toán phải copy tay ra Excel; thủ kho không có phiếu giấy để ký nhận.

## Success signal

Trên **UI người dùng vào được**, mỗi màn báo cáo và mỗi chứng từ trong phạm vi đều tải
về file Excel đúng bộ lọc + đúng tập cột đang thấy, hoặc mở được bản in.

Đo được: `/reports/{sales,inventory,debts,profit}` có nút Xuất khẩu và In hoạt động;
`LedgerCashPage` và 2 `InvoiceDetailDialog` không còn bắn toast placeholder; mỗi loại
báo cáo/chứng từ trong phạm vi có một test khẳng định response trả đúng content-type +
số dòng khớp với `POST search`.

Ghi chú: 2 stub ở `StorageReportShell` **không** tính vào tiêu chí này — 8 trang
`/reports/storage/*` đã bị gỡ khỏi nav nên người dùng không vào được (A-17).

## Out of scope

- Không viết lại 7 exporter sẵn có. Chúng được refactor về builder dùng chung **chỉ khi**
  nằm trên đường đi của một UoW; không có UoW nào chỉ để dọn dẹp.
- Không thêm PDF server-side (puppeteer / wkhtmltopdf). Khảo sát đề xuất puppeteer;
  repo đã có `jspdf` ở backoffice và đường HTML→iframe→print ở POS — xem ADR ở
  `03-logical-design.md`.
- Không đụng luồng import (`inventory/csv`, `customer/csv`) — chỉ đọc để lấy pattern.
- Không làm bulk export ở cấp danh sách chứng từ (MISA cũng không có).
- Không làm "In tem mã" — đã có ở `inventory-item-barcodes`.
- Không đổi hợp đồng `POST /reports/*/search` hiện hành.

## Constraints

- `exceljs` đã là dependency của `@erp/api`; không thêm dependency mới ở backend.
- Source backend chỉ tiếng Anh; chuỗi tiếng Việt nằm ở UI và ở nội dung tài liệu xuất ra.
- Mọi truy vấn lọc theo `actor.organizationId`; chứng từ còn theo `branchId`.
- Sau khi đổi endpoint: chạy API rồi `pnpm openapi:generate`, commit
  `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts`.
- `ValidationPipe` là `whitelist + forbidNonWhitelisted` — DTO phải khai báo đủ field.
