---
feature: report-table-single-line-cells
stories: 1
acceptance_criteria: 7
---

# Requirements — Ô dữ liệu bảng báo cáo hiện đúng một dòng

## US-01 — Mỗi dòng báo cáo là một dòng

Là người xem báo cáo, tôi muốn mỗi dòng dữ liệu nằm trên đúng một dòng với cột đủ rộng
cho SKU và tên hàng, để quét bảng theo hàng ngang mà không bị dòng cao thấp làm lệch mắt.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Bề rộng cột lấy từ backend khi backend có khai
```gherkin
Given backend "Số lượng tồn kho theo cửa hàng" trả cột sku width 140, parentSku 140, cột chi nhánh 120
When tôi mở báo cáo đó
Then ô "Mã SKU" đo được 140px, "Mã SKU mẫu mã" 140px, mỗi cột chi nhánh 120px
```

**AC-02** — Cột định danh lấy width backend, cột số fallback 112px
```gherkin
Given backend "Doanh thu theo mặt hàng" gửi width cho sku, itemName, unit, locationName nhưng không cho cột số
When tôi mở báo cáo đó với kỳ "Tháng trước"
Then Mã SKU đo được 140px, Tên hàng hóa 220px, Đơn vị tính 110px, Tên vị trí 160px
And các cột số (Số lượng bán, Khuyến mại, …) đo được 112px
```

**AC-07** — Backend khai width cho cột định danh dùng chung của 3 nhóm còn lại
```gherkin
Given một cột định danh (sku / skuCode, itemName, customerName, documentNumber, date, …)
When header được sinh bởi enrichHeader (hoá đơn, lợi nhuận) hoặc debtColumn (công nợ)
Then header mang width lấy từ một bảng chung, cùng giá trị ở cả ba nhóm
And cột số / tiền không mang width
```

**AC-03** — Ô dữ liệu không xuống dòng, dư thì cắt "..."
```gherkin
Given một dòng có tên hàng dài hơn bề rộng cột "Tên hàng hóa"
When bảng render
Then ô đó có white-space nowrap, overflow hidden, text-overflow ellipsis
And mọi dòng tbody cao đúng 32px, kể cả dòng Tổng ở tfoot
```

**AC-04** — Cột text có tooltip đủ giá trị, cột số không có
```gherkin
Given dòng đầu của "Số lượng tồn kho theo cửa hàng" là ABA2777-D-38 / ABA2777
When tôi đọc thuộc tính title của các ô trên dòng đó
Then đúng hai ô (Mã SKU, Mã SKU mẫu mã) có title bằng giá trị hiển thị
And các ô số không có title
```

**AC-05** — Header cột và hàng lọc không đổi
```gherkin
Given nhãn group "Tồn theo cửa hàng" và nhãn cột "Chi nhánh Long Xuyên"
When bảng render
Then header vẫn được xuống dòng khi nhãn dài hơn cột, không bị cắt "..."
And hàng lọc (ô "*" / "=") giữ nguyên chiều cao và bố cục
```

**AC-06** — Dialog drill-down dùng cùng hành vi
```gherkin
Given tôi bấm vào một ô link trên "Doanh thu theo mặt hàng" để mở "Chi tiết doanh thu mặt hàng theo hóa đơn"
When lưới trong dialog render
Then cột text 160px, cột số 112px, mọi ô nowrap + ellipsis, dòng 32px
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Tương thích | Không đổi API, không đổi generated api-client; `ReportColumnHeader.width` đã có sẵn | T-01-01, T-01-04 |
| Chất lượng | `tsc --noEmit` của `@erp/backoffice-web` và `@erp/api` xanh; 51 suite `modules/reporting` xanh | T-01-01, T-01-02, T-01-04 |
| Phạm vi | FE 3 file; backend 1 file mới + 3 util + 1 spec, không đụng engine SQL | T-01-01, T-01-02, T-01-04 |
