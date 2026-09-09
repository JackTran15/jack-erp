# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | Nguyên nhân duy nhất của 409 là `revision` thiếu ở câu `SELECT` ngoài cùng — không phải service so sánh sai, không phải phiếu bị sửa thật bởi một phiên khác | high | yes | Nếu sai thì sửa xong vẫn 409 và mất cả feature | resolved | Log 2026-09-09 nói rõ "bản 1, bạn đang giữ bản 0" trong khi chỉ có một người dùng; `?? 0` ở `cash-vouchers.adapters.ts:51` giải thích chính xác con số 0; PC000044 (`revision = 0`) sửa được còn PT004767 (`revision = 1`) thì không — đúng hình dạng dự đoán |
| A-02 | `revision` là trường **duy nhất** mà row DTO khai còn truy vấn không trả | high | no | Sửa xong vẫn còn một trường im lặng khác | resolved | Đối chiếu từng trường của `CashVoucherRowDto` và `DepositVoucherRowDto` với câu `SELECT` tương ứng ngày 2026-09-09: cả hai chỉ lệch đúng `revision` |
| A-03 | Hai sổ (`cash-ledger`, `deposit-ledger`) không dính lỗi này | high | no | Bỏ sót hai màn hình | resolved | Không màn sổ nào có đường sửa phiếu, và `CashLedgerRow`/`DepositLedgerRow` không khai `revision` |
| A-04 | Giữ nguyên `?? 0` ở hai adapter thay vì đổi thành `??` ném lỗi hay `?? undefined` | medium | no | Một lỗi cùng loại trong tương lai lại im lặng thay vì ồn ào | resolved | ADR-02 (2026-09-09): 0 là giá trị đúng cho phiếu vừa tạo; chỗ để bắt lỗi sớm là spec trên truy vấn, không phải một `throw` ở tầng hiển thị |
| A-05 | Không phiếu nào trên `erp_dev_3008` đang ở trạng thái hỏng cần vá dữ liệu | high | no | Người dùng vẫn gặp 409 sau khi deploy | resolved | `revision` là cột đọc-ghi bình thường; sửa truy vấn là lưới nhận đúng giá trị ngay, không có dữ liệu nào cần sửa |
