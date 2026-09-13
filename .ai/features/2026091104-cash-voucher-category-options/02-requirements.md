---
feature: cash-voucher-category-options
stories: 3
acceptance_criteria: 8
---

# Requirements — cash-voucher-category-options

## US-01 — Org đang dùng có đủ mục mới sau khi deploy

Là kế toán của một cửa hàng đang dùng hệ thống, tôi muốn thấy các mục chi mới mà không phải tự tạo từng mục,
để phân loại phiếu chi ngay sau khi cập nhật.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Bổ sung mục thiếu
```gherkin
Given org có đúng bộ mục mặc định cũ: 9 mục thu, 20 mục chi
When migration BackfillCashVoucherCategoryOptions chạy
Then org có 9 mục thu và 34 mục chi
And 14 mục chi mới trong bảng "Danh sách đích" có loại OUT, đang hoạt động, đúng display_order
```

**AC-02** — Đổi tên khi tên còn mặc định
```gherkin
Given CHI_TIEN_NUOC tên "Tiền nước" và CHI_CCDC tên "Công cụ dụng cụ"
When migration chạy
Then CHI_TIEN_NUOC tên "Tiền nước sinh hoạt" và CHI_CCDC tên "Mua đồ dùng, công cụ, dụng cụ"
And id và mã của hai dòng không đổi, nên dòng phiếu đã gắn hai mục này hiển thị tên mới
```

**AC-03** — Không đè chỉnh sửa của org
```gherkin
Given org đã đổi tên CHI_TIEN_NUOC thành "Nước máy" và đổi display_order của CHI_LUONG thành 99
When migration chạy
Then CHI_TIEN_NUOC vẫn tên "Nước máy" và CHI_LUONG vẫn display_order 99
```

**AC-04** — Không trùng, không hồi sinh, chạy lại không đổi gì
```gherkin
Given org đã xoá mềm CHI_TIEP_KHACH và tự tạo mục chi "Tiền vận chuyển" mã VC01
When migration chạy hai lần
Then CHI_TIEP_KHACH vẫn đã xoá mềm
And org không có mục mã CHI_TIEN_VAN_CHUYEN
And lần chạy thứ hai không thêm, sửa hay xoá dòng nào
```

**AC-05** — Lấp mục mặc định thiếu từ trước
```gherkin
Given org có các mục mặc định cũ nhưng không có BANK_FEE
When migration chạy
Then org có BANK_FEE "Phí ngân hàng", loại OUT, display_order 43
```

## US-02 — Dropdown theo thứ tự ảnh

Là kế toán, tôi muốn mục mới nằm cạnh các mục cùng nhóm, để tìm nhanh trong danh sách 34 mục.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-06** — Thứ tự dropdown ở 4 loại phiếu
```gherkin
Given org đã chạy migration
When tôi mở dropdown mục chi trên dòng chi tiết của Phiếu chi tiền mặt
Then 34 mục hiện theo thứ tự bên dưới
And Phiếu chi tiền gửi hiện cùng thứ tự
And dropdown mục thu của Phiếu thu tiền mặt và Phiếu thu tiền gửi hiện: Thu từ bán hàng, Thu khác, Thu thanh lý tài sản, Thu từ bán phế liệu, Thu hoàn ứng, Thu từ cửa hàng khác chuyển đến, Thu nhận tiền mặt về nhập quỹ, Thu nhận tiền gửi vào ngân hàng, Thu nợ khách hàng
```

Thứ tự mục chi: 1 Tiền điện · 2 Tiền điện thoại · 3 Tiền internet · 4 Tiền nước sinh hoạt · 5 Tiền thuê cửa hàng ·
6 Tiền vận chuyển · 7 Mua dụng cụ sửa dép · 8 Tiền lương · 9 Tiền thưởng · 10 Tiền phụ cấp · 11 Ứng lương ·
12 Mua đồ dùng, công cụ, dụng cụ · 13 Tài sản cố định · 14 Mua máy móc thiết bị · 15 Chi khác · 16 Chi tiếp khách ·
17 Mua văn phòng phẩm · 18 Chi tạm ứng · 19 Thuê mướn khác · 20 Chi vệ sinh môi trường · 21 Chi lý do khác ·
22 Chi mua hàng hóa · 23 Chi chuyển tiền sang cửa hàng khác · 24 Rút tiền gửi về nhập quỹ · 25 Chi gửi tiền vào ngân hàng ·
26 Chi ăn uống · 27 Mua xăng dầu nhớt · 28 Nạp VETC · 29 Làm Hàng · 30 Đồ dùng vệ sinh · 31 Tiền ăn · 32 Tiền nước uống ·
33 Chi trả nợ nhà cung cấp · 34 Phí ngân hàng.

## US-03 — Org tạo mới nhận cùng danh sách

Là người tạo tổ chức mới, tôi muốn có sẵn đúng danh sách mục thu/chi như org đang dùng.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-07** — Org mới bằng org cũ sau migration
```gherkin
Given một org chưa có mục nào
When seedForOrganization chạy (tạo tổ chức hoặc đăng ký)
Then org có 43 mục với code, name, direction, display_order bằng DEFAULT_CASH_VOUCHER_CATEGORIES
And một org có bộ mục cũ, sau migration, cho đúng cùng tập (code, name, direction, display_order)
```

**AC-08** — Mã hệ thống giữ nguyên
```gherkin
Given danh sách mặc định mới
Then vẫn chứa THU_KHAC, THU_NO_KH, CHI_KHAC, CHI_MUA_HANG, CHI_NO_NCC, BANK_FEE
And mọi mã không trùng và dài tối đa 32 ký tự
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| An toàn dữ liệu | Migration không xoá dòng nào; mọi UPDATE có điều kiện giá trị mặc định cũ; lỗi giữa chừng rollback cả migration | T-01-02 |
| Tương thích | Không đổi schema, không đổi API, không regenerate api-client | T-01-03 |
