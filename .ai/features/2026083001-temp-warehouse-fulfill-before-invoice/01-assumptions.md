---
feature: temp-warehouse-fulfill-before-invoice
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Màn hình hiện −1 là một khung nhìn theo trình tự đọc `stock_ledger_entries`, nên sắp lại thứ tự ghi sổ là đủ để nó hết âm | high | yes | Cả feature sai hướng; phải quay lại G0 | confirmed | Akenzy xác nhận 2026-08-30 khi chốt hướng sửa: "chuyển kho tạm ra showroom thì đúng rồi, nếu chuyển từ kho tạm ra showroom trước thì hóa đơn sẽ không hiện -1 như hình" |
| A-02 | Giữ nhịp 2 bất đồng bộ (outbox và consumer) là chấp nhận được; không chuyển vào transaction thanh toán | high | yes | Thiết kế đảo hướng hoàn toàn; UOW-01 và UOW-02 viết lại | confirmed | Akenzy chọn "Giữ async, lùi posted_at phiếu chuyển" ngày 2026-08-30, lý do là không để lỗi kho tạm làm hỏng lần bán tại quầy |
| A-03 | Mọi khung nhìn theo trình tự của sổ kho đều đọc `posted_at`, không nơi nào sắp theo `created_at` | high | yes | Lùi `posted_at` không đủ; vẫn còn báo cáo hiện âm | confirmed | Kiểm mã 2026-08-30: `stock-summary.service.ts:327-332`, `stock-summary-detail.service.ts:177-193/418-425`, `stock-period.service.ts:799-818`, `stock-ledger.service.ts:736-740` đều chỉ lọc và sắp theo `posted_at`. `created_at` chỉ còn trong index `idx` trên entity, không truy vấn nào dùng để sắp |
| A-04 | Thêm `postedAt?: Date` vào `RecordMovementParams` là tương thích ngược cho mọi caller hiện có | high | yes | Hồi quy toàn miền kho: nhập, xuất, kiểm kê, chuyển kho, bán hàng | confirmed | Trường tuỳ chọn, mặc định giữ `new Date()` như hiện tại (`stock-ledger.service.ts:206` và `:819`); không caller nào đang truyền trường này nên hành vi cũ không đổi. Khẳng định bằng AC-03 |
| A-05 | Mốc lùi phải nằm cùng ngày với hoá đơn, vì báo cáo cắt kỳ bằng `posted_at < :from` cho tồn đầu kỳ | high | yes | Phiếu chuyển rơi sang kỳ trước; tồn đầu kỳ và cuối kỳ của cả hai kỳ đều sai | confirmed | Kiểm mã 2026-08-30: `stock-summary-detail.service.ts:191-193` tính tồn đầu kỳ bằng `SUM(CASE WHEN sle.posted_at < $4 ...)`. Xử lý bằng kẹp mốc về đầu ngày, mô tả ở AC-04 |
| A-06 | Neo mốc theo `posted_at` của chính dòng `SALE_ISSUE` của hoá đơn (đọc lại từ sổ) là tất định qua mọi lần replay | medium | yes | Chạy lại consumer cho ra `posted_at` khác nhau; sổ kho không tái lập được | confirmed | Dòng `SALE_ISSUE` là bất biến sau khi ghi (CLAUDE.md, Database rules), nên đọc lại luôn ra cùng giá trị. Đây là lý do neo theo sổ thay vì theo `new Date()` của consumer. Khẳng định bằng AC-05 |
| A-07 | Màn hình cụ thể để chụp bằng chứng G4 là dialog Thẻ kho `StockLedgerCardDialog` | medium | no | Chụp nhầm màn ở G4, phải chụp lại; không ảnh hưởng mã nguồn | pending | — |
| A-08 | Không consumer hay báo cáo nào phụ thuộc vào bất biến `posted_at >= created_at` | medium | no | Một báo cáo lệch chưa lường trước; sửa cục bộ ở chỗ đó | pending | — |
| A-09 | Phiếu chuyển kho tạm do người dùng bấm tay (`transferLines`) không cần lùi mốc | high | no | Thừa phạm vi hoặc thiếu một ca; xử lý sau bằng ticket riêng | pending | — |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
| --- | --- | --- | --- |
| A-10 | Có thể sắp lại thứ tự ở tầng đọc, không cần đụng tầng ghi | `StockLedgerEntryEntity` không có cột thứ tự nào; mọi khung nhìn chỉ có `posted_at` để sắp, mà giá trị đó đã ghi sai thứ tự | Bắt buộc sửa ở tầng ghi. Sinh ra UOW-01 (mở `postedAt` cho caller) như tiền đề của UOW-02 |
| A-11 | `UPDATE` lại `posted_at` của dòng chuyển kho sau khi ghi là một lối thoát rẻ hơn | `stock_ledger_entries` là sổ append-only bất biến; sửa dòng đã ghi vi phạm quy ước nền của repo | Loại bỏ. Giá trị phải đúng ngay tại lần ghi đầu tiên, nên `postedAt` phải đi vào tham số của đường ghi |
