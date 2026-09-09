# Requirements — pos-catalog-page-load

Nền đo trên `erp_dev_3008`, org `e60e5f49-304d-4eb1-9735-3a2d10ba288f` ("MT"),
chi nhánh Cà Mau `0905fbc6-5746-417c-afe6-8c6265c4ddd6` (10 400 item POS-visible có
tồn, 12 318 dòng `stock_balances`) và Nha Trang `64f44dbe-…` (8 187 item).

## US-01 — Mở trang bán hàng không kéo cả kho về

> Là thu ngân, tôi muốn mở màn bán hàng là gõ được ngay, không phải chờ trình duyệt
> tải và parse vài megabyte dữ liệu mà màn hình không hiển thị.

**AC-01** — Không còn request tải toàn catalog
```gherkin
Given thu ngân mở /pos/ ở chi nhánh Cà Mau với giỏ trống
When trang tải xong
Then không có request nào tới GET /pos/branches/:id/catalog (không tham số search)
And không có request nào tới POST /pos/branches/:id/catalog/stock
```

**AC-02** — Payload lúc mở trang có trần
```gherkin
Given cùng chi nhánh đó
When trang tải xong
Then tổng byte của mọi request tới /catalog* ≤ 100 kB
```
Baseline: `GET /catalog` một mình = 10 400 phần tử ≈ 3 835 kB.

**AC-03** — Ô tìm hàng dùng được ngay
```gherkin
Given thu ngân vừa mở trang, lưới sản phẩm còn đang tải
When thu ngân bấm vào ô "(F3) Nhập tên hàng hóa, mã vạch, mã SKU"
Then ô nhận được focus và gõ được
```
Baseline: ô bị `disabled={catalogLoading}` cho tới khi 3 835 kB về xong.

## US-02 — Cảnh báo bán vượt tồn vẫn đúng

> Là thu ngân, tôi muốn chấm cảnh báo vượt tồn trên từng dòng giỏ vẫn đúng, kể cả
> dòng khôi phục từ hoá đơn lưu tạm.

**AC-04** — Tồn của dòng giỏ được làm tươi theo đúng những item đang có trong giỏ
```gherkin
Given giỏ có 3 dòng
When hook đồng bộ tồn chạy
Then đúng 1 request POST /catalog/stock với body chứa đúng 3 itemId
And response chứa đúng 3 phần tử
And không có request nào tới GET /catalog
```

**AC-05** — Giỏ rỗng thì không hỏi gì
```gherkin
Given giỏ không có dòng nào
When hook đồng bộ tồn chạy
Then không có request nào tới /catalog/stock
```

**AC-06** — Dòng khôi phục từ hoá đơn lưu tạm được điền tồn
```gherkin
Given một hoá đơn lưu tạm có 2 dòng, thu ngân mở lại nó
When giỏ được khôi phục
Then cả 2 dòng có snapshot tồn (maxQty), không dòng nào ở trạng thái onHandUnknown
And chấm cảnh báo vượt tồn hiện đúng theo sellableQuantity của từng dòng
```
Đây là ca mà vòng lặp effect trong `use-sync-cart-on-hand.ts` tồn tại vì nó —
dòng thêm vào **sau** lần fetch cuối.

**AC-07** — `sellableQuantity` từ endpoint mới bằng đúng từ đường cũ
```gherkin
Given một item có tồn ở chi nhánh và có dòng kho tạm đang mở
When gọi POST /catalog/stock với itemId đó
And gọi GET /catalog/search?q=<code>&mode=exact với cùng item
Then sellableQuantity của hai đường bằng nhau
```

## US-03 — Enter vẫn thêm được hàng

> Là thu ngân, tôi muốn gõ tên hàng rồi Enter là thêm được, như trước.

**AC-08** — Enter khớp đúng một mặt hàng
```gherkin
Given chuỗi "ABA2777-D-38" khớp đúng 1 mặt hàng ở chi nhánh
When thu ngân gõ chuỗi đó và nhấn Enter
Then mặt hàng được thêm vào giỏ
And ô tìm được xoá
```

**AC-09** — Enter khớp 0 và khớp nhiều
```gherkin
Given chuỗi "zzzz-khong-ton-tai"
When thu ngân nhấn Enter
Then hiện lỗi "Không tìm thấy hàng hoá"
Given chuỗi "ABA" khớp nhiều mặt hàng
When thu ngân nhấn Enter
Then hiện lỗi "Nhiều kết quả — chọn hàng bên dưới hoặc thu hẹp từ khóa."
```

**AC-10** — Dialog biến thể mở được từ chuỗi tìm
```gherkin
Given chuỗi khớp đúng 1 mặt hàng thuộc một product có biến thể
When openForQuery() chạy
Then dialog chọn biến thể mở với đúng productId của mặt hàng đó
```

## US-04 — Không hồi quy

**AC-11** — Chuyển kho nhanh không đổi
```gherkin
Given FastStockTransferPage dùng useSearchPosBranchCatalog, không dùng useCatalogQuery
When tìm hàng và chọn kho nguồn ở màn đó
Then hành vi không đổi so với trước thay đổi
```

**AC-12** — `GET /catalog` giữ nguyên hợp đồng
```gherkin
Given endpoint GET /pos/branches/:id/catalog vẫn tồn tại
When gọi nó với và không có search
Then response giữ nguyên shape PosCatalogLine đầy đủ như trước
```
Feature này gỡ **trang POS** khỏi endpoint, không xoá endpoint.
