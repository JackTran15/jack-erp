---
feature: return-debt-refund-split
stories: 4
acceptance_criteria: 18
---

# Requirements — Trả hàng trên hoá đơn còn nợ

Ký hiệu dùng chung trong các AC:

- `hoàn` = `refundedAmount` — giá trị ròng của hàng khách trả lại (đã chốt ở feature
  `return-points-net-basis`, không đổi trong feature này).
- `dư nợ` = `invoice_debts.remaining_amount` của **hoá đơn gốc**, đọc trong cùng
  transaction.
- `cấn trừ` = `min(hoàn, dư nợ)`.
- `chi ra` = `hoàn − cấn trừ`.
- `đã thực thu` = `phải thu (amountDue) − dư nợ` — số tiền cửa hàng thật sự đã cầm.

---

## US-01 — Tách khoản hoàn giữa công nợ và tiền chi ra

Là **thu ngân POS**, khi trả hàng cho hoá đơn còn nợ tôi muốn hệ thống tự trừ công nợ
trước rồi chỉ chi ra phần khách đã thực trả, để cửa hàng không mất tiền và khách không bị
nuốt phần đã trả.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Ca của QA: trả toàn bộ hoá đơn nợ một phần

```gherkin
Given hoá đơn gốc INV-202608-00022 có phải thu 765.000, khách đã trả 300.000, dư nợ 465.000
  And phiếu trả nhận lại toàn bộ hàng của hoá đơn đó (hoàn = 765.000)
  And thu ngân chọn hình thức đổi trả "Tiền mặt"
When thu ngân xác nhận phiếu trả
Then công nợ hoá đơn gốc giảm 465.000 và về trạng thái đã thanh toán (dư nợ = 0)
  And phiếu chi tiền mặt sinh ra đúng 300.000, không phải 765.000
  And phiếu trả ghi refundedAmount = 765.000 và offsetAmount = 465.000
```

**AC-02** — Trả một phần, khoản hoàn nhỏ hơn dư nợ

```gherkin
Given hoá đơn gốc có phải thu 765.000, đã trả 300.000, dư nợ 465.000
  And phiếu trả chỉ nhận lại một phần hàng, hoàn = 300.000
When thu ngân xác nhận phiếu trả
Then toàn bộ 300.000 đi giảm công nợ, dư nợ còn 165.000
  And không có phiếu chi tiền mặt nào được sinh
  And phiếu trả ghi refundedAmount = 300.000 và offsetAmount = 300.000
```

**AC-03** — Hoá đơn bán chịu đã trả hết nợ vẫn được hoàn đủ (chống hồi quy A-R1)

```gherkin
Given hoá đơn gốc bán chịu 765.000 mà khách đã trả nợ đủ qua phiếu thu
  And invoices.total_paid vẫn đọc 0 vì debt_payments không ghi ngược
  And dòng công nợ ở trạng thái đã thanh toán, dư nợ = 0
When trả toàn bộ hàng (hoàn = 765.000)
Then không có khoản cấn trừ nào (offsetAmount = 0)
  And phiếu chi tiền mặt sinh ra đủ 765.000
```

**AC-04** — Hoá đơn thu tiền ngay: hành vi cũ không đổi

```gherkin
Given hoá đơn gốc thanh toán đủ lúc bán, không có dòng invoice_debts
When trả toàn bộ hàng (hoàn = 765.000)
Then phiếu chi sinh ra đủ 765.000 và offsetAmount = 0
  And không có truy vấn nào làm thay đổi công nợ khách
```

**AC-05** — Nợ toàn phần: hoàn 100% nhưng không chi đồng nào

```gherkin
Given hoá đơn gốc bán chịu toàn phần: phải thu 765.000, đã trả 0, dư nợ 765.000
When trả toàn bộ hàng (hoàn = 765.000)
Then công nợ về 0 (cấn trừ 765.000)
  And không có phiếu chi tiền mặt nào được sinh
```

**AC-06** — Trả nhanh không có hoá đơn gốc: giữ nguyên

```gherkin
Given phiếu trả nhanh (QUICK) không tham chiếu hoá đơn gốc nào
When thu ngân xác nhận phiếu trả với hoàn = 500.000
Then phiếu chi sinh ra đủ 500.000
  And không có bước tra công nợ nào chạy
```

**AC-07** — Bất biến tiền của một phiếu trả

```gherkin
Given bất kỳ phiếu trả/đổi nào có hoá đơn gốc
When phiếu được post
Then cấn trừ + chi ra = refundedAmount, sai số 0 đồng
  And chi ra <= đã thực thu trên hoá đơn gốc tại thời điểm post
  And cấn trừ >= 0 và chi ra >= 0
```

**AC-08** — Đổi hàng lệch giá trên hoá đơn còn nợ

```gherkin
Given hoá đơn gốc còn dư nợ 465.000
  And phiếu ĐỔI trả lại hàng 765.000 và mua thêm hàng 200.000, netAmount = -565.000
When thu ngân xác nhận
Then cấn trừ = 465.000 và phiếu chi tiền mặt = 100.000
  And công nợ hoá đơn gốc về 0
```

**AC-09** — Nhiều lần trả một phần liên tiếp

```gherkin
Given hoá đơn gốc phải thu 765.000, đã trả 300.000, dư nợ 465.000
When trả lần một với hoàn = 400.000
  And trả lần hai với hoàn = 365.000
Then tổng cấn trừ hai lần = 465.000 và tổng chi ra hai lần = 300.000
  And công nợ hoá đơn gốc về 0 sau lần hai, không âm
```

**AC-10** — Hoàn qua tài khoản ngân hàng vẫn tách đúng

```gherkin
Given hoá đơn gốc còn dư nợ 465.000 và hoàn = 765.000
  And thu ngân chọn hình thức đổi trả là một tài khoản ngân hàng
When thu ngân xác nhận phiếu trả
Then cấn trừ 465.000 vào công nợ
  And quỹ tiền gửi của tài khoản đã chọn ghi rút đúng 300.000
  And không có bút toán tiền mặt nào phát sinh
```

---

## US-02 — Sổ quỹ và sổ công nợ khớp nhau trên cùng một phiếu

Là **kế toán**, tôi muốn một phiếu trả hàng sinh đúng hai chân (giảm công nợ + chi tiền)
để sổ quỹ, sổ công nợ và bút toán không mâu thuẫn.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-11** — Bút toán trả hàng ghi cả hai chân

```gherkin
Given phiếu trả có cấn trừ 465.000 và chi tiền mặt 300.000
When consumer bút toán trả hàng xử lý sự kiện
Then bút toán ghi giảm phải thu khách đúng 465.000
  And chân tiền 300.000 do chứng từ chi tiền mặt sở hữu, không bị ghi hai lần
  And tổng nợ = tổng có trên mọi bút toán sinh ra từ phiếu
```

**AC-12** — Không sinh phiếu chi rỗng

```gherkin
Given phiếu trả có chi ra = 0 (toàn bộ đi cấn trừ)
When phiếu được post
Then không có phiếu chi tiền mặt hay phiếu chi ngân hàng nào được tạo
  And sổ quỹ không xuất hiện dòng 0 đồng
```

**AC-13** — Tab Công nợ hiển thị đúng khoản cấn trừ

```gherkin
Given phiếu trả đã cấn trừ 465.000 vào hoá đơn gốc
When mở tab Công nợ của khách
Then có một dòng điều chỉnh mang mã phiếu trả, số tiền -465.000, đã tất toán
  And số dư công nợ luỹ kế của khách giảm đúng 465.000
```

---

## US-03 — POS hiện rõ khoản tách trước khi xác nhận

Là **thu ngân POS**, tôi muốn thấy trước sẽ trừ công nợ bao nhiêu và chi ra bao nhiêu, để
giải thích được cho khách ngay tại quầy.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-14** — Khối tách tiền trên màn hình thanh toán

```gherkin
Given giỏ trả hàng tham chiếu hoá đơn gốc còn dư nợ 465.000
  And tổng khoản hoàn là 765.000
When màn hình thanh toán hiển thị
Then có dòng "Trừ công nợ" hiện 465.000
  And dòng số tiền chi ra hiện 300.000
  And hai số cộng lại đúng bằng khoản hoàn, định dạng vi-VN
```

**AC-15** — Ô "Tính vào công nợ" biến mất khỏi luồng hoàn tiền

```gherkin
Given giỏ đang ở luồng hoàn tiền (số tiền quyết toán âm)
When màn hình thanh toán hiển thị
Then không còn ô tích "Tính vào công nợ"
  And payload gửi lên không bao giờ mang refundMethod = OFFSET
```

**AC-16** — Hoá đơn không nợ không hiện dòng thừa

```gherkin
Given giỏ trả hàng tham chiếu hoá đơn gốc đã thanh toán đủ
When màn hình thanh toán hiển thị
Then không hiện dòng "Trừ công nợ"
  And ô ghi nợ của đơn đổi có netAmount > 0 vẫn hiển thị như cũ
```

---

## US-04 — Huỷ phiếu trả đã tách hoàn nguyên đúng cả hai chân

Là **quản lý cửa hàng**, khi huỷ một phiếu trả đã vừa cấn trừ vừa chi tiền, tôi muốn công
nợ trở lại đúng như cũ và chỉ thu lại đúng số tiền đã chi, để việc huỷ không tạo ra sai
lệch mới.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-17** — Huỷ phiếu trả đã tách

```gherkin
Given phiếu trả đã cấn trừ 465.000 và chi tiền mặt 300.000, refundMethod ghi là tiền mặt
When quản lý huỷ phiếu trả đó
Then công nợ hoá đơn gốc quay lại 465.000 và trạng thái mở
  And chân thu lại tiền của khách đúng 300.000, không phải 765.000
  And phiếu chi 300.000 được đảo bằng chứng từ thu tương ứng
```

**AC-18** — Huỷ phiếu trả cấn trừ toàn phần

```gherkin
Given phiếu trả đã cấn trừ 765.000 và không chi đồng nào
When quản lý huỷ phiếu trả đó
Then công nợ hoá đơn gốc quay lại 765.000
  And không có chân thu lại tiền nào được sinh
```
