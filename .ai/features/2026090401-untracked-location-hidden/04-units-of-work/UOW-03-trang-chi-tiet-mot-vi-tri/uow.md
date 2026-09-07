---
id: UOW-03
slug: trang-chi-tiet-mot-vi-tri
title: Trang "Chi tiết vị trí" ở chế độ xem một vị trí hành xử giống hộp thoại
demoable: true
duration: 1d
depends_on: [UOW-02]
requirements: [US-03, US-04]
verifies: [AC-11, AC-12, AC-13, AC-15]
risk: low
status: todo
rollback: revert code — chỉ frontend, không hợp đồng, không dữ liệu
---

# UOW-03 — Chế độ xem một vị trí

Lát khép feature, và là lát nhỏ nhất: một file frontend.

Trang "Chi tiết vị trí" có **hai** chế độ và chỉ một chế độ đúng — phát hiện này đã bác bỏ giả
định A-11 lúc lập kế hoạch, và làm lát này co từ "sửa cả trang" xuống "sửa một hàm dựng tham số":

- Chế độ chung (`!isLocationDetail`) gọi `listStockBalances`, và `buildQuery`
  (`ItemLocationDetailsQuery.ts:47-50`) **đã** mặc định `isTracked = true`. Không đụng.
- Chế độ xem một vị trí (`isLocationDetail`, `ItemLocationDetailsPage.tsx:150-154`) gọi
  `listLocationStockItems` với `locationParams` (`:104-128`) chỉ mang
  `page / pageSize / sortBy / sortOrder / itemCode / itemName`. Bộ lọc trạng thái **có sẵn** trong
  state (`filters.isTracked`, `:87`, mặc định `"true"`) nhưng không bao giờ được chuyển xuống.

Nên lỗi P3 không phải "thiếu tính năng" mà là "state đã đúng, đường dẫn tham số bị đứt". Cột
"Trạng thái" cũng đã render sẵn ở `buildLocationStockItemColumns` (`:163-173`), chỉ bị đặt
`filterKind: "none"` nên không bấm lọc được (A-09).

Lát này cũng gánh AC-15 — phép kiểm khứ hồi trên cả ba màn hình — vì nó chạy sau cùng và là chỗ
duy nhất chứng minh được lời hứa lớn nhất của feature: ẩn đi mà **không mất gì** (A-04).

## Demo script

1. Mở `/inventory/item-location-details?locationId=<id của L>` → thấy đúng số dòng như hộp thoại chi tiết của L, không hơn
   không kém (AC-11).
2. Bấm bộ lọc cột "Trạng thái" → chọn "Ngừng theo dõi" → thấy đúng các dòng đã ngừng (AC-12).
3. Xoá bộ lọc cột "Trạng thái" → thấy đủ cả hai loại (AC-12).
4. Mở trang "Chi tiết vị trí" **không** kèm locationId → hành vi y như trước đợt sửa, request vẫn
   là `isTracked=true` trên `/inventory/stock/balances` (AC-13).
5. **Khứ hồi:** chọn cả 3 dòng đã ngừng của L, bật lại theo dõi → cả 3 hiện lại ở chế độ mặc định
   với đúng số lượng cũ; mở "Vị trí hàng hoá" thấy L trở lại "Đã xếp"; mở hộp thoại thấy đủ 3 mã;
   ngưỡng min/max của từng dòng còn nguyên; `git log` không có migration nào trong đợt (AC-15).

## In scope

- Chuyển `filters.isTracked` xuống `locationParams`.
- Đổi `filterKind` của cột "Trạng thái" trong `buildLocationStockItemColumns` từ `"none"` sang
  `"select"`, dùng `STATUS_FILTER_OPTIONS` mà T-02-03 đã export.
- Phép kiểm không hồi quy cho chế độ chung, và phép kiểm khứ hồi trên cả ba màn hình.

## Not in scope

- `listStockBalances` và `stock-ledger.service.ts` — chế độ chung đã đúng (A-11).
- Thêm cột mới. Cột "Trạng thái" đã tồn tại, chỉ đổi `filterKind` (A-09).

## Risks

| Risk | Mitigation |
|------|------------|
| Sửa nhầm sang chế độ chung và làm hồi quy màn hình đang chạy đúng | AC-13 là phép kiểm không hồi quy tường minh, nằm ngay trong T-03-01 |
| `locationParams` nằm trong `queryKey` — quên thêm `isTracked` vào object thì cache trả kết quả bộ lọc cũ | `isTracked` phải nằm trong chính `locationParams`, không phải một state song song |
| Ẩn đi rồi mới phát hiện dữ liệu đã mất | AC-15 chạy khứ hồi trên cả ba màn hình trước khi đóng feature |

## Definition of done

- [x] AC-11, AC-12, AC-13, AC-15 pass
- [x] Hai lối vào cùng một vị trí (hộp thoại và `/inventory/item-location-details?locationId=…`) cho **cùng** số dòng
- [x] Chế độ chung không đổi một hành vi nào
- [x] Ảnh chụp desktop 1440×900 của cả ba màn hình, chụp sau khi API đã build lại (A-10)
- [x] Không có file migration mới trong toàn bộ diff của feature
- [x] `pnpm build` xanh
- [x] Demoed và accepted ở G4
