---
id: UOW-05
slug: promotion-target-picker
title: Marketing chọn hàng hóa, mẫu mã và nhóm hàng cho mọi lưới của form CTKM
demoable: true
duration: 2d
depends_on: [UOW-03]
requirements: [US-05]
verifies: [AC-28]
risk: medium
status: todo
rollback: các lưới quay lại chế độ nhập tay bằng một commit revert; nếu `ProductSelectDialog` có sửa thì revert riêng phần prop `mode`
---

# UOW-05 — Chọn hàng hóa cho 6 lưới

FR-024 mô tả một dialog chọn hàng hóa: lọc theo nhóm, tìm theo SKU/tên, mở rộng dòng cha để
chọn từng mẫu mã, bộ đếm `n mẫu mã (m hàng hóa)`, phân trang, chọn nhiều dòng một lần mở.

**Dialog đó đã tồn tại**: `components/shared/product-select/ProductSelectDialog.tsx`, chạy trên
`POST /v2/inventory-items/search`. UoW này **nối dialog có sẵn vào 6 lưới**, không dựng dialog
mới. Hiện chỉ `ConditionPromotionSection/ApplicableGoodsGrid` đã nối.

## Demo script

1. Mở form `Giảm giá hàng hóa`, bấm chọn hàng ở `GoodsDiscountGrid` → dialog dùng chung mở ra.
2. Chọn hỗn hợp: một dòng ở cấp hàng hóa, hai dòng ở cấp mẫu mã → đóng dialog, cả ba vào lưới,
   dòng cũ không bị ghi đè.
3. Mở lại dialog → ba dòng vừa chọn hiện trạng thái đã chọn, không cho chọn trùng.
4. Đổi phạm vi sang `Nhóm hàng hóa` → dialog cho chọn nhóm từ cây `inventory_item_categories`
   ≥ 2 cấp; cột lưới đổi sang Mã nhóm · Tên nhóm · % giảm giá.
5. Nhập 30% ở ô áp hàng loạt → mọi dòng trong lưới nhận 30%, cột `Giá khuyến mại` tự tính:
   `685.000` → `479.500`.
6. Lặp cho 5 lưới còn lại: `ProductSelectionGrid` (bậc thang), `GiftProductGrid`,
   `BuyGetProductGrid` ×2, `ApplicableGoodsGrid`.

## In scope

- Wrapper `PromotionTargetPicker` chuẩn hóa `ProductSelectResult → PromotionLine`-shape.
- Helper `promoPrice` dùng chung, cùng quy tắc làm tròn với `roundVnd` của domain.
- Nối 5 lưới còn lại; chế độ `CATEGORY` trên `ProductSelectDialog`.

## Not in scope

- Dựng dialog chọn hàng hóa mới — quy ước đã chốt: tích hợp vào component có sẵn.
- Nhập/xuất Excel danh sách hàng khuyến mại (ngoài phạm vi epic).

## Risks

| Risk | Mitigation |
|---|---|
| Sửa `ProductSelectDialog` làm vỡ các nơi gọi hiện tại | Liệt kê **mọi** nơi gọi trước khi sửa, kiểm từng nơi và ghi vào PR description (T-05-03) |
| `promoPrice` ở FE lệch `roundVnd` ở BE → số trên form khác số BE tính | Một helper duy nhất, có test bắt buộc case AC-01 `promoPrice(685000, 'PERCENT', 30) === 479500` (T-05-01) |
| Mỗi lưới tự map kết quả dialog → 6 bản sao code map | Wrapper `toPromotionLines(result, role)` dùng chung cho cả 6 chỗ (T-05-01) |
| Chế độ `CATEGORY` làm `ProductSelectDialog` phình quá mức | Ưu tiên thêm prop `mode` tái dùng cây `categoryFilter` đã nạp; chỉ tách `CategorySelectDialog` khi cách kia đã thử và thấy rối (T-05-03) |

## Definition of done

- [ ] AC-28 pass
- [ ] Không có component dialog chọn hàng hóa nào mới dưới `pages/promotions/`
- [ ] Click-through mở dialog từ **cả 6 lưới**, chọn hỗn hợp, lưu, mở lại → đúng dòng đã chọn
- [ ] `pnpm --filter @erp/backoffice-web build` xanh
- [ ] Demo script chạy hết và được nghiệm thu ở gate G4
