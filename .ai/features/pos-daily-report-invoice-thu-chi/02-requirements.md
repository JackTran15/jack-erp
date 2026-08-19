---
feature: pos-daily-report-invoice-thu-chi
---

# Requirements — POS Báo cáo theo ngày: Thu/Chi lấy từ hoá đơn

Bối cảnh: báo cáo đang trộn hai nguồn (Thu = `invoice_payments` + phiếu thu, Chi = phiếu chi).
Với hoá đơn đổi trả, khoản hoàn bị tính hai lần và tổng sai. Yêu cầu: cả Thu và Chi chỉ lấy từ
hoá đơn, và bố cục theo đúng số liệu mẫu khách hàng cung cấp.

## Acceptance criteria

| ID | Given | When | Then |
|---|---|---|---|
| AC-01 | Một kỳ báo cáo bất kỳ | Mở tab Tổng hợp | Khối Thu (1) hiển thị đúng 5 dòng — Tiền mặt, Thẻ, Chuyển khoản, Voucher, Điểm — và **không** còn dòng "Khuyến mại" |
| AC-02 | Kỳ báo cáo có hoá đơn dùng điểm | Đọc khối Thu | Tổng Thu bằng tổng số học của 5 dòng; điểm được cộng vào tổng, không còn bị loại trừ |
| AC-03 | Hoá đơn đổi trả hoàn tiền mặt | Đọc khối Thu và Chi | Thu không bị trừ vì hoá đơn RTN; khoản hoàn chỉ xuất hiện một lần, ở Chi › Tiền mặt |
| AC-04 | Hoá đơn đổi trả hoàn qua chuyển khoản | Đọc khối Chi | Khoản hoàn nằm ở Chi › Chuyển khoản (trước đây mất hẳn vì ghi vào `bank_payments`) |
| AC-05 | Có phiếu chi thủ công (chi phí, lương, trả NCC) trong kỳ | Đọc khối Chi | Phiếu chi thủ công không được tính vào Chi |
| AC-06 | Hoá đơn đổi trả đã bị huỷ nhưng phiếu chi hoàn tiền vẫn POSTED | Đọc khối Chi | Khoản hoàn của chứng từ đã huỷ không được tính vào Chi |
| AC-07 | Kỳ có hoàn tiền mặt | Mở "xem chi tiết" Chi › Tiền mặt | Danh sách liệt kê hoá đơn RTN kèm cột "Loại chứng từ"; tổng của drill-down bằng đúng dòng tổng |
| AC-08 | Kỳ có thu nợ | Mở "xem chi tiết" Thu › Tiền mặt | Có dòng "Thu nợ" lấy từ `debt_payments`; đồng thời vẫn hiện ở Công nợ › Giảm nợ |
| AC-09 | Kỳ có hàng trả | Đọc thẻ Hàng trả | Số lượng và giá trị hiển thị số âm, cùng quy ước với bản in |
| AC-10 | Bất kỳ kỳ nào | So sánh Chi với Sổ quỹ tiền mặt | `netCashFlow` không còn được coi là số khớp Sổ quỹ; tài liệu và chú thích trên màn hình nói rõ điều này |
| AC-11 | Có lệnh chuyển quỹ (`Chuyển tiền gửi thành tiền mặt` / `Nộp tiền mặt vào tài khoản`) | Đọc Thu và Chi | Cả hai chân đều xuất hiện — chân chi ở Chi, chân thu ở Thu — nên lệnh chuyển quỹ không làm đổi `netCashFlow`. Chuyển sang chi nhánh khác thì chỉ có chân chi, vì tiền rời chi nhánh thật |
