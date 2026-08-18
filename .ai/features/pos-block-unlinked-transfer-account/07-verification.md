---
feature: pos-block-unlinked-transfer-account
environments: [local-pos]
viewports: [desktop]
---

# Verification — POS chặn thu tiền khi tài khoản chuyển khoản/thẻ chưa gắn quỹ tiền gửi

Môi trường `erp_dev` đang ở đúng trạng thái lỗi cần chứng minh: cả ba mapping
`payment_accounts` (cash / bank_transfer / card) đều là org-wide và **không** có
`deposit_account_id`. Vì vậy ca chặn tái hiện được ngay, không cần dựng dữ liệu.

Giỏ hàng của POS được lưu vào localStorage nên tồn tại xuyên suốt các bước — S2 và S3
cố ý dựa vào giỏ mà S1 đã tạo thay vì thêm hàng lại từ đầu.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Thêm 1 mặt hàng vào hóa đơn rồi đổi phương thức sang "Chuyển khoản" — select "Tài khoản nhận tiền" hiện ra, nghĩa là mapping có tồn tại (chỉ là chưa gắn quỹ) | `/` | `click [aria-label="Danh sách sản phẩm tư vấn"] button; wait button:has-text("Đồng ý"); click tbody tr td:first-child label; click button:has-text("Đồng ý"); click [aria-label="Phương thức thanh toán"]; click [role="option"]:has-text("Chuyển khoản")` | AC-01 | `count [aria-label="Tài khoản nhận tiền"] = 1` |
| S2 | Bấm "Thu tiền" với dòng chuyển khoản chưa gắn quỹ — POS chặn bằng dialog cảnh báo, hóa đơn không được tạo | `/` | `click [aria-label="Thu tiền"]` | AC-02 | `text=chưa liên kết tài khoản ngân hàng` |
| S3 | Bỏ khuyến mại, đổi lại "Tiền mặt" rồi bấm "Thu tiền" — thu tiền chạy trọn vẹn, giỏ hàng được dọn, chứng minh guard không chặn nhầm tiền mặt | `/` | `click [aria-label="Bỏ áp dụng khuyến mại"]; click button:has-text("Bỏ áp dụng"); click [aria-label="Phương thức thanh toán"]; click [role="option"]:has-text("Tiền mặt"); click [aria-label="Thu tiền"]` | AC-03 | `text=Chưa có hàng nào; no-text=chưa liên kết tài khoản ngân hàng` |

## Notes

- S3 tạo một hóa đơn thật trong `erp_dev`. Đó là cái giá để chứng minh guard không chặn
  nhầm tiền mặt. Chromium headless không bật hộp thoại in của hệ điều hành nên toggle
  "In hóa đơn" cứ để nguyên.
- S3 phải bỏ khuyến mại trước khi thu tiền. Không liên quan tới thay đổi này: giữ nguyên
  chương trình KM thì API trả 400 "Invoice must have a customer when there is a remaining
  debt balance" — số "Còn phải thu" mà POS hiển thị không khớp số API tính. Xem ghi chú
  bàn giao.
- Không kiểm ở đây: nhánh "tài khoản ĐÃ gắn quỹ thì thu tiền bình thường". Muốn dựng ca
  đó phải tạo quỹ tiền gửi + sửa mapping ở Backoffice, tức là thay đổi cấu hình của môi
  trường dev. Nhánh này được phủ bằng unit test
  `account-resolver.service.spec.ts` ("returns the linked depositAccountId when the
  mapping names one") và e2e `deposit-fund.e2e-spec.ts` (10/10 xanh sau khi fixture gắn quỹ).
