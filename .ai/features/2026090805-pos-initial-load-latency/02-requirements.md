# Requirements — pos-initial-load-latency

Đo trên `erp_dev_3008` (restore prod), org `e60e5f49…`, chi nhánh `71230276…`
(2 539 card, 21 024 item, 14 015 dòng `stock_balances`).

---

## US-01 — Thu ngân mở trang bán hàng và thấy lưới sản phẩm ngay

**AC-01** — Phân trang chạy trong SQL, không nạp toàn bộ catalog

```gherkin
Given org có 21 024 item POS-visible gộp thành 2 539 card
When GET /pos/branches/:branchId/catalog/products?page=1&pageSize=20
Then service KHÔNG đọc khoá cache `pos-catalog:cards:<org>`
And truy vấn tồn kho chỉ nhận itemId của đúng các card trên trang (~229 item)
And không có truy vấn nào gộp toàn bộ stock_balances của chi nhánh
```

**AC-02** — Thứ tự sắp xếp theo tên giữ nguyên tuyệt đối

```gherkin
Given danh sách 2 539 card của org e60e5f49…
When lấy toàn bộ card theo sortBy=name,sortOrder=asc qua endpoint mới
Then thứ tự trùng khít thứ tự cũ ([...cards].sort((a,b)=>a.name.localeCompare(b.name,'vi')))
And không có vị trí nào lệch
```

**AC-03** — Nội dung card không đổi

```gherkin
Given cùng một org, chi nhánh, page, pageSize, direction, categoryId, search
When gọi endpoint cũ và endpoint mới
Then data[], total, page, pageSize giống nhau từng trường
And quantityOnHand của từng card bằng nhau
```

**AC-04** — Ngân sách thời gian

```gherkin
Given dữ liệu quy mô erp_dev_3008
When gọi /catalog/products?page=1&pageSize=20 với cache Redis trống
Then tổng thời gian truy vấn của handler < 40 ms
And không có request nào phải trả giá "dựng lại cache" như hiện tại (153.9 ms mỗi 60s)
```

**AC-05** — Lọc theo nhóm hàng vẫn gồm nhóm con

```gherkin
Given nhóm cha "Giày nam" có các nhóm con
When GET /catalog/products?categoryId=<id nhóm cha>
Then trả về card thuộc nhóm cha VÀ mọi nhóm con, đúng như hành vi hiện tại
```

**AC-06** — Lọc theo direction (kho / showroom) không đổi

```gherkin
Given chi nhánh có cấu hình showroom
When gọi với direction=SHOWROOM rồi direction=WAREHOUSE
Then quantityOnHand mỗi card khớp giá trị endpoint cũ trả về cho cùng tham số
And chi nhánh chưa cấu hình showroom + direction=SHOWROOM trả tồn 0, không lỗi
```

---

## US-02 — Sắp xếp theo tồn kho vẫn dùng được

**AC-07** — Giữ đường chậm riêng, có ý thức

```gherkin
Given sortBy=quantityOnHand
When gọi /catalog/products
Then service dùng đường gộp tồn toàn chi nhánh (không thể phân trang trước khi biết tồn)
And kết quả khớp endpoint cũ
And các sortBy khác (name, minPrice, maxPrice) KHÔNG đi đường này
```

---

## US-03 — Danh tính người dùng không phải dựng lại mỗi lần tải trang

**AC-08** — `/admin/users/me` đọc từ cache

```gherkin
Given người dùng đã đăng nhập và đã gọi /admin/users/me một lần
When gọi lại trong vòng 15 phút mà không có thay đổi nào về user/role/chi nhánh
Then phản hồi lấy từ cache, không truy vấn users/roles/branches/profile
And nội dung giống hệt lần gọi đầu
```

**AC-09** — Đổi quyền có hiệu lực ngay, không chờ TTL

```gherkin
Given người dùng U đã có bản cache của /admin/users/me
When admin gán thêm role cho U, hoặc gán/bỏ chi nhánh, hoặc sửa hồ sơ nhân sự của U
Then bản cache của U bị xoá ngay trong cùng thao tác ghi
And lần gọi /admin/users/me tiếp theo của U phản ánh thay đổi đó
```

**AC-10** — Lỗi Redis không làm hỏng endpoint

```gherkin
Given Redis không truy cập được
When gọi /admin/users/me
Then endpoint vẫn trả đúng dữ liệu bằng cách truy vấn thẳng DB
And lỗi cache chỉ được ghi log, giống khuôn invalidateMyBranchesForUsers (branch.service.ts:130-137)
```

---

## US-04 — Trang POS tải ít dữ liệu thừa hơn

**AC-11** — Lưới sản phẩm xin 20 thay vì 30

```gherkin
Given POS mở trang bán hàng
When useCatalogProductsQuery gọi API
Then pageSize gửi lên là 20, trùng mặc định của PaginationQueryDto
```

**AC-12** — Corpus lọc khách còn 20

```gherkin
Given CheckoutPage mount
When useCustomerListQuery prefetch danh sách khách
Then pageSize là 20
And gõ vào ô tìm khách vẫn lọc local trước, chỉ gọi /customers/search khi không khớp
```

---

## Ngoài phạm vi (nhắc lại từ 00-intent.md)

`bcryptjs` chặn event loop, 89 lần restart tiến trình prod, cluster mode, và DEBUG log
trên production đều là feature riêng. Success signal p99 của US-03 sẽ **không** đạt được
chỉ bằng cache — xem A-09.
