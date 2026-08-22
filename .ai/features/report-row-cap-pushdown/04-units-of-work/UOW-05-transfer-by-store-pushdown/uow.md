---
id: UOW-05
slug: transfer-by-store-pushdown
title: Báo cáo "Điều chuyển theo cửa hàng" chạy dưới SQL
demoable: true
duration: 1.5d
depends_on: [UOW-01]
requirements: [US-01, US-02]
verifies: [AC-04, AC-05, AC-12, AC-21, AC-22, AC-23]
risk: medium
status: todo
rollback: revert `transfer-report.service.ts` + `transfer-by-store.report.ts`
---

# UOW-05 — Báo cáo "Điều chuyển theo cửa hàng" chạy dưới SQL

## Demo script

1. Mở "Điều chuyển theo cửa hàng", chọn cửa hàng nguồn → 200 trên tổ chức vượt trần
2. Lọc cột "Cửa hàng nhận" → dòng và footer đổi theo
3. Lọc "Giá trị xuất" trong một khoảng → footer khớp tập đã lọc
4. Kiểm footer: hai cột đơn giá bình quân vẫn trống, đúng như hôm nay (trung bình của trung bình là sai)

## In scope

- `transferByBranchSpecs` thêm brand, group, parentSku, parentName, color, size, targetBranch + join tương ứng vào câu count
- Spec `outAvgPrice` / `inAvgPrice` bằng biểu thức chia — lọc được nhưng vẫn không cộng được
- `countRows()` + pushdown cho `transfer-by-store.report.ts`

## Not in scope

- Báo cáo "Tổng hợp nhập xuất điều chuyển" (`transfer-summary`) — không nằm trong bảy báo cáo v2 dính lỗi

## Risks

| Risk | Mitigation |
|---|---|
| Hai cột đơn giá bình quân cố ý vắng mặt trong `totals`; thêm spec dễ vô tình kéo chúng vào | T-05-04 khẳng định `totals` vẫn không chứa hai khoá đó |

## Definition of done

- [x] AC-21 xanh, AC-04 parity với đường JS
- [x] `totals` vẫn không chứa outAvgPrice / inAvgPrice
- [x] `pnpm --filter @erp/api test` xanh
- [ ] Demo được nghiệm thu ở gate G4
