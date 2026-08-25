# Requirements — sales-report-km-and-drilldown

Kỳ tham chiếu cho mọi con số: **01–31/08/2026, chi nhánh HCM, trạng thái mặc định** (xem
[[01-assumptions]] để biết cách đo).

## US-01 — Kế toán muốn cột Khuyến mại của bốn báo cáo bán hàng khớp nhau

Để đối chiếu chéo giữa báo cáo tổng hợp và báo cáo chi tiết mà không phải giải thích chênh lệch.

**AC-01** — Khuyến mại của báo cáo theo hoá đơn trừ phần hoàn lại trên hoá đơn EXCHANGE
```gherkin
Given kỳ 01–31/08/2026 có hai hoá đơn EXCHANGE ngày 19/08, mỗi hoá đơn mang một dòng IN
  với promotion_discount = 150.000 và header discount_amount = 0
When mở "Tổng hợp bán hàng theo ngày" hoặc "Bảng kê hóa đơn và đơn hàng" cho kỳ đó
Then dòng tổng cột "Khuyến mại" bằng 8.914.000, không phải 9.214.000
And dòng ngày 19/08/2026 mang giá trị Khuyến mại âm 300.000
```

**AC-02** — Bốn báo cáo cho cùng tổng Khuyến mại
```gherkin
Given cùng một kỳ và cùng phạm vi chi nhánh
When lấy dòng tổng cột "Khuyến mại" của daily-sales-summary, invoice-order-listing,
  revenue-by-item và invoice-item-revenue-detail
Then cả bốn đều bằng 8.914.000
```

**AC-03** — Điểm KM có số thật ở grain mặt hàng
```gherkin
Given kỳ tham chiếu có ba hoá đơn dùng điểm (13/08: 500.000, 14/08: 50.000, 15/08: 100.000)
When mở "Doanh thu theo mặt hàng" cho kỳ đó
Then dòng tổng cột "Điểm KM" bằng 650.000, không phải 0
And bằng đúng dòng tổng cột "Điểm KM" của "Tổng hợp bán hàng theo ngày"
```

**AC-04** — Tỷ lệ KM (%) khớp chú thích trên chính header của nó
```gherkin
Given cột "Tỷ lệ KM (%)" mang annotation "(5)=((4)+(9))/(3)"
When báo cáo tính giá trị cột đó
Then giá trị bằng (Khuyến mại + Điểm KM) / Tiền hàng × 100
And không phải Khuyến mại / Tiền hàng × 100 như hiện tại
```

**AC-05** — Hoá đơn SALE không đổi số
```gherkin
Given một kỳ chỉ chứa hoá đơn SALE
When chạy cả bốn báo cáo trước và sau thay đổi
Then cột "Khuyến mại" giữ nguyên từng đồng
```

## US-02 — Người xem báo cáo ngày muốn mở bảng kê hoá đơn của một ngày

**AC-06** — Ô Ngày mở dialog bảng kê
```gherkin
Given đang ở "Tổng hợp bán hàng theo ngày" với ít nhất một dòng
When click vào ô cột "Ngày" của một dòng
Then mở dialog tiêu đề "BẢNG KÊ HÓA ĐƠN", phụ đề "Ngày dd/MM/yyyy" đúng ngày vừa click
And bảng liệt kê một dòng cho mỗi hoá đơn của đúng ngày đó
And có dòng filter theo cột và dòng tổng ở chân bảng
```

**AC-07** — Dialog thừa hưởng đúng phạm vi của báo cáo cha
```gherkin
Given báo cáo cha đang lọc theo một nhóm cửa hàng
When mở dialog bảng kê từ một dòng ngày
Then dialog dùng đúng phạm vi cửa hàng đó
And dòng tổng của dialog khớp các cột tương ứng của dòng vừa click
```

**AC-08** — Drill-down lồng: mã hoá đơn trong dialog vẫn mở được chi tiết
```gherkin
Given dialog bảng kê đang mở
When click một mã hoá đơn trong dialog
Then dialog chi tiết hoá đơn mở chồng lên trên
And đóng nó trả về dialog bảng kê, không đóng luôn cả hai
```

**AC-09** — In và Xuất khẩu trong dialog chạy trên đúng dữ liệu của dialog
```gherkin
Given dialog bảng kê của ngày 19/08/2026 đang mở
When bấm "Xuất khẩu"
Then file tải về chỉ chứa hoá đơn của ngày 19/08/2026
And chỉ chứa những cột đang hiển thị trong dialog
```

## US-03 — Người xem doanh thu theo mặt hàng muốn mở chi tiết theo hoá đơn của một SKU

**AC-10** — Ô Tên hàng hoá mở dialog chi tiết
```gherkin
Given đang ở "Doanh thu theo mặt hàng" ở grain mặt hàng
When click vào ô cột "Tên hàng hoá" của một dòng
Then mở dialog tiêu đề "CHI TIẾT DOANH THU MẶT HÀNG THEO HÓA ĐƠN"
And phụ đề mang "Mã SKU <sku> Từ <từ ngày> đến <đến ngày>" của báo cáo cha
And bảng chỉ chứa dòng của đúng SKU đó
And dòng tổng của dialog khớp dòng vừa click
```

**AC-11** — Lọc SKU chạy trong SQL, không lọc sau khi nạp
```gherkin
Given filters.sku được gửi lên
When invoice-item-revenue-detail xây dữ liệu
Then điều kiện itemCode nằm trong mệnh đề where của truy vấn dòng hàng
And không phải một phép lọc mảng sau khi đã nạp toàn bộ dòng hàng trong kỳ
```

**AC-12** — Không click được khi drill-down sẽ cho số sai
```gherkin
Given "Thống kê theo" đặt là Mẫu mã, Nhóm hàng hoặc Nhãn hiệu
When xem cột "Tên hàng hoá"
Then ô không phải link và click không mở gì
Given "Phân bổ doanh thu combo" đang bật
Then ô cũng không phải link
```

## US-04 — Không hồi quy phần drill-down sẵn có

**AC-13** — Mã hoá đơn vẫn click được ở nơi vốn click được
```gherkin
Given đang ở "Bảng kê hóa đơn và đơn hàng" hoặc "Chi tiết doanh thu theo hóa đơn và mặt hàng"
When click một mã hoá đơn
Then dialog chi tiết hoá đơn mở như trước
```

**AC-14** — Cột Ngày chỉ click được ở đúng một báo cáo
```gherkin
Given đang ở "Bảng kê hóa đơn và đơn hàng" (cũng có cột "Ngày")
When xem ô cột "Ngày"
Then ô là text thường, không phải link
```

**AC-15** — Cột có link không còn mất định dạng số
```gherkin
Given một cột số mà backend trả link = true
When bảng render ô đó
Then giá trị vẫn đi qua formatReportNumber
And không rơi về chuỗi thô như hiện tại
```
