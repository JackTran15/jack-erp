---
feature: temp-warehouse-fulfill-before-invoice
stories: 3
acceptance_criteria: 9
---

# Requirements — Phiếu chuyển kho tạm ghi sổ trước hoá đơn bán

## US-01 — Đường ghi sổ kho nhận được mốc ghi sổ từ caller

As a lập trình viên miền kho, I want `StockLedgerService` nhận `postedAt` tuỳ chọn
so that một luồng bù trừ có thể ghi dòng của mình vào đúng vị trí trong trình tự,
mà không phải sửa dòng đã ghi.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Caller truyền mốc thì mốc đó được tôn trọng
```gherkin
Given một movement hợp lệ có postedAt = 2026-08-30T10:00:00.000Z
When ghi qua recordBatchMovements
Then dòng stock_ledger_entries sinh ra có posted_at đúng bằng 2026-08-30T10:00:00.000Z
```

**AC-02** — Cùng hành vi trên đường ghi đơn lẻ
```gherkin
Given một movement hợp lệ có postedAt được chỉ định
When ghi qua recordMovement
Then dòng sinh ra có posted_at đúng bằng giá trị đã chỉ định
```

**AC-03** — Tương thích ngược
```gherkin
Given một movement KHÔNG có postedAt
When ghi qua recordMovement hoặc recordBatchMovements
Then posted_at được đặt bằng thời điểm ghi như hành vi hiện tại
And không caller sẵn có nào của hai hàm này phải sửa
```

## US-02 — Hàng bù từ kho tạm đứng trước hoá đơn trong sổ kho

As a kế toán kho, I want phiếu chuyển kho tạm ra showroom ghi sổ trước dòng bán
so that số dư luỹ kế trên thẻ kho không tụt âm chỉ vì thứ tự ghi.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-04** — Happy path
```gherkin
Given tồn showroom của mặt hàng đang bằng 0
And phiên kho tạm warehouse_to_showroom của chi nhánh có đủ 1 đơn vị mặt hàng đó
When bán 1 đơn vị mặt hàng đó qua POS và consumer bù kho tạm xử lý xong
Then hai dòng chuyển kho tạm có posted_at nhỏ hơn posted_at của dòng SALE_ISSUE cùng hoá đơn
And sắp mọi dòng của mặt hàng theo posted_at tăng dần rồi cộng dồn quantity thì không dòng nào có số dư luỹ kế nhỏ hơn 0
```

**AC-05** — Không vượt ranh giới ngày
```gherkin
Given dòng SALE_ISSUE của hoá đơn có posted_at rơi đúng vào mili giây đầu tiên của một ngày
When consumer bù kho tạm ghi phiếu chuyển
Then posted_at của phiếu chuyển bị kẹp lại để vẫn nằm trong cùng ngày với hoá đơn
And tồn đầu kỳ của ngày đó tính theo posted_at nhỏ hơn mốc đầu ngày không đổi so với trước khi có thay đổi này
```

**AC-06** — Chạy lại consumer là vô hại
```gherkin
Given consumer bù kho tạm đã xử lý xong một hoá đơn
When cùng event đó được giao lại lần nữa
Then không có phiếu chuyển thứ hai nào được sinh ra
And không dòng stock_ledger_entries nào được thêm hay đổi
```

**AC-07** — Bù một phần
```gherkin
Given hoá đơn bán 3 đơn vị nhưng phiên kho tạm chỉ có 1 đơn vị
When consumer bù kho tạm xử lý xong
Then phiếu chuyển 1 đơn vị vẫn có posted_at nhỏ hơn posted_at của dòng SALE_ISSUE
And phần 2 đơn vị còn lại vẫn để tồn showroom âm như trước, vì đó là thiếu hàng thật chứ không phải lỗi thứ tự
```

## US-03 — Bán hàng không dùng kho tạm không bị ảnh hưởng

As a thu ngân POS, I want lần bán không liên quan kho tạm chạy y như cũ
so that thay đổi này không đánh đổi gì ở luồng bán thường.

**Priority:** must
**Depends on:** US-02

### Acceptance criteria

**AC-08** — Không có phiên kho tạm
```gherkin
Given chi nhánh không có phiên kho tạm warehouse_to_showroom nào đang ACTIVE
When bán một mặt hàng qua POS
Then không phiếu chuyển nào được sinh ra
And dòng SALE_ISSUE có posted_at bằng thời điểm ghi như hành vi hiện tại
```

**AC-09** — Nhịp 2 vẫn nằm ngoài transaction thanh toán
```gherkin
Given consumer bù kho tạm ném lỗi khi xử lý
When một lần bán đi qua saga thanh toán
Then hoá đơn vẫn được ghi và commit thành công
And lỗi của consumer đi vào retry rồi DLQ, không lan ngược vào lần bán
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Hiệu năng | Thời gian hoàn tất saga thanh toán không tăng, vì nhịp 2 vẫn bất đồng bộ | T-01-05 |
| Tương thích | Mọi caller sẵn có của `recordMovement` và `recordBatchMovements` chạy không sửa | T-01-01 |
| Bất biến dữ liệu | Không `UPDATE` nào lên dòng `stock_ledger_entries` đã ghi | T-01-03 |
| Idempotency | Consumer dedupe qua `processed_events` với `eventId` tất định, mốc lùi cũng tất định | T-01-04 |
| Ngôn ngữ | Source backend viết bằng tiếng Anh, không chuỗi tiếng Việt trong mã NestJS | T-01-03 |
