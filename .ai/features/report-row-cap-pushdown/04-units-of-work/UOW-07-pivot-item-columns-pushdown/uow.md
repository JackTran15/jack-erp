---
id: UOW-07
slug: pivot-item-columns-pushdown
title: Báo cáo "Số lượng tồn theo cửa hàng" chạy dưới SQL cho các cột mặt hàng
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-01, US-02]
verifies: [AC-05, AC-11, AC-12, AC-19, AC-22]
risk: high
status: todo
rollback: revert `stock-balance-pivot.service.ts` + `stock-by-store-pivot.report.ts`; engine hôm nay chưa áp lọc SQL nên revert đưa về đúng trạng thái cũ
---

# UOW-07 — Báo cáo "Số lượng tồn theo cửa hàng" chạy dưới SQL cho các cột mặt hàng

## Demo script

1. Mở "Số lượng tồn theo cửa hàng" (bảng pivot) ở chế độ chuỗi → 200 trên tổ chức vượt trần
2. Lọc cột "Tên hàng hoá" và "Nhóm hàng" → dòng giảm, tổng số dòng đổi theo, các ô chi nhánh vẫn đúng
3. Lọc cột "Tổng" lớn hơn một ngưỡng → chỉ còn mặt hàng đạt ngưỡng
4. Lọc một cột chi nhánh → 400 nêu đích danh tên cột (cố ý, đóng ở UOW-08)

## In scope

- `PIVOT_COLUMN_SPECS` dựng từ số 0 — engine hôm nay chỉ băm `columnFilters` vào khoá cache, chưa hề áp vào SQL (A-09)
- 9 spec mức mặt hàng + join `products` / `inventory_item_categories` vào `itemPageSql` **và** `itemCountSql`
- Spec cột `total` bằng truy vấn con trên `stock_balances`, áp ở bước chọn mặt hàng chứ không phải sau khi gấp ô
- `countRows()` + pushdown cho `stock-by-store-pivot.report.ts`

## Not in scope

- Cột động `branch.qty.<branchId>` — UOW-08

## Risks

| Risk | Mitigation |
|---|---|
| Engine chia hai bước: chọn mặt hàng của trang, rồi mới fan-out ô theo chi nhánh. Lọc đặt sai bước sẽ lọc trên ô thay vì trên mặt hàng | Mọi vị từ ghép vào `itemPageSql`/`itemCountSql`; `cellSql` giữ nguyên |
| `loadBranchTotals` tính footer bằng truy vấn riêng, dễ quên đồng bộ bộ lọc | Done-when có test footer khớp tập đã lọc |

## Definition of done

- [x] AC-19 xanh, AC-11 trả 400 đúng tên cột chi nhánh
- [x] Bảng pivot trả 200 trên tổ chức 74515 dòng
- [x] `pnpm --filter @erp/api test` xanh
- [ ] Demo được nghiệm thu ở gate G4
