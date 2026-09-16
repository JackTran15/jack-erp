---
feature: pos-catalog-product-images
stories: 2
acceptance_criteria: 6
---

# Requirements — POS hiển thị ảnh hàng hoá trên lưới catalog và dialog chọn biến thể

Fixture (media-storage, chi nhánh Hồ Chí Minh, `verify-fixtures.py --reset`):
`AAA-MEDIA-A` mẫu mã có màu/size + 3 ảnh, `AAA-MEDIA-B` hàng lẻ + 1 ảnh, `AAA-MEDIA-C`
không ảnh. Tìm `AIDLC` trên lưới ra đúng ba card này.

## US-01 — Lưới catalog hiện ảnh hàng hoá

Là thu ngân POS, tôi muốn ô hàng hoá trên lưới tư vấn hiện ảnh của hàng đó (khi đã có
ảnh), để nhận diện hàng bằng mắt thay vì bằng mã SKU.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Card có ảnh render ảnh phủ kín ô, badge giá vẫn đè lên
```gherkin
Given lưới catalog đang hiện card AAA-MEDIA-A và AAA-MEDIA-B (imageUrl khác null)
When lưới render xong
Then mỗi card có một <img> với src đúng bằng imageUrl của card, alt là tên card
And ảnh phủ kín vùng ảnh 120px của card (object-cover), không làm card cao hơn
And badge giá vẫn nằm góc dưới-trái, đè lên ảnh
And không còn ShoppingBagIcon trong hai card đó
```

**AC-02** — Card không có ảnh giữ placeholder như cũ
```gherkin
Given lưới catalog đang hiện card AAA-MEDIA-C (imageUrl = null)
When lưới render xong
Then card đó không có <img>, vẫn là ShoppingBagIcon trên nền xám như hiện tại
And badge giá và tên card không đổi vị trí
```

**AC-03** — Ảnh tải lỗi rơi về placeholder, không báo lỗi
```gherkin
Given một card có imageUrl trỏ tới URL không tải được (bucket chưa mở, file đã xoá)
When trình duyệt bắn sự kiện error của <img>
Then card hiện ShoppingBagIcon như card không có ảnh
And không có toast lỗi, không có console.error mới, lưới và các card khác không đổi
```

## US-02 — Dialog chọn biến thể hiện ảnh và cho xem cỡ lớn

Là thu ngân POS, khi mở dialog chọn biến thể tôi muốn thấy ảnh hàng đó ở khối thông tin
đầu dialog và bấm "Xem" để phóng to, để đối chiếu với hàng đang cầm trên tay.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-04** — Header dialog hiện thumbnail ảnh với nhãn "Xem"
```gherkin
Given tôi bấm card AAA-MEDIA-A trên lưới
When dialog chọn biến thể tải xong chi tiết (GET .../catalog/products/:id?kind=PRODUCT)
Then ô 96×96 ở đầu dialog là một <img> với src bằng imageUrl của chi tiết, có nhãn "Xem"
And phần còn lại của header (tên, Vị trí lưu kho, Vị trí trưng bày, Mô tả) không đổi
```

**AC-05** — Bấm "Xem" mở ảnh cỡ lớn; đóng lại trả về đúng dialog đang chọn
```gherkin
Given dialog chọn biến thể của AAA-MEDIA-A đang mở và tôi đã tick một biến thể
When tôi bấm vào ô ảnh "Xem"
Then một dialog thứ hai mở ra, chứa duy nhất ảnh đó ở kích thước lớn (tối đa khung nhìn) và nút đóng
When tôi bấm Esc hoặc nút đóng
Then chỉ dialog ảnh đóng; dialog chọn biến thể còn nguyên, biến thể đã tick vẫn tick
And focus trở về ô ảnh "Xem"
```

**AC-06** — Không có ảnh thì "Xem" không mở gì
```gherkin
Given tôi bấm card AAA-MEDIA-C trên lưới (imageUrl = null)
When dialog chọn biến thể tải xong
Then ô đầu dialog là ShoppingBagIcon + nhãn "Xem" như hiện tại
And bấm vào ô đó không mở dialog nào
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Contract | Không đổi `PosProductCardDto` / `PosProductDetailDto`; không có diff trong `apps/api/**`, `packages/api-client/**` | T-01-01, T-01-02 (`touches:` không có đường dẫn nào ngoài `apps/pos-web/src`) |
| Mạng | Không thêm request tới API: ảnh tải bằng `<img src>` thẳng từ `MEDIA_PUBLIC_BASE_URL`, không đi qua `erpApi` | T-01-01, T-01-02 (không thêm hook/query; review diff) |
| Hiệu năng | `<img loading="lazy" decoding="async">` trên card; tối đa 20 ảnh/trang | T-01-01 |
| Bố cục | Card giữ `h-[120px]`, không CLS khi ảnh tải xong; ô header dialog giữ 96×96 | AC-01, AC-04 (screenshot) |
| A11y | Ô "Xem" có ảnh là `<button type="button" aria-label="Xem ảnh {tên}">`; dialog ảnh có `aria-label` là tên hàng; ảnh có `alt` | T-01-02 |
| Ngôn ngữ | Chuỗi UI tiếng Việt; không có chuỗi mới ngoài "Xem" (đã có) và `aria-label` | T-01-02 |
