# Requirements — warehouse-list-multiselect

## US-01 — Tick nhiều phiếu mà không kéo dữ liệu dòng hàng

Là nhân viên kho, tôi muốn đánh dấu nhiều phiếu trên danh sách mà không phải chờ
hệ thống tải chi tiết từng phiếu, để chọn nhanh tập phiếu cần in tem.

**AC-01** — Tick một ô không phát sinh request chi tiết
```gherkin
Given tôi đang ở trang Nhập kho và panel "Chi tiết" đang hiển thị lines của phiếu NK000430
When tôi click vào ô checkbox của dòng NK000428
Then ô checkbox của NK000428 chuyển sang trạng thái đã tick
And không có request nào tới /goods-receipts/{id} hay /goods-receipts/{id}/lines được gửi đi
And panel "Chi tiết" vẫn hiển thị lines của NK000430
```

**AC-02** — Click phần còn lại của dòng vẫn nạp chi tiết
```gherkin
Given tôi đang ở trang Nhập kho và panel "Chi tiết" đang hiển thị lines của phiếu NK000430
When tôi click vào ô "Đối tượng" của dòng NK000428
Then panel "Chi tiết" chuyển sang hiển thị lines của NK000428
And dòng NK000428 được tô nền phân biệt với các dòng còn lại
And trạng thái tick của mọi dòng không đổi
```

**AC-03** — Tick nhiều dòng cùng lúc
```gherkin
Given tôi đang ở trang Xuất kho với ít nhất 3 phiếu trong danh sách
When tôi tick ô checkbox của dòng 1, rồi dòng 2, rồi dòng 3
Then cả 3 ô đều ở trạng thái đã tick
```

**AC-04** — Vào trang là chưa tick gì
```gherkin
Given danh sách Lệnh điều chuyển vừa tải xong và dòng đầu tiên đang là dòng đang xem
When tôi nhìn cột checkbox
Then không ô checkbox nào ở trạng thái đã tick
```

## US-02 — Chọn tất cả trên header

Là nhân viên kho, tôi muốn một cú click tick hết các phiếu đang hiển thị, để khỏi
tick từng dòng khi cần in tem cả trang.

**AC-05** — Ô header tick hết dòng đang hiển thị
```gherkin
Given tôi đang ở trang Chuyển kho hiển thị 20 phiếu và chưa tick ô nào
When tôi click ô checkbox trên header
Then cả 20 ô checkbox của 20 dòng đều ở trạng thái đã tick
And không có request chi tiết nào được gửi đi
```

**AC-06** — Ô header bỏ tick hết
```gherkin
Given cả 20 dòng đang hiển thị đều đã tick
When tôi click ô checkbox trên header
Then không dòng nào còn ở trạng thái đã tick
```

**AC-07** — Ô header ở trạng thái nửa vời khi tick một phần
```gherkin
Given trang đang hiển thị 20 phiếu và tôi đã tick đúng 3 dòng
When tôi nhìn ô checkbox trên header
Then ô header hiển thị ở trạng thái indeterminate, không phải đã tick cũng không phải trống
```

**AC-08** — Không có dòng nào thì ô header vô hiệu
```gherkin
Given bộ lọc không trả về phiếu nào
When tôi nhìn ô checkbox trên header
Then ô header ở trạng thái disabled
```

## US-03 — Giữ và xóa lựa chọn

Là nhân viên kho, tôi muốn gom phiếu qua nhiều trang rồi in một lượt, nhưng không
muốn in nhầm phiếu thuộc bộ lọc cũ.

**AC-09** — Đổi trang giữ tick
```gherkin
Given tôi đã tick 2 phiếu ở trang 1 của danh sách Nhập kho
When tôi chuyển sang trang 2 rồi quay lại trang 1
Then 2 phiếu đó vẫn ở trạng thái đã tick
```

**AC-10** — Đổi bộ lọc xóa tick
```gherkin
Given tôi đã tick 2 phiếu trên danh sách Nhập kho
When tôi đổi khoảng ngày lọc và bấm "Lấy dữ liệu"
Then không phiếu nào còn ở trạng thái đã tick
```

**AC-11** — Bấm "Nạp" xóa tick
```gherkin
Given tôi đã tick 2 phiếu trên danh sách Xuất kho
When tôi bấm nút "Nạp" trên toolbar
Then không phiếu nào còn ở trạng thái đã tick
```

## US-04 — In tem mã hàng loạt

Là nhân viên kho, tôi muốn in tem cho toàn bộ hàng của nhiều phiếu trong một lần,
thay vì mở từng phiếu in từng lần.

**AC-12** — In tem gom lines của mọi phiếu đã tick
```gherkin
Given tôi đang ở trang Nhập kho và đã tick 2 phiếu, một phiếu 3 dòng và một phiếu 2 dòng
When tôi bấm "In tem mã"
Then trang In tem mã mở ra với 5 dòng hàng đổ sẵn
And nút "Hủy bỏ" của trang In tem mã quay về /inventory/purchase-orders
```

**AC-13** — Chưa tick thì in theo dòng đang xem
```gherkin
Given tôi đang ở trang Xuất kho, chưa tick ô nào, và panel "Chi tiết" đang hiển thị phiếu XK000012 có 4 dòng
When tôi bấm "In tem mã"
Then trang In tem mã mở ra với 4 dòng hàng của XK000012 đổ sẵn
```

**AC-14** — Gộp cùng một mặt hàng xuất hiện ở nhiều phiếu
```gherkin
Given tôi đã tick 2 phiếu và cùng một mặt hàng (cùng itemId, cùng vị trí) xuất hiện ở cả hai với số lượng 1 và 2
When tôi bấm "In tem mã"
Then trang In tem mã hiển thị một dòng duy nhất cho mặt hàng đó với số lượng 3
```

**AC-15** — Nút "In tem mã" báo trạng thái đang gom dữ liệu
```gherkin
Given tôi đã tick 5 phiếu trên trang Nhập kho
When tôi bấm "In tem mã" và các request chi tiết chưa trả về hết
Then nút "In tem mã" ở trạng thái disabled cho tới khi điều hướng xảy ra
```

**AC-16** — Một phiếu lỗi không chặn cả lượt in
```gherkin
Given tôi đã tick 3 phiếu và một trong số đó trả lỗi khi tải chi tiết
When tôi bấm "In tem mã"
Then hệ thống hiển thị toast lỗi nêu rõ có phiếu không tải được
And không điều hướng sang trang In tem mã
```

## US-05 — In tem hàng loạt không làm nghẽn trình duyệt

Là nhân viên kho, tôi muốn chọn tất cả rồi in tem mà trình duyệt không đứng hình.

**AC-17** — Dữ liệu đổ sẵn mang theo giá bán, trang In tem mã không tra lại từng SKU
```gherkin
Given tôi ở trang Nhập kho và bấm Chọn tất cả
When tôi bấm "In tem mã"
Then trang In tem mã hiển thị giá bán thật của từng hàng hóa ngay khi mở
And không có request /inventory/items?search=... nào được gửi cho những hàng hóa đã có giá
```
