---
feature: stock-card-description
stories: 1
acceptance_criteria: 4
---

# Requirements — Diễn giải đúng trong Chi tiết tồn kho

## US-01 — Xem đúng Diễn giải của chứng từ trong thẻ kho

Là nhân viên kho, tôi muốn cột Diễn giải trong Chi tiết tồn kho hiển thị đúng nội
dung tôi đã ghi trên chứng từ gốc, để tôi biết lý do thật của từng biến động kho
mà không phải mở từng chứng từ để đối chiếu.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Phiếu nhập/xuất kho hiển thị đúng Diễn giải gốc
```gherkin
Given một phiếu nhập kho có Diễn giải = "Nhập kho Biên Hòa 2"
When tôi mở Chi tiết tồn kho của một mặt hàng trong phiếu đó
Then dòng tương ứng ở cột Diễn giải hiển thị "Nhập kho Biên Hòa 2", không phải "Phiếu nhập kho NK000240"
```

**AC-02** — Các loại chứng từ khác (chuyển kho, điều chỉnh, kiểm kê, nhập mua) cũng hiển thị đúng Diễn giải gốc
```gherkin
Given một phiếu chuyển kho / điều chỉnh / kiểm kê / đơn mua hàng có Diễn giải khác rỗng
When tôi mở Chi tiết tồn kho của một mặt hàng liên quan
Then dòng tương ứng ở cột Diễn giải hiển thị đúng nội dung đã ghi trên chứng từ đó
```

**AC-03** — Chứng từ không có trường Diễn giải hoặc để trống → ô trống
```gherkin
Given một dòng có reference_type = INVOICE/INVOICE_CANCEL/RETURN_INVOICE (không có cột diễn giải), hoặc một phiếu nhập/xuất/chuyển/điều chỉnh có Diễn giải để trống
When tôi mở Chi tiết tồn kho
Then ô Diễn giải của dòng đó hiển thị trống — không hiển thị chuỗi máy sinh cũ, không hiển thị nhãn loại chứng từ thay thế
```

**AC-04** — Bộ lọc Diễn giải khớp với cột hiển thị
```gherkin
Given tôi gõ một từ khoá vào ô lọc Diễn giải trong Chi tiết tồn kho, khớp đúng Diễn giải gốc của một chứng từ (không khớp chuỗi máy sinh cũ)
When tôi áp dụng bộ lọc
Then dòng chứa Diễn giải đó xuất hiện trong kết quả
```

## Non-functional

| Kind        | Requirement                                                        | Verified by |
| ----------- | ------------------------------------------------------------------- | ----------- |
| Consistency | Cột hiển thị và bộ lọc Diễn giải phải cùng đọc một nguồn dữ liệu (resolved description), không lệch nhau | T-01-01 |
| Perf        | Không thêm N+1 query — vẫn dùng đúng 1 câu SQL cho trang kết quả, join theo `reference_id` như `documentNumberSql()` | T-01-01 |
