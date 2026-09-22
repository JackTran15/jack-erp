---
id: UOW-03
slug: admin-all-orders
title: Màn Tất cả đơn — Admin thấy toàn chuỗi và đơn đang ở chi nhánh nào
demoable: true
duration: 1d
depends_on: [UOW-02]
requirements: [US-03]
verifies: [AC-14, AC-15]
risk: low
status: todo
rollback: revert route + cột branchName; thuần đọc, không ghi gì
---

# UOW-03 — Màn Tất cả đơn

## Demo script
1. Dựng 3 đơn: một trong pool, một đã phân cho Hồ Chí Minh, một đã phân cho chi nhánh kiểm thử
2. `/orders/all` → lưới hiện đủ 3 đơn
3. Cột **Chi nhánh** ghi lần lượt "(Chưa phân)", "Hồ Chí Minh", "Chi nhánh kiểm thử"
4. Lọc cột Chi nhánh = Hồ Chí Minh → còn đúng 1 dòng
5. Lọc = "(Chưa phân)" → còn đúng 1 dòng, và đó đúng là đơn đang nằm trên màn Điều phối

## In scope
- Cột `branchName` thêm vào `ORDER_COLUMNS` + bộ lọc select theo chi nhánh
- Route `/orders/all` + nav

## Not in scope
- Hành động phân / trả / huỷ trên màn này — đây là màn tra cứu
- Xuất Excel

## Risks
| Risk | Mitigation |
| --- | --- |
| Thêm cột vào `ORDER_COLUMNS` làm lệch lưới `/orders` của chi nhánh (vốn không cần cột đó) | Cột khai trong `ORDER_COLUMNS` nhưng tập cột mặc định của mỗi màn khác nhau; `/orders` không bật `branchName` |
| Lọc "(Chưa phân)" không map được sang `branch_id IS NULL` | Giá trị lọc riêng, không phải chuỗi rỗng — ghi rõ trong T-03-01 |

## Definition of done
- [x] AC-14, AC-15 có bằng chứng ảnh trong `07-verification.md`
- [x] Lưới `/orders` của chi nhánh không đổi hình dạng
