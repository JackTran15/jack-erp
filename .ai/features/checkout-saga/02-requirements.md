---
feature: checkout-saga
stories: 5
acceptance_criteria: 22
---

# Requirements — Checkout Saga v2

Mọi tiêu chí dưới đây nói về endpoint **mới** `POST /v2/pos/checkout`. Luồng cũ
`POST /invoices/:id/checkout` giữ nguyên hành vi và được dùng làm mốc đối chiếu.

## US-01 — Chạy thử một đơn mà không ghi gì

Là **thu ngân / dev trực**, tôi muốn chạy checkout ở chế độ thử trên một draft thật
để thấy hệ thống sẽ làm gì, trước khi có bất kỳ dòng nào được ghi.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Dry-run chạy hết phase preflight và không ghi gì
```gherkin
Given một hóa đơn draft hợp lệ có 3 dòng hàng, mỗi dòng có locationId
When tôi gọi POST /v2/pos/checkout với dryRun = true
Then tôi nhận về danh sách 5 step preflight, mỗi step có tên, trạng thái OK và thời lượng
And tôi nhận về totals gồm subtotal, amountDue, totalPaid, remainder, newStatus
And SELECT count(*) trên invoices, invoice_payments, invoice_debts, stock_ledger_entries,
    journal_entries, cash_movements, outbox_messages, checkout_saga không đổi trước và sau
```

**AC-02** — Dry-run tính ra đúng con số luồng cũ tính ra
```gherkin
Given một hóa đơn draft có chiết khấu tay, điểm đã đổi và tiền đặt cọc
When tôi chạy dry-run trên hóa đơn đó
Then amountDue trả về bằng đúng computeAmountDue(subtotal, discountAmount, pointsDiscountAmount, depositAmount)
And pointsEarned bằng floor(amountDue / POINT_EARN_VND_PER_POINT)
```

**AC-03** — Lỗi cấu hình lộ ra ở preflight, không phải sau khi ghi
```gherkin
Given chi nhánh chưa cấu hình quỹ tiền mặt
When tôi gọi POST /v2/pos/checkout (dryRun hoặc thật) cho một đơn có dòng thanh toán tiền mặt
Then tôi nhận lỗi 400 ngay ở step resolve-funds
And trace cho thấy step resolve-funds là FAILED và không step transactional nào đã chạy
```

**AC-04** — Draft không hợp lệ bị chặn ở step đầu
```gherkin
Given một hóa đơn đã ở trạng thái PAID, hoặc một draft không có dòng hàng nào,
      hoặc một draft có dòng hàng thiếu locationId
When tôi gọi POST /v2/pos/checkout
Then tôi nhận 400 với thông điệp chỉ đúng nguyên nhân
And trace dừng ở step load-draft
```

## US-02 — Thanh toán một đơn bán, đạt parity với luồng cũ

Là **thu ngân**, tôi muốn thanh toán đơn qua luồng mới và nhận kết quả giống hệt luồng cũ,
để chuyển đổi không đổi nghiệp vụ.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-05** — Bán thu đủ tiền mặt
```gherkin
Given một draft 3 dòng và một dòng thanh toán tiền mặt bằng đúng amountDue
When tôi gọi POST /v2/pos/checkout
Then hóa đơn có status PAID, isDraft = false, có code thật và issuedAt
And có đúng 1 dòng invoice_payments với accountId do server resolve
And không có dòng invoice_debts nào
```

**AC-06** — Bán công nợ và bán trả một phần
```gherkin
Given một draft có khách hàng và số tiền trả nhỏ hơn amountDue
When tôi gọi POST /v2/pos/checkout
Then status là PARTIAL_DEBT khi có trả một phần, và DEBT khi không trả đồng nào
And có đúng 1 dòng invoice_debts với remainingAmount bằng phần còn thiếu, kèm dueDate và creditDays
```

**AC-07** — Chặn trả thừa và chặn công nợ không có khách
```gherkin
Given tổng tiền trả lớn hơn amountDue, hoặc còn nợ mà hóa đơn không có customerId
When tôi gọi POST /v2/pos/checkout
Then tôi nhận 400 và không có dòng nào được ghi
```

**AC-08** — Chia nhiều hình thức thanh toán
```gherkin
Given một draft trả bằng tiền mặt và chuyển khoản trên hai dòng khác nhau
When tôi gọi POST /v2/pos/checkout
Then mỗi dòng invoice_payments mang đúng accountId và depositAccountId server resolve theo paymentAccountId client chọn
```

**AC-09** — Đổi điểm trừ đúng trong transaction
```gherkin
Given một draft có pointsRedeemed > 0 trên thẻ có đủ điểm
When tôi gọi POST /v2/pos/checkout
Then điểm bị trừ trên thẻ và có dòng point_history REDEEM
And invoice.pointsBalanceAfter bằng số dư thẻ sau khi trừ điểm đổi và cộng điểm tích
And nếu thẻ không đủ điểm thì cả đơn rollback, không có dòng nào được ghi
```

**AC-10** — Cùng idempotency key thì replay, không sinh đơn thứ hai
```gherkin
Given tôi đã checkout thành công một đơn với header x-idempotency-key = K
When tôi gọi lại đúng request đó với cùng K
Then tôi nhận lại đúng kết quả cũ, cùng sagaId và cùng mã hóa đơn
And không có hóa đơn thứ hai và không có bút toán thứ hai
```

**AC-11** — Chạy lại được sau khi hỏng, và chặn được checkout đồng thời
```gherkin
Given một lần chạy trước đó đã FAILED trên cùng hóa đơn
When tôi gọi lại POST /v2/pos/checkout cho hóa đơn đó
Then lần chạy mới được phép chạy và thành công

Given hai request checkout đồng thời trên cùng một hóa đơn, không gửi x-idempotency-key
When cả hai cùng chạy
Then đúng một request thành công và request còn lại nhận 409
And chỉ có một mã hóa đơn được cấp, một bộ invoice_payments, một lần trừ điểm
```

**AC-12** — Trace đầy đủ khi thành công
```gherkin
Given tôi vừa checkout thành công
When tôi gọi GET /v2/pos/checkout/sagas/:id
Then tôi thấy saga có status COMPLETED, correlationId bằng x-request-id của request
And thấy đủ các step theo thứ tự, mỗi step có seq, name, phase, status OK, durationMs
```

**AC-13** — Trace đầy đủ khi hỏng, sau khi đã rollback
```gherkin
Given một step transactional ném lỗi
When request kết thúc
Then tôi nhận lỗi có mã và có sagaId
And GET /v2/pos/checkout/sagas/:id cho thấy status FAILED, step hỏng là FAILED kèm error,
    các step trước là OK, các step sau không có mặt
```

**AC-14** — Số hóa đơn v2 định dạng giống hệt v1
```gherkin
Given một quy tắc đánh số bất kỳ trong ma trận: continuous / có ngày / có suffix,
      nhân với 4 giá trị ResetPolicy (DAILY, MONTHLY, YEARLY, NEVER)
When cùng một giá trị sequence được đưa qua DocumentNumberingService và qua step next-document-number
Then hai bên trả về chuỗi giống hệt nhau
```

**AC-15** — Không nhảy số, và không đụng độ với luồng cũ
```gherkin
Given một step sau bước cấp số ném lỗi
When request kết thúc
Then currentValue của counter bằng đúng giá trị trước khi chạy

Given tôi chạy xen kẽ 10 đơn qua v1 và 10 đơn qua v2 trên cùng một chi nhánh
When tất cả hoàn tất
Then 20 mã hóa đơn liền mạch, không trùng và không nhảy
```

## US-03 — Hỏng giữa chừng thì không để lại gì

Là **kế toán**, tôi muốn một lần thanh toán hỏng không để lại nửa vời trong sổ,
để không phải đi dò và sửa tay.

**Priority:** must
**Depends on:** US-02

### Acceptance criteria

**AC-16** — Ghi kho, bút toán, thu quỹ nằm trong cùng transaction
```gherkin
Given một draft có dòng tiền mặt và dòng chuyển khoản
When tôi checkout thành công qua /v2
Then stock_ledger_entries có đủ dòng SALE_ISSUE cho mọi dòng hàng
And journal_entries có bút toán bán hàng với các chân đúng như luồng v1 sinh ra
And cash_movements có dòng thu tiền mặt vào quỹ chi nhánh
And bút toán quỹ tiền gửi được ghi cho dòng không phải tiền mặt
And không có message nào được publish thẳng lên 4 topic STOCK_DEDUCTION, JOURNAL_POST_SALE,
    CASH_MOVEMENT_FROM_PAYMENT, DEPOSIT_VOUCHER_NEEDED_POS_SALE
```

**AC-17** — Fail sau khi đã ghi kho thì mọi thứ biến mất
```gherkin
Given cấu hình COA doanh thu bị thiếu nên step post-journal sẽ ném lỗi
When tôi gọi POST /v2/pos/checkout
Then SELECT count(*) trên cả 8 bảng nghiệp vụ bằng đúng giá trị trước khi chạy
And counter số hóa đơn không tăng
And checkout_saga có đúng một dòng FAILED kèm trail các step đã chạy
```

**AC-18** — Kafka chết không làm hỏng đơn
```gherkin
Given broker Kafka đang dừng
When tôi gọi POST /v2/pos/checkout
Then request vẫn thành công, hóa đơn và kho và bút toán và quỹ đều đã ghi
And outbox_messages có các dòng chưa publish (published_at IS NULL)
When tôi bật lại broker
Then relay đẩy hết các dòng đó và published_at được điền
```

## US-04 — Khuyến mại chạy trong chính transaction thanh toán

Là **thu ngân**, tôi muốn chương trình khuyến mại được áp và ghi nhận ngay trong lúc thanh toán,
với số tiền do máy chủ quyết, để không lệch giữa màn hình và sổ sách.

**Priority:** must
**Depends on:** US-03

### Acceptance criteria

**AC-19** — Server tự tính, bỏ số client gửi
```gherkin
Given một CTKM giảm 30% đang hiệu lực cho một SKU trong giỏ
When tôi gọi POST /v2/pos/checkout kèm selectedProgramIds và kèm cả một discountAmount bịa
Then chiết khấu ghi trên hóa đơn là số máy chủ tự tính, không phải số client gửi
And có bản ghi snapshot CTKM đã áp gồm programId, code, type, priority, discountAmount và lineDiscounts
```

**AC-20** — Hàng tặng thành dòng hóa đơn và bị trừ kho
```gherkin
Given một CTKM tặng hàng đang hiệu lực
When tôi checkout qua /v2
Then hóa đơn có thêm dòng hàng tặng với is_gift = true và promotion_program_id trỏ đúng CTKM
And stock_ledger_entries có dòng SALE_ISSUE cho hàng tặng
And dòng hàng tặng không làm tăng doanh thu ghi nhận
```

## US-05 — Voucher không bị dùng hai lần

Là **chủ cửa hàng**, tôi muốn một voucher chỉ được tiêu đúng một lần,
kể cả khi hai quầy bấm cùng lúc.

**Priority:** must
**Depends on:** US-04

### Acceptance criteria

**AC-21** — Hai quầy tranh một voucher
```gherkin
Given một voucher chưa dùng và hai hóa đơn draft khác nhau cùng áp voucher đó
When hai lệnh checkout chạy đồng thời
Then đúng một đơn thành công và voucher mang redeemedInvoiceId của đơn đó
And đơn thua nhận 409 và rollback sạch: không có hóa đơn, không có bút toán, không trừ kho
```

**AC-22** — POS chuyển được sang luồng mới bằng cờ
```gherkin
Given biến môi trường VITE_CHECKOUT_V2 được bật
When thu ngân bấm thanh toán trên màn hình POS
Then request đi tới POST /v2/pos/checkout
And khi tắt cờ thì request quay lại POST /invoices/:id/checkout, hành vi không đổi
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Hiệu năng | p95 của `POST /v2/pos/checkout` không xấu hơn luồng v1 quá 50% trên cùng dữ liệu; nếu vượt thì kích hoạt đường lùi trong ADR-02 | T-03-06 |
| Quan sát | Mỗi step sinh đúng một dòng log có `sagaId`, `correlationId`, `seq/total`, tên step, kết quả và thời lượng | T-01-04 |
| Tương thích | Toàn bộ spec hiện có của `checkout-invoice.service` và `invoice-debt.service` vẫn xanh sau mọi migration của epic | T-04-01 |
| Ràng buộc | Không file cũ nào ngoài **5 file** đã thỏa thuận bị sửa (xem Constraints ở `00-intent.md`); kiểm bằng `git diff --stat` ở cuối mỗi UoW | T-05-04 |
