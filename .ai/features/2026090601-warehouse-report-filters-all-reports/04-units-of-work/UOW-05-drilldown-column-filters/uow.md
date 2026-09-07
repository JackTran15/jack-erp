---
id: UOW-05
slug: drilldown-column-filters
title: Ô lọc trên lưới drill-down lọc thật
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-04]
verifies: [AC-11, AC-12]
risk: medium
status: todo
rollback: Revert; ba báo cáo quay lại trạng thái nhận-rồi-bỏ (không tệ hơn hôm nay)
---

# UOW-05 — Ô lọc trên lưới drill-down lọc thật

## Demo script
1. Từ "Tổng hợp nhập xuất điều chuyển", click để mở dialog "Chi tiết phiếu nhập xuất điều chuyển"
2. Ghi lại số dòng N
3. Gõ một giá trị CÓ THẬT vào ô lọc đầu một cột → số dòng < N, và mọi dòng còn lại đều khớp
4. Nhìn các cột không có spec → không có ô nhập nào được vẽ
5. Không thao tác nào trên dialog trả 400

## In scope
- `columnFilters` thành tham số của `detail()` và `summarizeByCounterpart()` (ADR-06)
- `ReportColumnSpecs` cho cột có biểu thức thật; `filterKind: 'none'` cho cột không có

## Not in scope
- Bộ lọc đầu trang cho 3 báo cáo này — chúng là drill-down, phạm vi đến từ ô được click

## Risks
| Risk | Mitigation |
| --- | --- |
| `transfer-catalog-parity.spec.ts` khoá chữ ký (A-08) | Cập nhật spec trong cùng ticket, không tắt |

## Definition of done
- [x] AC-11 và AC-12 pass
- [x] Không cột nào vừa vẽ ô lọc vừa không có spec
- [x] `transfer-catalog-parity.spec.ts` xanh
