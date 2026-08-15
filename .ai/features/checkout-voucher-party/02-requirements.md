---
feature: checkout-voucher-party
---

# Requirements — checkout-voucher-party

Quy ước dùng chung cho toàn bộ AC dưới đây — gọi là **bộ bốn ô**:

| Ô | Cột cash | Cột bank | Giá trị |
|---|---|---|---|
| Đối tượng nộp/nhận | `partner_type` + `partner_id` + `partner_name_snapshot` | như cash | `CUSTOMER` + `invoices.customer_id` + `customers.name` |
| Người nộp/nhận | `payer_name` / `payee_name` | `payer_name` / `payee_name` | `customers.name` |
| Địa chỉ | `partner_address_snapshot` | `partner_address_snapshot` | `customers.address` ?? `branches.address` |
| Nhân viên thu/chi | `staff_id` | `collected_by` / `paid_by` | `employee_profiles.user_id` của `invoices.salesperson_id`, thiếu thì `invoices.staff_id` |

---

## US-01 — Kế toán mở phiếu thu POS và biết ngay thu của ai, ai thu

**AC-01** — Phiếu thu bán hàng tiền mặt, hoá đơn có khách hàng (checkout v1)
```gherkin
Given một hoá đơn POS có customer_id trỏ tới khách "Nguyễn Văn A" (địa chỉ "12 Lê Lợi")
  And hoá đơn có salesperson_id trỏ tới nhân viên gắn tài khoản "thu.ngan@erp"
When chốt đơn bằng checkout v1 với một dòng thanh toán tiền mặt
Then cash_receipts của hoá đơn đó có partner_type = 'CUSTOMER'
  And partner_id = id của khách "Nguyễn Văn A"
  And partner_name_snapshot = 'Nguyễn Văn A'
  And payer_name = 'Nguyễn Văn A'
  And partner_address_snapshot = '12 Lê Lợi'
  And staff_id = users.id của "thu.ngan@erp"
```

**AC-02** — Khách vãng lai thì để trống đối tượng, phiếu vẫn tạo
```gherkin
Given một hoá đơn POS không có customer_id
When chốt đơn tiền mặt
Then phiếu thu vẫn được tạo và POSTED như hiện nay
  And partner_type, partner_id, partner_name_snapshot, payer_name đều NULL
  And staff_id vẫn được điền
  And partner_address_snapshot = địa chỉ chi nhánh bán
```

**AC-03** — Địa chỉ thoái lui về chi nhánh khi khách chưa khai địa chỉ
```gherkin
Given hoá đơn có khách hàng nhưng customers.address rỗng hoặc chỉ có khoảng trắng
  And chi nhánh bán có branches.address = '45 Nguyễn Huệ'
When phiếu thu được sinh
Then partner_address_snapshot = '45 Nguyễn Huệ'
```

**AC-04** — Nhân viên thu thoái lui về người lập hoá đơn
```gherkin
Given hoá đơn không có salesperson_id
When phiếu thu được sinh
Then staff_id = invoices.staff_id
  And dialog phiếu thu hiển thị được mã và tên của người đó
```

**AC-05** — Phiếu thu tiền thừa khách không lấy mang cùng bộ bốn ô
```gherkin
Given một hoá đơn tiền mặt có keptChangeAmount > 0
When chốt đơn (cả v1 lẫn v2)
Then cash_receipts purpose = OTHER_INCOME của hoá đơn đó có đủ bộ bốn ô
  And reference_type vẫn là INVOICE_KEPT_CHANGE như hiện nay
```

---

## US-02 — Phiếu chi hoàn tiền đổi trả cũng phải chỉ rõ trả cho ai

**AC-06** — Hoàn tiền mặt
```gherkin
Given một phiếu trả hàng của khách "Nguyễn Văn A" với refundMethod = CASH và refundedAmount > 0
When chốt phiếu trả
Then cash_payments purpose = REFUND của phiếu đó có partner_type = 'CUSTOMER'
  And partner_id / partner_name_snapshot / partner_address_snapshot theo bộ bốn ô
  And payee_name = 'Nguyễn Văn A'
  And staff_id theo bộ bốn ô
```

**AC-07** — Hoàn qua tiền gửi
```gherkin
Given cùng phiếu trả nhưng refundMethod = BANK
When chốt phiếu trả
Then bank_payments purpose = REFUND có đủ bộ bốn ô
  And paid_by (chứ không phải staff_id) mang id nhân viên
```

**AC-08** — Trả nhanh không có hoá đơn gốc thì để trống đối tượng
```gherkin
Given một phiếu trả nhanh không gắn hoá đơn gốc và không có khách
When hoàn tiền mặt
Then phiếu chi vẫn được tạo, ba ô đối tượng NULL, ô nhân viên vẫn điền
```

---

## US-03 — Checkout v2 có phiếu thu ngang bằng v1

**AC-09** — v2 sinh đúng một phiếu thu POSTED cho đơn tiền mặt
```gherkin
Given VITE_CHECKOUT_V2 = true
When chốt một đơn tiền mặt qua saga
Then có đúng 1 dòng cash_receipts với reference_type = INVOICE, reference_id = invoice.id
  And status = POSTED, document_number theo quy tắc đánh số CASH_RECEIPT
  And total_amount = tổng các dòng thanh toán CASH của hoá đơn
  And cash_movement_id và journal_entry_id trỏ tới đúng movement và bút toán saga đã ghi inline
  And có đủ bộ bốn ô
```

**AC-10** — v2 không phát sinh thêm bút toán nào
```gherkin
Given cùng một đơn tiền mặt
When chốt qua saga sau khi feature này xong
Then số dòng journal_entries và journal_entry_lines sinh ra bằng đúng số trước khi có feature
  And không có bút toán nào có description khác 'POS Invoice <số>'
```

**AC-11** — Lỗi giữa chừng thì không để lại phiếu mồ côi, không tiêu số phiếu
```gherkin
Given một bước sau bước ghi phiếu ném lỗi (ví dụ deduct-stock thất bại)
When transaction checkout rollback
Then không có dòng cash_receipts nào của hoá đơn đó
  And bộ đếm số phiếu thu không nhảy — đơn kế tiếp vẫn nhận đúng số liền sau
```

**AC-12** — Replay cùng idempotency key không sinh phiếu thứ hai
```gherkin
Given một checkout v2 đã hoàn tất
When gửi lại đúng request đó với cùng X-Idempotency-Key
Then vẫn chỉ có 1 dòng cash_receipts cho hoá đơn đó
```

---

## US-04 — Thanh toán không tiền mặt để lại chứng từ trong Sổ tiền gửi

**AC-13** — Phiếu thu tiền gửi cho mỗi dòng thanh toán không tiền mặt
```gherkin
Given một hoá đơn POS thanh toán bằng chuyển khoản hoặc thẻ hoặc ví
When chốt đơn (v1 hoặc v2)
Then mỗi dòng thanh toán không tiền mặt có một bank_receipts POSTED
  And phiếu link tới deposit_movement đã ghi cho dòng đó, không post thêm bút toán
  And phiếu có đủ bộ bốn ô, với collected_by mang id nhân viên
  And gửi lại cùng dòng thanh toán không sinh phiếu thứ hai
```

---

## US-05 — Thiếu dữ liệu định danh không được làm hỏng việc bán hàng

**AC-14** — Mọi thiếu hụt đều thoái lui im lặng
```gherkin
Given bất kỳ trường hợp nào sau đây:
  | khách hàng đã bị xoá khỏi bảng customers |
  | chi nhánh chưa khai địa chỉ |
  | nhân viên bán hàng không gắn employee_profiles hoặc profile không có user_id |
When phiếu được sinh, kể cả trên đường v2 nằm trong transaction checkout
Then phiếu vẫn được tạo và đơn hàng vẫn chốt thành công
  And ô không tra được để NULL
  And log ghi một cảnh báo nêu rõ hoá đơn nào thiếu gì
  And không có exception nào thoát ra ngoài bước ghi phiếu
```

**AC-15** — Phiếu tạo tay không đổi hành vi
```gherkin
Given luồng tạo phiếu thu/chi thủ công ở backoffice
When tạo một phiếu như trước
Then hành vi và dữ liệu ghi xuống không đổi
  And toàn bộ test hiện có của cash-vouchers và deposit-vouchers vẫn xanh
```

---

## Bất biến

- Không AC nào được thoả bằng cách nới `PartnerResolverService` cho hết throw — đường tạo
  phiếu tay **cần** nó throw để chặn id rác từ form.
- Số lượng bút toán trên mỗi đơn hàng là bất biến của feature này. Nếu một thay đổi làm nó
  tăng, thay đổi đó sai kể cả khi mọi AC khác xanh.
