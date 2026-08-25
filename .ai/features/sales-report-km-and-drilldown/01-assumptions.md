# Assumption register

Kỳ tham chiếu cho mọi con số dưới đây: **01–31/08/2026, chi nhánh HCM (`69982b87…`), trạng thái
mặc định (loại trừ `cancelled`)** — 45 hoá đơn. Đo trực tiếp bằng SQL trên `erp_dev` ngày 25/08/2026.

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | "Điểm KM" ở grain mặt hàng phải phân bổ `invoices.points_discount_amount` xuống từng dòng theo tỉ lệ `line_total`, thay vì giữ hard-code `0`. | medium | yes | Huỷ T-01-02 (4h). Nếu MISA cố tình để trống cột này ở grain mặt hàng thì D1 không phải defect và cột giữ nguyên `placeholder: 0`. | resolved | Người dùng chốt 25/08/2026: phân bổ theo tỉ lệ `line_total`. Cơ sở: công thức MISA "Doanh thu (6)=(3)-(4)-(9)" trên chính báo cáo mặt hàng có tham chiếu (9) = Điểm KM, nên MISA cũng mang điểm xuống grain mặt hàng. Phần dư do làm tròn dồn vào dòng cuối để Σ dòng = số trên header. |
| A-02 | "Khuyến mại" ở hai báo cáo theo hoá đơn phải **trừ** phần khuyến mại đang được hoàn lại trên dòng `IN` của hoá đơn EXCHANGE/RETURN, tức lấy Σ `sign(direction) × (line_discount + promotion_discount)`. Hệ quả: tổng KM kỳ tham chiếu **giảm** từ 9.214.000 xuống 8.914.000. | high | yes | Sai hướng dấu thì T-01-01 làm số tệ hơn hiện tại và phải làm lại; con số kế toán đã đối chiếu sẽ đổi. | resolved | Người dùng chốt 25/08/2026: trừ phần hoàn lại. `revenue-by-item` vốn đã ký theo `direction`, nên hai nhóm báo cáo khớp bằng cách sửa nhóm theo hoá đơn — không đụng `revenue-by-item`. Hoá đơn SALE bất biến (Σ dòng OUT = 9.214.000 = Σ header). |
| A-03 | `revenue-by-item` gom nhóm theo `itemId ?? itemCode` nhưng hiển thị `itemCode`. Mặt hàng đổi mã giữa kỳ cho một dòng chứa hai mã ⇒ drill-down lọc theo `sku` sẽ bắt thiếu dòng. | high | no | Dialog B thiếu vài dòng cho đúng nhóm mặt hàng đã đổi mã. Hiếm; chấp nhận và ghi chú. | confirmed | Chấp nhận. Không có `itemId` trên row và không có cơ chế cột ẩn để mang nó sang; `sku` là khoá duy nhất row mang theo. Ghi vào "Not verified here" của 07. |
| A-04 | `daily-sales-summary` bỏ qua `statDateType` (hard-code `invoice.issuedAt`) còn `invoice-order-listing` thì tôn trọng `statDateColumn`. Dialog A không set `STAT_DATE_TYPE` ⇒ hai bên dùng cùng một cột ngày. | high | no | Dialog A liệt kê hoá đơn theo cột ngày khác với dòng vừa click ⇒ footer không khớp. | confirmed | Đã đọc `daily-sales-summary.report.ts:154` và registry FE: `daily-sales-summary` không expose `STAT_DATE_TYPE`. Allow-list kế thừa filter của dialog A không chứa key này ⇒ đích dùng mặc định `issuedAt`. |
| A-05 | Template cột đã lưu không rò rỉ vào bảng lồng trong dialog. | high | no | Dialog mở ra với bộ cột của báo cáo cha ⇒ sai cột hoàn toàn. | confirmed | `useReportColumnTemplate` đang `enabled: source === "inventory"` (`_api/report-template.api.ts:83`); báo cáo bán hàng không bao giờ load template. Ghi vào ADR-01 như một điều kiện có thể mất hiệu lực. |
| A-06 | Thêm `filters.sku` không ảnh hưởng row cap khi xuất khẩu. | high | no | Xuất khẩu dialog B 400 vì cap bắn trên tập khác tập nạp. | confirmed | `invoice-item-revenue-detail` khai **cả** `countRows` lẫn `exportSource` đều không ⇒ `report-export.service.ts:183` bỏ qua cap và dùng `SingleShotFetcher`. Filter chỉ thu hẹp tập. |
| A-07 | Hoá đơn `cancelled` bị loại khỏi mọi báo cáo theo mặc định, nên số kỳ vọng phải tính với `status <> 'cancelled'`. | high | no | Mọi con số kỳ vọng trong 02/07 lệch ⇒ bước verify fail nhầm. | confirmed | `applyInvoiceStatusFilter` (`report-core/report-query.util.ts`): không có `invoiceStatus`/`status` thì `andWhere(status != CANCELLED)`. Kỳ tham chiếu: 61 hoá đơn tổng, 45 sau khi loại `cancelled`. |
| A-08 | Người dùng chấp nhận tiêu đề file xuất khẩu/in của drill-down mang nhãn báo cáo gốc, và phụ đề dialog B bỏ phần `Mẫu mã <parent>`. | high | no | Phải làm thêm ~4h (whitelist `documentTitle`/`documentSubtitle`; thêm nguồn tên sản phẩm cha). | confirmed | Người dùng chọn "Chấp nhận cả hai" khi được hỏi ngày 25/08/2026. Ghi trong "Out of scope" của [[00-intent]]. |

## Số đo nền (kỳ tham chiếu)

| Đại lượng | Giá trị | Ghi chú |
|---|---|---|
| Σ `invoices.discount_amount` | 9.214.000 | `daily-sales-summary` / `invoice-order-listing` đang hiện số này |
| Σ dòng `OUT` (`line_discount` + `promotion_discount`) | 9.214.000 | khớp tuyệt đối với header ⇒ phần bán mới không có lỗi |
| Σ dòng `IN` | 300.000 | 2 hoá đơn EXCHANGE ngày 19/08, mỗi hoá đơn 150.000 |
| Σ dòng **có dấu theo `direction`** | **8.914.000** | `revenue-by-item` đang hiện số này |
| Σ `points_discount_amount` (có dấu theo loại) | 650.000 | 13/08: 500.000 · 14/08: 50.000 · 15/08: 100.000 |
| Σ `subtotal` | 124.670.000 | |

Hai hoá đơn EXCHANGE gây lệch, đã soi từng dòng:

```
RTN-202608-00022  EXCHANGE  discount_amount=0   OUT AK1163023-D-35  promo=0
                                                OUT AK1163023-D-36  promo=0
                                                IN  ABA2777-D-39    promo=150.000
RTN-202608-00023  EXCHANGE  discount_amount=0   OUT ABA2777-D-38    promo=0
                                                IN  ABA2777-D-42    promo=150.000
```

Dòng `IN` mang khuyến mại **của lần bán gốc đang được hoàn lại**. `invoices.discount_amount` chỉ
ghi khuyến mại của phần bán mới (= 0), nên hai báo cáo theo hoá đơn không thấy khoản hoàn lại này.
