---
id: UOW-09
slug: cashier-excludes-auto-applied
title: Thu ngân bỏ hẳn một CTKM auto_apply đang áp (đóng A-13)
demoable: true
duration: 1.5d
depends_on: [UOW-04]
requirements: [US-10]
verifies: [AC-33, AC-34, AC-35, AC-36, AC-37]
risk: high
status: todo
rollback: revert PromotionResolver + DTO changes trong T-09-01/T-09-02; excludedProgramIds biến mất khỏi contract; checkbox/nút X quay về hành vi khoá cũ (locked, không untick được — như trước UOW-09)
---

# UOW-09 — Thu ngân bỏ hẳn một CTKM auto_apply đang áp

Đóng A-13 — phát hiện qua live-test 12/08/2026: bấm X ở dòng "Khuyến mại" tự áp lại CTKM vừa
bỏ (vì `selectedProgramIds: []` chỉ trả engine về mặc định `priority`, không phải "không áp
gì"); checkbox "Đã áp dụng" trong dialog (`PromotionRow.tsx`) bị khoá cứng — comment trong
code ghi rõ "A-13, còn pending".

`UOW-04` khai rõ đây là **not in scope** của nó: "Bỏ một CTKM `auto_apply=true` mà server đã
tự áp (A-13, còn pending)". UoW này giải đúng phần đó bằng field riêng, không tái dùng
`selectedProgramIds` (xem ADR-07).

## Demo script

1. Backoffice: 1 CTKM `GIFT_ITEM` auto_apply=true + 1 CTKM `INVOICE_DISCOUNT` auto_apply=true,
   không tranh chấp nhau (khác tài nguyên — một chiếm slot quà, một chiếm slot giảm giá hoá đơn)
2. POS: thêm hàng vào giỏ khớp cả 2 CTKM → cả 2 tự áp, panel hiện "Khuyến mại -X" kèm nút X
3. Mở dialog Chương trình khuyến mãi: cả 2 dòng hiện "Đã áp dụng", checkbox tick được để untick
4. Untick CTKM tặng quà → hộp xác nhận nêu tên chương trình + số tiền còn phải thu trước/sau →
   xác nhận
5. Dialog: CTKM tặng quà chuyển "Đã bỏ áp dụng" (skippedPrograms, reason EXCLUDED_BY_CASHIER);
   CTKM giảm giá hoá đơn còn nguyên "Đã áp dụng", không bị ảnh hưởng
6. Đóng dialog: panel chỉ còn giảm giá của CTKM hoá đơn, đúng số server trả
7. Bấm nút X ở dòng tổng "Khuyến mại" → hộp xác nhận liệt kê CTKM còn lại sắp bị loại → xác
   nhận → panel hết hẳn dòng "Khuyến mại", tổng về giá gốc
8. Bấm Thu tiền; hoá đơn không ghi CTKM nào trong 2 CTKM ban đầu
9. Mở giỏ mới (hoá đơn khác) cùng SKU đó → cả 2 CTKM tự áp lại bình thường — loại trừ chỉ sống
   trong draft hiện tại, không rò rỉ sang hoá đơn khác

## In scope

- `excludedProgramIds` mới trên `EvaluateCartDto` + `CheckoutV2Dto`; `PromotionResolver` loại
  hẳn khỏi `eligible` (ADR-07)
- Untick được dòng "Đã áp dụng" trong dialog; nút X ở dòng tổng bỏ **hết** mọi CTKM đang áp
- Hộp xác nhận trước khi loại trừ, nêu tên chương trình + số tiền trước/sau (đồng bộ pattern
  T-04-03)
- `EXCLUDED_BY_CASHIER` trong `SkippedProgramReason` + nhãn tiếng Việt
- Giữ nguyên toàn bộ hành vi cũ khi `excludedProgramIds` rỗng — kể cả hành vi
  `selectedProgramIds` của UOW-04 không hồi quy

## Not in scope

- Bật lại một CTKM đã loại trừ bằng cơ chế khác ngoài tick lại dòng đó trong dialog — không có
  "undo" riêng
- Loại trừ CTKM cho *tương lai* (vd chặn hẳn 1 CTKM khỏi mọi hoá đơn của 1 khách) — phạm vi chỉ
  1 giỏ hàng đang mở, sống theo draft, y hệt vòng đời `selectedProgramIds`
- Thay đổi hành vi hoán đổi winner của UOW-04 (`RESOURCE_TAKEN`) — hai cơ chế độc lập, cùng
  tồn tại song song

## Risks

| Risk                                                                                       | Mitigation                                                                                                      |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Sửa `promotion-resolver.ts` lần 2 làm hồi quy cả engine gốc lẫn UOW-04                       | T-09-01 không được sửa/xoá case nào trong `promotion-resolver.spec.ts` (31 case gốc + 5 case UOW-04); test cũ đỏ = ticket chưa xong |
| `excludedProgramIds` và `selectedProgramIds` mâu thuẫn (cùng 1 id ở cả hai)                  | ADR-07 chốt loại trừ thắng; T-09-01 có case riêng cho tình huống này                                             |
| Nút X ở dòng tổng loại "hết" có thể loại nhầm CTKM thu ngân thực ra muốn giữ khi giỏ đang cộng dồn nhiều CTKM | Hộp xác nhận (T-09-04) liệt kê rõ tên từng CTKM sắp bị loại, không chỉ một con số tổng             |

## Definition of done

- [ ] AC-33..AC-37 pass theo Demo script — chạy sống qua Chrome (**chưa làm** — chỉ mới verify
      qua automated test + tsc, chưa click-through tay)
- [x] Toàn bộ `promotion-resolver.spec.ts` cũ xanh (31 case gốc + 5 case UOW-04), không sửa
      case nào — chỉ thêm case mới cho `excludedProgramIds` (T-09-01, code review PASS)
- [x] `excludedProgramIds` rỗng ⇒ kết quả giống hệt trước UOW-09, kể cả khi `selectedProgramIds`
      (UOW-04) đang có giá trị (case riêng ở cả unit T-09-01 lẫn e2e T-09-05/case 4)
- [x] `pnpm --filter @erp/api test` và `test:e2e` xanh — `test`: 254 suite/2244 pass;
      `test:e2e -- promotion-evaluate`: 19/19; `test:e2e -- checkout-saga-promotion`: 13/13
      (nhiễu "outbox_messages" đã biết, không liên quan — xem ghi chú T-04-04/T-09-05)
- [ ] Demoed và accepted ở gate G4 — không tự ý tick mục này
