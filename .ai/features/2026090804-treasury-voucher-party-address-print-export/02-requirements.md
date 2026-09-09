---
feature: 2026090804-treasury-voucher-party-address-print-export
stories: 5
acceptance_criteria: 18
---

# Requirements — Phiếu thu chi: đối tượng tự nhập, địa chỉ, In và Xuất khẩu

Bốn loại phiếu trong phạm vi, gọi tắt suốt tài liệu này là **4 loại phiếu**:

| Tên trên giao diện | Bảng | Dialog |
|---|---|---|
| Phiếu thu tiền mặt | `cash_receipts` | `ReceiptVoucherDialog` |
| Phiếu chi tiền mặt | `cash_payments` | `PaymentVoucherDialog` |
| Phiếu thu tiền gửi | `bank_receipts` | `DepositReceiptVoucherDialog` |
| Phiếu chi tiền gửi | `bank_payments` | `DepositPaymentVoucherDialog` |

---

## US-01 — Gõ thẳng tên đối tượng vào phiếu

Là thủ quỹ, tôi muốn gõ thẳng tên người nộp / nhận tiền vào ô Đối tượng khi người đó không
có trong danh mục, để phiếu vẫn ghi được ai đã giao dịch mà không phải tạo hồ sơ khách hàng
rác.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Gõ tên, bỏ trống mã
```gherkin
Given tôi đang tạo một phiếu chi tiền mặt mới
And tôi chưa chạm vào ô Mã đối tượng
When tôi gõ "Nguyễn Văn Ba" vào ô Tên đối tượng và lưu phiếu
Then phiếu lưu thành công
And bản ghi có partner_type = 'OTHER', partner_id = NULL, partner_name_snapshot = 'Nguyễn Văn Ba'
```

**AC-02** — Mở lại phiếu đối tượng tự nhập
```gherkin
Given một phiếu chi tiền mặt đã lưu với đối tượng tự nhập "Nguyễn Văn Ba"
When tôi mở lại phiếu đó ở chế độ sửa
Then ô Tên đối tượng hiện "Nguyễn Văn Ba"
And ô Tên đối tượng vẫn gõ sửa được
And ô Mã đối tượng trống
```

**AC-03** — Chọn từ danh mục rồi sửa tên (A-02)
```gherkin
Given tôi đã chọn khách hàng "KH001 — Công ty A" từ kính lúp trên một phiếu thu tiền mặt
When tôi sửa ô Tên thành "Công ty A — CN Bình Tân" và lưu
Then bản ghi giữ nguyên partner_type = 'CUSTOMER' và partner_id của KH001
And partner_name_snapshot = 'Công ty A — CN Bình Tân'
```

**AC-04** — Modal "Chọn đối tượng" không còn lối cụt
```gherkin
Given tôi mở modal "Chọn đối tượng" từ một phiếu bất kỳ trong 4 loại phiếu
When tôi mở dropdown "Loại đối tượng"
Then không còn mục nào dẫn tới một danh sách không bao giờ có kết quả
And không request nào tới GET /cash-vouchers/partners bị trả 400
```

**AC-05** — Cột Đối tượng trên lưới Thu chi (A-05)
```gherkin
Given một phiếu chi tiền mặt có đối tượng tự nhập "Nguyễn Văn Ba" và ô Người nhận để trống
When tôi mở danh sách Quỹ tiền → Thu chi tiền mặt
Then cột "Đối tượng" của dòng đó hiện "Nguyễn Văn Ba"
```

**AC-06** — Áp cho cả 4 loại phiếu
```gherkin
Given tôi lần lượt mở phiếu thu tiền mặt, phiếu chi tiền mặt, phiếu thu tiền gửi, phiếu chi tiền gửi
When tôi gõ tên đối tượng và lưu ở từng loại
Then cả bốn đều lưu partner_name_snapshot đúng tên đã gõ
```

---

## US-02 — Địa chỉ trên phiếu tiền mặt lưu được

Là thủ quỹ, tôi muốn địa chỉ gõ trên phiếu tiền mặt được lưu lại, để phiếu in ra có đủ
thông tin người nhận tiền ký nhận.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-07** — Địa chỉ gõ tay được lưu
```gherkin
Given tôi đang tạo một phiếu chi tiền mặt cho đối tượng tự nhập
When tôi gõ "123 Lê Lợi, Q1" vào ô Địa chỉ và lưu
Then bản ghi cash_payments có partner_address_snapshot = '123 Lê Lợi, Q1'
And mở lại phiếu thì ô Địa chỉ hiện đúng chuỗi đó
```

**AC-08** — Địa chỉ gõ tay thắng địa chỉ danh mục (A-03)
```gherkin
Given tôi chọn một khách hàng có địa chỉ "456 Nguyễn Huệ" từ kính lúp trên phiếu thu tiền mặt
And ô Địa chỉ tự điền "456 Nguyễn Huệ"
When tôi sửa ô Địa chỉ thành "456 Nguyễn Huệ, lầu 3" và lưu
Then partner_address_snapshot = '456 Nguyễn Huệ, lầu 3'
```

**AC-09** — Sửa địa chỉ trên phiếu đã ghi sổ
```gherkin
Given một phiếu thu tiền mặt đã ghi sổ, tạo thủ công, revision = 0
When tôi sửa mỗi ô Địa chỉ rồi lưu
Then phiếu lưu thành công và revision tăng lên 1
And partner_address_snapshot mang giá trị mới
And không phát sinh phiếu bù trừ nào (số tiền không đổi)
```

---

## US-03 — In phiếu ra khổ A5

Là thủ quỹ, tôi muốn in phiếu thu / chi ra giấy khổ A5, để người giao dịch ký nhận.

**Priority:** must
**Depends on:** US-01, US-02

### Acceptance criteria

**AC-10** — In một phiếu thu tiền mặt
```gherkin
Given tôi mở chi tiết một phiếu thu tiền mặt đã ghi sổ
When tôi bấm "In"
Then hộp thoại in của trình duyệt mở ra với bản xem trước khổ A5
And bản in có: tiêu đề "PHIẾU THU", số phiếu, ngày dạng dài, tên và địa chỉ đối tượng, lý do
And có bảng Diễn giải / Số tiền và dòng tổng
And có dòng "Số tiền bằng chữ" đọc đúng tiếng Việt
And có khối chữ ký
```

**AC-11** — Đúng tiêu đề và nhãn cho từng loại phiếu
```gherkin
Given tôi in lần lượt cả 4 loại phiếu
Then tiêu đề lần lượt là PHIẾU THU / PHIẾU CHI / PHIẾU THU (tiền gửi) / PHIẾU CHI (tiền gửi)
And nhãn đối tượng là "Người nộp tiền" trên phiếu thu và "Người nhận tiền" trên phiếu chi
```

**AC-12** — In phiếu của đối tượng tự nhập
```gherkin
Given một phiếu chi tiền mặt có đối tượng tự nhập và địa chỉ gõ tay
When tôi bấm "In"
Then bản in hiện đúng tên và địa chỉ đã gõ, không để trống
```

**AC-13** — Nút In chỉ có ở phiếu đã lưu (A-07)
```gherkin
Given tôi mở dialog tạo phiếu mới
Then nút "In" không hiện
```

---

## US-04 — Xuất từng phiếu ra Excel

Là kế toán, tôi muốn tải một phiếu ra file .xlsx, để gửi kèm email hoặc lưu hồ sơ.

**Priority:** should
**Depends on:** US-03

### Acceptance criteria

**AC-14** — Tải .xlsx một phiếu
```gherkin
Given tôi mở chi tiết một phiếu chi tiền mặt đã ghi sổ
When tôi bấm "Xuất khẩu"
Then trình duyệt tải về một file .xlsx
And tên file phản ánh loại phiếu và số phiếu, không phải "chung-tu.xlsx"
```

**AC-15** — Nội dung file khớp phiếu
```gherkin
Given file .xlsx vừa tải của phiếu đó
When tôi mở file
Then có số phiếu, ngày, tên đối tượng, địa chỉ, lý do
And có đủ các dòng chi tiết và dòng tổng đúng bằng tổng tiền của phiếu
And có dòng tiền bằng chữ
```

**AC-16** — Phiếu ngoài phạm vi thì không tải được
```gherkin
Given một id phiếu không tồn tại, hoặc thuộc tổ chức khác
When gọi route xuất khẩu với id đó
Then API trả 404
And không có file nào được tải về
```

---

## US-05 — Xuất danh sách Thu chi ra Excel

Là kế toán tổng hợp, tôi muốn xuất danh sách Thu chi tiền mặt đang xem ra Excel, để đối
chiếu ngoài phần mềm.

**Priority:** should
**Depends on:** —

### Acceptance criteria

**AC-17** — Xuất theo bộ lọc đang áp dụng (A-10)
```gherkin
Given tôi ở Quỹ tiền → Thu chi tiền mặt với một khoảng ngày và một quỹ đã lọc
And danh sách có nhiều hơn một trang
When tôi bấm "Xuất khẩu"
Then file .xlsx tải về chứa TOÀN BỘ dòng khớp bộ lọc, không chỉ trang đang xem
And không chứa dòng nào nằm ngoài bộ lọc
```

**AC-18** — Không có dòng nào
```gherkin
Given bộ lọc hiện tại không khớp phiếu nào
When tôi bấm "Xuất khẩu"
Then file .xlsx vẫn tải về với hàng tiêu đề và không có dòng dữ liệu
And không có toast lỗi
```

---

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Bảo mật | In/Xuất từng phiếu dùng lại đúng quyền đọc phiếu đó (`accounting.{cash_receipt,cash_payment,bank_receipt,bank_payment}.read`); không thêm permission mới, không seed RBAC (A-08) | T-03-04, T-04-03 |
| Bảo mật | Mọi route mới lọc theo `actor.organizationId` và tôn trọng `@RequireBranchScope()` như route `GET :id` cạnh nó | T-04-03 |
| Tương thích | Không migration mới; không đổi shape phản hồi của các route đọc phiếu đang có | T-01-05, T-02-04 |
| Kế thừa | Phần In dùng `renderVoucherHtml` + `amount-in-words.util`; phần Xuất dùng `ExportPipeline` + `VoucherXlsxWriter` + `voucherToReportDocument`. Không khuôn thứ hai | T-03-03, T-04-02 |
| Hồi quy | Đường tạo phiếu tự động (consumer POS, thu nợ, phiếu bù trừ) không đổi hành vi | T-01-05 |
