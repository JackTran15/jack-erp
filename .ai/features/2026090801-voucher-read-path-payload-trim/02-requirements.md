---
feature: voucher-read-path-payload-trim
stories: 7
acceptance_criteria: 27
---

# Requirements — Cắt payload đường đọc

Quy ước chung cho mọi AC dưới đây: "chọn một phiếu" = tick/click một hàng trên lưới danh
sách để panel "Chi tiết" bên dưới đổi nội dung — **không** mở dialog.

**Bổ sung 8/9/2026 (reopen G1).** AC-25 và AC-26 được thêm sau khi đo trên trình duyệt cho thấy cả
Nhập kho lẫn Xuất kho đang gọi **nối tiếp**: request dòng xuất phát 44 ms (đo lần hai: 51 ms) sau
khi header đã về, vì `DetailPanel` suy id từ **kết quả** query header
(`PurchaseOrdersPage.tsx:991`, `GoodsIssuePage.tsx:981`). Yêu cầu song song vốn chỉ nằm trong sơ đồ
Luồng 1 và success signal của `00-intent.md`, không có AC nào, nên không ticket nào của UOW-01 và
UOW-02 phủ nó. Đây chính là cơ chế đã làm `2026083002` chậm đi dù payload giảm còn 42 %.

## US-01 — Nhập kho: chọn phiếu không còn tải dòng hàng

Là người dùng kho, tôi muốn bấm qua lại giữa các phiếu nhập mà không phải chờ tải hàng trăm
dòng hàng, để dò một phiếu trong danh sách không còn cảm giác treo.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Chọn phiếu chỉ tải phần đầu phiếu
```gherkin
Given tôi đang ở Nhập kho và trong kỳ có một phiếu ≥ 200 dòng
When tôi chọn phiếu đó trên lưới
Then request GET /goods-receipts/:id được gửi kèm includeLines=false
And phản hồi không chứa trường lines
And vẫn chỉ có đúng một request tới GET /goods-receipts/:id cho thao tác này
```

**AC-02** — Panel "Chi tiết" không đổi hành vi
```gherkin
Given tôi vừa chọn một phiếu nhập
When panel "Chi tiết" hiển thị
Then nó vẫn nạp dòng qua POST /v2/goods-receipts/:id/lines/search theo từng trang
And cuộn xuống cuối vẫn nạp tiếp trang sau
```

**AC-03** — Ba nút cần dòng vẫn đủ dòng
```gherkin
Given tôi đã chọn một phiếu nhập 5 000 dòng
When tôi bấm "Sửa" (hoặc "Nhân bản", hoặc "In tem mã" khi chưa tick phiếu nào)
Then nút chuyển sang trạng thái đang tải và bị khoá cho tới khi dòng về đủ
And dialog/trang tem mã mở ra với đủ 5 000 dòng, không thiếu dòng nào
```

**AC-04** — Lỗi khi nạp dòng không nuốt im
```gherkin
Given API trả lỗi cho lượt nạp dòng theo yêu cầu
When tôi bấm "Sửa"
Then tôi thấy thông báo lỗi và dialog KHÔNG mở ra
And nút trở lại trạng thái bấm được
```


**AC-25** — Header và dòng chạy song song
```gherkin
Given tôi đang ở Nhập kho
When tôi chọn một phiếu trên lưới
Then request GET /goods-receipts/:id và request POST /v2/goods-receipts/:id/lines/search
     cùng xuất phát trong một lượt render
And request dòng KHÔNG chờ phản hồi của header mới bắt đầu
And đo trên waterfall, thời điểm bắt đầu của hai request cách nhau dưới 10 ms
```

## US-02 — Xuất kho: cùng hành vi với Nhập kho

Là người dùng kho, tôi muốn trang Xuất kho hành xử giống Nhập kho, để không có trang nào
còn lại giữ đúng cái lỗi vừa sửa.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-05** — Chọn phiếu xuất chỉ tải phần đầu phiếu
```gherkin
Given tôi đang ở Xuất kho
When tôi chọn một phiếu trên lưới
Then request GET /inventory/goods-issues/:id được gửi kèm includeLines=false
And phản hồi không chứa trường lines
```

**AC-06** — Các nút cần dòng của Xuất kho
```gherkin
Given tôi đã chọn một phiếu xuất
When tôi bấm một nút cần cả mảng dòng
Then nút bị khoá trong lúc nạp và mở ra với đủ dòng
```


**AC-26** — Header và dòng chạy song song (Xuất kho)
```gherkin
Given tôi đang ở Xuất kho
When tôi chọn một phiếu trên lưới
Then hai request header và dòng cùng xuất phát trong một lượt render
And thời điểm bắt đầu của chúng cách nhau dưới 10 ms
```

## US-03 — Lệnh điều chuyển: phân trang dòng

Là người dùng kho, tôi muốn xem lệnh điều chuyển mà không tải hết dòng mỗi lần đổi hàng
chọn, và thứ tự dòng phải y như trước khi phân trang.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-07** — Cột `line_no` được backfill đúng thứ tự đang hiển thị
```gherkin
Given bảng transfer_order_lines chưa có cột line_no
When migration chạy trên bản restore prod
Then mọi dòng có line_no bắt đầu từ 1 trong phạm vi từng lệnh điều chuyển
And thứ tự theo line_no trùng khớp thứ tự ORDER BY created_at, ctid
And so sánh trước/sau trên toàn bảng cho ra danh sách dòng y hệt về thứ tự
```

**AC-08** — Endpoint phân trang dòng
```gherkin
Given một lệnh điều chuyển 120 dòng
When tôi gọi POST /v2/inventory/transfer-orders/:id/lines/search với page=1, limit=50
Then tôi nhận về 50 dòng đầu theo line_no tăng dần, kèm total = 120
And gọi tiếp page=3 trả 20 dòng cuối, không trùng và không sót dòng nào
```

**AC-09** — Chọn lệnh điều chuyển không tải dòng
```gherkin
Given tôi đang ở Lệnh điều chuyển
When tôi chọn một hàng
Then request GET /inventory/transfer-orders/:id được gửi kèm includeLines=false
And panel "Chi tiết" nạp dòng qua endpoint phân trang
```

**AC-10** — Phân trang không được nhìn thấy từ phía người dùng
```gherkin
Given một lệnh điều chuyển 120 dòng
When tôi mở panel và cuộn tới cuối
Then tôi thấy đủ 120 dòng, đúng thứ tự như trước khi có phân trang
```

**AC-11** — Cách ly tổ chức/chi nhánh
```gherkin
Given một lệnh điều chuyển thuộc tổ chức khác
When tôi gọi endpoint phân trang dòng với id đó
Then tôi nhận 404, không phải một trang dòng rỗng
```

## US-04 — Chuyển kho: danh sách thôi mang dòng

Là người dùng kho, tôi muốn mở danh sách Chuyển kho mà server không phải kéo dòng của cả
20 phiếu trên trang, vì tôi chỉ xem chi tiết đúng một phiếu.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-12** — Backfill `line_no` cho `stock_transfer_lines`
```gherkin
Given stock_transfer_lines không có created_at và không có line_no
When migration chạy
Then line_no được gán theo ORDER BY ctid trong phạm vi từng phiếu
And thứ tự dòng hiển thị sau migration trùng khớp thứ tự hiển thị trước migration
```

**AC-13** — Danh sách không còn join dòng
```gherkin
Given trang Chuyển kho hiển thị 20 phiếu
When lưới nạp qua POST /v2/inventory/stock/transfers/search
Then phản hồi không chứa lines trên bất kỳ hàng nào
And truy vấn không còn 6 mệnh đề leftJoinAndSelect cho lines và quan hệ của lines
```

**AC-14** — Cột "Tổng tiền" giữ nguyên số
```gherkin
Given một phiếu chuyển kho nhiều dòng có tổng tiền hiển thị là X trước khi sửa
When tôi mở lại danh sách sau khi sửa
Then cột Tổng tiền của phiếu đó vẫn là X
And chân lưới vẫn cộng ra đúng tổng như trước
```

**AC-15** — Panel "Chi tiết" nạp dòng của phiếu đang chọn
```gherkin
Given tôi chọn một phiếu chuyển kho
When panel hiển thị
Then dòng được nạp qua POST /v2/inventory/stock/transfers/:id/lines/search theo trang
And thứ tự dòng khớp với thứ tự trước khi có phân trang
```

**AC-16** — Dialog Sửa/Xem vẫn đủ dòng
```gherkin
Given danh sách không còn mang lines
When tôi bấm mở dialog Sửa một phiếu chuyển kho
Then nút khoá trong lúc nạp và dialog mở ra với đủ dòng như trước
And lưu lại không làm mất dòng nào
```

## US-05 — Kiểm kê: phân trang dòng

Là người dùng kho, tôi muốn chọn một phiếu kiểm kê mà không kéo toàn bộ dòng đếm, vì một
phiếu kiểm kê kho thật có thể tới hàng nghìn dòng.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-17** — Chọn phiếu kiểm kê không tải dòng
```gherkin
Given tôi đang ở Kiểm kê kho
When tôi chọn một phiếu
Then request GET /inventory/stock-takes/:id được gửi kèm includeLines=false
And phản hồi vẫn chứa members (panel cần), nhưng không chứa lines
```

**AC-18** — Panel kiểm kê phân trang
```gherkin
Given một phiếu kiểm kê 1 000 dòng
When panel "Chi tiết" hiển thị
Then dòng nạp qua POST /v2/inventory/stock-takes/:id/lines/search theo trang
And cuộn tới cuối cho đủ 1 000 dòng đúng thứ tự line_no
```

**AC-19** — Đường ghi của kiểm kê không đổi
```gherkin
Given tôi mở dialog sửa/kết luận một phiếu kiểm kê
When tôi lưu
Then toàn bộ dòng được gửi đi như trước, không phiếu nào bị cắt cụt còn một trang
```


**AC-27** — Chân lưới cộng theo cả phiếu, không theo trang đã nạp
```gherkin
Given một phiếu kiểm kê 1 000 dòng và panel mới chỉ nạp trang đầu
When tôi đọc ba số ở chân lưới (Theo số / Kiểm kê / Chênh lệch)
Then chúng là tổng của TOÀN BỘ 1 000 dòng, không phải của số dòng đang nạp
And khi tôi cuộn thêm vài trang, ba số đó KHÔNG đổi
```

## US-06 — Badge điều chuyển đọc từ endpoint đếm

Là người dùng backoffice, tôi muốn con số trên tab "Điều chuyển từ cửa hàng khác" không
kéo theo một truy vấn nặng trên mọi trang tôi mở.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-20** — Endpoint đếm trả về một số
```gherkin
Given chi nhánh đang chọn có 10 lệnh điều chuyển chờ nhập
When tôi gọi GET /inventory/transfer-orders/importable/count
Then tôi nhận { "count": 10 }
And con số này bằng đúng độ dài mảng mà GET /inventory/transfer-orders/importable trả về cùng lúc
```

**AC-21** — Không còn nạp dòng phiếu xuất để dựng badge
```gherkin
Given tôi mở một trang backoffice bất kỳ ngoài Điều chuyển từ cửa hàng khác
When badge được dựng
Then server không chạy truy vấn nào trên goods_issue_lines cho lượt đó
And không có phiếu xuất nào được nạp cùng quan hệ eager của nó
```

**AC-22** — Không gọi khi thiếu quyền
```gherkin
Given tôi đăng nhập bằng tài khoản không có inventory.transfer.read
When tôi mở bất kỳ trang backoffice nào
Then không có request nào tới endpoint đếm được gửi đi
And không có 403 nào trong tab Network
```

## US-07 — Cache roles/branches phía server

Là người vận hành, tôi muốn `/auth/session` và `/branches/me` không đánh DB lại từ đầu ở mỗi
lần tải trang, mà vẫn thu hồi được phiên tức thì.

**Priority:** should
**Depends on:** —

### Acceptance criteria

**AC-23** — Lần gọi thứ hai phục vụ từ cache
```gherkin
Given tôi vừa gọi GET /auth/session một lần
When tôi gọi lại trong vòng TTL
Then resolveUserRoles và resolveUserBranches không chạy truy vấn DB nào
And phản hồi giống hệt lần đầu
And GET /branches/me lần thứ hai cũng không chạy truy vấn DB nào
```

**AC-24** — Thu hồi phiên và đổi quyền vẫn hiệu lực ngay
```gherkin
Given tôi đã gọi /auth/session và cache đang nóng
When phiên bị thu hồi (đăng xuất / xoá session khỏi Redis)
Then lần gọi /auth/session kế tiếp trả 401 ngay lập tức, không chờ hết TTL
And khi vai trò hoặc gán chi nhánh của tôi bị đổi, lần gọi kế tiếp phản ánh giá trị mới mà không cần chờ hết TTL
```
