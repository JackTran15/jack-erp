---
id: UOW-02
slug: credit-back-net
title: Điểm đã tiêu được hoàn lại theo đúng tỷ lệ tiền
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02, US-03]
verifies: [AC-06, AC-07, AC-08, AC-09, AC-11]
risk: medium
status: todo
rollback: hoàn nguyên `computeRedeemedCreditBack` về `pointsRedeemed × returnSubtotal / subtotal` — một hàm, không schema, không hợp đồng API
---

# UOW-02 — Điểm đã tiêu được hoàn lại theo đúng tỷ lệ tiền

Nửa còn lại của cùng một phiếu trả. `computeRedeemedCreditBack` đứng trên đúng cơ sở gộp mà
UOW-01 vừa bỏ, nên nếu dừng ở UOW-01 thì phiếu trả vẫn còn hai cơ sở tiền khác nhau — chỉ là
đổi chỗ chứ không hết.

Khác một điểm quan trọng so với UOW-01, và cần nói thẳng: hàm này đang hoàn **dư** điểm cho
khách. Sửa xong khách sẽ được hoàn **ít hơn** hiện tại. Chủ sở hữu đã được nêu rõ điều này
trước khi chọn (A-01).

Đây cũng là lát cắt mang trường hợp biên có thật: `INV-202608-00010` đang nằm trong DB dev
với `amount_due = 0` vì khách trả trọn bằng điểm. Mẫu số mới bằng 0 ở đúng hoá đơn đó (A-07).

## Demo script

1. Dựng hoá đơn R2 trên dev: cùng hai dòng như R1, nhưng khách tiêu **1.000 điểm**
   (`points_discount_amount = 500.000`). Chốt đơn.
2. Mở DB: `points_redeemed = 1.000`, `amount_due = 9.474.000`, `points_earned = 947`.
3. POS → Đổi trả hàng → chọn R2 → **chỉ trả dòng A** → chốt phiếu trả.
4. Xem thẻ khách: điểm hoàn lại là **46**. Trước khi sửa chỗ này là **49**.
5. Trả nốt dòng B ở một phiếu khác → tổng điểm hoàn lại của hai phiếu **không vượt quá 1.000**.
6. Làm lại từ đầu với một hoá đơn R2 khác, lần này trả **toàn bộ** trong một phiếu → hoàn lại
   đúng **1.000** điểm, không hơn không kém.
7. Lấy `INV-202608-00010` (`amount_due = 0`, trả trọn bằng điểm) → trả một phần → không lỗi,
   số điểm hoàn là số nguyên hữu hạn, không `NaN`.
8. Đối chiếu `invoices.points_balance_after` của phiếu trả với số dư thật trên thẻ sau khi
   consumer đảo điểm chạy xong: hai số bằng nhau.

## In scope

- `computeRedeemedCreditBack` (`checkout-return.service.ts:651`) chuyển sang tỷ lệ
  `returnedNet / originalInvoice.amountDue` theo ADR-01.
- Chốt chặn `amountDue <= 0` → thoái về tỷ lệ gộp trên `subtotal`, rồi `subtotal <= 0` → 0.
- Kiểm `points_balance_after` khớp số dư thật sau khi consumer chạy.

## Not in scope

- `computeReverseBase` — thuộc UOW-01.
- Đổi cách consumer đảo điểm kẹp ở số dư khả dụng — đang đúng, không đụng.
- `points-redemption.service.ts` (áp điểm trên draft lúc bán) — đường bán, không đụng.
- Bù lại điểm đã hoàn dư của các phiếu trả cũ (A-02).

## Risks

| Risk | Mitigation |
|---|---|
| Chia cho 0 trên hoá đơn trả trọn bằng điểm — có thật trong DB dev (A-07) | T-02-02 có nhánh chốt chặn riêng; AC-08 kiểm bằng chính hoá đơn đó |
| Khách được hoàn ít hơn trước → nhìn như hồi quy khi ai đó xem lại | Ghi vào docblock và vào Demo script bước 4: con số **cố ý** giảm, kèm lý do |
| Mẫu số chọn sai (`Σ netLine` thay vì `amountDue`) → trả toàn bộ không hoàn đủ điểm đã tiêu | AC-07 kiểm đúng đầu mút đó; đã ghi là phương án bị loại trong `03-logical-design.md` |
| `points_balance_after` là ảnh chụp tính trước khi consumer chạy → dễ lệch mà không ai thấy | AC-11 đối chiếu ảnh chụp với số dư thật sau khi consumer xong |

## Definition of done

- [x] AC-06, AC-07, AC-08, AC-09, AC-11 pass ở mức unit (55/55 trong spec)
- [x] Trả toàn bộ hoá đơn hoàn lại đúng `points_redeemed`, kiểm bằng số trên ít nhất hai hoá đơn
- [x] Không đường nào hoàn quá số điểm đã tiêu trên đơn gốc
- [x] Hoá đơn `amount_due = 0` không sinh `NaN` và không chia cho 0
- [x] `pnpm --filter @erp/api test` xanh
- [ ] Demoed và accepted at gate G4 — **CHƯA**: cần chạy Demo script trên app thật
