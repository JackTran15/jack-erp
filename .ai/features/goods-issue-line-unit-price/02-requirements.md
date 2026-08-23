---
feature: goods-issue-line-unit-price
stories: 4
acceptance_criteria: 12
---

# Requirements — Đơn giá theo từng dòng trên phiếu xuất kho

## US-01 — Hai mức giá cho cùng một mã hàng trên một phiếu xuất

Là **thủ kho**, tôi muốn nhập hai dòng cùng một mã hàng ở hai đơn giá khác nhau trên cùng một
phiếu xuất, để phiếu phản ánh đúng thực tế lô hàng thay vì bị hệ thống quy về một giá.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Giữ nguyên đơn giá người dùng nhập
```gherkin
Given tôi đang ở "Thêm mới phiếu xuất kho" với mục đích "Điều chuyển đến cửa hàng khác"
  And tôi nhập dòng 1: DD780, kho KHO SG, số lượng 30, đơn giá 350.000
  And tôi nhập dòng 2: DD780, kho KHO SG, số lượng 60, đơn giá 340.000
When tôi bấm "Lưu" rồi mở lại phiếu vừa tạo
Then dòng 1 hiển thị đơn giá 350.000 và thành tiền 10.500.000
  And dòng 2 hiển thị đơn giá 340.000 và thành tiền 20.400.000
  And phiếu vẫn có đúng hai dòng DD780 tách biệt, không bị gộp
```

**AC-02** — Sổ kho ghi theo đúng đơn giá từng dòng
```gherkin
Given phiếu xuất ở AC-01 đã ở trạng thái POSTED
When tôi đọc stock_ledger_entries theo reference_id của phiếu
Then tổng line_value bằng đúng -30.900.000
  And tổng quantity bằng đúng -90
```

**AC-03** — Dòng bỏ trống đơn giá vẫn lấy bình quân tức thời
```gherkin
Given tôi thêm một dòng DD480 với số lượng 30 và để đơn giá bằng 0
When tôi lưu phiếu
Then dòng DD480 được ghi sổ theo giá vốn bình quân tức thời của DD480 tại chi nhánh
  And đơn giá hiển thị trên dòng đó bằng chính giá vốn đó, không phải 0
```

**AC-04** — Đơn giá âm bị từ chối
```gherkin
Given tôi nhập một dòng có đơn giá nhỏ hơn 0
When tôi bấm "Lưu"
Then hệ thống từ chối lưu và báo lỗi rõ dòng nào sai
  And không có dòng stock_ledger_entries nào được ghi
```

---

## US-02 — Sửa phiếu xuất đã ghi sổ mà không mất đơn giá từng dòng

Là **kế toán kho**, tôi muốn sửa một phiếu xuất đã ghi sổ mà hai dòng trùng mã hàng vẫn giữ
đúng đơn giá riêng, để không phải huỷ phiếu và lập lại từ đầu.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-05** — Sửa số lượng giữ nguyên đơn giá từng dòng
```gherkin
Given phiếu xuất ở AC-01 đã POSTED với hai dòng DD780 (30 × 350.000 và 60 × 340.000)
When tôi sửa dòng 2 từ 60 xuống 50 rồi lưu
Then dòng 1 vẫn là 30 × 350.000 và dòng 2 là 50 × 340.000
  And không dòng nào bị gán lại đơn giá theo dòng còn lại
```

**AC-06** — INV-2 đúng sau khi sửa
```gherkin
Given phiếu vừa sửa ở AC-05
When tôi cộng line_value của mọi stock_ledger_entries có reference_id của phiếu
Then tổng bằng đúng -27.500.000, khớp tổng (số lượng × đơn giá) của các dòng phiếu hiện tại
  And không dòng stock_ledger_entries hay journal_entries cũ nào bị UPDATE hoặc DELETE
```

**AC-07** — Tăng số lượng định giá theo đơn giá của chính dòng đó, không theo bình quân
```gherkin
Given phiếu xuất ở AC-01 đã POSTED
When tôi tăng dòng 1 từ 30 lên 40, giữ nguyên đơn giá 350.000, rồi lưu
Then bút toán chênh lệch ghi thêm 10 đơn vị ở đơn giá 350.000
  And đơn giá đó không phải giá vốn bình quân tức thời của DD780
  And tổng line_value của phiếu bằng đúng -34.400.000 (= 40 × 350.000 + 60 × 340.000)
```

**AC-12** — Vừa đổi giá vừa đổi số lượng: chốt bằng bất biến, không bằng đơn giá bút toán
```gherkin
Given phiếu xuất ở AC-01 đã POSTED
When tôi tăng dòng 1 từ 30 lên 40 và đồng thời đổi đơn giá dòng đó thành 360.000, rồi lưu
Then dòng 1 lưu là 40 × 360.000 và dòng 2 vẫn là 60 × 340.000
  And tổng line_value của phiếu bằng đúng -34.800.000
  And đơn giá trên dòng bút toán chênh lệch là số dẫn xuất (|valueDelta / quantityDelta|),
      không phải đơn giá của bất kỳ dòng phiếu nào — đây là hệ quả đã biết của việc
      computeVoucherDelta gộp theo (item, location), xem ADR-03
```

**AC-08** — Xoá một trong hai dòng trùng SKU
```gherkin
Given phiếu xuất ở AC-01 đã POSTED
When tôi xoá dòng 2 (60 × 340.000) rồi lưu
Then bút toán đảo đúng 60 đơn vị ở đơn giá 340.000, không phải ở 350.000
  And dòng 1 giữ nguyên 30 × 350.000
```

---

## US-03 — Điều chuyển liên chi nhánh giữ đúng giá từng dòng ở cả hai đầu

Là **kế toán kho**, tôi muốn chi nhánh nhận thấy đúng các dòng và đơn giá mà chi nhánh gửi
đã xuất, để giá trị hàng hoá không lệch giữa hai chi nhánh.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-09** — Chân nhập soi gương chân xuất theo từng dòng
```gherkin
Given chi nhánh gửi đã xuất một lệnh điều chuyển qua form, với hai dòng DD780
      (30 × 350.000 và 60 × 340.000)
When chi nhánh đích nhận lệnh điều chuyển đó
Then phiếu nhập sinh ra có đúng hai dòng DD780 với đơn giá 350.000 và 340.000
  And tổng giá trị phiếu nhập bằng đúng tổng giá trị phiếu xuất
```

**AC-10** — Sửa lệnh điều chuyển không nhân đôi chênh lệch trên dòng trùng SKU
```gherkin
Given lệnh điều chuyển ở AC-09 đã xuất và đã nhập
When chi nhánh đích sửa số lượng DD780 giảm 10 đơn vị
Then tổng chênh lệch áp lên chân xuất đúng bằng 10 đơn vị, không phải 20
  And chân xuất vẫn giữ hai dòng với hai đơn giá riêng
```

---

## US-04 — Không phá vỡ các phiếu do hệ thống tự sinh

Là **người vận hành hệ thống**, tôi muốn các phiếu xuất do hệ thống tự sinh tiếp tục ghi sổ
đúng như trước, để thay đổi này không âm thầm làm sai giá vốn ở những luồng không ai kiểm.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-11** — Chân xuất tự sinh của lệnh điều chuyển và phiếu xuất từ kiểm kê giữ nguyên hành vi
```gherkin
Given một lệnh điều chuyển được chuyển sang "Đang thực hiện" mà không qua form nhập giá
When hệ thống tự sinh phiếu xuất chân nguồn
Then phiếu đó ghi sổ theo items.purchase_price như dòng code hiện có (A-03)
  And phiếu xuất chênh lệch do kiểm kê sinh ra vẫn ghi sổ theo ảnh giá của
      `ItemCostSnapshotService.snapshotCosts`, **không đổi** so với trước feature
```
