---
feature: overview-branch-share-legend-overflow
stories: 1
acceptance_criteria: 3
---

# Requirements — Legend tỉ trọng theo chi nhánh không tràn

## US-01 — Legend nằm gọn trong card

Là quản lý chuỗi, tôi muốn legend tỉ trọng doanh thu theo chi nhánh nằm gọn trong card,
để nó không che card khác và select kỳ.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Legend không vượt khung biểu đồ
```gherkin
Given chế độ "Chuỗi cửa hàng" có 15 chi nhánh
When tôi mở Tổng quan
Then legend "Tỉ trọng doanh thu theo chi nhánh" cao không quá 80% khung biểu đồ (264px) và nằm trọn trong card
And select "Tháng này" của widget bấm được, không bị legend che
```

**AC-02** — Cuộn tới mọi chi nhánh, vẫn ẩn/hiện được
```gherkin
Given legend dài hơn khung
When tôi cuộn trong legend
Then thấy được chi nhánh cuối danh sách
And bấm vào nó thì lát tương ứng ẩn/hiện như trước
```

**AC-03** — Widget "Tỉ trọng doanh thu hàng hóa" không đổi
```gherkin
Given legend hàng hóa chỉ vài dòng
When Tổng quan render
Then legend hàng hóa không có thanh cuộn và vẫn căn giữa theo chiều dọc như trước
```
