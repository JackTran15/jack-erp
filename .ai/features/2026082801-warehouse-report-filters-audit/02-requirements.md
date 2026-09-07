---
feature: warehouse-report-filters-audit
stories: 5
acceptance_criteria: 14
---

# Requirements — Bộ lọc nhóm Báo cáo > Kho

## US-01 — Lọc theo nhóm hàng cha

Là nhân viên kho, tôi muốn chọn một nhóm hàng cha ở nhóm Báo cáo > Kho và thấy hàng của mọi
nhóm con bên dưới nó, để không phải chọn lần lượt từng nhóm lá.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Nhóm cha gộp toàn bộ nhóm con
```gherkin
Given cây nhóm hàng có "GIÀY DÉP" với ba nhóm lá có dữ liệu trong kỳ: 49 + 3 + 1 dòng
And "GIÀY DÉP" không có mặt hàng gắn trực tiếp
When tôi lọc "Tổng hợp nhập xuất tồn kho" theo nhóm "GIÀY DÉP"
Then lưới trả về 53 dòng — đúng tổng của các nhóm lá
And không dòng nào thuộc nhóm ngoài cây "GIÀY DÉP"
```

**AC-02** — Nhóm lá giữ nguyên hành vi
```gherkin
Given tôi lọc theo nhóm lá "Giày nam"
When lưới tải xong
Then số dòng vẫn đúng bằng 49 như trước khi sửa
```

**AC-03** — Hậu duệ mọi cấp, không chỉ con trực tiếp
```gherkin
Given một nhóm ông "A" có nhóm con "B", và "B" có nhóm cháu "C" đang giữ mặt hàng
When tôi lọc theo nhóm "A"
Then lưới hiện các mặt hàng thuộc "C"
```

**AC-04** — Áp dụng cho mọi báo cáo kho có lọc nhóm
```gherkin
Given 7 báo cáo kho khai bộ lọc "Nhóm hàng hóa"
When tôi lọc từng báo cáo theo cùng một nhóm cha
Then không báo cáo nào trả 0 dòng trong khi các nhóm lá của nó có dữ liệu
```

## US-02 — Đổi báo cáo thì bộ lọc không thuộc báo cáo đó biến mất

Là người xem báo cáo, tôi muốn mọi bộ lọc đang có hiệu lực đều nhìn thấy được trên form, để
không bị một bộ lọc vô hình thu hẹp kết quả mà không có chỗ nào xoá.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-05** — Bộ lọc không có dòng trên form mới bị xoá
```gherkin
Given tôi đặt "Thương hiệu" = "Giay MT" ở "Số lượng tồn kho theo cửa hàng"
When tôi đổi sang "Tổng hợp nhập xuất tồn kho", báo cáo không có dòng "Thương hiệu"
Then số dòng bằng đúng lúc không lọc thương hiệu (56, không phải 1)
```

**AC-06** — Payload không mang bộ lọc đã bị xoá
```gherkin
Given tôi vừa đổi sang một báo cáo không khai dòng "Thương hiệu"
When trang gọi POST /reports/inventory/search
Then thân request không có khoá `brand`
```

**AC-07** — Bộ lọc dùng chung được giữ nguyên
```gherkin
Given tôi đặt "Nhóm hàng hóa" và kỳ báo cáo "Tháng này" ở "Tổng hợp nhập xuất tồn kho"
When tôi đổi sang "Chi tiết số lượng nhập xuất tồn kho", báo cáo cũng khai hai dòng đó
Then cả hai giá trị vẫn còn nguyên trên form
```

## US-03 — Ô lọc cột chỉ hiện ở cột lọc được

Là người xem báo cáo, tôi muốn ô lọc trên đầu cột hoặc lọc được, hoặc không hiện, để không gõ
vào một ô chỉ trả về lỗi.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-08** — Không còn 400 từ ô lọc cột ở hạt mặc định
```gherkin
Given 8 báo cáo kho ở hạt "Hàng hoá" (mặc định) và ở chế độ chuỗi
When tôi gửi một bộ lọc cột cho từng cột có ô nhập
Then không request nào trả HTTP 400 "không hỗ trợ lọc trên báo cáo này"
```

**AC-09** — Cột luôn rỗng thì không có ô lọc
```gherkin
Given cột "Mã chi nhánh" của "Bảng kê chi tiết phiếu nhập xuất kho" luôn trả về rỗng
When lưới vẽ dòng lọc ở đầu bảng
Then ô của cột đó trống, giống "Mã vị trí" ở "Tổng hợp nhập xuất tồn kho"
```

**AC-10** — Cột lọc được vẫn lọc đúng
```gherkin
Given một cột có dữ liệu và có ô lọc
When tôi lọc bằng một giá trị không tồn tại
Then lưới trả 0 dòng, chân trang trả tổng 0
```

## US-04 — Cache không trộn phạm vi chi nhánh giữa hai người dùng

Là quản trị, tôi muốn kết quả báo cáo phản ánh đúng chi nhánh người gọi được phân công, để
người chỉ quản một chi nhánh không đọc được số của chi nhánh khác qua cache.

**Priority:** should
**Depends on:** —

### Acceptance criteria

**AC-11** — Hai phạm vi chi nhánh không dùng chung ô cache
```gherkin
Given người dùng A quản 2 chi nhánh và người dùng B quản 1, cùng một tổ chức
And cả hai gửi cùng một request báo cáo không mang `store` trong payload
When B gọi ngay sau A, trong 45 giây cache còn hiệu lực
Then B nhận số của riêng chi nhánh mình, không phải bản cache của A
```

## US-05 — Lọc theo cột hoạt động ở mọi hạt "Thống kê theo"

Là người xem báo cáo, tôi muốn ô lọc cột ở hạt "Mẫu mã" và "Nhóm hàng hóa" hành xử như ở hạt
"Hàng hoá": cột nào có số thì lọc được, cột nào rỗng thì không hiện ô.

**Priority:** must
**Depends on:** US-03

### Acceptance criteria

**AC-12** — Không còn 400 ở hạt gộp
```gherkin
Given 8 báo cáo kho, lần lượt ở "Thống kê theo" = Mẫu mã và = Nhóm hàng hóa
When tôi gửi một bộ lọc cột cho từng cột còn ô nhập
Then không request nào trả HTTP 400
And test `column-filterability.spec.ts` không còn dùng `it.failing` cho hai hạt này
```

**AC-13** — Cột có dữ liệu ở hạt gộp thì lọc được thật
```gherkin
Given "Tổng hợp nhập xuất tồn kho" ở hạt "Mẫu mã", cột "Mã SKU" đang hiện mã sản phẩm cha
When tôi lọc cột đó bằng một giá trị không tồn tại
Then lưới trả 0 dòng — nghĩa là bộ lọc thật sự chạy, không phải bị bỏ qua
```

**AC-14** — Cột rỗng ở hạt gộp thì không có ô lọc
```gherkin
Given "Chi tiết số lượng nhập xuất tồn kho" ở hạt "Mẫu mã"
And các cột "Màu sắc", "Size", "Đơn vị tính", "Thương hiệu" đều rỗng ở hạt này
When lưới vẽ dòng lọc ở đầu bảng
Then ô của những cột đó trống, còn ở hạt "Hàng hoá" chúng vẫn có ô lọc
```
