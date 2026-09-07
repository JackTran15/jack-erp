---
id: UOW-01
slug: cot-xep-hang-hoa
title: Cột "Xếp hàng hoá" nói đúng sự thật sau khi Ngừng theo dõi
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05]
risk: low
status: todo
rollback: revert code — không schema, không dữ liệu, không tham số API mới
---

# UOW-01 — Cột "Xếp hàng hoá" nói đúng sự thật

Lát đầu tiên vì nó là triệu chứng người dùng nhìn thấy trước nhất ("trạng thái Đã xếp"), và vì nó
độc lập hoàn toàn: không thêm tham số, không đụng hợp đồng API, không cần FE đổi một dòng nào.

Toàn bộ lỗi nằm trong một hằng SQL. `HAS_ITEMS_SQL`
(`search-locations-v2.handler.ts:18-22`) hỏi "vị trí này có dòng `stock_balances` nào không" trong
khi câu hỏi đúng là "có dòng nào **đang theo dõi** không". Vì hằng đó được dùng ở cả ba chỗ —
projection, predicate `hasItems = true`, predicate `NOT (...)` — sửa một chỗ là sửa cả cột lẫn bộ
lọc, và hai vế không thể lệch nhau. Đó là lý do giữ nó là một hằng chứ không chép ra ba chuỗi.

Cạm bẫy duy nhất của lát này là viết nhầm phủ định. "Chưa xếp" là
`NOT EXISTS(... AND is_tracked = true)` — *không còn dòng nào đang theo dõi*. Nó **không** phải
`EXISTS(... AND is_tracked = false)` — *có ít nhất một dòng đã ngừng*. Một vị trí vừa có dòng đang
theo dõi vừa có dòng đã ngừng phân biệt được hai vế đó, nên test phải có đúng ca hỗn hợp này.

Lát này cũng vá luôn bản sao cùng lỗi ở `listLocations` (A-06) — endpoint còn sống dù backoffice
không gọi. Đây chính là kịch bản mà A-05 đợt `2026090301` cảnh báo: chỗ đọc nào quên guard thì lỗi
tái diễn ở màn hình sau.

## Demo script

1. Vào "Chi tiết vị trí", chọn **mọi** dòng của vị trí L, bấm Ngừng theo dõi.
2. Sang trang "Vị trí hàng hoá", tìm L → cột "Xếp hàng hoá" hiển thị **"Chưa xếp"** (AC-01).
3. Lọc cột "Xếp hàng hoá" = "Chưa xếp" → L có trong kết quả; đổi sang "Đã xếp" → L biến mất, và
   tổng số dòng khớp với từng bộ lọc (AC-03).
4. Lấy vị trí M có 1 dòng đang theo dõi **số lượng 0** và vài dòng đã ngừng → M vẫn **"Đã xếp"**
   (AC-02). Đây là ca dễ làm hỏng nhất nếu ai đó lọc theo số lượng.
5. Quay lại "Chi tiết vị trí", bật lại theo dõi 1 dòng của L → L trở lại **"Đã xếp"** (AC-04).
6. Gọi thẳng endpoint danh sách vị trí v1 cho L → `hasItems = false` (AC-05).

## In scope

- `AND sb.is_tracked = true` trong hằng `HAS_ITEMS_SQL` của `SearchLocationsV2Handler`.
- Cùng điều kiện trong truy vấn phụ tính `hasItems` của `InventoryLocationService.listLocations`.
- Test cho ca hỗn hợp (vừa có dòng đang theo dõi vừa có dòng đã ngừng) ở cả hai chiều bộ lọc.

## Not in scope

- Danh sách hàng bên trong một vị trí (UOW-02) — khác endpoint, khác hình dạng hợp đồng.
- Bất kỳ tham số mới nào trên `LocationSearchV2Dto`. `hasItems` là định nghĩa nghiệp vụ, không phải
  bộ lọc tuỳ chọn (ADR-02).

## Risks

| Risk | Mitigation |
|------|------------|
| Viết nhầm `EXISTS(is_tracked = false)` thay vì `NOT EXISTS(is_tracked = true)` | T-01-01 bắt buộc có test ca hỗn hợp — vị trí có cả hai loại dòng phải ra "Đã xếp" |
| Sửa projection mà quên predicate (hoặc ngược lại) | Giữ nguyên một hằng dùng chung; test assert cả `hasItems=true`, `hasItems=false` và giá trị projection |
| `listLocations` bị bỏ quên (A-06) | Là ticket riêng T-01-02 chứ không phải ghi chú trong T-01-01 |

## Definition of done

- [x] AC-01..AC-05 pass
- [x] Test có ca hỗn hợp và ca "đang theo dõi nhưng số lượng 0"
- [x] `pnpm --filter @erp/api test` xanh
- [x] Không có file migration mới trong diff
- [x] Demoed và accepted ở G4
