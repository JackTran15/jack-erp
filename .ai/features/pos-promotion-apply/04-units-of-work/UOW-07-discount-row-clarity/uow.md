---
id: UOW-07
slug: discount-row-clarity
title: Dòng Khuyến mại ở panel thanh toán — ẩn khi 0đ, hiện đúng %, xoá được
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-02]
requirements: [US-08]
verifies: [AC-25, AC-26, AC-27, AC-28]
risk: low
status: todo
rollback: revert PaymentSummaryBlock.tsx to the unconditional row; drop discountMode/discountValue from AppliedProgram — purely additive fields, no persisted data involved
---

# UOW-07 — Dòng Khuyến mại: ẩn khi 0đ, hiện đúng %, xoá được

Thêm 10/08/2026 sau phiên review bug QA trên `feat/promotions`. Dòng "Khuyến mại" ở panel
thanh toán hiện render bất kể số tiền (kể cả -0₫), không bao giờ hiện %, và không có cách nào
bỏ chọn CTKM đã tick ngoài việc reload lại trang.

## Demo script

1. Backoffice: tạo 1 CTKM `INVOICE_DISCOUNT` kiểu `PERCENT` 30%, `auto_apply=true`
2. POS bằng tài khoản `STAFF`: giỏ hàng rỗng/chưa đủ điều kiện → panel thanh toán **không có**
   dòng "Khuyến mại"
3. Thêm hàng đủ điều kiện CTKM 30% → dòng hiện "Khuyến mại (30%)  -xxx đ" kèm nút **X**
4. Bấm nút X (giả định CTKM này được tick thủ công qua dialog của UOW-02, không phải
   auto-apply) → `selectedProgramIds` về rỗng, preview chạy lại, tổng tiền quay về giá trị
   trước khi chọn
5. Tạo thêm 1 CTKM `ITEM_DISCOUNT` trên 1 SKU khác, làm 2 CTKM cùng áp trong 1 giỏ → dòng hiện
   "Khuyến mại" (không kèm %) vì % lẻ không mô tả đúng tổng đã cộng dồn

## In scope

- Ẩn dòng "Khuyến mại" khi `promotionDiscount = 0`
- Hiện badge "(X%)" khi đúng 1 CTKM `INVOICE_DISCOUNT` kiểu `PERCENT` đang áp một mình
- Nút X bỏ tick CTKM tùy chọn đã chọn qua dialog (UOW-02)

## Not in scope

- Đổi CTKM `auto_apply=true` đang thắng (đó là `UOW-04-cashier-overrides-winner`, còn `todo`)
- Badge % cho `ITEM_DISCOUNT`/`TIERED_DISCOUNT` — các loại này không có 1 mode/value cấp
  chương trình (per-reward hoặc per-tier), nên không hiện % cho chúng, chỉ hiện nhãn phẳng

## Risks

| Risk | Mitigation |
| --- | --- |
| % badge sai khi nhiều reward khác mode cùng gộp vào 1 chương trình | T-07-01 chỉ set `discountMode`/`discountValue` khi `type === INVOICE_DISCOUNT`; các type khác luôn `undefined`, T-07-02 fallback về nhãn phẳng |
| Store field `appliedPromotion` (đơn lẻ) bị `T-02-03` xoá và thay bằng `selectedProgramIds` mảng — build T-07-03 trước T-02-03 sẽ vỡ ngay khi merge | `T-07-03.depends_on` khai rõ `T-02-03`; không bắt đầu trước khi UOW-02 xong track đó |

## Definition of done

- [ ] AC-25..AC-28 pass theo Demo script
- [ ] Không còn nhánh nào đọc `promotionPreview.data.promotionDiscount` để render dòng mà thiếu
      guard `> 0`
- [ ] `pnpm --filter @erp/api test` xanh (bao phủ T-07-01)
- [ ] `tsc --noEmit` của `pos-web` sạch
- [ ] Demoed và accepted ở gate G4
