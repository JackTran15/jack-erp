---
id: UOW-04
slug: exchange-promotion-pos
title: POS — tab đổi trả dùng CTKM cho dòng mua thêm, chọn/bỏ trong modal, thu đúng số BE chốt
demoable: true
duration: 1.5d
depends_on: [UOW-01, UOW-03]
requirements: [US-04]
verifies: [AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27]
risk: high
status: todo
rollback: revert 4 commit pos-web; BE (UOW-03) vẫn nhận request cũ không có id → CTKM autoApply vẫn áp server-side, nên KHÔNG rollback UOW-04 mà giữ UOW-03 — FE cũ sẽ gửi payments theo gross và bị 400; rollback phải là cả hai
---

# UOW-04 — Tab đổi trả dùng CTKM

## Demo script
1. POS tab bán: quét SKU-685, *Thu tiền* → HĐ S (CTKM-A 10%, hoàn 616.500/đv).
2. *Đổi trả hàng* → S → trả 1 × SKU-685 → tab đổi trả. Quét thêm SKU-685 (mua thêm).
3. Dòng mua thêm: nhãn `CTKM-A … (68.500)`, *Thành tiền* ~~685.000~~ **616.500**. Modal: CTKM-A *Đã áp dụng* (ảnh 5 hôm nay: "Chưa có chương trình…").
4. Panel: *Tổng tiền* **0**, không *Còn phải thu* dương / *Trả lại khách* dương. Bấm *Thanh toán* → phiếu đổi post với `refundMethod OFFSET`, `netAmount 0`.
5. Lặp với bỏ CTKM-A trong modal: *Còn phải thu* **68.500**; *Thanh toán* → `payments 68.500`, `excludedProgramIds: [CTKM-A]`, BE `netAmount 68500`.
6. Trả 1 × SKU-685 (616.500) + mua 1 × SKU-100 (100.000, không CTKM): *Trả lại khách* **516.500**, *Thanh toán* → BE `refundedAmount 516500` (hôm nay FE gửi hoàn 585.000 theo gross → lệch BE).
7. Chặn `/v2/promotions/evaluate` (DevTools) rồi quét thêm SKU-685: panel thiếu nhãn, nhưng *Thanh toán* vẫn đi: `exchanges` → `checkout-return/preview` (`netAmount 0`) → `checkout-return` OFFSET; phiếu post có `promotion_discount 68.500`. Chặn `checkout-return/preview` → toast "Không lấy được số tiền đổi trả từ máy chủ", không có request `checkout-return`.
8. *In tạm tính* ở bước 3 → dòng mua thêm trên bản in có nhãn CTKM-A + 616.500; khối *Tiền hàng trả lại* không nhãn.

## In scope
- Preview chạy ở mọi variant, chỉ gửi dòng mua thêm; giảm tay % vào evaluate.
- Sau khi tạo phiếu: dry-run `checkout-return/preview` → payload từ `netAmount` BE, kèm selected/excluded ids (ADR-03); preview POS hỏng không chặn (ADR-05).

## Not in scope
- Dòng trả nhận nhãn từ preview (UOW-02 lo bằng snapshot).
- Sửa `ReturnItemsDialog`, `PaymentSection` layout.
- Tab bán: hành vi không đổi ngoài A-10 (giảm tay % vào evaluate).

## Risks
| Risk | Mitigation |
| --- | --- |
| `selectPromotionDiscountAmount` / `selectPromotionBucketTotals` giờ khác 0 ở tab đổi trả → `deriveSettlement` trừ CTKM khỏi `grandTotal` âm | Đây là điều muốn: `grandTotal = new − return`, trừ CTKM của new là đúng. Đối chiếu từng đồng với BE ở bước 4–6 demo |
| Preview gửi `lineId` client, BE evaluate `lineId = invoice_items.id` — cùng giỏ nhưng ánh xạ khác | Chỉ tổng `promotionDiscount` dùng cho `net`; nhãn theo lineId client như luồng bán |
| Draft đổi trả cũ trong localStorage có `promotionPreview` `idle` | Hook chạy lại khi mount, không cần migrate |
| Preview POS hỏng → panel thiếu CTKM nhưng BE vẫn áp → số panel ≠ số post | Chấp nhận có chủ ý (A-09 rejected, ADR-05), cùng tư thế luồng bán; `console.warn` khi lệch để QA thấy; hóa đơn in lấy `code`/điểm từ response |
| Thêm một request (`preview`) giữa tạo phiếu và post | Chỉ ở luồng đổi/trả; lỗi ở đây → toast + dọn draft như nhánh lỗi hiện có, không post nửa chừng |

## Definition of done
- [ ] AC-20..AC-27 có ảnh headless + assert DOM/network trong `evidence/`; AC-24 đối chiếu body request với `netAmount` của `checkout-return/preview`
- [ ] Ba kịch bản demo 4/5/6 cho `netAmount`/`refundedAmount` BE **bằng** số panel hiển thị
- [ ] Tab bán: số *Còn phải thu* với giỏ `L-01`/`L-02` của 2026091804 không đổi (A-10 chỉ đổi khi có giảm tay %)
- [ ] `tsc --noEmit` pos-web xanh
- [ ] Không file nào ngoài `touches:` của T-04-01..T-04-04 bị đụng
- [ ] Demo script chạy trước Akenzy
