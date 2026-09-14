---
feature: treasury-voucher-staff-date-autocomplete
stories: 3
acceptance_criteria: 18
---

# Requirements — Phiếu thu/chi: nhân viên trên bản in, Ngày thu/chi trên danh sách; tắt autocomplete backoffice

## US-01 — In / Xuất phiếu thu, phiếu chi ghi rõ nhân viên và người lập

Là kế toán hoặc thủ quỹ, tôi muốn bản in và file Excel của phiếu thu / phiếu chi có nhân viên thu/chi và tên
người lập phiếu in sẵn, để không phải viết tay và biết ai là người thu/chi tiền.

**Priority:** must
**Depends on:** —

Áp dụng cho cả 4 loại phiếu quỹ: phiếu thu tiền mặt, phiếu chi tiền mặt, phiếu thu tiền gửi, phiếu chi tiền gửi
(A-04). "Nhân viên thu/chi" là `staff_id` ở phiếu tiền mặt, `collected_by` / `paid_by` ở phiếu tiền gửi.

### Acceptance criteria

**AC-01** — Phiếu chi tiền mặt có nhân viên chi
```gherkin
Given một phiếu chi tiền mặt có Nhân viên chi là "Nguyễn Văn A", quỹ "Quỹ tiền mặt - KHO SG", lý do "Tiền ăn"
When tôi bấm In trên dialog phiếu
Then khối thông tin có dòng "Nhân viên chi: Nguyễn Văn A" nằm ngay trước dòng "Lý do"
And không có dòng nào mang nhãn "Quỹ tiền mặt"
```

**AC-02** — Phiếu thu tiền mặt có nhân viên thu
```gherkin
Given một phiếu thu tiền mặt có Nhân viên thu là "Nguyễn Văn A"
When tôi bấm In
Then khối thông tin có dòng "Nhân viên thu: Nguyễn Văn A" nằm ngay trước dòng "Lý do"
And không có dòng nào mang nhãn "Quỹ tiền mặt"
```

**AC-03** — Phiếu thu / chi tiền gửi
```gherkin
Given một phiếu thu tiền gửi có Nhân viên thu "Nguyễn Văn A" và Tham chiếu "FT2609"
And một phiếu chi tiền gửi có Nhân viên chi "Nguyễn Văn A"
When tôi bấm In trên từng phiếu
Then phiếu thu có dòng "Nhân viên thu: Nguyễn Văn A", phiếu chi có dòng "Nhân viên chi: Nguyễn Văn A"
And không phiếu nào có dòng mang nhãn "Tài khoản ngân hàng"
And phiếu thu vẫn có dòng "Tham chiếu: FT2609"
```

**AC-04** — Phiếu không có nhân viên thu/chi
```gherkin
Given một phiếu thu tiền mặt không chọn Nhân viên thu
When tôi bấm In
Then khối thông tin không có dòng "Nhân viên thu", kể cả dòng nhãn rỗng
```

**AC-05** — Cột ký đầu tiên mang nhãn Nhân viên thu/chi, không in sẵn tên
```gherkin
Given một phiếu (bất kỳ loại nào trong 4 loại) có nhân viên thu/chi "Nguyễn Văn A" và do tài khoản "Trần Thị B" tạo
When tôi bấm In
Then cột ký đầu tiên mang nhãn "Nhân viên thu" trên phiếu thu, "Nhân viên chi" trên phiếu chi (A-16)
And không cột ký nào mang nhãn "Người lập phiếu"
And không cột ký nào in sẵn tên dưới "(Ký, họ tên)" — "Nguyễn Văn A" chỉ xuất hiện ở dòng "Nhân viên chi" (A-17)
```

**AC-06** — Tên người tạo phiếu không lên bản in
```gherkin
Given một phiếu không có nhân viên thu/chi, do tài khoản "Trần Thị B" tạo
When tôi bấm In hoặc Xuất khẩu
Then "Trần Thị B" không xuất hiện ở đâu trên bản in / file
And khối thông tin không có dòng Nhân viên thu/chi
```

**AC-07** — Nhân viên thu/chi không xác định được
```gherkin
Given một phiếu có nhân viên thu/chi không tìm được trong tổ chức của tôi (user bị xoá, id lạc org)
When tôi bấm In hoặc Xuất khẩu
Then bản in / file vẫn tạo được
And khối thông tin không có dòng Nhân viên thu/chi
```

**AC-08** — Xuất khẩu Excel khớp bản in
```gherkin
Given phiếu ở AC-01
When tôi bấm Xuất khẩu trên dialog phiếu
Then sheet có dòng "Nhân viên chi: Nguyễn Văn A" và không có dòng "Quỹ tiền mặt"
And khối chữ ký bắt đầu bằng ô "Nhân viên chi", không có ô "Người lập phiếu"
And sheet kết thúc ở hàng "(Ký, họ tên)" — không có hàng tên nào bên dưới, và "Nguyễn Văn A" chỉ có trong dòng thông tin
```

**AC-09** — Phiếu kho không đổi
```gherkin
Given một phiếu nhập kho, một phiếu xuất kho, một phiếu chuyển kho và một lệnh chuyển kho
When tôi In và Xuất khẩu từng phiếu
Then khối thông tin giống hệt trước thay đổi
And khối chữ ký không in tên nào
```

## US-02 — Danh sách Thu, chi tiền mặt theo Ngày thu/chi

Là kế toán đối chiếu quỹ, tôi muốn danh sách Thu, chi tiền mặt hiển thị, lọc và sắp theo ngày thu/chi trên chứng
từ, để phiếu lập lùi ngày nằm đúng kỳ của nó.

**Priority:** must
**Depends on:** —

Dùng chung hai phiếu mẫu: **X** có ngày chi 06/09/2026, tạo ngày 13/09/2026; **Y** có ngày thu 31/08/2026, tạo
ngày 01/09/2026. Cả hai cùng quỹ, cùng chi nhánh.

### Acceptance criteria

**AC-10** — Cột Ngày thu/chi
```gherkin
Given phiếu X
When tôi mở Quỹ tiền > Tiền mặt > Thu, chi tiền mặt
Then cột đầu tiên có tiêu đề "Ngày thu/chi" thay cho "Ngày tạo"
And dòng của X hiện "06/09/2026"
```

**AC-11** — Bộ lọc kỳ theo ngày thu/chi
```gherkin
Given phiếu X và phiếu Y
When tôi chọn Từ ngày 01/09/2026, Đến ngày 30/09/2026 và bấm Lấy dữ liệu
Then X có trong danh sách, Y không có
And số kết quả và Tổng tiền dưới lưới chỉ tính các phiếu có ngày thu/chi trong kỳ
```

**AC-12** — Bộ lọc cột Ngày thu/chi
```gherkin
Given phiếu X
When tôi lọc cột Ngày thu/chi từ 06/09/2026 đến 06/09/2026
Then X có trong danh sách
When tôi lọc cột Ngày thu/chi từ 13/09/2026 đến 13/09/2026
Then X không có trong danh sách
```

**AC-13** — Sắp xếp theo ngày thu/chi
```gherkin
Given ba phiếu cùng kỳ: ngày chi 06/09 tạo 13/09, ngày chi 10/09 tạo 10/09, và ngày chi 10/09 tạo 11/09
When tôi mở danh sách
Then thứ tự là: ngày 10/09 tạo 11/09, ngày 10/09 tạo 10/09, ngày 06/09 tạo 13/09
```

**AC-14** — Xuất khẩu danh sách
```gherkin
Given danh sách đang lọc kỳ 01/09/2026–30/09/2026
When tôi bấm Xuất khẩu trên thanh lọc
Then file có cột "Ngày thu/chi" mang ngày chứng từ và không có cột "Ngày tạo"
And file có đúng các phiếu mà lưới hiển thị với cùng bộ lọc, cùng thứ tự
```

## US-03 — Tắt gợi ý tự động của trình duyệt trên backoffice

Là người nhập chứng từ trên backoffice, tôi muốn trình duyệt không chèn dropdown lịch sử nhập lên ô nhập, để bảng
gợi ý của ứng dụng không bị che.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-15** — Ô Đối tượng ở phiếu chuyển kho
```gherkin
Given tôi mở Thêm mới phiếu chuyển kho
When tôi focus ô Đối tượng
Then phần tử input của ô mang autocomplete="off"
And Chrome không hiện dropdown giá trị đã nhập trước đó, chỉ bảng gợi ý của ứng dụng hiện
```

**AC-16** — Các ô trong ảnh 6 và 7
```gherkin
Given phiếu xuất kho và phiếu chuyển kho
When tôi focus ô "Chọn cửa hàng đích", ô "Tên đối tượng" và ô "Tìm mã/tên" ở dòng chi tiết
Then phần tử input của từng ô mang autocomplete="off"
```

**AC-17** — Mặc định cho toàn backoffice
```gherkin
Given một ô nhập dạng text, search, number, tel hoặc email trong apps/backoffice-web
And ô đó render qua Input, TagsInput hoặc MultiSelectChips của @erp/ui, hoặc là thẻ <input> viết tay
And nơi dùng không truyền autoComplete
When ô được render
Then phần tử input mang autocomplete="off"
```

**AC-18** — Ô đăng nhập và đổi mật khẩu giữ nguyên
```gherkin
Given trang đăng nhập backoffice và dialog đổi mật khẩu
When các ô được render
Then ô tổ chức, email, mật khẩu giữ autocomplete "organization", "username", "current-password"
And các ô của dialog đổi mật khẩu giữ "current-password" và "new-password"
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Tương thích | Payload in của 4 loại phiếu kho không đổi, không mapper kho nào phải sửa | AC-09 |
| Hiệu năng | In phiếu tiền mặt thêm tối đa một lượt tra `users` (nhân viên thu/chi); phiếu tiền gửi không thêm truy vấn — tên đã có từ `getById` | ADR-08 |
