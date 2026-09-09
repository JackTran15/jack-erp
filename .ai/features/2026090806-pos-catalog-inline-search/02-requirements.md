# Requirements — pos-catalog-inline-search

Ô tìm nói ở đây là ô sản phẩm trong `ProductCatalogHeader` (nhãn "TƯ VẤN BÁN HÀNG",
phím tắt Shift+F3), thứ ghi `catalogQuery`. Ô F3 ở `POSToolbar` không đổi (A-07).

---

## US-01 — Thu ngân gõ từ khoá và thấy lưới lọc ngay

**AC-01** — Lưới lọc trên server, không lọc trong bộ nhớ

```gherkin
Given chi nhánh có hàng nghìn card và lưới đang hiển thị trang đầu 20 card
When thu ngân gõ "AK59" vào ô tìm sản phẩm
Then lưới gọi GET /pos/branches/:branchId/catalog/products với search=AK59
And không còn lọc `productCards` trong bộ nhớ theo `name`
And lưới hiện đúng các card khớp, kể cả card không nằm trong 20 card đã tải trước đó
```

**AC-02** — Khớp theo mã, không chỉ theo tên

```gherkin
Given "AK59" là tiền tố MÃ hàng, không xuất hiện trong tên card nào
When thu ngân gõ "AK59"
Then lưới hiện các card có biến thể mang mã bắt đầu bằng AK59
And không hiện "Chưa có hàng phù hợp"
```

**AC-03** — Không cần Enter

```gherkin
Given ô tìm đang trống
When thu ngân gõ "112" rồi dừng tay 150ms mà KHÔNG bấm Enter
Then lưới đã cập nhật theo "112"
```

**AC-04** — Gõ liên tục không bắn mỗi ký tự một request

```gherkin
Given thu ngân gõ liên tục 8 ký tự trong vòng dưới 150ms mỗi ký tự
When chuỗi gõ kết thúc
Then chỉ có request cho giá trị đã settle, không phải 8 request
```

**AC-05** — Xoá ô tìm thì lưới trở về đầy đủ

```gherkin
Given lưới đang lọc theo "AK59"
When thu ngân xoá hết ô tìm
Then lưới gọi lại không kèm `search` và hiện trang đầu như lúc mới mở
```

---

## US-02 — Không còn hai câu trả lời khác nhau trên một màn hình

**AC-06** — Dropdown gợi ý mức SKU không còn hiện dưới ô tìm sản phẩm

```gherkin
Given thu ngân gõ bất kỳ chuỗi nào vào ô tìm sản phẩm
When kết quả trả về, dù có khớp hay không
Then không có danh sách thả xuống nào hiện ra dưới ô đó
And cũng không hiện khung "Không có kết quả."
```

**AC-07** — Các ô tìm khác không đổi

```gherkin
Given ô "Lọc theo nhóm hàng hóa" cùng hàng, ô F3 ở POSToolbar, và ô tìm của
      màn Chuyển kho nhanh đều dùng chung PosSearchPopover
When feature này thêm prop tắt dropdown vào component đó
Then ba nơi kia vẫn hiện dropdown như cũ vì prop mặc định là tắt-tính-năng-mới
```

---

## US-03 — Quét mã vạch vẫn thêm thẳng vào giỏ

**AC-08** — Đường auto-add không hỏng

```gherkin
Given máy quét bắn một mã vạch khớp tuyệt đối một SKU
When chuỗi vào ô tìm sản phẩm
Then mặt hàng được thêm thẳng vào giỏ
And ô tìm được xoá
And KHÔNG có dialog chọn biến thể nào mở ra
```

**AC-09** — Guard khử trùng còn nguyên

```gherkin
Given cùng một mã được quét hai lần liên tiếp
When lần quét thứ hai vào
Then vẫn thêm đúng một dòng cho mỗi lần quét (re-scan tăng số lượng), không nhân đôi
```

---

## US-04 — Tìm ra đúng một món thì mở luôn dialog chọn biến thể

**AC-10** — Đúng một card thì dialog tự mở

```gherkin
Given thu ngân gõ chuỗi khớp đúng MỘT card
When kết quả trả về với total = 1
Then dialog chọn biến thể của card đó tự mở, không cần bấm Enter hay click card
```

**AC-11** — Đọc theo tổng số khớp, không theo số card trên trang

```gherkin
Given một từ khoá khớp 21 card và thu ngân đang ở trang 2 (chỉ có 1 card)
When trang 2 hiển thị
Then dialog KHÔNG tự mở, vì total = 21 chứ không phải 1
```

**AC-12** — Đóng dialog thì nó không bật lại

```gherkin
Given dialog đã tự mở cho từ khoá "AK5907"
When thu ngân đóng dialog mà không sửa ô tìm
Then dialog không mở lại
And chỉ khi từ khoá đổi rồi lại khớp đúng một card thì mới mở lần nữa
```

**AC-13** — Nhiều hoặc không có kết quả thì không mở gì

```gherkin
Given từ khoá khớp 0 card hoặc từ 2 card trở lên
When kết quả trả về
Then không dialog nào tự mở
And lưới hiển thị kết quả (hoặc trạng thái trống) như bình thường
```

---

## Ngoài phạm vi (nhắc lại từ 00-intent.md)

Endpoint v2 POST theo CQRS, bố cục/kích thước ô tìm, hiệu năng truy vấn tìm kiếm
(35–42 ms, quét tuần tự — [[2026090805-pos-initial-load-latency]] A-04), và ô F3 ở
`POSToolbar`.
