---
feature: pos-barcode-focus
blocking_open: 0
---

# Assumption register

| ID   | Assumption | Confidence | Blocking | Blast radius if wrong | Status    | Resolution |
| ---- | ---------- | ---------- | -------- | ---------------------- | --------- | ---------- |
| A-01 | Focus phải trả về ngay khi giao dịch ghi nhận xong (trước khi in), và trả về lần nữa sau khi hộp thoại in đóng — không chỉ một trong hai thời điểm | high | yes | Nếu chỉ focus 1 lần, `window.print()` (native browser dialog) có thể cướp lại focus sau đó và ô quét vẫn mất focus | confirmed | Xác nhận bởi Akenzy, 2026-09-04, qua AskUserQuestion: "Cả hai: focus ngay, rồi focus lại sau khi in xong" |
| A-02 | Auto-focus khi vào màn hình bán hàng áp dụng cho MỌI lần `CheckoutPage` mount (kể cả quay lại từ trang khác), không chỉ lần đầu sau đăng nhập | high | yes | Nếu chỉ áp dụng "lần đầu", cần thêm cờ trạng thái vào store và logic phức tạp hơn hẳn | confirmed | Xác nhận bởi Akenzy, 2026-09-04, qua AskUserQuestion: "Mỗi lần màn hình bán hàng được mount" |
| A-03 | `resetCheckoutUiDraft()` không reset `productSearchFocusSeq` — an toàn để gọi `requestProductSearchFocus()` trước dòng reset đó trong `finalizeCheckoutAndPrint` mà không bị chính reset ghi đè | high | no | Nếu reset có xoá seq, phải đổi thứ tự gọi hoặc đổi field khác | confirmed | Xác nhận bằng đọc trực tiếp `checkout-ui.store.ts:198-213` — `resetCheckoutUiDraft` không liệt kê `productSearchFocusSeq` |
| A-04 | `printReceiptIfNeeded` luôn resolve (kể cả khi không có `receiptPayload`, hoặc khi in lỗi bị catch nội bộ) nên `await` nó xong rồi gọi focus lần 2 là an toàn, không bị treo | high | no | Nếu `invoicePrinter.print()` có đường không resolve, focus lần 2 sẽ không bao giờ chạy | confirmed | Xác nhận bằng đọc `BrowserWindowInvoicePrinter.print()` — có timeout fallback 60s trên `onafterprint`, và `printReceiptIfNeeded` tự bọc try/catch nên luôn resolve |
