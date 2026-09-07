---
feature: 2026090401-pos-draft-invoice-fixes
environments: [local-pos]
viewports: [desktop]
---

# Verification — Hoá đơn lưu tạm

Chỉ chạy trên `local-pos`. Cả ba lỗi đều nằm trong app POS; backoffice không có màn nào
liên quan, và hai môi trường `local-backoffice-bm` / `local-backoffice-wh` thuộc feature khác.

Dữ liệu neo: chi nhánh Hồ Chí Minh trên `erp_dev` có **15 phiếu lưu tạm**, phiếu mới nhất là
`DRAFT-1787570592232` (1 × `ABA2799-D-38`, 750.000). Chi nhánh này **không có tồn showroom**
cho mặt hàng đó, nên dòng khôi phục phải cảnh báo "Hàng hóa quá số lượng tồn" — chứ KHÔNG
phải "Chưa xác định được tồn kho". Đó chính là ranh giới lỗi/không lỗi của UOW-02.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | "DS hoá đơn" không còn dòng trạng thái "Nháp" | `/pos/invoices` | `click text=Hôm nay; click text=Toàn bộ; click text=Áp dụng; wait text=Đã thanh toán` | AC-10, AC-11 | `text=Đã thanh toán; no-text=Nháp` |
| S2 | Các trạng thái hoá đơn thật vẫn hiện đủ | `/pos/invoices` | `click text=Hôm nay; click text=Toàn bộ; click text=Áp dụng; wait text=Đã thanh toán` | AC-12 | `text=Đã thanh toán; text=Ghi nợ; text=Đã hủy` |
| S3 | Dialog "HĐ lưu tạm" vẫn liệt kê đủ phiếu nháp | `/pos/` | `click text=HĐ lưu tạm; wait text=Hóa đơn chưa thanh toán` | AC-13 | `text=DRAFT-1787570592232` |
| S4 | Mở lại phiếu lưu tạm: tiền phải thu được tự nhập, không để 0 | `/pos/` | `click text=HĐ lưu tạm; wait text=Hóa đơn chưa thanh toán; click text=Đồng ý; wait text=Còn phải thu` | AC-01, AC-03 | `text=750.000; no-text=-750.000` |

## Not verified here

- **AC-02** (chia hai dòng thanh toán) và **AC-04**, **AC-05**: cần gõ số tiền rồi lưu tạm rồi
  mở lại — một chuỗi ghi dữ liệu, không hợp với một bước đọc màn hình. Đã khoá bằng test đơn vị
  (`invoicePayloadMapper.test.ts`, `checkout-session.store.test.ts`) và đo tay ở T-01-03/04/05.
- **AC-06, AC-07, AC-08, AC-09** — toàn bộ UOW-02: **trình duyệt không phân biệt được**
  trên tập dữ liệu này, và đây là một giới hạn thật chứ không phải lười.
  Trước khi sửa, dòng khôi phục mang cờ *chưa-biết-tồn*; sau khi sửa nó mang tồn thật là **0**
  (chi nhánh HCM trên `erp_dev` không có tồn showroom cho mặt hàng nào). Cả hai trạng thái đều
  cho ra **cùng một icon đỏ** và cùng bật dialog "Cảnh báo xuất quá số lượng tồn"; thứ duy nhất
  khác nhau là chữ trong tooltip, mà tooltip chỉ hiện khi rê chuột — runner không có động từ
  `hover`. Một bước không rê chuột sẽ cho `no-text=Chưa xác định được tồn kho` xanh vô điều
  kiện, tức xanh giả.
  Bằng chứng thay thế đã có: A/B thật trong T-02-01 (dep cũ → `maxQty 0 / unknown: true` + tooltip
  "Hãy kiểm tra tồn trước khi bán."; dep mới → `maxQty 10 / unknown: false`, sạch cảnh báo), cộng
  4 test store trong T-02-02. Vì vậy **UOW-02 không nhận khối "Verification evidence"**.

## Notes

Đăng nhập bằng `admin@erp.local` (org `f1000000-…-0001`), chi nhánh Hồ Chí Minh
(`LOCAL_POS_BRANCH_ID`). Tài khoản trong `.ai/credentials.env` trước 4/9/2026 trỏ vào một org
đã không còn tồn tại và trả 401.

`/pos/invoices` mặc định lọc "Ngày tạo / Hôm nay"; phải mở về "Toàn bộ" **và bấm "Áp dụng"**
thì mới có phiếu nháp cũ trong tập kết quả. Bỏ nút "Áp dụng" là lưới rỗng và `no-text=Nháp`
đúng vô điều kiện — lần chạy đầu đã dính đúng bẫy đó. Vì vậy S1 phải kèm một assert dương
(`text=Đã thanh toán`): nó là thứ duy nhất phân biệt "đã lọc hết nháp" với "chưa có dòng nào".
