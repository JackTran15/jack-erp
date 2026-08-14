---
feature: footer-grand-totals
stories: 6
acceptance_criteria: 22
---

# Requirements — Footer tổng toàn tập kết quả

Quy ước chung cho mọi AC dưới đây:

- "tổng toàn tập" = tổng trên **mọi dòng khớp bộ lọc hiện hành**, không phụ thuộc `page`/`limit`.
- "bộ lọc hiện hành" = bộ lọc chính (kỳ, chi nhánh, kho...) **và** lọc-theo-cột đang bật.
- Footer và lưới phải sinh ra từ **cùng một** hàm dựng truy vấn; không chấp nhận hai đường dựng
  `WHERE` song song.

---

## US-01 — Footer đúng trên 3 phiếu kho

Là kế toán kho, tôi muốn dòng Tổng tiền ở Nhập kho / Xuất kho / Chuyển kho là tổng của toàn bộ
phiếu khớp bộ lọc, để chép thẳng vào báo cáo mà không phải cộng tay từng trang.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Tổng không đổi theo phân trang
```gherkin
Given tôi ở màn hình Nhập kho với một bộ lọc cho ra nhiều hơn một trang
When tôi đổi số dòng/trang từ 20 sang 50, rồi chuyển sang trang 2
Then giá trị footer "Tổng tiền" giữ nguyên ở cả ba lần
```

**AC-02** — Tổng phản ứng với bộ lọc
```gherkin
Given tôi ở màn hình Nhập kho
When tôi đặt filter cột "Tổng tiền ≤ X" cho ra tập kết quả nhỏ hơn
Then footer giảm xuống đúng tổng của tập đã lọc
And số dòng trên pager cũng đổi theo cùng bộ lọc đó
```

**AC-03** — Bất biến limit (kiểm chứng bằng unit test)
```gherkin
Given cùng một bộ filter gửi tới POST /v2/goods-receipts/search
When tôi gọi với limit = 1 và với limit = 100
Then hai response trả về cùng một giá trị totalAmount
And cùng một giá trị total
```

**AC-04** — Không nhân dòng do join
```gherkin
Given một phiếu nhập có 5 dòng hàng
When tôi tính totalAmount toàn tập
Then phiếu đó đóng góp đúng một lần tổng tiền của nó, không nhân lên 5 lần
```

**AC-05** — Áp dụng cho cả ba màn
```gherkin
Given AC-01..AC-04 đã đạt trên Nhập kho
When tôi lặp lại trên Xuất kho và Chuyển kho
Then kết quả tương đương, dùng chung một pattern handler
```

---

## US-02 — Footer đúng trên Tổng hợp tồn kho

Là quản lý chi nhánh, tôi muốn cả 6 cột số ở Tổng hợp tồn kho là tổng toàn tập, để không thấy
số khác nhau giữa hai lần xem cùng một bộ lọc.

**Priority:** must
**Depends on:** US-01 (dùng lại pattern, không phụ thuộc code)

### Acceptance criteria

**AC-06** — Cả 6 cột bất biến theo trang
```gherkin
Given tôi ở Tổng hợp tồn kho với kết quả nhiều trang
When tôi chuyển trang hoặc đổi số dòng/trang
Then footer của SL tồn, Tồn đầu kỳ, SL nhập, SL xuất, Đang chuyển đi, Sắp nhận về đều không đổi
```

**AC-07** — Nhất quán theo kỳ
```gherkin
Given tôi chọn "Từ ngày / Đến ngày"
When tôi đọc dòng footer
Then footer SL tồn = footer Tồn đầu kỳ + footer SL nhập − footer SL xuất
```

**AC-08** — Trừ hàng giữ chỗ
```gherkin
Given tôi bật tuỳ chọn loại trừ hàng đã giữ chỗ
When footer SL tồn được tính
Then nó bằng tổng toàn tập của (tồn − đã giữ chỗ), khớp với tổng các ô trong cột
```

**AC-09** — Dòng "sắp nhận về" chưa có tồn được tính đúng một lần
```gherkin
Given tồn tại lệnh điều chuyển đang về mà chi nhánh chưa có tồn của mã hàng đó
When tôi xem footer "Sắp nhận về" ở trang 1 và ở trang 2
Then hai giá trị bằng nhau và mỗi lệnh chỉ được cộng một lần
```

**AC-10** — Nhánh lọc dẫn xuất
```gherkin
Given tôi đặt filter trên một cột dẫn xuất (Tồn đầu kỳ / SL nhập / SL xuất / Đang chuyển đi / Sắp nhận về)
When kết quả được trả về
Then footer là tổng của tập **sau khi** lọc, không phải trước khi lọc
```

**AC-11** — Xuất khẩu không gánh chi phí thừa
```gherkin
Given tiến trình xuất khẩu lặp qua dữ liệu theo từng trang
When nó gọi lớp service tổng hợp tồn kho
Then phần tính tổng toàn tập bị bỏ qua và kết quả xuất khẩu không đổi so với trước
```

---

## US-03 — Báo cáo kho phân trang phía server

Là người xem báo cáo, tôi muốn duyệt được hết dữ liệu của báo cáo, để không kết luận sai vì
chỉ nhìn thấy 200 dòng đầu.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-12** — Không còn cắt cụt im lặng
```gherkin
Given một báo cáo cho ra nhiều hơn 200 dòng
When tôi bấm tới trang cuối
Then tôi xem được tới dòng cuối cùng trong tổng số dòng mà pager công bố
```

**AC-13** — Server phân trang
```gherkin
Given tôi đang ở trang 3 với 50 dòng/trang
When lưới nạp dữ liệu
Then yêu cầu gửi lên mang đúng page và pageSize đó
And response chỉ chứa đúng số dòng của trang đó
```

**AC-14** — Đổi bộ lọc quay về trang 1
```gherkin
Given tôi đang ở trang 5
When tôi đổi bộ lọc chính hoặc lọc-theo-cột
Then lưới quay về trang 1 và không hiện trang trống
```

---

## US-04 — Lọc-theo-cột của báo cáo chạy phía server

Là người xem báo cáo, tôi muốn ô lọc trên đầu cột lọc trên toàn bộ dữ liệu chứ không chỉ trang
đang xem, để kết quả lọc và con số tổng nói cùng một chuyện.

**Priority:** must
**Depends on:** US-03

### Acceptance criteria

**AC-15** — Lọc tác dụng toàn tập
```gherkin
Given một báo cáo có nhiều trang
When tôi gõ điều kiện vào ô lọc của một cột
Then kết quả gồm cả những dòng vốn nằm ở các trang sau
And tổng số dòng trên pager đổi theo
```

**AC-16** — Cột số dùng toán tử số
```gherkin
Given một cột số trên báo cáo
When tôi lọc bằng =, ≤, ≥ hoặc khoảng giá trị
Then kết quả khớp theo giá trị số, không theo chuỗi đã định dạng
```

**AC-17** — Mọi cột đang có ô lọc đều lọc được
```gherkin
Given bất kỳ cột nào hiện đang có ô lọc trên header
When tôi đặt điều kiện lọc cho cột đó
Then điều kiện được áp phía server, kể cả các cột ghép bằng JS (Đang chuyển đi, Sắp nhận về, cột theo chi nhánh của báo cáo pivot)
```

---

## US-05 — Footer báo cáo lấy tổng từ API

Là kế toán, tôi muốn dòng tổng cuối bảng báo cáo là tổng thật của cả tập, để đối chiếu được với
sổ sách.

**Priority:** must
**Depends on:** US-03, US-04

### Acceptance criteria

**AC-18** — Tổng bất biến theo trang, biến theo lọc
```gherkin
Given một báo cáo nhiều trang
When tôi chuyển trang
Then footer không đổi
When tôi thêm một điều kiện lọc-theo-cột
Then footer và lưới cùng đổi theo đúng bộ lọc đó
```

**AC-19** — Cột dẫn xuất tính từ primitive
```gherkin
Given các cột dẫn xuất như Tồn cuối hay Đơn giá bình quân
When footer của chúng được hiển thị
Then chúng được suy ra từ các tổng primitive, không phải trung bình của trung bình
```

**AC-20** — Cột động của báo cáo pivot
```gherkin
Given báo cáo Tồn kho theo chi nhánh với các cột sinh theo từng chi nhánh
When footer hiển thị
Then mỗi cột chi nhánh có tổng riêng và cột Tổng bằng đúng tổng các cột chi nhánh
```

**AC-21** — Cache không trả về hình dạng cũ
```gherkin
Given các response báo cáo được cache
When mã mới được triển khai
Then không có response nào thiếu phần tổng do đọc phải entry cache viết bởi mã cũ
```

---

## US-06 — Không phá vỡ thứ đang chạy

Là developer, tôi muốn thay đổi này không làm hỏng các đường dùng chung, để không phải sửa
vòng hai.

**Priority:** must
**Depends on:** US-01, US-02, US-03

### Acceptance criteria

**AC-22** — Consumer hiện có vẫn chạy
```gherkin
Given báo cáo chuỗi và tiến trình xuất khẩu dùng chung các service này
When tôi chạy build toàn workspace và bộ test của @erp/api
Then không có lỗi biên dịch và không có test nào đang xanh chuyển đỏ
And api-client được sinh lại khớp với response mới
```
