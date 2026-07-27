---
feature: cancel-invoice-refund
stories: 6
acceptance_criteria: 20
---

# Requirements — Hoàn tiền & hoàn kho khi hủy hóa đơn

Số tiền hoàn ở mọi tiêu chí dưới đây = **tổng thực thu** trên `invoice_payments`
của hóa đơn đó (A-05), tách theo từng phương thức thanh toán.

## US-01 — Hoàn tiền mặt về quỹ khi hủy hóa đơn

Là kế toán quỹ, tôi muốn tiền mặt đã thu tự động rời quỹ kèm một phiếu chi
khi hóa đơn bị hủy, để số dư quỹ và sổ quỹ luôn khớp thực tế.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Hủy hóa đơn tiền mặt đã thu đủ
```gherkin
Given một hóa đơn SALE status=paid, thu 1.000.000₫ tiền mặt, đã sinh phiếu thu POS_SALE
When admin hủy hóa đơn đó
Then hệ thống sinh đúng một phiếu chi tiền mặt purpose=REFUND, total_amount = 1.000.000₫
And phiếu chi ở trạng thái POSTED, thuộc quỹ tiền mặt của chi nhánh hóa đơn
And cash_accounts.balance của quỹ đó giảm đúng 1.000.000₫
And phiếu thu POS_SALE gốc vẫn giữ nguyên trạng thái POSTED
```

**AC-02** — Hủy hóa đơn thu một phần (partial_debt)
```gherkin
Given một hóa đơn SALE 1.000.000₫ status=partial_debt, khách đã trả 600.000₫ tiền mặt
When admin hủy hóa đơn đó
Then phiếu chi hoàn tiền có total_amount = 600.000₫, không phải 1.000.000₫
And công nợ 400.000₫ còn lại được tất toán như hành vi hiện tại
And cash_accounts.balance giảm đúng 600.000₫
```

**AC-03** — Hủy hóa đơn công nợ chưa thu đồng nào
```gherkin
Given một hóa đơn SALE status=debt, total_paid = 0, không có dòng invoice_payments
When admin hủy hóa đơn đó
Then không có phiếu chi nào được sinh ra
And không có cash movement nào được ghi
And công nợ vẫn được tất toán và hóa đơn vẫn chuyển sang CANCELLED
```

**AC-04** — Sự kiện bị gửi lại (idempotent)
```gherkin
Given một hóa đơn đã hủy và đã sinh phiếu chi hoàn tiền
When sự kiện INVOICE_CANCELLED được xử lý lại (replay hoặc DLQ retry)
Then không có phiếu chi thứ hai nào được tạo
And cash_accounts.balance không đổi thêm lần nữa
```

## US-02 — Hoàn tiền gửi về tài khoản khi hủy hóa đơn

Là kế toán ngân hàng, tôi muốn khoản chuyển khoản/thẻ đã nhận rời tài khoản
tiền gửi kèm một phiếu chi tiền gửi, để không còn movement trôi nổi không chứng từ.

**Priority:** must
**Depends on:** US-01 (dùng chung dữ liệu thanh toán trên payload)

### Acceptance criteria

**AC-05** — Hủy hóa đơn thanh toán chuyển khoản
```gherkin
Given một hóa đơn SALE status=paid, thu 2.000.000₫ qua chuyển khoản vào một tài khoản tiền gửi
When admin hủy hóa đơn đó
Then hệ thống sinh đúng một phiếu chi tiền gửi (UNC) POSTED, số tiền 2.000.000₫, trên đúng tài khoản đã nhận tiền
And số dư tài khoản tiền gửi giảm đúng 2.000.000₫ — đúng một lần, không phải hai
And không còn deposit movement "thô" nào được ghi ngoài phiếu chi này
```

**AC-06** — Hóa đơn thanh toán hỗn hợp (split tender)
```gherkin
Given một hóa đơn SALE 3.000.000₫ thu 1.000.000₫ tiền mặt và 2.000.000₫ chuyển khoản
When admin hủy hóa đơn đó
Then sinh một phiếu chi tiền mặt 1.000.000₫ và một phiếu chi tiền gửi 2.000.000₫
And quỹ tiền mặt giảm 1.000.000₫ và tài khoản tiền gửi giảm 2.000.000₫
And cả hai phiếu chi cùng tham chiếu tới hóa đơn bị hủy
```

**AC-07** — Movement tiền gửi đã đối chiếu ngân hàng (BR-REF-02)
```gherkin
Given một hóa đơn thanh toán chuyển khoản mà deposit movement đã được đối chiếu
When admin hủy hóa đơn đó
Then phiếu chi tiền gửi vẫn được sinh ra (tiền thật đã rời tài khoản)
And movement gốc đã đối chiếu không bị đảo
And hệ thống ghi log cảnh báo để kế toán đối chiếu lại kỳ sau
```

## US-03 — Liên kết hai chiều giữa phiếu thu, phiếu chi và hóa đơn hủy

Là kế toán, tôi muốn từ một phiếu chi hoàn tiền tra ngược ra phiếu thu gốc và
hóa đơn bị hủy (và ngược lại), để đối chiếu không phải dò tay.

**Priority:** must
**Depends on:** US-01, US-02

### Acceptance criteria

**AC-08** — Phiếu chi trỏ về hóa đơn bị hủy
```gherkin
Given một hóa đơn vừa bị hủy có sinh phiếu chi hoàn tiền
When đọc phiếu chi đó
Then reference_type = REFUND và reference_id = id của hóa đơn bị hủy
And description chứa mã hóa đơn bị hủy
```

**AC-09** — Bảng voucher_links nối phiếu thu với phiếu chi
```gherkin
Given một hóa đơn tiền mặt đã bị hủy, có phiếu thu POS_SALE và phiếu chi REFUND
When đọc bảng voucher_links
Then tồn tại đúng một dòng from=(CASH_RECEIPT, phiếu thu gốc), to=(CASH_PAYMENT, phiếu chi hoàn), relation=REFUNDED_BY
And dòng đó mang invoice_id của hóa đơn bị hủy
And xử lý lại sự kiện không tạo dòng trùng
```

**AC-10** — Tra cứu được cả hai chiều
```gherkin
Given một cặp phiếu thu ↔ phiếu chi đã liên kết
When gọi API chi tiết của phiếu chi hoàn tiền
Then response mang thông tin phiếu thu gốc (id, số chứng từ)
And khi gọi API chi tiết của phiếu thu gốc thì response mang thông tin phiếu chi hoàn tiền
```

## US-04 — Hàng hủy cộng về kho showroom

Là nhân viên showroom, tôi muốn hàng của hóa đơn bị hủy nằm ngay trên kệ
showroom, để bán lại được mà không phải làm phiếu chuyển kho.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-11** — Hàng đã bán từ kệ showroom
```gherkin
Given một hóa đơn bán 2 cái item X, xuất từ một kệ thuộc kho showroom của chi nhánh
When admin hủy hóa đơn đó
Then tồn kho của kệ showroom đó tăng đúng 2
And bút toán kho là RETURN_IN với referenceType=INVOICE_CANCEL
```

**AC-12** — Hàng đã bán từ kho tổng
```gherkin
Given một hóa đơn bán 3 cái item Y, xuất từ một vị trí thuộc kho tổng (không phải showroom)
When admin hủy hóa đơn đó
Then 3 cái được cộng vào vị trí trong kho showroom của chi nhánh, không cộng về kho tổng
And nếu item chưa có kệ riêng ở showroom thì cộng vào vị trí "Mặc định" của showroom
```

**AC-13** — Sự kiện bị gửi lại không cộng kho hai lần
```gherkin
Given một hóa đơn đã hủy và đã hoàn kho
When sự kiện INVOICE_CANCELLED được xử lý lại
Then không có bút toán kho mới nào được ghi
And tồn kho không đổi
```

## US-05 — Chặn hủy những hóa đơn không được phép

Là quản lý, tôi muốn hệ thống từ chối hủy các hóa đơn sẽ gây hoàn tiền
chồng chéo, để không phải đi sửa sổ sách sau đó.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-14** — Hóa đơn trả hàng / đổi hàng
```gherkin
Given một hóa đơn có type = RETURN hoặc EXCHANGE
When gọi API hủy hóa đơn đó
Then API trả 400 với thông báo chỉ hóa đơn bán mới được hủy
And không có thay đổi nào về trạng thái, tiền hay kho
```

**AC-15** — Hóa đơn đã có phiếu trả hàng tham chiếu
```gherkin
Given một hóa đơn SALE đã có ít nhất một hóa đơn RETURN hoặc EXCHANGE trỏ tới nó qua original_invoice_id
When gọi API hủy hóa đơn đó
Then API trả 400 với thông báo hóa đơn đã phát sinh trả/đổi hàng
And không có phiếu chi nào được sinh ra
```

**AC-16** — Hóa đơn nháp hoặc đã hủy
```gherkin
Given một hóa đơn có status ngoài paid / debt / partial_debt
When gọi API hủy hóa đơn đó
Then API trả 400 nêu rõ trạng thái hiện tại (hành vi sẵn có, phải giữ nguyên)
```

## US-06 — Nút hủy hóa đơn trên POS

Là admin, tôi muốn hủy hóa đơn ngay trên màn hình danh sách hóa đơn POS,
để không phải nhờ ai gọi API.

**Priority:** must
**Depends on:** US-05

### Acceptance criteria

**AC-17** — Admin thấy nút hủy
```gherkin
Given tôi đăng nhập POS bằng tài khoản có role admin
When tôi mở màn Danh sách hóa đơn và click vào một hóa đơn status=paid
Then dialog chi tiết hóa đơn hiện nút "Hủy hóa đơn"
```

**AC-18** — Người không phải admin không thấy nút
```gherkin
Given tôi đăng nhập POS bằng tài khoản không có role admin
When tôi mở dialog chi tiết của cùng hóa đơn đó
Then không có nút "Hủy hóa đơn" nào hiển thị
```

**AC-19** — Hủy thành công
```gherkin
Given tôi là admin đang mở dialog chi tiết một hóa đơn hủy được
When tôi bấm "Hủy hóa đơn", nhập lý do và xác nhận
Then hệ thống gọi API hủy kèm lý do
And danh sách hóa đơn được nạp lại và hóa đơn hiện trạng thái "Đã hủy"
And nút "Hủy hóa đơn" không còn hiển thị cho hóa đơn đó
```

**AC-20** — Hủy bị từ chối
```gherkin
Given tôi là admin và hóa đơn không đủ điều kiện hủy (đã có phiếu trả hàng)
When tôi bấm "Hủy hóa đơn" và xác nhận
Then dialog hiện thông báo lỗi tiếng Việt lấy từ API
And hóa đơn giữ nguyên trạng thái cũ
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Idempotency | Mọi consumer của INVOICE_CANCELLED phải no-op khi xử lý lại — kiểm tra reference trước khi ghi, không chỉ dựa vào `processed_events` | T-01-04, T-02-04, T-03-03 |
| Atomicity | Movement + phiếu chi của cùng một chân tiền phải commit trong một transaction; không được để movement không có phiếu | T-01-03, T-02-03 |
| Ngôn ngữ | Source backend chỉ tiếng Anh; tiếng Việt chỉ ở `description` chứng từ và UI POS | T-01-03, T-06-02 |
| Observability | Mỗi chân (tiền mặt / tiền gửi / kho) log một dòng kèm invoiceId, số chứng từ sinh ra và số tiền | T-01-03, T-02-03 |
| Migration | Bảng `voucher_links` tạo bằng migration viết tay, có unique index chống ghi trùng | T-03-01 |
