---
feature: footer-grand-totals-standard
blocking_open: 0         # count of blocking + pending; must be 0 to pass G1
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Chuẩn chung là `ReportTotals = Record<string, number>` + `PaginatedWithTotals<T>` khai ở `shared-interfaces`; lưới một cột tiền vẫn dùng `totals` chứ không giữ scalar song song | medium | yes | Toàn bộ hình dạng response của 15 bảng | resolved | Chủ sở hữu chốt 2026-08-14: "mở rộng contract sẵn có" |
| A-02 | Retrofit 12 bảng đợt 1 làm **cùng đợt** này, không để lại sau | medium | yes | Phạm vi feature; phải chạy lại đủ 17 bước verify đợt 1 | resolved | Chủ sở hữu chốt 2026-08-14: "retrofit luôn cùng đợt" |
| A-03 | Hai bảng dialog POS được nối phân trang thật, không chỉ sửa footer | high | yes | Phạm vi UOW POS; đụng state + pager của hai màn | resolved | Chủ sở hữu chốt 2026-08-14 |
| A-04 | Tab Lịch sử mua hàng sửa cả hai bất nhất: đẩy lọc trạng thái xuống server, và cho ô lọc "Tổng thanh toán" dùng đúng đại lượng cột hiển thị | high | yes | Đổi **hành vi người dùng thấy được** ở ô lọc | resolved | Chủ sở hữu chốt 2026-08-14: "sửa cả hai" |
| A-05 | Họ `{ rows, totals: ReportRow \| null, total }` của engine báo cáo **không** gộp vào chuẩn mới | high | no | Nếu sai: phải sửa thêm cả báo cáo bán hàng + engine báo cáo kho | resolved | Chốt trong plan 2026-08-14: giữ nguyên, chỉ ghi rõ ranh giới |
| A-06 | `getInvoiceSignedTotal` (`netAmount` cho RETURN/EXCHANGE, còn lại `amountDue`) là đại lượng đúng cho cả ba footer POS | high | no | Footer POS sai dấu với đơn trả; SQL ngây thơ ra 28.927.000 thay vì 26.337.000 | pending | — |
| A-07 | `FilterBuilder.applyCompare` nhận được biểu thức SQL thô, nên một factory dùng chung được cho cả filter lẫn `SUM` | high | no | Phải tách hai đường, và filter/footer có thể lệch nhau | pending | — |
| A-08 | Đổi hình dạng response không cần migration, không cột mới | high | no | Nếu sai, phạm vi khác hẳn | pending | — |
| A-09 | `apps/pos-web` không có test runner ⇒ không lên kế hoạch unit test FE | high | no | Kế hoạch verify sai chỗ; mất thời gian viết test không chạy | pending | — |
| A-10 | Ghim chi nhánh khi verify POS làm bằng cách gieo phiên (login → switch-branch → ghi `.ai/.auth/`), **không** sửa `post_login` trong `aidlc.yaml` dùng chung | high | no | Nếu sai: cấu hình chung dính thứ chỉ đúng ở một máy | resolved | Chủ sở hữu chốt 2026-08-14: giữ `.ai/` sạch |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
| --- | --- | --- | --- |
| A-R1 | Ba bảng POS là việc độc lập, chỉ cần lặp lại pattern đợt 1 | Đợt 1 để lại **bốn** hình dạng `totals`; thêm POS theo pattern cũ là thêm hình dạng thứ năm | Feature này gánh thêm phần chuẩn hoá + retrofit 12 bảng cũ |
| A-R2 | Chưa có chuẩn nào cho `totals` trong repo | `shared-interfaces/src/invoice-report/search.ts:121-127` đã chuẩn hoá `{ rows, totals, total }` và `inventory-report/search.ts:60-61` tái dùng nguyên vẹn — đợt 1 không biết nên dựng shape riêng | Chuẩn mới phải nêu rõ ranh giới với họ này, thay vì giả vờ nó không tồn tại |
