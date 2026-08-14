---
feature: footer-grand-totals-standard
stories: 5
acceptance_criteria: 16
---

# Requirements — Chuẩn hoá `totals` + ba bảng POS

Quy ước chung: "tổng toàn tập" = tổng trên **mọi dòng khớp bộ lọc hiện hành**, không phụ thuộc
`page`/`limit`; và footer với lưới phải sinh ra từ **cùng một** hàm dựng truy vấn.

---

## US-01 — Một kiểu `totals` duy nhất

Là developer, tôi muốn có một chỗ duy nhất khai "tổng toàn tập trông như thế nào", để endpoint tiếp
theo không đẻ ra hình dạng thứ năm.

**Priority:** must
**Depends on:** —

**AC-01** — Contract tồn tại và được dùng
```gherkin
Given packages/shared-interfaces khai ReportTotals và PaginatedWithTotals
When tôi đọc bất kỳ endpoint nào trong phạm vi feature này
Then response của nó dùng đúng kiểu đó, không khai lại hình dạng riêng
```

**AC-02** — Quy ước được viết ra, không chỉ nằm trong đầu
```gherkin
Given doc comment của contract
When một developer cần biết cột dẫn xuất hay cột động thì làm sao
Then quy ước ghi rõ: cột dẫn xuất không nằm trong totals, cột động dùng dot-path,
     và ranh giới với họ { rows, totals: ReportRow|null, total } của engine báo cáo
```

---

## US-02 — Retrofit không được đổi con số

Là chủ sở hữu, tôi muốn việc chuẩn hoá không âm thầm làm sai những con số vừa mới kiểm xong.

**Priority:** must
**Depends on:** US-01

**AC-03** — Mọi con số của đợt 1 giữ nguyên
```gherkin
Given 17 bước verify của feature footer-grand-totals đã xanh trước khi retrofit
When tôi chạy lại đúng 17 bước đó sau khi đổi hình dạng response
Then tất cả vẫn xanh với **cùng** các con số đã khẳng định
```

**AC-04** — Không consumer nào bị bỏ quên
```gherkin
Given response đổi từ totalAmount scalar sang totals
When tôi chạy tsc toàn workspace
Then không có lỗi, và không màn hình nào hiển thị footer rỗng vì đọc field cũ
```

---

## US-03 — Footer POS là tổng toàn tập

Là thu ngân, tôi muốn "Tổng tiền" ở POS là tổng thật của bộ lọc, để không phải cộng tay khi lật trang.

**Priority:** must
**Depends on:** US-01

**AC-05** — Bất biến theo trang (Danh sách hóa đơn)
```gherkin
Given tôi ở Danh sách hóa đơn với một bộ lọc cho ra nhiều hơn một trang
When tôi đổi số dòng/trang rồi chuyển sang trang khác
Then footer "Tổng tiền" giữ nguyên
```

**AC-06** — Đơn trả mang dấu âm được tính đúng
```gherkin
Given trong tập kết quả có hóa đơn loại RETURN/EXCHANGE
When footer được tính
Then nó dùng netAmount cho các đơn đó và amountDue cho phần còn lại
And giá trị khác với một phép SUM(amount_due) ngây thơ
```

**AC-07** — Bất biến `limit` ở tầng truy vấn
```gherkin
Given cùng một bộ filter gửi tới một trong ba endpoint POS
When tôi gọi với limit = 1 và với limit = 100
Then hai response trả về cùng totals và cùng total
```

**AC-08** — Footer phản ứng với bộ lọc
```gherkin
Given tôi ở Danh sách hóa đơn
When tôi lọc cột tiền cho ra tập nhỏ hơn
Then cả lưới và footer cùng đổi theo bộ lọc đó
```

**AC-09** — Điều kiện cố định của "đơn đủ điều kiện đổi trả" không được rơi rụng
```gherkin
Given endpoint đổi trả chỉ nhận đơn SALE, đã thanh toán/ghi nợ, chưa nháp,
      và còn hàng chưa trả (EXISTS trên invoice_items)
When tổng toàn tập được tính
Then nhánh tính tổng mang **đủ** các điều kiện đó
And footer không lớn hơn tổng các dòng đang hiển thị
```

---

## US-04 — Hai bảng dialog lật được hết

Là nhân viên đổi trả, tôi muốn xem được mọi hóa đơn đủ điều kiện, để không kết luận nhầm vì chỉ
thấy 100 dòng đầu.

**Priority:** must
**Depends on:** US-03

**AC-10** — Không còn cắt cụt im lặng
```gherkin
Given tập kết quả nhiều hơn một trang
When tôi bấm sang trang tiếp theo ở Đổi trả hàng hoặc Lịch sử mua hàng
Then tôi xem được các dòng tiếp theo
And thanh phân trang phản ánh đúng tổng số dòng
```

**AC-11** — Đổi bộ lọc thì quay về trang 1
```gherkin
Given tôi đang ở trang cuối
When tôi đổi một bộ lọc bất kỳ nuôi truy vấn
Then lưới quay về trang 1, không hiện trang trống
```

**AC-12** — Footer không đổi khi lật trang
```gherkin
Given tôi đang xem một trang bất kỳ của hai bảng đó
When tôi chuyển trang
Then footer giữ nguyên
```

---

## US-05 — Lịch sử mua hàng nói cùng một chuyện

Là kế toán, tôi muốn số đếm, số tiền và bộ lọc trên tab này cùng mô tả một tập, để đối chiếu được.

**Priority:** must
**Depends on:** US-03

**AC-13** — Đếm và tiền cùng một tập
```gherkin
Given tab Lịch sử mua hàng của một khách hàng
When tôi đọc "Tổng hóa đơn: N" và số tiền ở footer
Then cả hai mô tả cùng một tập dòng, không phải hai tập khác nhau
```

**AC-14** — Lọc theo đúng con số đang nhìn
```gherkin
Given cột "Tổng thanh toán" hiển thị một giá trị
When tôi lọc cột đó bằng một điều kiện so sánh
Then kết quả khớp theo chính giá trị đang hiển thị, không theo số tiền đã thu
```

**AC-15** — Dòng không map được trạng thái vẫn hiện
```gherkin
Given một hóa đơn có trạng thái không nằm trong bảng nhãn của tab
When danh sách được render
Then dòng đó vẫn hiện với ô trạng thái để trống, thay vì bị bỏ âm thầm
```

---

## US-06 — Không phá vỡ thứ đang chạy

**Priority:** must

**AC-16** — Build và test sạch
```gherkin
Given toàn bộ thay đổi của feature
When tôi chạy pnpm build và bộ test của @erp/api
Then không lỗi biên dịch, không test nào đang xanh chuyển đỏ
And api-client được sinh lại khớp response mới
```
