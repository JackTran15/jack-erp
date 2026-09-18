---
id: UOW-02
slug: receipt-at-sale
title: Hóa đơn in lúc bán — nhãn CTKM dưới từng dòng, Thành tiền sau CTKM hàng hóa
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-11, AC-12, AC-13]
risk: low
status: todo
rollback: revert 3 file in; hóa đơn đã in là giấy — không có gì để dọn
---

# UOW-02 — Hóa đơn in lúc bán

## Demo script
1. Giỏ SKU-685 + SKU-100, bấm **In tạm tính** → HTML in: dòng 1 dưới tên *CTKM-A … (68.500)*, ĐG 685.000, TT **616.500**; dòng 2 dưới tên *CTKM-B … (10.000)*, TT **100.000**; khối tổng: Tiền hàng 785.000, Khuyến mãi 78.500 (KM theo mặt hàng 68.500 / KM theo hóa đơn 10.000), Tổng thanh toán 706.500
2. Thêm giảm tay 50.000 dòng 1 → In tạm tính: dòng 1 có 2 nhãn, TT **566.500**; khối tổng thêm *Giảm giá* 50.000, KM theo mặt hàng vẫn 68.500
3. Bật *In hóa đơn*, **Thu tiền** → HTML hóa đơn in giống bước 1 từng nhãn, từng số

## In scope
- `InvoiceLineData.promotionLabels`, factory dựng nhãn + `lineTotal` net item-bucket từ `promotionEngineDiscounts`, renderer in nhãn
- Bằng chứng: `--receipt` mở rộng assert từng dòng; hóa đơn sau Thu tiền lấy từ iframe in

## Not in scope
- Khối tổng hóa đơn in (A-05 — giữ nguyên)
- In lại từ hóa đơn đã lưu (UOW-03)

## Risks
| Risk | Mitigation |
| --- | --- |
| `promotionEngineDiscounts` chỉ được truyền ở một trong hai đường in (tạm tính vs sau Thu tiền) | `grep promotionEngineDiscounts` cả `use-checkout-estimate.ts` lẫn `use-checkout-actions.ts` — hai đường đều đi qua `buildCheckoutInvoicePayload` |
| Mẫu in nhiệt hẹp, hai nhãn dài làm vỡ dòng | Nhãn là `div.line-sub` riêng, đã có với ghi chú/giảm tay; kiểm ảnh ở 480px |

## Definition of done
- [ ] AC-11, AC-12, AC-13 có bằng chứng HTML in (assert `div.line-sub` + cột TT từng dòng)
- [ ] Khối tổng hóa đơn in **không đổi** so với ảnh `POS-05` của feature 2026091803
- [ ] `tsc --noEmit` xanh; không file ngoài `touches:`
