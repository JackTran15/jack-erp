---
feature: return-points-net-basis
stories: 3
acceptance_criteria: 11
---

# Requirements — Điểm trả hàng tính trên đúng số tiền khách đã trả

## Hoá đơn tái hiện

Lỗi chỉ hiện ra khi khuyến mại **không đều tay** giữa các dòng (A-R1). Mọi AC dưới đây
dùng chung hai hoá đơn dựng sẵn sau. Số đã tự kiểm chứng bằng chính công thức trong
`checkout-return.service.ts`, không lấy từ báo cáo hiện trường (A-03, A-R3).

**R1 — có khuyến mại, không tiêu điểm**

| | Dòng A | Dòng B |
|---|---|---|
| `line_total` (gộp) | 490.000 | 9.510.000 |
| `promotion_discount` | 26.000 | 0 |
| ròng | **464.000** | **9.510.000** |

`subtotal = 10.000.000` · `discount_amount = 26.000` · `points_discount_amount = 0` ·
`amount_due = 9.974.000` · `points_earned = floor(9.974.000/10.000) = 997`

**R2 — như R1 nhưng khách tiêu 1.000 điểm**

`subtotal = 10.000.000` · `discount_amount = 26.000` · `points_redeemed = 1.000` ·
`points_discount_amount = 500.000` · `amount_due = 9.474.000` · `points_earned = 947`

---

## US-01 — Trả hàng chỉ trừ đúng số điểm món đó đã tích

Là khách hàng, tôi muốn khi trả lại một món đã mua khuyến mại thì thẻ của tôi chỉ bị trừ
đúng số điểm món đó mang lại, để số dư điểm của tôi không bị hao đi sau mỗi lần trả.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Trả một phần hoá đơn khuyến mại không đều tay
```gherkin
Given hoá đơn R1 đã thanh toán, khách đã tích 997 điểm
When tôi trả lại dòng A (gộp 490.000, ròng 464.000)
Then số tiền hoàn là 464.000
And invoices.points_reversed của phiếu trả bằng 46
And không bằng 48 như cơ sở gộp hiện hành đang cho
```

**AC-02** — Bất biến phần giữ lại: điểm còn lại khớp với hàng còn giữ
```gherkin
Given hoá đơn R1 đã thanh toán, khách đã tích 997 điểm
When tôi trả lại dòng A và giữ lại dòng B
Then số điểm còn lại từ hoá đơn này là 997 − 46 = 951
And đúng bằng số điểm mà riêng dòng B tự nó mang lại: floor(9.510.000/10.000) = 951
And không phải 949 như cơ sở gộp hiện hành để lại
```

> Đây mới là bất biến đúng, không phải "tổng điểm trừ bằng điểm đã tích". Vì mỗi phiếu trả
> đều `floor` riêng nên `Σ floor(...) ≤ floor(Σ ...)` — tổng có thể hụt một vài điểm do làm
> tròn ở **cả hai** cơ sở, và cơ sở gộp cũng không vượt quá tổng. Vấn đề thật của cơ sở gộp
> là **phân bổ sai giữa các dòng**: dòng được khuyến mại gánh nhiều điểm hơn phần nó đã
> mang lại, nên khách trả đúng món đó thì bị hụt điểm trên **số hàng họ vẫn đang giữ**.

**AC-03** — Trả toàn bộ trong một lần vẫn đúng như trước
```gherkin
Given hoá đơn R1 đã thanh toán, points_earned = 997
When tôi trả cả hai dòng trong cùng một phiếu trả
Then points_reversed bằng đúng 997
And kết quả này không đổi so với hành vi hiện hành
```

**AC-04** — Hoá đơn v1 không khuyến mại giữ nguyên hành vi
```gherkin
Given một hoá đơn có mọi invoice_items.promotion_discount = 0
When tôi trả lại một phần bất kỳ của hoá đơn đó
Then số điểm bị trừ đúng bằng số mà cơ sở gộp hiện hành đang cho
And không có test hiện có nào của luồng này phải sửa kỳ vọng
```

**AC-05** — Trả nhanh không có hoá đơn gốc
```gherkin
Given một phiếu trả nhanh (QUICK) không tham chiếu hoá đơn gốc nào
When tôi chốt phiếu trả
Then không có lỗi chia cho 0 và không có giá trị NaN nào được ghi
And số điểm bị trừ theo đúng nhánh thoái lui hiện có
```

---

## US-02 — Điểm đã tiêu trên đơn gốc được hoàn lại theo đúng tỷ lệ tiền

Là khách hàng đã dùng điểm để giảm giá, tôi muốn khi trả lại hàng thì phần điểm được hoàn
tương ứng với phần tiền thực trả cho món đó, để cùng một phiếu trả không đứng trên hai
cơ sở khác nhau.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-06** — Hoàn điểm đã tiêu theo cơ sở ròng
```gherkin
Given hoá đơn R2 đã thanh toán, khách đã tiêu 1.000 điểm
When tôi trả lại dòng A
Then số điểm hoàn lại thẻ là 46
And không bằng 49 như cơ sở gộp hiện hành đang cho
```

**AC-07** — Trả toàn bộ hoàn lại đúng số điểm đã tiêu
```gherkin
Given hoá đơn R2 đã thanh toán, points_redeemed = 1.000
When tôi trả toàn bộ hoá đơn
Then số điểm hoàn lại thẻ bằng đúng 1.000
```

**AC-08** — Hoá đơn thanh toán trọn bằng điểm
```gherkin
Given một hoá đơn có amount_due = 0 vì điểm đã trả hết phần còn lại
When tôi trả lại một phần hoá đơn đó
Then không có phép chia cho 0 nào được thực hiện
And số điểm hoàn lại là một số nguyên hữu hạn, không phải NaN
```

**AC-09** — Nhiều lần trả từng phần không hoàn quá số đã tiêu
```gherkin
Given hoá đơn R2 đã thanh toán, points_redeemed = 1.000
When tôi trả từng dòng ở các phiếu trả riêng cho tới khi hết hàng
Then tổng số điểm hoàn lại không vượt quá 1.000
```

---

## US-03 — Con số trên phiếu và con số vào thẻ luôn khớp nhau

Là kế toán, tôi muốn ảnh chụp điểm in trên phiếu trả và số điểm thực sự trừ vào thẻ luôn
là một, để khiếu nại của khách đối chiếu được mà không phải tra tay `point_history`.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-10** — Ảnh chụp và sự kiện dùng chung một cơ sở
```gherkin
Given bất kỳ phiếu trả nào trong AC-01..AC-09
When phiếu trả được chốt
Then invoices.points_reversed và số điểm trong sự kiện đảo điểm gửi đi bằng nhau
And cả hai cùng đến từ một hàm tính duy nhất
```

**AC-11** — Số dư dự kiến khớp số dư thực
```gherkin
Given hoá đơn R2 và thẻ khách có số dư đã biết trước
When tôi trả lại dòng A và consumer đảo điểm đã chạy xong
Then invoices.points_balance_after bằng đúng số dư thực trên thẻ
```

---

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Tương thích ngược | Không hoá đơn v1 nào (mọi `promotion_discount = 0`) đổi số điểm | T-01-04 |
| Tài liệu | Docblock `checkout-return.service.ts:507-513` — nhận định "`returnSubtotal` stays GROSS on purpose" nay đã sai — được viết lại nêu rõ cơ sở mới và vì sao đổi | T-01-05 |
| Ngôn ngữ | Mọi docblock, log, thông báo lỗi mới trong backend viết bằng tiếng Anh | T-01-05 |
| Dữ liệu lịch sử | Không migration nào chạm vào `point_history`, `membership_cards` hay `invoices` đã post (A-02) | T-01-05 |
| Chất lượng test | Mọi case trong `checkout-return.service.spec.ts` đang khoá cơ sở gộp được sửa có chủ đích, kèm lý do trong diff — không sửa kỳ vọng cho xanh (A-08) | T-01-04 |
