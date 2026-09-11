---
feature: report-multi-location-column
stories: 3
acceptance_criteria: 13
---

# Requirements — Cột "Vị trí" liệt kê đủ mọi kho–vị trí

## US-01 — Nhân viên kho đọc đủ vị trí trên báo cáo Tổng hợp nhập xuất tồn kho

Là nhân viên kho, tôi muốn thấy **mọi** kho–vị trí mà một mặt hàng đang nằm,
để không đi tới một kệ rồi phát hiện hàng nằm ở kho lưu trữ khác.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Hai kho lưu trữ, hai kệ
```gherkin
Given mặt hàng A có kệ ưu tiên A101 ở kho lưu trữ mã "A1" và kệ ưu tiên A201 ở kho lưu trữ mã "A2"
  And cả hai kho đều đang hoạt động và thuộc chi nhánh đang xem
When tôi mở báo cáo Tổng hợp nhập xuất tồn kho ở chế độ một chi nhánh
Then ô "Mã vị trí" của mặt hàng A hiển thị "A1-A101, A2-A201"
  And ô "Tên vị trí" hiển thị "<tên kho A1>-<tên kệ A101>, <tên kho A2>-<tên kệ A201>"
```

**AC-02** — Một kệ duy nhất vẫn được gắn tiền tố kho
```gherkin
Given mặt hàng B chỉ nằm trên đúng một kệ A101 thuộc kho lưu trữ mã "A1"
When tôi mở báo cáo
Then ô "Mã vị trí" hiển thị "A1-A101"
```
> Đây là **thay đổi hành vi cũ**: hôm nay ô đó hiển thị "A101" không kèm kho.
> Cố ý, theo A-03.

**AC-03** — Hợp của kệ ưu tiên và kệ đang có tồn
```gherkin
Given mặt hàng C có kệ ưu tiên A101 với tồn 0
  And mặt hàng C còn tồn 5 trên kệ B202 thuộc một kho lưu trữ khác
When tôi mở báo cáo
Then ô "Mã vị trí" chứa cả cặp của A101 lẫn cặp của B202
```

**AC-04** — Cặp "Ngừng theo dõi" bị loại, các cặp còn lại giữ nguyên
```gherkin
Given mặt hàng D nằm trên kệ A101 và kệ A201
  And cặp (D, A101) được đánh dấu Ngừng theo dõi
When tôi mở báo cáo
Then ô "Mã vị trí" chỉ chứa cặp của A201
  And mặt hàng D vẫn xuất hiện trên báo cáo
```

**AC-05** — Chỉ nằm ở showroom
```gherkin
Given mặt hàng E không nằm trên kệ của bất kỳ kho lưu trữ nào
  And mặt hàng E còn tồn trên kệ của showroom
When tôi mở báo cáo Tổng hợp nhập xuất tồn kho
Then ô "Mã vị trí" hiển thị cặp kho–vị trí của kệ showroom đó
```

**AC-06** — Thứ tự tất định
```gherkin
Given mặt hàng F nằm trên nhiều kệ ở nhiều kho lưu trữ
When tôi tải báo cáo hai lần với cùng bộ lọc
Then chuỗi trong ô "Mã vị trí" giống hệt nhau ở cả hai lần
  And các cặp được sắp theo mã kho, rồi tới mã vị trí
```

## US-02 — Cột vị trí nhất quán ở các báo cáo doanh thu và lợi nhuận

Là kế toán, tôi muốn cột "Vị trí" ở báo cáo doanh thu/lợi nhuận đọc giống hệt báo cáo tồn,
để không phải nhớ báo cáo nào hiển thị kiểu gì.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-07** — Ba báo cáo còn lại cùng định dạng
```gherkin
Given mặt hàng A nằm trên hai kệ ở hai kho lưu trữ khác nhau
When tôi mở "Chi tiết doanh thu theo mặt hàng", "Doanh thu theo mặt hàng" và "Lợi nhuận theo mặt hàng"
Then cột vị trí ở cả ba báo cáo hiển thị cùng chuỗi "A1-A101, A2-A201"
```

**AC-08** — Ba báo cáo này không lẫn kệ showroom
```gherkin
Given mặt hàng E không nằm trên kệ kho lưu trữ nào và chỉ còn tồn ở showroom
When tôi mở ba báo cáo doanh thu/lợi nhuận
Then ô vị trí của mặt hàng E để trống
```
> Giữ nguyên khác biệt cố ý giữa các báo cáo — lý do ở `item-warehouse-location.util.ts:39-45`.

**AC-13** — Cột vị trí ở ba báo cáo này đủ rộng cho trường hợp thường gặp
```gherkin
Given mặt hàng A nằm trên hai kệ ở hai kho lưu trữ
When tôi xem "Chi tiết doanh thu theo mặt hàng", "Doanh thu theo mặt hàng" và "Lợi nhuận theo mặt hàng" trên khung nhìn desktop 1440x900
Then ô vị trí ở cả ba báo cáo hiển thị trọn chuỗi "A1-A101, A2-A201" mà không bị CSS cắt
```
> Bổ sung ngày 2026-09-10 khi mở lại G1: kế hoạch ban đầu chỉ nới cột ở Tổng hợp nhập xuất
> tồn kho (AC-12), trong khi A-02 ("không giới hạn, chỉ nới rộng cột") và A-04 ("cả 4 báo
> cáo") áp cho cả bốn báo cáo.

## US-03 — Không làm hỏng bộ lọc và các chế độ xem sẵn có

Là support, tôi muốn mọi bộ lọc và chế độ xem của báo cáo hoạt động y như trước,
để việc sửa cột vị trí không kéo theo khiếu nại mới.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-09** — Dropdown "Kho" không đổi kết quả
```gherkin
Given tôi chọn một kho lưu trữ ở bộ lọc "Kho" của báo cáo Tổng hợp nhập xuất tồn kho
When báo cáo trả về
Then tập dòng và các số nhập/xuất/tồn giống hệt kết quả trước khi sửa
```

**AC-10** — Chế độ chuỗi và chọn nhiều cửa hàng giữ nguyên
```gherkin
Given tôi xem báo cáo ở chế độ chuỗi, hoặc chọn nhiều hơn một cửa hàng
When báo cáo trả về
Then hai cột vị trí bị loại khỏi danh mục cột (chế độ chuỗi), hoặc để trống (nhiều cửa hàng)
  And không có truy vấn tra vị trí nào được thực hiện
```

**AC-11** — Xuất Excel giữ đủ chuỗi
```gherkin
Given mặt hàng A nằm trên nhiều kệ
When tôi xuất báo cáo ra Excel
Then ô vị trí trong file chứa đầy đủ mọi cặp, không bị cắt
```

**AC-12** — Cột đủ rộng cho trường hợp thường gặp
```gherkin
Given mặt hàng A nằm trên hai kệ ở hai kho lưu trữ
When tôi xem báo cáo trên khung nhìn desktop 1440x900
Then ô "Mã vị trí" hiển thị trọn chuỗi mà không bị CSS cắt
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Hiệu năng | Việc tra vị trí vẫn giới hạn ở phạm vi một trang và không phát sinh thêm truy vấn ngoài 4 truy vấn hiện có mỗi lần tra | T-01-01 |
| Tương thích | `resolveItemWarehouseLocations` đổi kiểu trả về; cả 4 nơi gọi phải biên dịch được và có test | T-01-03 |
| Hồi quy | Quy tắc "Ngừng theo dõi" của `2026090401-untracked-location-hidden` vẫn đúng ở dạng nhiều cặp | T-01-02 |
