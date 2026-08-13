---
id: UOW-02
slug: clamp-points
title: Điểm chỉ bị trừ đúng phần đổi được thành tiền giảm
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-06, AC-07, AC-08]
risk: medium
status: todo
rollback: gỡ bước `clamp-points` khỏi danh sách step trong `checkout-saga.controller.ts` — các step khác không phụ thuộc nó
---

# UOW-02 — Kẹp điểm sau khi engine khuyến mại chạy

Trần đổi điểm được chốt trên **draft**, qua một lời gọi HTTP riêng, trước khi engine KM từng chạy.
Rồi trong transaction checkout, KM được cộng vào và `computeAmountDue` kẹp kết quả bằng
`Math.max(0, …)` — phần chênh biến mất trong im lặng, nhưng thẻ khách vẫn bị trừ đủ số điểm.

Giỏ 580.000, KM 116.000, khách bấm 1000 điểm: 928 điểm là đủ, 72 điểm còn lại lẽ ra phải ở lại trên
thẻ. Hiện tại cả 1000 bị trừ và 36.000đ giá trị bốc hơi.

Sửa ở tầng saga chứ không ở tầng áp điểm trên draft (ADR-02): draft chỉ ghi nhận **ý định**, nơi duy
nhất biết đủ dữ kiện để kẹp là trong transaction, sau `evaluate-promotion`. Làm ở đó thì cả đường
gọi API trực tiếp cũng được bảo vệ, không chỉ đường qua POS.

## Demo script

1. Giỏ 580.000, CTKM giảm 116.000 (còn phải thu 464.000). Bấm đổi 1000 điểm.
2. Checkout → thẻ chỉ bị trừ **928 điểm**, còn lại **72 điểm** trên thẻ (AC-06).
3. `invoices.points_redeemed = 928`, `points_discount_amount = 464.000`, `amount_due = 0` (AC-07).
4. `point_history` có đúng **một** dòng REDEEM `delta = -928` — không có dòng −1000 nào (AC-07).
5. Trên màn hình thanh toán, "Còn phải thu" hiển thị **0**, không phải −36.000; số điểm hiển thị là
   số sẽ thực bị trừ (AC-08).
6. Ca đối chứng: giỏ không có CTKM, đổi 1000 điểm trong hạn mức → vẫn trừ đủ 1000, không đổi hành vi.

## In scope

- Bước saga `clamp-points` (D3) và việc `redeem-points` chỉ trừ số đã kẹp.
- Lưu `pointsRedeemed` / `pointsDiscountAmount` theo số đã kẹp.
- POS: kẹp 0 ở `deriveSettlement`, hiển thị số điểm thực dùng.

## Not in scope

- `points-redemption.service.ts` (áp điểm trên draft) giữ nguyên vai trò ghi nhận ý định (ADR-02).
- Luồng checkout v1 — không có bước saga; lỗi này chỉ biểu hiện ở v2 (cờ `VITE_CHECKOUT_V2`).
- Đổi tỷ giá điểm hay quy tắc tích điểm.

## Definition of done

- [ ] AC-06…AC-08 pass
- [ ] Không đường nào trừ điểm nhiều hơn giá trị thực được giảm, kể cả khi gọi API trực tiếp
- [ ] `points_redeemed` trả về trong response bằng đúng số đã trừ trên thẻ
- [ ] Giỏ không có CTKM giữ nguyên hành vi cũ
- [ ] Demoed và accepted at gate G4
