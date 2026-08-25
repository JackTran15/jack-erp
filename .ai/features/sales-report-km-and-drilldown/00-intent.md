# Intent — sales-report-km-and-drilldown

## Problem

Khách hàng đối chiếu "Báo cáo > Bán hàng" của jack-erp với MISA eShop (mục #11 cũ) và báo ba
điểm lệch. Khảo sát cho thấy chúng là hai loại vấn đề khác nhau, không phải một:

**1. Cột khuyến mãi không nhất quán giữa các báo cáo bán hàng.** Bốn báo cáo hoá đơn lấy
"Khuyến mại" từ hai nguồn khác nhau và không bao giờ được đối chiếu với nhau:

| Báo cáo | `revenue.discount` | `revenue.promoPoints` | `revenue.promoRate` |
|---|---|---|---|
| `daily-sales-summary` | Σ `invoices.discount_amount` | Σ `points_discount_amount` | `discount / subtotal` |
| `invoice-order-listing` | `invoices.discount_amount` | `points_discount_amount` | `discount / subtotal` |
| `revenue-by-item` | Σ (`line_discount` + `promotion_discount`) | hard-code `0` | `discount / goods` |
| `invoice-item-revenue-detail` | `line_discount` + `promotion_discount` | hard-code `0` | — |

Ba defect rơi ra từ bảng này, cả ba đã xác nhận bằng SQL trên `erp_dev`:

- **D1** — "Điểm KM" luôn bằng 0 ở hai báo cáo theo mặt hàng (`revenue-by-item.columns.ts:63`
  khai `placeholder: 0`), trong khi `invoices.points_discount_amount` có dữ liệu thật
  (Σ 750.000 trên 5 hoá đơn SALE). Đây đúng nghĩa "cột chưa có dữ liệu".
- **D2** — Hoá đơn EXCHANGE mất toàn bộ khuyến mại ở hai báo cáo theo hoá đơn:
  `invoices.discount_amount` không được ghi cho hoá đơn đổi hàng trong khi dòng hàng vẫn mang
  `promotion_discount`. Đếm trên `erp_dev`: SALE 48 hoá đơn lệch 0; RETURN 15 lệch 0;
  EXCHANGE 10 hoá đơn, **2 lệch, tổng 300.000**. Cùng một kỳ, báo cáo theo ngày ra 0 còn báo
  cáo theo mặt hàng ra 300.000.
- **D3** — "Tỷ lệ KM (%)" không khớp chú thích của chính nó. Header mang annotation
  `(5)=((4)+(9))/(3)` (do feature `revenue-by-item-misa-parity` đặt) nhưng code tính
  `discountAmount / subtotal`, thiếu `(9)` ở tử số.

**2. Hai dialog drill-down chưa tồn tại** (không phải hỏng). `ReportPageTableView.tsx:425-440`
hard-code `col.column === "invoiceCode"`, nên mọi cột khác — kể cả cột backend đã trả
`link: true` — render thành text thường:

- `daily-sales-summary`: click cột **Ngày** phải mở "BẢNG KÊ HÓA ĐƠN" của ngày đó.
- `revenue-by-item`: click cột **Tên hàng hoá** phải mở "CHI TIẾT DOANH THU MẶT HÀNG THEO HÓA ĐƠN"
  của đúng SKU đó.

Backend đã có sẵn đúng hai report cần dùng — `invoice-order-listing` (1 dòng/hoá đơn) và
`invoice-item-revenue-detail` (1 dòng/dòng hàng) — chạy qua cùng endpoint
`POST /reports/invoices/search`. Không cần endpoint mới.

Feature `revenue-by-item-misa-parity` (đã G5) tự ghi nhận A-01 **chưa được xác nhận đầy đủ** vì
bộ seed lúc đó có KM = 0 ở mọi dòng. Giờ đã có dữ liệu KM khác 0 — đây là lúc trả nợ nhận định đó.

## Success signal

- Cùng một kỳ và cùng phạm vi chi nhánh, Σ "Khuyến mại" và Σ "Điểm KM" của cả bốn báo cáo bán
  hàng bằng nhau, và bằng số tính trực tiếp bằng SQL — kể cả khi kỳ có hoá đơn EXCHANGE.
- "Tỷ lệ KM (%)" bằng đúng `((4)+(9))/(3)` như annotation trên chính header cột.
- Trên `#daily_sales_summary`, click ô Ngày mở dialog liệt kê hoá đơn của ngày đó, có dòng filter,
  footer tổng, và ba nút In / Xuất khẩu / Đóng; footer của dialog khớp dòng vừa click.
- Trên `#revenue_by_product` ở grain mặt hàng, click ô Tên hàng hoá mở dialog chi tiết theo từng
  dòng hoá đơn của đúng SKU đó, tổng khớp dòng vừa click.
- Không hồi quy: drill-down mã hoá đơn hiện có vẫn chạy; cột `Ngày` trên ba báo cáo còn lại vẫn
  là text thường.

## Out of scope

- **Tiêu đề file xuất khẩu/in của drill-down** — dùng nhãn báo cáo gốc ("BẢNG KÊ HÓA ĐƠN VÀ ĐƠN
  HÀNG"), không phải "BẢNG KÊ HÓA ĐƠN". Người dùng đã chấp nhận. Giao diện trên màn hình vẫn đúng MISA.
- **Phần `Mẫu mã <parent>` ở phụ đề dialog B** — hiện không có nguồn dữ liệu
  (`ItemLookupResultDto` không trả tên sản phẩm cha, `revenue-by-item` không có cột đó). Người dùng
  đã chấp nhận bỏ.
- **Thêm vitest cho `backoffice-web`** — app này có `"test": "echo test"` và bốn file `*.spec.ts`
  dưới `src` không hề chạy. Sửa việc đó là feature riêng.
- **Bốn báo cáo ngoài nhóm hoá đơn** (kho, công nợ, lợi nhuận) — không đụng tới, kể cả khi chúng
  cũng có cột `date`.
- **Đổi cách promotion engine ghi `invoices.discount_amount`** — sửa ở tầng đọc (báo cáo), không
  sửa tầng ghi (checkout saga). Dữ liệu lịch sử phải đọc đúng mà không cần backfill.
- **Đưa `LINK_COLUMNS` thành cấu hình theo báo cáo** — chỉ thêm cờ `link` cho `date` riêng trong
  `daily-sales-summary`, không tái cấu trúc cơ chế toàn cục.

## Constraints

- `invoices` và `invoice_items` là dữ liệu bất biến sau khi phát hành. Mọi sửa chữa nằm ở tầng
  đọc; không migration dữ liệu, không backfill.
- Bất biến phải giữ: `invoices.subtotal = Σ invoice_items.line_total`, và
  `invoice_items.promotion_discount` **không** trừ vào `line_total` (mọi consumer tự trừ).
- `ReportStoreProvider` / `TableStoreProvider` là provider theo instance nên lồng được; nhưng
  `ReportUrlSync` ghi URL hash nên **không** được mount trong dialog.
- Sửa `InvoiceReportFilterDto` bắt buộc kéo theo `pnpm openapi:generate` + commit
  `openapi.snapshot.json` và `packages/api-client/src/generated/schema.ts`. FE hiện cast body
  (`payload as unknown as Record<string, unknown>`) nên trình biên dịch **sẽ không** nhắc.
- `ValidationPipe` toàn cục dùng `whitelist + forbidNonWhitelisted`: field DTO mới phải khai báo
  đầy đủ, nếu không request 400.
- Chuỗi hiển thị tiếng Việt; mã nguồn backend tiếng Anh.
