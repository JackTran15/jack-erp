---
feature: treasury-voucher-party-reason-edit
stories: 4
acceptance_criteria: 19
---

# Requirements — Phiếu thu chi quỹ tiền

Bốn loại phiếu trong phạm vi, gọi tắt là **"cả bốn loại"** ở các tiêu chí bên dưới:
phiếu thu tiền mặt, phiếu chi tiền mặt, phiếu thu tiền gửi, phiếu chi tiền gửi.

## US-01 — Ghi đối tượng không có trong danh mục

Là kế toán quỹ, tôi muốn gõ thẳng tên người nộp/người nhận khi họ không có trong danh mục,
để phiếu không bị trống ô Đối tượng.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Chọn loại "Khác" thì mở khoá ô tên
```gherkin
Given tôi đang tạo một phiếu chi tiền mặt
When tôi chọn "Khác" ở ô Loại đối tượng
Then ô Đối tượng cho tôi gõ tự do
And ô đó không còn gọi tra cứu danh mục nữa
```

**AC-02** — Tên tự nhập được lưu và hiện lại đúng
```gherkin
Given tôi đã chọn loại "Khác" và gõ "Nguyễn Văn A" vào ô Đối tượng
When tôi lưu phiếu rồi mở lại phiếu đó
Then ô Đối tượng vẫn hiện "Nguyễn Văn A"
And phiếu được lưu với partner_type = OTHER và partner_id rỗng
```

**AC-03** — Lưới danh sách hiện tên tự nhập
```gherkin
Given tôi vừa lưu một phiếu chi có đối tượng tự nhập "Nguyễn Văn A"
When tôi xem lưới Thu chi tiền mặt
Then cột Đối tượng của dòng đó hiện "Nguyễn Văn A", không để trống
```

**AC-04** — Hộp thoại Chọn đối tượng có mục "Khác"
```gherkin
Given tôi mở hộp thoại Chọn đối tượng từ một phiếu thu
When tôi mở ô Loại đối tượng
Then danh sách có mục "Khác" bên cạnh Nhà cung cấp, Khách hàng, Nhân viên
And chọn "Khác" thì hộp thoại không tra cứu mà trả tôi về ô nhập tự do
```

**AC-05** — Đổi từ "Khác" sang một loại có thật thì xoá tên tự nhập
```gherkin
Given tôi đã gõ "Nguyễn Văn A" ở loại "Khác"
When tôi đổi ô Loại đối tượng sang "Khách hàng"
Then ô Đối tượng trống trở lại và tra cứu danh mục như cũ
And phiếu không giữ lẫn lộn vừa tên tự nhập vừa partner_id
```

**AC-06** — Áp dụng cho cả bốn loại phiếu
```gherkin
Given chứng từ là phiếu thu tiền mặt, chi tiền mặt, thu tiền gửi, hoặc chi tiền gửi
When tôi chọn loại đối tượng "Khác" và gõ tên
Then hành vi giống hệt nhau ở cả bốn, kể cả nhãn "Đối tượng nộp" hay "Đối tượng nhận"
```

## US-02 — Không phải gõ lý do hai lần

Là người nhập liệu, tôi muốn Lý do thu/chi tự chảy xuống dòng Diễn giải đầu tiên,
để không phải gõ lại cùng một câu.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-07** — Tự điền khi dòng 1 còn trống
```gherkin
Given tôi đang tạo một phiếu chi và ô Diễn giải dòng 1 đang trống
When tôi gõ "Chi tiền điện tháng 8" vào ô Lý do chi rồi rời khỏi ô đó
Then ô Diễn giải dòng 1 hiện "Chi tiền điện tháng 8"
And lưu phiếu thì dòng 1 mang đúng nội dung đó
```

**AC-08** — Không đè lên chữ đã gõ tay
```gherkin
Given tôi đã tự gõ "Tiền điện chi nhánh HCM" vào ô Diễn giải dòng 1
When tôi gõ hoặc sửa ô Lý do chi
Then ô Diễn giải dòng 1 giữ nguyên "Tiền điện chi nhánh HCM"
```

**AC-09** — Áp dụng cho cả bốn loại phiếu
```gherkin
Given chứng từ là một trong bốn loại phiếu quỹ
When tôi gõ Lý do thu hoặc Lý do chi và dòng 1 còn trống
Then dòng 1 được điền theo, giống nhau ở cả bốn
```

## US-03 — Sửa phiếu đã ghi sổ

Là kế toán quỹ, tôi muốn sửa một phiếu đã ghi sổ và giữ nguyên số phiếu,
để một lần gõ nhầm không để lại hai dòng trên sổ quỹ.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-10** — Nút Sửa mở được trên phiếu đã ghi sổ
```gherkin
Given tôi chọn một phiếu thu tiền mặt do người dùng tạo, trạng thái đã ghi sổ
When tôi nhìn thanh công cụ
Then nút "Sửa" bấm được, không còn tooltip "Chỉ sửa phiếu nháp"
And bấm vào thì hộp thoại mở ở chế độ sửa với đúng dữ liệu phiếu đó
```

**AC-11** — Sửa số tiền thì số dư quỹ khớp số mới, số phiếu không đổi
```gherkin
Given phiếu thu PT có số tiền 5.000.000 đã ghi sổ và quỹ đang có số dư B
When tôi sửa số tiền thành 4.000.000 rồi lưu
Then phiếu vẫn mang đúng số phiếu PT cũ
And số dư quỹ bằng B trừ 1.000.000
```

**AC-12** — Chênh lệch đi bằng bút toán mới, không sửa bút toán cũ
```gherkin
Given tôi vừa sửa một phiếu đã ghi sổ
When tôi mở Sổ chi tiết tiền mặt của kỳ đó
Then bút toán gốc còn nguyên, không dòng journal_entries hay cash_movements nào bị sửa hay xoá
And có thêm đúng một chứng từ điều chỉnh mang phần chênh lệch
```

**AC-13** — Phiếu do máy sinh thì không sửa được
```gherkin
Given tôi chọn một phiếu thu sinh từ bán hàng POS hoặc từ thu nợ khách hàng
When tôi nhìn thanh công cụ
Then nút "Sửa" không bấm được và nêu rõ lý do là phiếu tự sinh
And nếu gọi thẳng API sửa thì bị từ chối
```

**AC-14** — Sửa tăng vượt số dư quỹ không cho âm thì bị chặn
```gherkin
Given quỹ tiền mặt có allow_negative = false và số dư 1.000.000
And có một phiếu chi 500.000 đã ghi sổ
When tôi sửa phiếu chi đó lên 2.000.000
Then thao tác bị từ chối với thông báo quỹ không đủ tiền
And số dư quỹ và phiếu đều không đổi
```

**AC-15** — Không đổi được ngày sang kỳ đã khoá sổ
```gherkin
Given kỳ tháng 7 của tài khoản tiền gửi đã khoá sổ
When tôi sửa một phiếu chi tiền gửi và đổi ngày chứng từ về tháng 7
Then thao tác bị từ chối và nêu rõ kỳ đã khoá
```

**AC-16** — Hai người sửa cùng lúc thì một bên phải thua
```gherkin
Given hai phiên cùng mở một phiếu đã ghi sổ để sửa
When cả hai bấm lưu
Then đúng một bên thành công
And bên còn lại nhận lỗi yêu cầu tải lại phiếu, không ghi đè âm thầm
```

## US-04 — Xoá phiếu đã ghi sổ

Là kế toán quỹ, tôi muốn xoá hẳn một phiếu nhập nhầm,
để nó không còn nằm trên sổ quỹ.

**Priority:** must
**Depends on:** US-03

### Acceptance criteria

**AC-17** — Xoá thì quỹ trở về như chưa từng có phiếu
```gherkin
Given quỹ có số dư B trước khi tôi tạo phiếu thu 3.000.000
And phiếu đó đã ghi sổ nên số dư đang là B cộng 3.000.000
When tôi xoá phiếu đó
Then số dư quỹ trở lại đúng B
And không dòng ledger cũ nào bị xoá — phần đảo là các dòng mới
```

**AC-18** — Phiếu đã xoá biến khỏi lưới nhưng không mất khỏi cơ sở dữ liệu
```gherkin
Given tôi vừa xoá một phiếu chi
When tôi tải lại lưới Thu chi tiền mặt
Then phiếu đó không còn trong danh sách
And bản ghi vẫn còn với dấu đã xoá mềm, kèm người xoá và thời điểm xoá
```

**AC-19** — Phiếu do máy sinh thì không xoá được
```gherkin
Given tôi chọn một phiếu chi sinh từ trả nợ nhà cung cấp
When tôi nhìn thanh công cụ
Then nút "Xóa" không bấm được
And nếu gọi thẳng API xoá thì bị từ chối
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Toàn vẹn kế toán | Sau mỗi lần sửa và mỗi lần xoá, tổng phát sinh trên `cash_movements` của phiếu bằng đúng tổng tiền hiện tại của phiếu (0 nếu đã xoá) | T-03-06 |
| Toàn vẹn kế toán | Không câu lệnh nào UPDATE hay DELETE một dòng `journal_entries` / `cash_movements` / `deposit_movements` đã ghi sổ | T-03-06 |
| Phân quyền | Sửa và xoá dùng đúng permission đã seed, không thêm key mới, không nới vai trò nào | T-03-07 |
| Đa chi nhánh | Mọi truy vấn sửa/xoá lọc theo `organizationId` và `branchId` của actor; không sửa được phiếu chi nhánh khác | T-03-07 |
