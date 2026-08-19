---
feature: exchange-temp-warehouse-fulfill
stories: 2
acceptance_criteria: 7
---

# Requirements — exchange-temp-warehouse-fulfill

## US-01 — Đơn đổi trả tiêu thụ kho tạm như đơn bán

Là thu ngân POS, tôi muốn chân "Mua thêm" của đơn đổi trả rút hàng từ kho tạm giống hệt
một lượt bán thường, để tồn showroom không bị âm và nhân viên kho không phải dò tay.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Đường hạnh phúc: chân "Mua thêm" tiêu thụ dòng kho tạm đang chờ
```gherkin
Given chi nhánh có một phiên kho tạm ACTIVE chiều warehouse_to_showroom
And SKU "YMT25017-D-38" có một dòng kho tạm ACTIVE số lượng 1
When tôi thanh toán một hóa đơn đổi trả có chân OUT "YMT25017-D-38" số lượng 1
Then dòng kho tạm đó chuyển trạng thái TRANSFERRED
And nó mang invoiceId và invoiceNumber của chính hóa đơn đổi trả vừa lập
And một phiếu chuyển Kho → Showroom số lượng 1 được lập và ghi sổ
And tồn showroom của SKU đó không âm
```

**AC-02** — Không có hàng chờ ở kho tạm thì không đổi hành vi
```gherkin
Given chi nhánh không có phiên kho tạm ACTIVE nào
When tôi thanh toán một hóa đơn đổi trả có chân OUT
Then hóa đơn vẫn được ghi sổ bình thường
And không có phiếu chuyển kho nào được lập
And hành vi trừ kho showroom giữ nguyên như trước
```

**AC-03** — Trả hàng thuần không phát sự kiện tiêu thụ kho tạm
```gherkin
Given một hóa đơn trả hàng thuần, chỉ có dòng IN
When tôi thanh toán hóa đơn đó
Then không có sự kiện tiêu thụ kho tạm nào được phát
And hàng trả vẫn được ghi có vào showroom như trước
```

**AC-04** — Gộp theo mặt hàng, chỉ tính dòng OUT
```gherkin
Given một hóa đơn đổi trả có hai dòng OUT cùng SKU "X" số lượng 1 và 2
And một dòng IN cùng SKU "X" số lượng 1
When tôi thanh toán hóa đơn đó
Then sự kiện tiêu thụ kho tạm mang đúng một dòng cho SKU "X" với số lượng 3
```

**AC-05** — Số lượng gửi đi luôn dương
```gherkin
Given một hóa đơn đổi trả có chân OUT số lượng 1
When sự kiện tiêu thụ kho tạm được dựng
Then số lượng trong payload là 1, không phải -1
```

## US-02 — Nhân viên kho thấy dòng đã bán qua đơn đổi trả

Là nhân viên kho, tôi muốn dòng kho tạm đã bị một đơn đổi trả tiêu thụ hiện ra số hóa đơn
thay vì ô tick, để nó rời khỏi danh sách "dòng cần kiểm tra".

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-06** — Dòng đã tiêu thụ rời danh sách cần kiểm tra
```gherkin
Given một dòng kho tạm đã bị hóa đơn đổi trả tiêu thụ
When tôi mở màn hình Chuyển kho tạm với "Hiển thị dòng cần kiểm tra" đang tích
Then dòng đó không còn hiện trong danh sách
```

**AC-07** — Không tiêu thụ lại dòng đã chuyển
```gherkin
Given một dòng kho tạm đã ở trạng thái TRANSFERRED mang invoiceId
When cùng sự kiện tiêu thụ kho tạm được giao lại lần nữa
Then không có phiếu chuyển kho thứ hai nào được lập
And dòng đó giữ nguyên invoiceId ban đầu
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Tương đương | Payload dựng ở đường đổi trả trùng hình dạng với `checkout-invoice.service.ts:355-377` | T-01-01 |
| Idempotency | `eventId = invoiceId` giữ nguyên quy ước sẵn có; giao lại không tạo phiếu chuyển thứ hai | T-01-02 |
| Ngôn ngữ | Mã nguồn backend mới viết tiếng Anh | T-01-01 |
