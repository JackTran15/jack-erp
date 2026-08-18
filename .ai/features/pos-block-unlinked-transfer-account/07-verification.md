---
feature: pos-block-unlinked-transfer-account
environments: [local-pos]
viewports: [desktop]
---

# Verification — POS chặn thanh toán khi tài khoản chuyển khoản/thẻ chưa liên kết quỹ tiền gửi

Máy local đang ở đúng trạng thái lỗi cần chứng minh: mapping `payment_accounts` cho
`bank_transfer` do seed baseline tạo ra không gắn `deposit_account_id` nào, nên select
"Tài khoản nhận tiền" chỉ hiện nhãn fallback "Chuyển khoản" thay vì tên quỹ + số tài khoản.
Không cần dựng thêm dữ liệu.

Hai bước là một cặp: S1 chứng minh luật chặn đúng ca hỏng, S2 chứng minh nó không chặn nhầm
tiền mặt. Thiếu S2 thì một build chặn sạch mọi phương thức vẫn xanh.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Thêm hàng, chọn "Chuyển khoản" (tài khoản chưa gắn quỹ), bấm "Thu tiền" → bị chặn | `/` | `wait [aria-label="Danh sách sản phẩm tư vấn"] button; click [aria-label="Danh sách sản phẩm tư vấn"] button; wait tbody input[type="checkbox"]; click tbody label:has(input[type="checkbox"]); click button:has-text("Đồng ý"); click [aria-label="Phương thức thanh toán"]; click [role="option"]:has-text("Chuyển khoản"); click [aria-label="Thu tiền"]` | AC-01 | `text=chưa liên kết tài khoản ngân hàng` |
| S2 | Cùng giỏ hàng đó, đổi sang "Tiền mặt", bấm "Thu tiền" → bán được | `/` | `wait [aria-label="Phương thức thanh toán"]; click [aria-label="Phương thức thanh toán"]; click [role="option"]:has-text("Tiền mặt"); click [aria-label="Thu tiền"]` | AC-02 | `text=Chưa có hàng nào` |

## Notes

- S2 hoàn tất một hóa đơn thật trên DB `erp_dev`. Đây là cái giá để chứng minh guard không
  chặn nhầm — không có cách nào khác kiểm được điều đó qua UI.
- S2 khẳng định `text=Chưa có hàng nào` (giỏ rỗng trở lại sau khi bán xong) chứ KHÔNG dùng
  `no-text=chưa liên kết`. Một assert phủ định ở đây từng xanh giả: lần chạy trước nó vẫn pass
  trong khi màn hình đang hiện toast HTTP 400 — bất kỳ lỗi nào cũng thỏa mãn "không thấy chữ".
  Chỉ một lần bán thành công mới làm giỏ hàng rỗng lại.
- Cần `apps/pos-web/.env` với `VITE_CHECKOUT_V2=true` (file local, đã gitignore). Thiếu nó,
  POS rơi về `POST /invoices/:id/checkout` (v1) — nhánh này không chạy promotion engine, nên
  client trừ khuyến mại 10% còn hóa đơn nháp trên server thì không, phần chênh bị coi là công
  nợ và checkout bị từ chối vì thiếu khách hàng. Đó là cấu hình thiếu, không phải lỗi của
  thay đổi này; guard nằm ở `AccountResolverService` nên phủ cả hai nhánh như nhau.
- S1 và S2 phụ thuộc thứ tự: giỏ hàng do S1 tạo được localStorage giữ lại qua lần điều hướng
  của S2, nên S2 không thêm hàng nữa.

## Not verified here

- Guard phía BE (`AccountResolverService.resolvePaymentAccount`) phủ cả ba đường checkout —
  đã có unit test `account-resolver.service.spec.ts` và e2e `deposit-fund.e2e-spec.ts`.
- Luật validate khi UPDATE cấu hình `payment_accounts` — thuộc Backoffice, ngoài phạm vi POS.
