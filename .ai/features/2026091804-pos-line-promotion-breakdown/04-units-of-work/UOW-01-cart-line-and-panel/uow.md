---
id: UOW-01
slug: cart-line-and-panel
title: Màn hình bán hàng — dòng hàng vẽ CTKM, panel phải chỉ còn CTKM hóa đơn
demoable: true
duration: 1.5d
depends_on: []
requirements: [US-01, US-02]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10]
risk: medium
status: todo
rollback: revert 4 file pos-web; không có dữ liệu nào ghi xuống — preview là dữ liệu server trả, không lưu
---

# UOW-01 — Dòng hàng vẽ CTKM, panel phải chỉ còn CTKM hóa đơn

## Demo script
1. Đăng nhập POS (Hồ Chí Minh), gõ `SKU-685` → dòng hiện nhãn đỏ *CTKM-A hang hoa 10% SKU-685 - claude (68.500)*, Thành tiền ~~685.000~~ **616.500**; panel: Tổng tiền **616.500**, **không** có dòng Khuyến mại, Còn phải thu 616.500
2. Gõ `SKU-100` → dòng 2 có nhãn *CTKM-B … (10.000)*, Thành tiền **100.000** không gạch; panel: Tổng tiền **716.500**, *Khuyến mại (10%)* **−10.000**, Còn phải thu **706.500**
3. Chuột phải dòng SKU-685 → giảm giá tay 50.000 lý do "test" → hai nhãn dưới tên (CTKM-A vẫn 68.500 — engine tính % trên đơn giá gốc), Thành tiền ~~685.000~~ **566.500**; Còn phải thu = 566.500 + 100.000 − 10.000 = **656.500**, khớp `evaluate`
4. Bấm ✕ cạnh *Khuyến mại* → hộp xác nhận chỉ nêu CTKM-B → đồng ý → dòng Khuyến mại biến mất, nhãn CTKM-A vẫn còn
5. Mở modal *Chương trình khuyến mãi*, bỏ tick CTKM-A → nhãn trên SKU-685 biến mất, Thành tiền về không gạch

## In scope
- `buildLinePromotionIndex` + `LinePromotion` + hai selector (ADR-01)
- `InvoiceLineItemRow`: nhãn CTKM + Thành tiền net item-bucket (ADR-02, ADR-03)
- `PaymentSummaryBlock`: Tổng tiền hiển thị, dòng Khuyến mại invoice-only, ✕ chỉ invoice (ADR-05)
- Ảnh headless có assert DOM cho AC-01/02/04/07/08/10

## Not in scope
- Hóa đơn in (UOW-02), hóa đơn đã lưu (UOW-03)
- Số tiền từng CTKM trong modal *Chương trình khuyến mãi*
- Dòng trả/đổi hàng (`isReturnCredit`) — không vẽ CTKM

## Risks
| Risk | Mitigation |
| --- | --- |
| Có chỗ khác đọc `promotionDiscount` toàn phần để hiển thị (gợi ý tiền mặt, QR, in) và bỗng lệch với *Tổng tiền* mới | `grep selectPromotionDiscountAmount` trước khi sửa; chỉ đổi số **hiển thị** ở hai component, `deriveSettlement` giữ nguyên nên Còn phải thu không đổi |
| `lineId` preview không khớp `CartLine.lineId` sau khi tách dòng (`Tách dòng`) | Demo bước 1–2 lộ ngay; index bỏ qua id lạ + `console.warn` (error taxonomy) |
| ✕ đổi hành vi (chỉ bỏ CTKM hóa đơn) làm thu ngân quen tay bất ngờ | Câu xác nhận nêu đích danh chương trình bị bỏ; ghi trong PR (A-04) |

## Definition of done
- [ ] AC-01..AC-10 có bằng chứng: ảnh headless assert DOM cho 01/02/04/07/08/10, đọc mã cho 03/05/06/09
- [ ] Còn phải thu **không đổi từng đồng** so với trước feature ở cả 3 giỏ demo (so với `amountAfterPromotion` của `evaluate`)
- [ ] `tsc --noEmit` pos-web xanh
- [ ] Không file nào ngoài `touches:` của các ticket bị đụng
