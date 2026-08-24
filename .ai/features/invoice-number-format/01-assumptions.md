---
feature: invoice-number-format
blocking_open: 0
---

# Assumption register — invoice-number-format

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | `xxxx` là số thứ tự **reset mỗi ngày**, 4 chữ số, không phải số chạy liên tục | high | yes | `resetPolicy` của rule + migration + mọi AC về đánh số | confirmed | Akenzy chọn "Reset mỗi ngày" trong vòng hỏi 2026-08-22 |
| A-02 | Bộ đếm **dùng chung toàn công ty**, không tách theo chi nhánh, và mã không mang đoạn phân biệt chi nhánh | high | yes | Nếu tách theo chi nhánh thì hai chi nhánh cùng ra `2608210001` → 23505 trên `uq_invoice_org_code`; phải thêm token chi nhánh, lệch khỏi định dạng yêu cầu | superseded | Đảo lại bởi A-10 — xem "Rejected assumptions" bên dưới. Reopened tại G2, 2026-08-24 |
| A-03 | Hoá đơn **ĐỔI hàng (EXCHANGE)** dùng chung dải số với trả hàng và cũng mang đuôi `TH` | high | yes | Nếu tách, phải thêm `DocumentType` mới + migration enum + sửa mọi nơi đọc RTN | confirmed | Akenzy chọn "Cả trả và đổi đều TH" trong vòng hỏi 2026-08-22 |
| A-04 | Chỉ đổi định dạng của `INVOICE` và `RETURN`; 26 loại chứng từ còn lại giữ nguyên | high | yes | Phạm vi gấp ~14 lần, đụng phiếu thu/chi, nhập/xuất/chuyển kho, mã KH/NV | confirmed | Akenzy chọn "Chỉ hoá đơn bán + trả/đổi" trong vòng hỏi 2026-08-22 |
| A-05 | **Không viết lại mã của hoá đơn đã tồn tại.** `INV-202608-00013` và `RTN-202608-00035` giữ nguyên vĩnh viễn | high | no | Nếu người dùng muốn backfill thì thêm một UoW migration riêng — không phải sửa lại UoW nào đang có | confirmed | Xác nhận bằng chứng thật trên `erp_dev`, 2026-08-24: `SELECT code FROM invoices WHERE code LIKE 'INV-%'` vẫn ra `INV-202608-00013`, `RTN-202608-00002`/`00001` nguyên vẹn sau mọi migration. Akenzy accept ở G4/G5, 2026-08-24 |
| A-06 | Phiếu **tạm tính** ("HÓA ĐƠN TẠM TÍNH") in ra **không có dòng `Số:`** thay vì mang số giả | medium | no | 1 dòng trên mẫu in; nếu sai thì thêm nhãn "Chưa cấp số" — sửa một chỗ | confirmed | Xác nhận bằng code: `renderInvoiceHtml.ts:390-391` chỉ render dòng `Số:` khi `invoiceNumber` có giá trị; tạm tính dựng trước khi thanh toán (ADR-03) nên `invoiceNumber` luôn `undefined` lúc đó. Akenzy accept ở G4/G5, 2026-08-24 |
| A-07 | Các org trên production đã có sẵn rule active cho `INVOICE`/`RETURN` như trên `erp_dev` | medium | no | Migration `UPDATE` không khớp hàng nào → org đó rơi về `ensureDefaultActiveRule`, mà nhánh đó cũng đã sửa → vẫn ra đúng định dạng | confirmed | Akenzy xác nhận trực tiếp khi đóng feature, 2026-08-24: production đã có sẵn rule active cho INVOICE/RETURN |
| A-08 | Chưa có tích hợp hoá đơn điện tử / cơ quan thuế nào ràng buộc định dạng `INV-`, nên số hiện tại thuần nội bộ và đổi được | high | no | Nếu có, đổi định dạng là vi phạm quy định phát hành — phải huỷ cả feature | confirmed | Akenzy xác nhận trực tiếp khi đóng feature, 2026-08-24: chưa có tích hợp hoá đơn điện tử/cơ quan thuế nào ràng buộc định dạng |
| A-09 | Quá 9999 hoá đơn/ngày/công ty là ngoài thực tế; nếu xảy ra thì số dài ra (`26082110000`) chứ không trùng | high | no | Không có — hành vi suy biến an toàn, đã kiểm bằng `padStart` | confirmed | Xác nhận bằng code: `sequence.toString().padStart(rule.sequenceLength, "0")` — vượt quá độ dài chỉ làm chuỗi dài ra, không lặp lại giá trị đã cấp. Akenzy accept ở G4/G5, 2026-08-24 |
| A-10 | Bộ đếm hoá đơn **tách theo chi nhánh** (`INVOICE`/`RETURN`); định dạng hiển thị `YYMMDDxxxx` giữ nguyên, không thêm hậu tố chi nhánh; ràng buộc unique mở rộng thành `(organization_id, branch_id, code)` để hai chi nhánh được phép trùng chuỗi số trong cùng một ngày | high | yes | Đảo A-02 + vô hiệu hoá guard ADR-06; cần migration mới đổi `uq_invoice_org_code`, seed rule theo chi nhánh cho mọi chi nhánh hiện có, và một cửa sổ rủi ro khi cutover giữa ngày (xem ADR-07) | confirmed | Akenzy chọn "Giữ định dạng YYMMDDxxxx, đổi bộ đếm theo chi nhánh + đổi ràng buộc unique" khi được hỏi lại 2026-08-24, sau khi thấy ảnh QA #26 (số nhảy khi lọc theo một chi nhánh) |

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
| A-02 | Bộ đếm hoá đơn dùng chung toàn công ty là đủ; đối chiếu cuối ngày không cần bộ đếm liên tục theo chi nhánh | Kế toán đối chiếu hoá đơn **cuối ngày theo từng chi nhánh**, và bộ đếm dùng chung làm số nhảy cách quãng khi lọc theo một chi nhánh — không phân biệt được "chi nhánh khác chiếm số" với "thiếu hoá đơn" (ảnh QA #26) | A-10 thay thế; ADR-06 (migration guard chặn rule theo chi nhánh) bị vô hiệu hoá, thay bằng ADR-07; cần một UoW mới cho migration đổi ràng buộc unique + seed rule theo chi nhánh |
