---
feature: inventory-item-stock-status-utilities
stories: 2
acceptance_criteria: 20
---

# Requirements — Danh mục > Hàng hoá: "Trạng thái hết hàng" + "Tiện ích"

Bối cảnh chung cho mọi kịch bản dưới đây: người dùng đã đăng nhập backoffice, có quyền
`inventory.read`, đang ở màn `/admin/inventory-items` ("Danh mục > Hàng hoá"), và lưới đang
hiển thị các **nhóm sản phẩm** (một dòng = một `product` kèm mọi biến thể, hoặc một mặt
hàng mồ côi không thuộc sản phẩm nào).

## US-01 — Lọc nhanh những mặt hàng đã hết

Là nhân viên quản lý danh mục, tôi muốn khoanh ngay những sản phẩm không còn tồn tại chi
nhánh mình, để biết phải đặt hàng hoặc yêu cầu điều chuyển cái gì.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Happy path: bật bộ lọc
```gherkin
Given tôi đang ở chi nhánh "Hồ Chí Minh" và lưới hiển thị toàn bộ 2.554 nhóm
When tôi bấm nút "Trạng thái hết hàng" trên thanh công cụ
Then lưới chỉ còn những nhóm có tổng tồn tại chi nhánh đó ≤ 0
And tổng số bản ghi báo về là 1.605
```

**AC-02** — Cộng biến thể theo dấu, gồm cả tồn âm (ví dụ do người dùng đưa ra)
```gherkin
Given sản phẩm "A" có hai biến thể, A1 tồn -1 và A2 tồn 1, tại chi nhánh đang chọn
When tôi bật "Trạng thái hết hàng"
Then sản phẩm "A" nằm trong kết quả, vì tổng của nó là 0 chứ không phải 1
```

**AC-03** — Nhóm chưa từng nhập hàng
```gherkin
Given sản phẩm "B" không có dòng stock_balances nào tại chi nhánh đang chọn
When tôi bật "Trạng thái hết hàng"
Then sản phẩm "B" nằm trong kết quả, vì tổng tồn được tính là 0
```

**AC-04** — Tắt bộ lọc
```gherkin
Given bộ lọc "Trạng thái hết hàng" đang bật
When tôi bấm lại nút đó
Then lưới quay về đầy đủ 2.554 nhóm
And nút trở lại thể hiện trạng thái tắt
```

**AC-05** — Kết hợp với bộ lọc cột khác
```gherkin
Given tôi đã gõ "Giày MT" vào ô lọc cột "Thương hiệu"
When tôi bật "Trạng thái hết hàng"
Then kết quả là giao của hai điều kiện, không phải chỉ điều kiện hết hàng
And ô lọc "Thương hiệu" vẫn giữ nguyên giá trị đã gõ
```

**AC-06** — Phạm vi theo chi nhánh
```gherkin
Given bộ lọc "Trạng thái hết hàng" đang bật tại chi nhánh "Hồ Chí Minh" và trả về 1.605 nhóm
When tôi chuyển sang chi nhánh "Chi Nhánh Cần Thơ"
Then kết quả đổi thành 1.216 nhóm
```

**AC-07** — Nút thể hiện trạng thái đang bật
```gherkin
Given bộ lọc "Trạng thái hết hàng" đang bật
When tôi nhìn thanh công cụ
Then nút "Trạng thái hết hàng" hiển thị khác rõ ràng so với lúc tắt
And khác biệt đó không chỉ dựa vào màu sắc
```

**AC-08** — Mặt hàng mồ côi
```gherkin
Given mặt hàng "C" có product_id NULL và tồn 0 tại chi nhánh đang chọn
When tôi bật "Trạng thái hết hàng"
Then mặt hàng "C" nằm trong kết quả
```

**AC-09** — Phân trang phản ánh tập đã lọc
```gherkin
Given bộ lọc "Trạng thái hết hàng" đang bật
When tôi sang trang 2
Then các dòng ở trang 2 cũng đều có tổng tồn ≤ 0
And số trang được tính trên 1.605 nhóm chứ không phải 2.554
```

## US-02 — Đổi trạng thái kinh doanh cho nhiều mặt hàng một lượt

Là người quản trị danh mục, tôi muốn tick nhiều dòng rồi chuyển tất cả sang "Ngừng kinh
doanh" (hoặc ngược lại) trong một thao tác, thay vì mở từng mặt hàng.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-10** — Menu Tiện ích
```gherkin
Given tôi có quyền inventory.write
When tôi bấm "Tiện ích" trên thanh công cụ
Then tôi thấy đúng hai mục: "Đang kinh doanh" và "Ngừng kinh doanh"
And không còn toast "Tiện ích đang được triển khai."
```

**AC-11** — Happy path: ngừng kinh doanh hàng loạt
```gherkin
Given tôi đã tick 5 dòng, không dòng nào có hàng ở Showroom
When tôi chọn Tiện ích > "Ngừng kinh doanh" và xác nhận
Then hệ thống gọi đúng MỘT request thay đổi trạng thái
And cột "Trạng thái" của cả 5 dòng chuyển sang "Ngừng kinh doanh"
And mọi biến thể bên trong 5 nhóm đó đều có is_active = false
```

**AC-12** — Dòng nhóm phải nở ra thành mặt hàng
```gherkin
Given tôi tick một dòng type='product' chứa 8 biến thể
When tôi chọn Tiện ích > "Ngừng kinh doanh" và xác nhận
Then cả 8 mặt hàng đổi trạng thái
And thao tác không âm thầm không-làm-gì vì id của dòng là products.id chứ không phải items.id
```

**AC-13** — Hộp thoại xác nhận
```gherkin
Given tôi đã tick 5 dòng
When tôi chọn Tiện ích > "Ngừng kinh doanh"
Then hiện hộp thoại nêu rõ số dòng bị ảnh hưởng và trạng thái đích
And không có gì thay đổi cho tới khi tôi bấm xác nhận
```

**AC-14** — Bỏ qua hàng đang ở Showroom
```gherkin
Given tôi đã tick 10 dòng, trong đó 2 dòng có mặt hàng đang nằm ở kho Showroom
When tôi chọn Tiện ích > "Ngừng kinh doanh" và xác nhận
Then 8 dòng còn lại đổi sang "Ngừng kinh doanh"
And hiện cảnh báo nêu số lượng bị bỏ qua kèm mã của chúng
And 2 dòng đó giữ nguyên trạng thái cũ
```

**AC-15** — Kích hoạt lại không bị chặn
```gherkin
Given tôi đã tick các dòng đang "Ngừng kinh doanh" và có hàng ở Showroom
When tôi chọn Tiện ích > "Đang kinh doanh" và xác nhận
Then tất cả đều chuyển sang "Đang kinh doanh"
And quy tắc Showroom không chặn gì, vì nó chỉ áp cho chiều tắt
```

**AC-16** — Đồng bộ cờ trên sản phẩm
```gherkin
Given tôi tick một dòng type='product'
When tôi chuyển nó sang "Ngừng kinh doanh"
Then products.is_active của sản phẩm đó cũng thành false
And hai cờ không bị đẩy lệch thêm so với hiện trạng
```

**AC-17** — Chặn theo quyền
```gherkin
Given tôi đăng nhập bằng vai trò chỉ có inventory.read
When tôi nhìn thanh công cụ của màn Danh mục > Hàng hoá
Then tôi không dùng được menu Tiện ích
And nếu gọi thẳng endpoint thì nhận 403
```

**AC-18** — Lưới phản ánh kết quả ngay
```gherkin
Given tôi vừa chuyển 5 dòng sang "Ngừng kinh doanh"
When hộp thoại đóng lại
Then lưới nạp lại và 5 dòng đó vẫn hiển thị, với trạng thái mới
And chúng không biến mất khỏi danh sách
```

**AC-19** — Idempotency
```gherkin
Given một request đổi trạng thái đã thành công với một X-Idempotency-Key
When đúng request đó được gửi lại với cùng khoá và cùng body
Then phản hồi được phát lại từ bộ nhớ đệm
And không có bản ghi nào bị ghi thêm lần nữa
```

**AC-20** — Xoá cache catalog POS
```gherkin
Given một mặt hàng đang hiển thị trên POS
When tôi chuyển nhóm chứa nó sang "Ngừng kinh doanh"
Then cache catalog POS của tổ chức bị xoá
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Performance | Bật bộ lọc hết hàng không làm truy vấn danh sách chậm thêm quá 100 ms (đã đo bản mẫu: 33 ms trên 41.718 mặt hàng / 164.481 dòng tồn) | T-01-01 |
| Correctness | Phép cộng tồn không kẹp về 0 ở bất kỳ đâu — tồn âm phải cộng theo dấu | T-01-01 |
| Security | Endpoint bulk yêu cầu `inventory.write`; mọi mặt hàng bị đụng phải thuộc `actor.organizationId` | T-02-01 |
| i18n | Toàn bộ chuỗi hiển thị bằng tiếng Việt; mã nguồn backend giữ tiếng Anh | T-01-03, T-02-04 |
