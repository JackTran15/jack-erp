---
feature: cancel-invoice-refund
blocking_open: 0         # count of blocking + pending; must be 0 to pass G1
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | Hủy hóa đơn sinh **phiếu chi** hoàn tiền mới; phiếu thu POS_SALE gốc giữ nguyên POSTED (không đảo) | high | yes | Toàn bộ UOW-01/02 + hình dạng ADR-01 | confirmed | Akenzy chọn "Phiếu chi hoàn tiền" trong vòng hỏi G0, 2026-07-27 |
| A-02 | Chân tiền gửi: phiếu chi tiền gửi (`BankPaymentsService.createAndPostInternal`) **sở hữu** movement; bỏ movement thô trong `DepositRefundService.reverseForCancelledInvoice` | high | yes | UOW-02; nếu sai thì trừ quỹ tiền gửi 2 lần | confirmed | Akenzy chọn "Phiếu chi tiền gửi sở hữu movement", 2026-07-27 |
| A-03 | Hàng hủy luôn cộng vào showroom qua `resolveBranchItemLocations(..., {showroomOnly:true})`, bỏ qua `invoice_items.location_id` | high | yes | UOW-03 | confirmed | Akenzy chọn "Luôn showroom, bỏ qua vị trí bán", 2026-07-27 |
| A-04 | Phạm vi: backend + nút "Hủy hóa đơn" trong dialog chi tiết hóa đơn ở POS, chỉ hiện với role admin | high | yes | UOW-04 tồn tại hay không | confirmed | Akenzy: "POS được hủy với khi bạn là role admin… click vào hóa đơn có nút hủy hóa đơn", 2026-07-27 |
| A-05 | Số tiền hoàn = tổng tiền **thực thu** (`invoice_payments`, tương đương `invoices.total_paid`), KHÔNG phải `amount_due`. Hóa đơn `partial_debt` chỉ hoàn phần đã thu; phần công nợ vẫn tất toán như hiện tại | high | yes | Công thức số tiền trên mọi phiếu chi; sai là hoàn thừa tiền cho khách | confirmed | Akenzy chốt "600.000₫ — chỉ trả phần khách đã đưa" sau khi được chỉ ra rằng hoàn đủ 1.000.000₫ làm két âm 400.000₫, 2026-07-27 |
| A-06 | Chỉ hóa đơn `type = SALE` được hủy. `CANCELLABLE_STATUSES` hiện cho phép cả RETURN/EXCHANGE lọt qua vì không lọc theo `type` — cần siết lại | medium | yes | Một luật nghiệp vụ mới trong `CancelInvoiceService`; nếu sai thì hoàn tiền ngược dấu cho hóa đơn trả hàng | confirmed | Akenzy chọn "Chỉ SALE + chưa có phiếu trả/đổi", 2026-07-27 |
| A-07 | Hóa đơn đã có phiếu trả hàng / đổi hàng (`invoices.original_invoice_id` trỏ tới nó) thì **không** được hủy — phải xử lý bằng luồng đổi–trả | medium | yes | Guard trong `CancelInvoiceService`; nếu sai thì hoàn tiền chồng lên khoản đã hoàn ở phiếu trả | confirmed | Akenzy chọn "Chỉ SALE + chưa có phiếu trả/đổi", 2026-07-27 |
| A-08 | Liên kết chéo phiếu thu ↔ phiếu chi lưu trong **bảng `voucher_links` đa hình dùng chung** (`from_kind`/`from_id`/`to_kind`/`to_id`/`relation`), không thêm cột vào từng bảng chứng từ | medium | yes | Migration + shape của ADR-02; mọi màn hình muốn hiện chứng từ đối phía phải join qua bảng này | confirmed | Akenzy chọn "Bảng voucher_links chung", 2026-07-27 |
| A-09 | Quyền hủy vẫn dùng `pos.invoice.write` ở backend; "chỉ admin" thực thi ở frontend bằng role của `useCurrentUserQuery()` | medium | no | Nếu cần chặt hơn thì thêm permission key `pos.invoice.cancel` + seed RBAC — thêm 1 ticket | pending | — |
| A-10 | Movement tiền gửi đã đối chiếu (BR-REF-02) vẫn phải sinh phiếu chi (tiền thật đã rời tài khoản), chỉ khác là không đảo movement gốc | medium | no | Nhánh xử lý lỗi trong consumer tiền gửi | pending | — |
| A-11 | Không backfill dữ liệu cũ: hóa đơn đã CANCELLED trước khi tính năng này lên vẫn thiếu phiếu chi, kế toán tự xử lý tay | high | no | Nếu sai thì thêm một migration/script backfill | pending | — |
| A-12 | Hủy hóa đơn không bị chặn bởi khóa kỳ kế toán và không bị chặn bởi phiên kiểm kê quỹ — giữ nguyên hành vi hiện tại (`DepositPeriodGuard` chỉ áp cho chân tiền gửi) | low | no | Nếu sai thì thêm guard vào `CancelInvoiceService` | pending | — |

| A-13 | Double-post GL ở chân bán (`JournalSaleConsumer` ghi DR COA tiền, trùng với bút toán movement của phiếu thu POS_SALE) để **ngoài phạm vi**; luồng hủy vẫn đảo toàn bộ JE bán nên tổng cộng vẫn ra 0 | high | no | Nếu ai sửa chân bán mà không sửa luồng hủy → COA tiền bị credit thừa. Khóa bằng test + ADR-05 | confirmed | Akenzy chọn "Ngoài phạm vi — ghi chú ràng buộc" sau khi được trình bằng bảng đối chiếu sổ, 2026-07-27 |
| A-14 | Chân tiền gửi **không có phiếu thu gốc** để nối cặp — checkout chỉ ghi deposit movement, chưa từng sinh phiếu thu tiền gửi. Nên `voucher_links` chỉ có dòng cho chân tiền mặt; phiếu chi tiền gửi chỉ ref tới hóa đơn | high | no | AC-09/AC-10 chỉ áp dụng cho cặp tiền mặt. Nếu sau này muốn cặp đối xứng thì phải sinh cả phiếu thu tiền gửi ở checkout — epic khác | pending | — |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
|----|----------------|----------------------|-------------|
| — | Chưa có | — | — |
