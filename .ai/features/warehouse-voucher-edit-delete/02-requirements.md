---
feature: warehouse-voucher-edit-delete
stories: 5
acceptance_criteria: 21
---

# Requirements — Sửa và xoá phiếu nhập / phiếu xuất kho

Quy ước chung cho mọi kịch bản dưới đây: "phiếu đã ghi sổ" nghĩa là `status = POSTED`,
đã có số phiếu và đã có dòng trong `stock_ledger_entries`.

## US-01 — Sửa phiếu nhập kho đã ghi sổ

Là thủ kho, tôi muốn sửa trực tiếp một phiếu nhập đã ghi sổ
để không phải xoá phiếu rồi gõ lại và mất số phiếu.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Sửa số lượng, ghi chênh lệch vào sổ kho
```gherkin
Given phiếu nhập PNK-A đã ghi sổ với 1 dòng: 10 cái, đơn giá 100.000
When tôi sửa dòng đó thành 7 cái và lưu
Then phiếu vẫn mang số PNK-A và vẫn ở trạng thái đã ghi sổ
And stock_ledger_entries có thêm đúng 1 dòng chênh lệch: -3, referenceId = PNK-A
And 3 dòng ledger gốc không bị sửa hay xoá
And tồn kho của mặt hàng tại vị trí đó giảm đúng 3
```

**AC-02** — Sửa đơn giá, không đổi số lượng
```gherkin
Given phiếu nhập PNK-A đã ghi sổ với 1 dòng: 10 cái, đơn giá 100.000
When tôi sửa đơn giá thành 120.000 và lưu
Then stock_ledger_entries có thêm 1 dòng chênh lệch quantity = 0, lineValue = 200.000
And giá vốn bình quân tức thời của mặt hàng phản ánh giá trị mới
And tồn kho số lượng không đổi
```

**AC-03** — Thêm và xoá dòng hàng
```gherkin
Given phiếu nhập PNK-A đã ghi sổ với 2 dòng hàng
When tôi xoá dòng thứ nhất, thêm một dòng mặt hàng mới 5 cái và lưu
Then sổ kho có dòng đảo toàn bộ số lượng của dòng bị xoá
And sổ kho có dòng nhập mới +5 cho mặt hàng vừa thêm
And tổng giá trị phiếu sau sửa bằng tổng dòng hàng còn lại
```

**AC-04** — Sửa phần không chạm sổ
```gherkin
Given phiếu nhập PNK-A đã ghi sổ
When tôi chỉ sửa đối tượng, người giao, diễn giải và ngày chứng từ rồi lưu
Then không có dòng stock_ledger_entries nào được thêm
And không có bút toán kế toán nào được ghi
And phiếu hiển thị thông tin mới ngay trên danh sách
```

**AC-05** — Hai người sửa cùng lúc
```gherkin
Given phiếu nhập PNK-A đã ghi sổ
When hai request sửa phiếu PNK-A chạy song song
Then đúng một request ghi được chênh lệch
And request còn lại nhận lỗi 409 và không ghi thêm dòng ledger nào
```

## US-02 — Sổ kế toán và quỹ khớp với phiếu nhập sau khi sửa hoặc xoá

Là kế toán kho, tôi muốn sổ quỹ, sổ cái và công nợ NCC tự về đúng khi phiếu nhập
được sửa hoặc xoá, để không phải gỡ tay sau mỗi thao tác kho.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-06** — Sửa phiếu nhập tiền mặt
```gherkin
Given phiếu nhập tiền mặt PNK-B đã ghi sổ, tổng tiền 10.000.000
When tôi sửa tổng tiền xuống 7.000.000 và lưu
Then quỹ tiền mặt của chi nhánh tăng lại đúng 3.000.000
And sổ cái có bút toán chênh lệch DR111 / CR156 đúng 3.000.000
And tổng phát sinh trên TK 156 do phiếu này sinh ra bằng 7.000.000
```

**AC-07** — Sửa phiếu nhập công nợ
```gherkin
Given phiếu nhập công nợ PNK-C đã ghi sổ, tổng tiền 10.000.000, chưa trả đồng nào
When tôi sửa tổng tiền lên 12.000.000 và lưu
Then dòng supplier_debts của phiếu có originalAmount = 12.000.000 và remainingAmount = 12.000.000
And sổ cái có bút toán chênh lệch DR156 / CR331 đúng 2.000.000
```

**AC-08** — Sửa phiếu công nợ xuống thấp hơn số đã trả
```gherkin
Given phiếu nhập công nợ PNK-C tổng 10.000.000, NCC đã được trả 6.000.000
When tôi sửa tổng tiền xuống 4.000.000 và lưu
Then supplier_debts có originalAmount = 4.000.000, paidAmount = 6.000.000, remainingAmount = -2.000.000
And trạng thái dòng nợ là OVERPAID
And không có phiếu thu nào được sinh tự động
```

**AC-09** — Xoá phiếu nhập tiền mặt
```gherkin
Given phiếu nhập tiền mặt PNK-B đã ghi sổ, tổng tiền 10.000.000
When tôi xoá phiếu
Then tồn kho trở về đúng như trước khi có phiếu
And quỹ tiền mặt của chi nhánh tăng lại đúng 10.000.000
And bút toán gốc của phiếu bị đảo, số dư TK 156 do phiếu này sinh ra bằng 0
And phiếu chi tự động gắn với phiếu nhập không còn hiệu lực trên sổ quỹ
```

**AC-10** — Xoá phiếu nhập công nợ
```gherkin
Given phiếu nhập công nợ PNK-C đã ghi sổ, tổng tiền 10.000.000
When tôi xoá phiếu
Then tồn kho trở về đúng như trước khi có phiếu
And dòng supplier_debts của phiếu không còn ảnh hưởng báo cáo công nợ
And bút toán gốc bị đảo, số dư TK 331 do phiếu này sinh ra bằng 0
```

**AC-11** — Xoá hai lần song song
```gherkin
Given phiếu nhập PNK-A đã ghi sổ
When hai request xoá phiếu PNK-A chạy song song
Then đúng một request thực hiện việc đảo bút
And request còn lại nhận lỗi 409
And tồn kho chỉ được cộng lại đúng một lần
```

## US-03 — Sửa và xoá phiếu xuất kho đã ghi sổ

Là thủ kho, tôi muốn sửa hoặc xoá phiếu xuất đã ghi sổ và thấy tồn kho cộng trừ đúng
phần chênh lệch.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-12** — Sửa tăng số lượng xuất
```gherkin
Given phiếu xuất PXK-A đã ghi sổ với 1 dòng 5 cái, đơn giá vốn đã chốt 80.000
And giá vốn bình quân hiện tại của mặt hàng là 90.000
When tôi sửa dòng đó thành 8 cái và lưu
Then sổ kho có thêm 1 dòng chênh lệch -3 với đơn giá 90.000
And 5 cái đã ghi sổ trước đó giữ nguyên đơn giá 80.000
```

**AC-13** — Sửa giảm số lượng xuất
```gherkin
Given phiếu xuất PXK-A đã ghi sổ với 1 dòng 5 cái, đơn giá vốn đã chốt 80.000
When tôi sửa dòng đó thành 2 cái và lưu
Then sổ kho có thêm 1 dòng chênh lệch +3 với đơn giá 80.000
And tồn kho tăng lại đúng 3
```

**AC-14** — Xoá phiếu xuất đã ghi sổ
```gherkin
Given phiếu xuất PXK-A đã ghi sổ
When tôi xoá phiếu
Then toàn bộ số lượng đã xuất được cộng lại vào tồn kho theo đúng đơn giá đã ghi
And phiếu chuyển sang trạng thái đã huỷ và biến mất khỏi danh sách mặc định
And hai request xoá song song chỉ đảo bút một lần
```

**AC-15** — Không chặn tồn âm
```gherkin
Given mặt hàng chỉ còn tồn 2 cái
When tôi sửa một phiếu nhập đã ghi sổ từ 10 xuống 5, khiến tồn xuống -3
Then hệ thống vẫn ghi chênh lệch và lưu thành công
And tồn kho hiển thị -3 mà không có lỗi chặn nào
```

## US-04 — Chân phiếu điều chuyển giữ đồng bộ hai chi nhánh

Là thủ kho, tôi muốn sửa chân phiếu của một lệnh điều chuyển mà chi nhánh đối ứng
cũng được điều chỉnh theo, để tồn hai bên không lệch nhau.

**Priority:** must
**Depends on:** US-01, US-03

### Acceptance criteria

**AC-16** — Chi nhánh đích chưa nhập
```gherkin
Given lệnh điều chuyển TO-A đã xuất ở chi nhánh A, chi nhánh B chưa nhập
When tôi sửa phiếu xuất của TO-A từ 10 xuống 6
Then tồn chi nhánh A tăng lại 4
And số lượng chờ nhập của TO-A ở chi nhánh B là 6
```

**AC-17** — Chi nhánh đích đã nhập
```gherkin
Given lệnh điều chuyển TO-A đã xuất ở A và đã nhập ở B, số lượng 10
When tôi sửa phiếu xuất của TO-A từ 10 xuống 6
Then sổ kho chi nhánh A có chênh lệch +4
And sổ kho chi nhánh B có chênh lệch -4 trên chính phiếu nhập của TO-A
And tổng tồn hai chi nhánh sau khi sửa bằng tổng tồn trước khi có lệnh điều chuyển cộng 0
```

**AC-18** — Xoá chân phiếu điều chuyển
```gherkin
Given lệnh điều chuyển TO-A đã xuất ở A và đã nhập ở B
When tôi xoá phiếu xuất của TO-A
Then phiếu nhập ở B được đảo bút và lệnh điều chuyển bị huỷ
And hành vi này giống hệt luồng huỷ hiện có, không sinh thêm chứng từ nào
```

## US-05 — Nút Sửa hoạt động trên màn hình Nhập kho và Xuất kho

Là thủ kho, tôi muốn bấm Sửa trên một phiếu đã ghi sổ và sửa được ngay trong màn hình
đang dùng, không phải qua đường vòng nào khác.

**Priority:** must
**Depends on:** US-01, US-03

### Acceptance criteria

**AC-19** — Mở được form sửa
```gherkin
Given tôi đang ở màn hình Nhập kho và chọn một phiếu đã ghi sổ
When tôi bấm nút Sửa
Then form mở ra ở chế độ sửa với đầy đủ dòng hàng, kho, vị trí, đối tượng của phiếu
And nút Sửa cũng hoạt động tương tự trên màn hình Xuất kho
```

**AC-20** — Lưu thành công, không tạo phiếu trùng
```gherkin
Given tôi đang sửa một phiếu xuất đã ghi sổ
When tôi đổi số lượng một dòng và bấm Lưu
Then hệ thống gọi endpoint cập nhật của chính phiếu đó
And danh sách sau khi tải lại vẫn chỉ có một phiếu với số phiếu cũ
And không có phiếu mới nào được tạo thêm
```

**AC-21** — Báo lỗi rõ ràng khi lưu hỏng
```gherkin
Given tôi đang sửa một phiếu nhập tiền mặt và quỹ không đủ tiền cho phần chênh lệch tăng
When tôi bấm Lưu
Then form hiển thị thông báo lỗi bằng tiếng Việt nêu đúng nguyên nhân
And phiếu giữ nguyên dữ liệu cũ, sổ kho và sổ quỹ không thay đổi
```

**AC-22** — Đổi phiếu chọn khi dialog Sửa còn mở không làm lẫn dữ liệu
```gherkin
Given tôi đã bấm Sửa để mở phiếu A trên màn hình Nhập kho (dialog đang mở, chưa Lưu)
When tôi chọn phiếu B trên lưới rồi bấm Sửa/Xem/Nhân bản lần nữa trong lúc dialog phiếu A còn mở
Then hệ thống không đổi phiếu đang sửa của dialog đang mở sang B
And nếu dialog phiếu A có đổi/mất dữ liệu để mở B, form hiển thị đúng và chỉ đúng dữ liệu của
    phiếu đang được sửa tại mọi thời điểm — không có trường hợp nào PATCH đi kèm id của một
    phiếu còn nội dung của phiếu khác
And nút Sửa cũng hoạt động tương tự trên màn hình Xuất kho
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Tính nhất quán | Mọi cặp (ghi sổ kho + ghi sổ kế toán) của một lần sửa nằm trong đúng một transaction; hỏng một nửa thì rollback cả hai | T-01-03 |
| Đồng thời | Cả bốn lối sửa/xoá khoá row phiếu bằng `SELECT … FOR UPDATE` và đọc lại trạng thái trong transaction | T-01-02 |
| Idempotency | Endpoint cập nhật thừa hưởng `IdempotencyInterceptor` sẵn có, không tự cài lại | T-05-02 |
| Bất biến sổ | Không `UPDATE` và không `DELETE` dòng `stock_ledger_entries` hay `journal_entries` đã ghi | T-01-03 |
| Ngôn ngữ mã nguồn | Thông báo lỗi, log, comment phía backend viết tiếng Anh; chuỗi hiển thị frontend tiếng Việt | T-05-03 |
| Kiểm thử | Mỗi tổ hợp {nhập tiền mặt, nhập công nợ, xuất kho} × {sửa, xoá} có ít nhất một unit test cho phần tính chênh lệch | T-01-04, T-02-03, T-03-03 |
