---
id: UOW-04
slug: stock-period-siblings-pushdown
title: Hai báo cáo "Tồn theo cửa hàng" và "Chi tiết số lượng tồn" chạy dưới SQL
demoable: true
duration: 2d
depends_on: [UOW-03]
requirements: [US-01, US-02]
verifies: [AC-12, AC-15, AC-16, AC-17, AC-22]
risk: medium
status: todo
rollback: revert hai file `*.report.ts`; specs của engine đã có từ UOW-02/03 nên không cần lùi engine
---

# UOW-04 — Hai báo cáo "Tồn theo cửa hàng" và "Chi tiết số lượng tồn" chạy dưới SQL

## Demo script

1. Mở "Tổng hợp nhập xuất tồn theo cửa hàng" ở chế độ chuỗi → 200, không còn 400
2. Lọc cột "Cửa hàng" → dòng và footer đổi theo, sang trang 2 vẫn giữ bộ lọc
3. Mở "Chi tiết số lượng tồn" → 200; lọc "Nhập mua" lớn hơn 0 → footer khớp
4. Lọc một trong sáu cột chỗ trống (Nhập kho tạm, Xuất huỷ…) → 400 nêu đích danh tên cột, thay vì trang rỗng khó hiểu

## In scope

- 2 spec mức chi nhánh cho nhánh `item_branch`: branchCode, branch
- `KEY_MAP` phân rã cho "Chi tiết số lượng tồn": inTotal→inQty, outTotal→outQty, inPurchase→inQtyPurchase, …
- Sáu cột chỗ trống (A-05) cố ý không có spec nên lọc trả 400
- `countRows()` + pushdown cho cả hai báo cáo

## Not in scope

- Điền dữ liệu cho sáu cột chỗ trống — chúng chưa từng có dữ liệu, không phải việc của feature này

## Risks

| Risk | Mitigation |
|---|---|
| `stock-quantity-detail` bật `includeBreakdown`, dùng nhánh SQL khác | Specs phân rã đã có sẵn trong `NUMERIC_PERIOD_COLUMNS`; chỉ thiếu KEY_MAP |

## Definition of done

- [x] AC-15, AC-16, AC-17 xanh
- [x] Hai báo cáo trả 200 trên tổ chức 74515 dòng
- [x] `pnpm --filter @erp/api test` xanh
- [ ] Demo được nghiệm thu ở gate G4
