---
feature: revenue-by-item-misa-parity
slug: revenue-by-item-misa-parity
owner: Akenzy
created: 2026-07-30
status: draft
source: |
  Ảnh đối chiếu do người dùng cung cấp 2026-07-30 — #1 = export hiện tại của ERP,
  #2 = export MISA eShop (giaymt.mshopkeeper.vn) cùng báo cáo "Doanh thu theo mặt hàng".
---

# Intent — Doanh thu theo mặt hàng: parity cột với MISA

## Problem

Kế toán đối chiếu số liệu bằng cách mở file MISA và file ERP cạnh nhau. Với báo cáo
**"Doanh thu theo mặt hàng"** việc đó không làm được: hai file có **cùng số liệu nhưng
khác hình**, nên mỗi lần đối chiếu là một lần đọc dò từng cột.

Cụ thể, đối chiếu ảnh #1 (ERP) với ảnh #2 (MISA):

| MISA (#2), 14 cột A→N | ERP hiện tại (#1), 12 cột |
|---|---|
| Thứ tự: SKU, Tên HH, ĐVT, **Mã vị trí, Tên vị trí**, SL bán, Đơn giá TB, Tiền hàng, KM, Điểm KM, Tỷ lệ KM, Doanh thu, **Nhóm HH, Thương hiệu** | Nhóm HH + Thương hiệu nằm ở cột 3–4; **thiếu hẳn 2 cột vị trí** |
| Nhãn: `Số lượng bán`, `Đơn giá TB`, `Doanh thu` | `Số lượng`, `Đơn giá`, `Tổng` |
| Mỗi cột số có ký hiệu công thức: `(1)`, `(2)=(3)/(1)`, `(5)=((4)+(9))/(3)` | Không có dòng ký hiệu nào |
| Dòng tham số: `Xem theo cửa hàng: …; Nhóm hàng hóa: Tất cả nhóm; Thống kê theo: Mẫu mã; …` | Chỉ có dòng `Từ ngày … Đến ngày …` |

Hai điều đã kiểm chứng trong code, quyết định hình dạng của feature này:

1. **Số liệu đã đúng.** `invoice_items.line_total = quantity × unit_price − line_discount`
   (comment cột, `invoice-item.entity.ts:62`), nên `revenue.total` mà ERP đang gắn nhãn
   "Tổng" **chính là** `Doanh thu` của MISA (`Tiền hàng − Khuyến mại − Điểm KM`, với
   `Điểm KM` hiện là placeholder 0). Đây là lỗi **nhãn + thứ tự + chú thích**, không phải
   lỗi tính toán. Không sửa aggregator.
2. **Nhãn grain trên dòng tham số bị đảo ngược.** Ảnh #2 chụp ở grain
   `Thống kê theo: Mẫu mã`. Chọn "Mẫu mã" trên ERP đã gửi đúng `statBy: "parent"`
   (`STAT_BY_OPTIONS`, `packages/shared-interfaces/src/invoice-report/options.ts:76`) —
   khảo sát ban đầu nghi có bug 400 ở đây đã bị bác bỏ sau khi đọc lại code kỹ hơn (xem
   A-20, `01-assumptions.md`). Bug thật nằm ở chỗ khác: `GROUP_BY_LABELS_VI` trong
   `get-invoice-report-document.handler.ts` gán `ITEM`→`'Mẫu mã'`, `PARENT`→`'Hàng hóa'`
   — ngược nghĩa `resolveGrain` — nên dòng tham số của MỌI lần export gọi sai tên grain.

Nguyên nhân gốc của phần cột: catalog thật nằm ở BE (`REVENUE_BY_ITEM_COLUMNS`), FE chỉ
map lại qua `mapHeadersToTableConfig`. Registry FE `report-revenue-by-product.registry.ts`
**đã mô tả đúng layout MISA** (thứ tự, nhãn, `formulaDisplay`) nhưng chỉ là fallback dự
phòng, không bao giờ thắng catalog BE — nên bản mô tả đúng đó chưa từng lên tới file Excel.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Kế toán đối chiếu | Mở 2 file, dò cột theo tên vì thứ tự khác nhau; không có cột vị trí để lần theo kho | Đặt 2 file cạnh nhau, cột A→N khớp nhau, so trực tiếp theo ô |
| Quản lý bán hàng | Không biết `Tổng` là gộp gì; phải hỏi lại hoặc tự tính | Đọc `(6)=(3)-(4)-(9)` ngay trên tiêu đề cột |
| Quản lý kho | Không lần được doanh thu về vị trí kho khi xuất Excel | Có `Mã vị trí` / `Tên vị trí` ở grain hàng hóa, 1 cửa hàng |

## Success signal

Xuất Excel báo cáo "Doanh thu theo mặt hàng" ở grain **Mẫu mã**, cùng kỳ và cùng cửa hàng
với ảnh #2, cho file **khớp cột-theo-cột A→N** với MISA: đúng 14 tiêu đề, đúng thứ tự,
đúng chú thích công thức, có dòng tham số, có dòng tổng — kiểm bằng một snapshot test
đọc lại workbook đã ghi, cộng một lần đối chiếu mắt trên file thật.

## Out of scope

- **Sửa cách tính doanh thu / KM / tỷ lệ KM** — đã kiểm chứng là đúng (xem Problem #1).
- **Cột `Nhà cung cấp`** — export MISA #2 không có, catalog BE không có backing; xóa entry
  chết khỏi registry FE thay vì hiện thực hóa nó (quyết định của người dùng, 2026-07-30).
- **`Điểm KM` có số thật** — không có backing loyalty theo dòng; giữ placeholder 0 như MISA
  #2 (mọi ô cũng bằng 0). Ghi ở A-05.
- **`productType` / `allocateComboRevenue`** — DTO nhận nhưng không có tác dụng; không phải
  vấn đề của parity cột.
- **3 báo cáo hóa đơn còn lại** (`daily-sales-summary`, `invoice-order-listing`,
  `invoice-item-revenue-detail`) — dùng chung `INVOICE_REPORT_COLUMN_LABELS_VI`, nhãn của
  chúng **không đổi**. Đây là ràng buộc thiết kế, xem ADR-01.
- **Tái tạo phần lỗi của MISA** — chuỗi rác `; : False` cuối dòng tham số MISA không copy.

## Constraints

| Kind | Detail |
|---|---|
| Kiến trúc | ADR-01 của feature `export-print`: bảng trên màn hình, trang in và file Excel đọc **cùng một** catalog + payload. Không được tách nhánh override riêng cho export. |
| Chia sẻ | `INVOICE_REPORT_COLUMN_LABELS_VI` và `INVOICE_REPORT_COLUMN_DESCS` dùng chung 4 báo cáo → override phải theo từng báo cáo, không sửa map dùng chung. |
| Ngôn ngữ | Source BE (comment, error, log) tiếng Anh; nhãn tiếng Việt sống ở `packages/shared-interfaces`. |
| Kiểu dữ liệu | `DocumentColumn` (shared-interfaces) chưa có field mang chú thích công thức → xlsx writer và HTML print hiện **không thể** vẽ tiêu đề 2 dòng. |
| Tương thích | `POST /reports/invoices/export` và `/print-payload` đang dùng thật; đổi thứ tự cột trong catalog **thay đổi thứ tự cột mặc định của bảng đang mở** của mọi người dùng. |
| Feature đang mở | `export-print` ở G3, 42/51 ticket done, `UOW-09-report-xlsx-house-style` cùng chạm `xlsx-stream.writer.ts`. Cần tránh sửa chồng. |

## Existing surface touched

Từ `.ai/architecture.md` (verified_by: Akenzy, 2026-07-27):

- **Catalog cột (nguồn sự thật):** `apps/api/src/modules/reporting/invoice-report/revenue-by-item.columns.ts`
- **Report definition:** `.../invoice-report/reports/revenue-by-item.report.ts` (`buildColumns` trả `desc: null`)
- **Nhãn / công thức dùng chung:** `packages/shared-interfaces/src/invoice-report/column.ts`
- **Payload document:** `packages/shared-interfaces/src/reporting/document-payload.ts` (`DocumentColumn`)
- **Đường export + print:** `.../reporting/report-core/report-export.service.ts` (`resolveColumns`, `prepareExport`)
- **Dòng tiêu đề / tham số:** `.../invoice-report/queries/get-invoice-report-document.handler.ts` (`invoiceFilterSummary`, `GROUP_BY_LABELS_VI`)
- **Renderer Excel:** `.../report-core/export/xlsx-stream.writer.ts` (`writeHeaderRow`)
- **Renderer in:** `apps/backoffice-web/src/lib/print/render-report-table-html.ts`
- **Filter grain (đã đúng sẵn, không sửa — A-20):** `STAT_BY_OPTIONS` ở `packages/shared-interfaces/src/invoice-report/options.ts`
- **Registry fallback FE:** `apps/backoffice-web/src/constants/reports/report-registry/report-revenue-by-product.registry.ts`
- **Adjacent features:** `export-print` (G3, đang construction) — chạm chung `xlsx-stream.writer.ts`, `document-payload.ts`
- **Entry points:** không có route mới; sửa tại chỗ trên `/chain-store/reports`
