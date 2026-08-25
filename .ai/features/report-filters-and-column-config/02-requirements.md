---
feature: report-filters-and-column-config
stories: 3
acceptance_criteria: 6
---

# Requirements — Bộ lọc tồn kho theo cây nhóm hàng và lưu cấu hình cột báo cáo

## US-01 — Lọc tồn kho theo một nhóm hàng cha

Là nhân viên kho, tôi muốn chọn một nhóm hàng cha ở "Tổng hợp tồn kho" và thấy tồn của mọi
mặt hàng thuộc các nhóm con của nó, để không phải chọn lần lượt từng nhóm lá.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Nhóm cha bao gồm toàn bộ nhóm con
```gherkin
Given cây nhóm hàng là "PHỤ KIỆN" → "GIÀY DÉP" → {"Giày nam", "Giày nữ", "Dép nữ", …}
And mọi mặt hàng chỉ được gắn vào nhóm lá, "GIÀY DÉP" không có mặt hàng trực tiếp nào
When tôi lọc "Tổng hợp tồn kho" theo nhóm hàng "GIÀY DÉP"
Then lưới hiện các dòng thuộc mọi nhóm con của "GIÀY DÉP"
And không hiện dòng nào thuộc nhóm ngoài cây đó (ví dụ "Phiếu quà tặng")
```

**AC-02** — Không lọc thì không bị thu hẹp
```gherkin
Given tôi mở "Tổng hợp tồn kho" ở chi nhánh Hồ Chí Minh và chưa đặt bộ lọc nào
When lưới tải xong
Then chân trang hiện đúng tổng số dòng của chi nhánh, kể cả các nhóm ngoài "GIÀY DÉP"
```

## US-02 — Giữ cấu hình cột của báo cáo bán hàng

Là người xem báo cáo, tôi muốn cấu hình cột đã lưu ở Báo cáo Bán hàng còn nguyên khi mở lại
báo cáo, để không phải chỉnh lại mỗi lần vào.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-03** — Lưu rồi là ẩn ngay
```gherkin
Given tôi đang xem "Tổng hợp bán hàng theo ngày" với cột "Tỷ lệ KM (%)" đang hiện
When tôi mở "Sửa mẫu", bỏ tick Hiển thị của cột đó và bấm "Lưu"
Then hộp thoại đóng lại và cột "Tỷ lệ KM (%)" biến mất khỏi lưới
```

**AC-04** — Cấu hình sống qua lần tải lại
```gherkin
Given tôi vừa lưu cấu hình ẩn cột "Tỷ lệ KM (%)"
When tôi tải lại trang báo cáo
Then cột "Tỷ lệ KM (%)" vẫn ẩn
```

## US-03 — Kỳ báo cáo mặc định là hôm nay

Là người xem báo cáo, tôi muốn Báo cáo Bán hàng và Báo cáo Kho mở sẵn ở kỳ "Hôm nay", để xem
số trong ngày mà không phải đổi kỳ mỗi lần vào.

**Priority:** should
**Depends on:** —

### Acceptance criteria

**AC-05** — Báo cáo Bán hàng mở ở "Hôm nay"
```gherkin
Given tôi chưa từng đổi kỳ báo cáo trong phiên này
When tôi mở nhóm Báo cáo Bán hàng
Then ô kỳ báo cáo hiện "Hôm nay", không phải "Tháng này"
```

**AC-06** — Báo cáo Kho mở ở "Hôm nay"
```gherkin
Given tôi chưa từng đổi kỳ báo cáo trong phiên này
When tôi mở nhóm Báo cáo Kho
Then ô kỳ báo cáo hiện "Hôm nay", không phải "Tháng này"
```
