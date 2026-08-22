---
feature: invoice-number-format
blocking_open: 0
---

# Assumption register — invoice-number-format

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | `xxxx` là số thứ tự **reset mỗi ngày**, 4 chữ số, không phải số chạy liên tục | high | yes | `resetPolicy` của rule + migration + mọi AC về đánh số | confirmed | Akenzy chọn "Reset mỗi ngày" trong vòng hỏi 2026-08-22 |
| A-02 | Bộ đếm **dùng chung toàn công ty**, không tách theo chi nhánh, và mã không mang đoạn phân biệt chi nhánh | high | yes | Nếu tách theo chi nhánh thì hai chi nhánh cùng ra `2608210001` → 23505 trên `uq_invoice_org_code`; phải thêm token chi nhánh, lệch khỏi định dạng yêu cầu | confirmed | Akenzy chọn "Chung toàn công ty" trong vòng hỏi 2026-08-22 |
| A-03 | Hoá đơn **ĐỔI hàng (EXCHANGE)** dùng chung dải số với trả hàng và cũng mang đuôi `TH` | high | yes | Nếu tách, phải thêm `DocumentType` mới + migration enum + sửa mọi nơi đọc RTN | confirmed | Akenzy chọn "Cả trả và đổi đều TH" trong vòng hỏi 2026-08-22 |
| A-04 | Chỉ đổi định dạng của `INVOICE` và `RETURN`; 26 loại chứng từ còn lại giữ nguyên | high | yes | Phạm vi gấp ~14 lần, đụng phiếu thu/chi, nhập/xuất/chuyển kho, mã KH/NV | confirmed | Akenzy chọn "Chỉ hoá đơn bán + trả/đổi" trong vòng hỏi 2026-08-22 |
| A-05 | **Không viết lại mã của hoá đơn đã tồn tại.** `INV-202608-00013` và `RTN-202608-00035` giữ nguyên vĩnh viễn | high | no | Nếu người dùng muốn backfill thì thêm một UoW migration riêng — không phải sửa lại UoW nào đang có | pending | — |
| A-06 | Phiếu **tạm tính** ("HÓA ĐƠN TẠM TÍNH") in ra **không có dòng `Số:`** thay vì mang số giả | medium | no | 1 dòng trên mẫu in; nếu sai thì thêm nhãn "Chưa cấp số" — sửa một chỗ | pending | — |
| A-07 | Các org trên production đã có sẵn rule active cho `INVOICE`/`RETURN` như trên `erp_dev` | medium | no | Migration `UPDATE` không khớp hàng nào → org đó rơi về `ensureDefaultActiveRule`, mà nhánh đó cũng đã sửa → vẫn ra đúng định dạng | pending | — |
| A-08 | Chưa có tích hợp hoá đơn điện tử / cơ quan thuế nào ràng buộc định dạng `INV-`, nên số hiện tại thuần nội bộ và đổi được | high | no | Nếu có, đổi định dạng là vi phạm quy định phát hành — phải huỷ cả feature | pending | — |
| A-09 | Quá 9999 hoá đơn/ngày/công ty là ngoài thực tế; nếu xảy ra thì số dài ra (`26082110000`) chứ không trùng | high | no | Không có — hành vi suy biến an toàn, đã kiểm bằng `padStart` | pending | — |

## Sự thật đã tra được (không phải giả định)

Những điều dưới đây đã kiểm trực tiếp trên repo/DB nên **không** nằm trong bảng trên:

| Điều | Cách kiểm |
|---|---|
| Số in lúc thanh toán là số ngẫu nhiên sinh ở client | `checkoutReceiptFactory.ts:23` — `Math.floor(Math.random() * 10_000)` |
| In lại từ danh sách dùng đúng `invoice.code` | `invoiceRowPrintPayload.ts:101` |
| `uq_invoice_org_code` là UNIQUE `(organization_id, code)` | `pg_indexes` trên `erp_dev` |
| `formatDate` không hỗ trợ `YYMMDD` | `document-numbering.service.ts:546-561` |
| `formatDocumentNumber` luôn nối bằng `-` khi có date hoặc suffix | `document-numbering.service.ts:521-544` |
| `RETURN` và `EXCHANGE` cùng dùng `DocumentType.RETURN` | `checkout-return.service.ts:246` là call site duy nhất |
| Response của `/checkout` và `/checkout-return` đều là `InvoiceRow` có `code` | `use-query-invoice.ts:85,403` + `invoice.interface.ts:47` |
| Không có code nào parse prefix `INV-`/`RTN-` | grep hai dạng khác nhau, chỉ ra comment |
| `erp_dev` đang có rule `INVOICE=INV/YYYYMM/5/MONTHLY` và `RETURN=RTN/YYYYMM/5/MONTHLY`, đều org-wide | `select … from document_number_rules` |
| Hoá đơn nháp mang mã `DRAFT-<timestamp>`, không đi qua bộ đánh số | `select code from invoices` |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
|----|----------------|----------------------|-------------|
| — | — | — | — |
