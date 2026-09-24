---
feature: cash-report-voucher-detail
stories: 2
acceptance_criteria: 11
---

# Requirements — Xem chi tiết phiếu / hóa đơn từ báo cáo Quỹ tiền

Fixture: e2e dùng `apps/api/test/e2e/setup/cash-fund-fixture.ts` (chi nhánh A, B; PT-01..05,
PTG-01, PC-01..07), bổ sung một hóa đơn HD-A1 ở chi nhánh A, PT-02 gắn `INVOICE` → HD-A1 và
PC-04 gắn `REFUND` → HD-A1. Trình duyệt dùng erp_dev_3008 (org My Company) — chọn dòng thật
theo loại phiếu lúc chạy script.

## US-01 — Mở phiếu từ Số chứng từ

Là kế toán, tôi muốn bấm Số chứng từ trên báo cáo Quỹ tiền để xem phiếu ngay tại chỗ, không
phải sang Sổ quỹ tìm lại.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Mở đúng dialog theo loại phiếu
```gherkin
Given Bảng kê thu chi kỳ có đủ Phiếu thu, Phiếu chi, Thu tiền gửi, Chi tiền gửi
And tôi có 4 quyền accounting.{cash_receipt,cash_payment,bank_receipt,bank_payment}.read
When tôi bấm Số chứng từ của một dòng mỗi loại
Then Phiếu thu mở dialog phiếu thu tiền mặt, Phiếu chi mở dialog phiếu chi tiền mặt,
  Thu tiền gửi mở dialog thu tiền gửi, Chi tiền gửi mở dialog chi tiền gửi
And dialog ở chế độ xem: đúng số chứng từ, ngày chứng từ và tổng tiền của dòng đã bấm
And không có nút "Sửa" hay "Lưu"; có "In" và "Xuất khẩu"
```

**AC-02** — Bảng kê tiền chi theo mục chi
```gherkin
Given Bảng kê tiền chi theo mục chi có dòng TỔNG CHI, dòng nhóm mục chi và dòng chi tiết
When tôi bấm Số chứng từ của một dòng chi tiết
Then dialog phiếu chi tương ứng mở ra
And dòng TỔNG CHI và dòng nhóm không có ô bấm được
```

**AC-03** — Dòng không phải chứng từ
```gherkin
Given Bảng kê thu chi có dòng "Số dư đầu kỳ"
Then dòng đó không có ô Số chứng từ bấm được
```

**AC-04** — Trong dialog drill-down (phủ đủ 5 báo cáo)
```gherkin
Given tôi mở Tình hình thu chi và bấm ô Tiền mặt dòng IV (dialog Bảng kê thu chi)
  or mở Chi tiền theo mục chi / Chi tiền theo thời gian và bấm một mục / một ngày (dialog Bảng kê tiền chi theo mục chi)
When tôi bấm Số chứng từ trong dialog drill-down
Then dialog phiếu mở chồng lên trên
And đóng dialog phiếu thì dialog drill-down vẫn còn, đúng trang và bộ lọc
```

**AC-05** — Chế độ Chuỗi, phiếu chi nhánh khác
```gherkin
Given tôi đang ở header chi nhánh A, báo cáo Bảng kê thu chi Cửa hàng = Tất cả
When tôi bấm Số chứng từ của một phiếu thuộc chi nhánh B
Then dialog mở đúng phiếu của chi nhánh B, không báo lỗi
```

**AC-06** — Thiếu quyền đọc phiếu
```gherkin
Given vai trò của tôi có reporting.cash.read nhưng không có accounting.cash_payment.read
When tôi mở Bảng kê thu chi
Then Số chứng từ của các dòng Phiếu chi hiển thị text thường, không tô xanh, bấm không gọi API
And Số chứng từ của các loại tôi có quyền vẫn bấm được
```

**AC-07** — Từ phiếu thu sang hóa đơn
```gherkin
Given dialog phiếu thu của một phiếu thu bán hàng đang mở từ báo cáo
When tôi bấm mã hóa đơn nguồn trong dialog
Then dialog "Chi tiết hóa đơn" của báo cáo mở với hóa đơn đó
```

## US-02 — Mở hóa đơn từ Số hóa đơn / Tham chiếu

Là kế toán đối soát bán hàng, tôi muốn bấm Số hóa đơn hoặc Tham chiếu để xem hóa đơn của
phiếu, giống Bảng kê hóa đơn.

**Priority:** must
**Depends on:** US-01 (dùng chung registry và gating quyền)

### Acceptance criteria

**AC-08** — Dòng mang id hóa đơn
```gherkin
Given fixture có PT-02 (INVOICE → HD-A1) và PC-04 (REFUND → HD-A1)
When tôi POST /reports/cash-fund/search reportType cash-in-out-list, chi nhánh A, tháng 9
Then dòng PT-02 và PC-04 có invoiceNumber = mã HD-A1 và _invoiceId = id HD-A1
And reference của PC-04 là "REFUND <mã HD-A1>"
And dòng không gắn hóa đơn có _invoiceId = null
And /columns không có cột _invoiceId, tổng Tiền thu / Tiền chi không đổi so với trước
When tôi search expense-list-by-category cùng kỳ
Then dòng chi tiết PC-04 có invoiceNumber = mã HD-A1 và _invoiceId = id HD-A1
```

**AC-09** — Bấm Số hóa đơn
```gherkin
Given cột "Số hóa đơn" đã bật trong Sửa mẫu
When tôi bấm Số hóa đơn của một dòng gắn hóa đơn trên #3 hoặc #5
Then dialog "Chi tiết hóa đơn" mở đúng hóa đơn theo id (không lẫn hóa đơn trùng mã ở chi nhánh khác)
```

**AC-10** — Bấm Tham chiếu
```gherkin
When tôi bấm Tham chiếu "INVOICE <mã>" hoặc "REFUND <mã>" trên Bảng kê thu chi
Then dialog "Chi tiết hóa đơn" mở đúng hóa đơn đó
And Tham chiếu "MANUAL", "FUND_SWAP", "TRANSFER", "GOODS_RECEIPT" … không bấm được
```

**AC-11** — Thiếu quyền xem hóa đơn
```gherkin
Given vai trò của tôi không có reporting.invoice.branch.read
Then Số hóa đơn và Tham chiếu hiển thị text thường trên #3 và #5
```
