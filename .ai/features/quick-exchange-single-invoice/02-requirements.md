---
feature: quick-exchange-single-invoice
stories: 4
acceptance_criteria: 14
---

# Requirements — Gộp hoá đơn đổi trả nhanh thành một chứng từ

## US-01 — Đổi trả nhanh có mua thêm ra một chứng từ

Là thu ngân, tôi muốn một lần đổi trả nhanh (trả hàng + mua hàng mới) chỉ sinh ra **một**
hoá đơn đổi trả, để tra cứu và đối chiếu không phải ghép hai chứng từ rời.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Đổi hàng rẻ hơn (khách được hoàn phần chênh)
```gherkin
Given tôi đang ở tab "Đổi trả nhanh" chưa có hoá đơn gốc
And giỏ "Trả hàng" có món A đơn giá 500.000₫ số lượng 1
And giỏ "Mua thêm" có món B đơn giá 300.000₫ số lượng 1
When tôi bấm Thanh toán và chọn hoàn tiền mặt
Then hệ thống tạo đúng một hoá đơn type EXCHANGE
And hoá đơn đó có original_invoice_id là null
And hoá đơn đó có một dòng direction=IN cho món A và một dòng direction=OUT cho món B
And net_amount = -200000 và refunded_amount = 200000
And không có hoá đơn type SALE nào được tạo
```

**AC-02** — Đổi hàng đắt hơn (khách bù thêm tiền)
```gherkin
Given giỏ "Trả hàng" có món A 300.000₫ và giỏ "Mua thêm" có món B 500.000₫
When tôi thu đủ 200.000₫ tiền mặt và bấm Thanh toán
Then một hoá đơn EXCHANGE được tạo với net_amount = 200000 và refunded_amount = 0
And hoá đơn có status PAID
And một dòng invoice_payments 200.000₫ được ghi, không phải 500.000₫
```

**AC-03** — Đổi ngang giá
```gherkin
Given giỏ "Trả hàng" và giỏ "Mua thêm" cùng tổng 500.000₫
When tôi bấm Thanh toán
Then một hoá đơn EXCHANGE được tạo với net_amount = 0 và refunded_amount = 0
And không có dòng invoice_payments nào
And không có chuyển động quỹ tiền mặt nào
```

**AC-04** — Chỉ trả hàng, không mua thêm (không hồi quy)
```gherkin
Given giỏ "Trả hàng" có món A 500.000₫ và giỏ "Mua thêm" rỗng
When tôi bấm Thanh toán và chọn hoàn tiền mặt
Then hệ thống vẫn gọi POST /invoices/returns với mode "quick"
And tạo một hoá đơn type RETURN như trước, không phải EXCHANGE
```

**AC-05** — Hàng trả về showroom, hàng bán trừ showroom
```gherkin
Given kịch bản của AC-01
When hoá đơn EXCHANGE được chốt
Then stock ledger có một movement RETURN_IN cho món A vào kho showroom của chi nhánh
And có một movement trừ kho cho món B từ kho showroom của chi nhánh
And cả hai cùng tham chiếu id của hoá đơn EXCHANGE đó
```

**AC-06** — Không đụng returned_quantity khi không có hoá đơn gốc
```gherkin
Given kịch bản của AC-01
When hoá đơn EXCHANGE được chốt
Then không có dòng invoice_items nào bị cập nhật returned_quantity
And không có lỗi ConflictException nào được ném
```

**AC-07** — Từ chối dữ liệu mâu thuẫn
```gherkin
Given một request POST /invoices/exchanges không có originalInvoiceId
When một returnLine trong request lại mang originalInvoiceItemId
Then API trả 400 với thông điệp nêu rõ originalInvoiceItemId không hợp lệ khi thiếu originalInvoiceId
```

## US-02 — Đổi trả theo hoá đơn không hồi quy

Là kế toán, tôi muốn luồng đổi trả theo hoá đơn giữ nguyên mọi hành vi sau khi hai luồng
dùng chung một code path, để không phải kiểm lại toàn bộ nghiệp vụ cũ.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-08** — Kiểm số lượng được trả vẫn chạy
```gherkin
Given một hoá đơn bán gốc có món A số lượng 5
When tôi đổi trả theo hoá đơn đó, trả 2 món A và mua thêm món B
Then invoice_items của hoá đơn gốc có returned_quantity tăng đúng 2
And lần trả thứ hai vượt quá 5 bị từ chối với 409
```

**AC-09** — Cấn trừ công nợ vẫn chạy
```gherkin
Given hoá đơn bán gốc còn công nợ chưa thu
When tôi trả hàng theo hoá đơn đó và tích "Tính vào công nợ"
Then refundMethod gửi lên là OFFSET
And công nợ của hoá đơn gốc giảm đúng số tiền hoàn
```

## US-03 — Luật thanh toán đúng cho đổi trả nhanh

Là thu ngân, tôi muốn giao diện không mời tôi những lựa chọn vô nghĩa khi không có hoá đơn
gốc, để không tạo ra chứng từ mà hệ thống phải tự sửa lại phía sau.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-10** — Ẩn lựa chọn công nợ khi không có hoá đơn gốc
```gherkin
Given tôi đang ở tab "Đổi trả nhanh"
When phần thanh toán hiển thị
Then không thấy checkbox "Tính vào công nợ" ở cả chiều thu lẫn chiều hoàn
And ở tab "Đổi trả theo hoá đơn" thì hai checkbox đó vẫn hiển thị như cũ
```

**AC-11** — Ép thu đủ khi khách bù thêm tiền
```gherkin
Given đổi trả nhanh với net_amount dương
When tổng tiền đã nhập nhỏ hơn phần chênh phải thu
Then nút Thanh toán bị khoá
And không request nào được gửi lên server
```

**AC-12** — Chọn đúng quỹ hoàn tiền
```gherkin
Given đổi trả nhanh với net_amount âm
When tôi chọn "Hình thức đổi trả" là một tài khoản ngân hàng
Then refundMethod gửi lên là BANK kèm refundAccountId của tài khoản đó
And khi tôi chọn tiền mặt thì refundMethod là CASH
```

## US-04 — In lại biên lai đổi trả đúng như lúc thanh toán

Là thu ngân, tôi muốn biên lai in lại từ danh sách hoá đơn giống hệt biên lai in lúc thanh
toán, để không phải giải thích với khách vì sao hai tờ khác nhau.

**Priority:** should
**Depends on:** US-01

### Acceptance criteria

**AC-13** — Dấu và khối tổng của biên lai in lại
```gherkin
Given một hoá đơn EXCHANGE có dòng IN và dòng OUT
When tôi mở hoá đơn đó từ danh sách và bấm In
Then dòng hàng trả hiển thị số lượng và thành tiền mang dấu âm
And khối "Tiền hàng trả lại" / "Giá trị trả lại" xuất hiện
And "Tổng thanh toán" bằng đúng net_amount của hoá đơn
```

**AC-14** — Hoá đơn bán in lại không đổi
```gherkin
Given một hoá đơn type SALE
When tôi mở và in lại từ danh sách
Then mọi con số giống hệt trước thay đổi này
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Tương thích ngược | `POST /invoices/exchanges` với `originalInvoiceId` vẫn hoạt động y như cũ | T-01-01 |
| Không migration | Epic không thêm/sửa file nào trong `apps/api/src/database/migrations/` | T-01-01 |
| Ngôn ngữ | Không có chuỗi tiếng Việt nào mới trong source backend ngoài `BadRequestException` hiển thị cho thu ngân | T-01-01 |
| Hợp đồng API | `openapi.snapshot.json` và `packages/api-client` được regenerate sau khi DTO đổi | T-01-05 |
