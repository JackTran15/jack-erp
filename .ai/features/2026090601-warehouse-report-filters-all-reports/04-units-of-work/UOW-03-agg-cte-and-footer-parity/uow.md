---
id: UOW-03
slug: agg-cte-and-footer-parity
title: Vị từ thành viên vào CTE gộp; chân trang khớp lưới
demoable: true
duration: 2d
depends_on: [UOW-02]
requirements: [US-02, US-05]
verifies: [AC-06, AC-08, AC-13, AC-14]
risk: high
status: todo
rollback: Revert; UOW-02 vẫn đứng một mình (hết 400, chưa lọc đúng ở hạt gộp)
---

# UOW-03 — Vị từ thành viên vào CTE gộp; chân trang khớp lưới

## Demo script
1. Chọn một nhóm có cả hàng ĐVT "Đôi" lẫn ĐVT khác
2. "Thống kê theo" = "Nhóm hàng hóa", không lọc ĐVT → ghi lại số lượng của nhóm đó
3. Đặt "Đơn vị tính" = "Đôi" → số lượng nhóm đó **nhỏ hơn** bước 2 và **lớn hơn 0**
4. Lật tới trang cuối → tổng số dòng khớp số dòng thật sự duyệt được
5. "Tổng hợp hàng hóa đã điều chuyển theo cửa hàng" ở hạt Mẫu mã → trang cuối có ít nhất một dòng

## In scope
- `partitionAggFilters` ba ngăn: `cteWhere` / `outerWhere` / `having` (ADR-03)
- Một CTE `groups` dùng chung cho trang + đếm + chân trang, ở cả `stock-period` và `transfer-report` (ADR-05)
- Bổ `JOIN branches b` còn thiếu ở `countSql` hạt gộp của `transfer-report`

## Not in scope
- Đổi cách đếm sang window function — đã bác ở phần Alternatives rejected

## Risks
| Risk | Mitigation |
| --- | --- |
| Vị từ đặt ngoài CTE ⇒ lọc trên cột đã NULL hoá, trả rỗng (A-06) | Test bắt buộc: nhóm ĐVT hỗn hợp phải ra `0 < n < không lọc` |
| Số tổng giảm so với hôm nay, trông như hồi quy (A-09) | Ghi vào ghi chú phát hành; test khẳng định tổng = số dòng duyệt được |

## Definition of done
- [x] AC-06, AC-08, AC-13, AC-14 pass
- [x] Ba câu (trang/đếm/chân trang) dùng chung một CTE ở cả hai engine
- [x] Ghi chú phát hành nêu rõ số tổng có thể giảm
