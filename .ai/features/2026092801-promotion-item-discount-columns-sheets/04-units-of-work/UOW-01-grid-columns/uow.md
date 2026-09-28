---
id: UOW-01
slug: grid-columns
title: Lưới Giảm giá hàng hóa — tên sạch, cột ĐVT/Giá bán/Giá KM, Đồng giá bỏ cột %
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-02, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10]
risk: low
status: todo
rollback: revert T-01-01..T-01-03 — chỉ frontend, không có migration
---

# UOW-01 — Lưới Giảm giá hàng hóa: tên sạch, cột ĐVT/Giá bán/Giá KM, Đồng giá bỏ cột %

## Demo script
1. Form *Giảm giá hàng hóa*, phạm vi *Hàng hóa*, *%*. Bấm kính lúp, chọn lẻ vài mẫu mã có size/màu → tên **không** có `(38 · D)`
2. Lưới có cột `ĐVT | Giá bán | % giảm giá | Giá khuyến mại`. Gõ `SKU-685` ở ô tra cứu, giá trị 30 → Giá bán 685.000, Giá KM 479.500; đổi thành 10 → 616.500
3. Chuyển *Số tiền*, `SKU-100` giảm 150.000 → Giá KM 0
4. Chuyển *Đồng giá*, nhập 50.000 → cột `% giảm giá` và copy xuống biến mất, Giá KM mọi dòng = 50.000
5. Lưu, mở lại → ĐVT/Giá bán vẫn đủ, tên không đổi
6. Chuyển phạm vi *Nhóm hàng hóa* → không có ba cột ĐVT/Giá bán/Giá KM
7. Mở CTKM *Tặng hàng*, chọn mẫu mã qua picker → tên cũng không có hậu tố

## In scope
- `toPromotionTargets` bỏ hậu tố `variantLabel`
- `GoodsDiscountRow.unit` / `sellingPrice` + nguồn từ ô tra cứu, picker, chi tiết
- Cột mới và luật ẩn cột theo phạm vi / phương thức

## Not in scope
- Dòng từ nhập khẩu có ĐVT/giá (UOW-03, cần server trả thêm ở UOW-02)
- Nút Nhập/Xuất ở *Đồng giá* (UOW-03)

## Risks
| Risk | Mitigation |
| --- | --- |
| `/inventory/items` không trả `sellingPrice` (A-13) | T-01-02 kiểm response thật trước khi code; nếu thiếu thì `reopen G2` |
| Lưới 8 cột bị chật ở 1440px | Chia lại `width` %; chụp ảnh ở viewport `desktop` |

## Definition of done
- [x] AC-01 xanh trong `promotion-target.spec.ts`
- [x] AC-02..AC-10 có ảnh chụp trình duyệt trong `07-verification.md`
- [x] `pnpm --filter @erp/backoffice-web build` xanh (tsc)
- [x] Không file nào ngoài `touches:` bị đụng
