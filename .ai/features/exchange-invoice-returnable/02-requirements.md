---
feature: exchange-invoice-returnable
stories: 3
acceptance_criteria: 11
---

# Requirements — Đổi trả theo hoá đơn trên hoá đơn đổi trả

## US-01 — Tìm thấy hoá đơn đổi trong danh sách đổi trả

Là thu ngân POS, tôi muốn hoá đơn đổi trả còn hàng "Mua thêm" chưa trả hết xuất hiện
trong màn hình `Đổi trả hàng`, để khách mang hàng của lần đổi trước quay lại thì tôi
đổi trả **theo hoá đơn** được, thay vì phải dùng `Đổi trả nhanh`.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Hoá đơn đổi còn hàng mua thêm thì hiện trong lưới
```gherkin
Given một hoá đơn EXCHANGE đã post ở chi nhánh đang làm việc
  And hoá đơn đó có ít nhất một dòng direction = OUT với quantity > returned_quantity
When thu ngân mở màn hình Đổi trả hàng với khoảng ngày bao trùm hoá đơn đó
Then hoá đơn đó xuất hiện trong lưới
```

**AC-02** — Hoá đơn trả thuần không hiện
```gherkin
Given một hoá đơn RETURN đã post (chỉ có dòng direction = IN)
When thu ngân mở màn hình Đổi trả hàng
Then hoá đơn đó KHÔNG xuất hiện trong lưới
```

**AC-03** — Hoá đơn đổi đã trả hết hàng mua thêm thì rơi khỏi lưới
```gherkin
Given một hoá đơn EXCHANGE mà mọi dòng OUT đều có returned_quantity = quantity
When thu ngân mở màn hình Đổi trả hàng
Then hoá đơn đó KHÔNG xuất hiện trong lưới
```

**AC-04** — Hoá đơn đổi ghi nợ vẫn trả được
```gherkin
Given một hoá đơn EXCHANGE có net > 0 được ghi nợ, status = DEBT hoặc PARTIAL_DEBT
When thu ngân mở màn hình Đổi trả hàng
Then hoá đơn đó xuất hiện trong lưới
```

**AC-05** — Tổng ở chân lưới khớp với số dòng đang lọc
```gherkin
Given lưới đang lọc ra một tập gồm cả hoá đơn bán lẫn hoá đơn đổi
When thu ngân đọc ô "Tổng thanh toán" ở chân trang
Then tổng đó bằng đúng tổng có dấu của toàn bộ tập khớp bộ lọc
  And hoá đơn đổi đóng góp netAmount (âm khi cửa hàng đã hoàn tiền), hoá đơn bán đóng góp amountDue
```

---

## US-02 — Phân biệt được loại chứng từ trên lưới

Là thu ngân POS, tôi muốn nhìn ra ngay dòng nào là hoá đơn bán và dòng nào là hoá đơn
đổi, để không chọn nhầm chứng từ khi khách đứng chờ.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-06** — Cột Loại
```gherkin
Given lưới Đổi trả hàng đang hiện cả hoá đơn bán lẫn hoá đơn đổi
When thu ngân nhìn vào lưới
Then mỗi dòng có một cột "Loại" ghi "Bán hàng" hoặc "Đổi trả"
```

**AC-07** — Tổng thanh toán có dấu
```gherkin
Given một hoá đơn đổi mà cửa hàng đã hoàn tiền cho khách (netAmount < 0)
When thu ngân nhìn dòng đó
Then cột "Tổng thanh toán" hiện số âm, đúng bằng netAmount
```

---

## US-03 — Chỉ trả được đúng phần hàng khách đang cầm

Là kế toán, tôi muốn khi mở một hoá đơn đổi ra trả, hệ thống chỉ chào các dòng "Mua
thêm" và chặn trả quá số lượng, để không sinh xuất kho khống và chi tiền khống.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-08** — Chỉ chào dòng Mua thêm
```gherkin
Given một hoá đơn EXCHANGE có 1 dòng IN (hàng khách đã trả) và 2 dòng OUT (mua thêm)
When thu ngân bấm Trả hàng trên hoá đơn đó
Then hộp thoại chỉ liệt kê 2 dòng OUT
  And không dòng nào trong danh sách là dòng IN
```

**AC-09** — Giá hoàn bằng giá đã tính cho khách ở lần đổi
```gherkin
Given một dòng OUT có lineTotal = 1.200.000 cho quantity = 2
When thu ngân mở hộp thoại trả hàng
Then refundableUnitPrice của dòng đó = 600.000
  And số tiền checkout thực tính cho 2 đơn vị = 1.200.000
```

**AC-10** — Không trả vượt số lượng đã bán
```gherkin
Given một dòng OUT có quantity = 2 và returned_quantity = 1
When thu ngân mở hộp thoại trả hàng
Then maxReturnable của dòng đó = 1
  And gửi yêu cầu trả 2 đơn vị bị từ chối với lỗi vượt số lượng
```

**AC-11** — Không trả được dòng hàng khách đã trả
```gherkin
Given id của một dòng direction = IN thuộc một hoá đơn EXCHANGE
When client gửi dòng đó làm originalInvoiceItemId khi tạo phiếu trả
Then API từ chối với 400 và không tạo chứng từ nào
```

---

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Nhất quán | Số POS xem trước (`refundableUnitPrice × qty`) bằng đúng số `computeReturnedNet` tính lúc checkout, cho mọi hoá đơn gốc kiểu EXCHANGE | T-01-02 |
| Bất biến dữ liệu | Không migration, không sửa hàng đã post; chỉ đọc | T-01-01 |
| Nhất quán lưới/tổng | Mọi vị từ lọc dòng đều có mặt trong truy vấn tổng — lưới và footer không bao giờ lệch | T-01-01 |
| Hồi quy | Hoá đơn `SALE` giữ nguyên hành vi cũ từng chi tiết (danh sách, dòng chào trả, giá hoàn) | T-01-01, T-01-02 |
| Ngôn ngữ | Source backend tiếng Anh; chuỗi UI tiếng Việt | T-02-01 |
