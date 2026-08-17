---
id: UOW-07
slug: pos-promotion-row
title: Dòng "Khuyến mại" chỉ hiện khi có tiền giảm thật
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-05]
verifies: [AC-14]
risk: low
status: todo
rollback: revert một file
---

# UOW-07 — Dòng khuyến mại ở panel thanh toán

Lát nhỏ nhất của feature. Giỏ hàng rỗng, tổng tiền 0, nhưng dòng "Khuyến mại" vẫn hiện kèm một ô xám
đang tải.

Guard đã có sẵn và đúng — `shouldShowPromotionRow` (`promotionPresentation.ts:203-206`) trả
`promotionDiscount > 0`. Nó chỉ chặn nhánh `ready`; nhánh `loading`
(`PaymentSummaryBlock.tsx:92-101`) render vô điều kiện. Cùng họ với lỗi #4 và #3: một nhánh có
guard, nhánh song song thì không.

Preview KM **cố ý** chạy cả khi giỏ rỗng (`use-checkout-promotion-preview.ts:80-92`) để dialog
"Chương trình khuyến mãi" nạp được danh sách — nên không được sửa bằng cách chặn preview, mà chặn ở
chỗ render.

## Demo script

1. Mở màn hình bán hàng với giỏ rỗng → **không** có dòng "Khuyến mại", không ô xám đang tải (AC-14).
2. Mở dialog "Chương trình khuyến mãi" khi giỏ rỗng → danh sách CTKM vẫn nạp bình thường (không được
   hồi quy vì preview vẫn phải chạy).
3. Thêm hàng vào giỏ, chưa có CTKM nào khớp → không có dòng "Khuyến mại".
4. Thêm hàng khớp CTKM → trong lúc tải hiện ô xám, xong thì hiện số tiền giảm thật.
5. Xoá hết hàng khỏi giỏ → dòng biến mất trở lại.

## In scope

- Chặn nhánh `loading` trong `PaymentSummaryBlock.tsx`.

## Not in scope

- Đổi `use-checkout-promotion-preview.ts` — việc chạy khi giỏ rỗng là cố ý.
- Đổi `shouldShowPromotionRow` — đang đúng.
- Các dòng khác trong panel thanh toán.

## Definition of done

- [x] AC-14 pass — ảnh chụp `evidence/local-pos/desktop/S1.png`: giỏ rỗng, `Tổng tiền 0`, panel đi
      thẳng Tổng tiền → Đặt cọc → Còn phải thu, **không** có dòng "Khuyến mại" và không có ô xám
- [ ] Dialog "Chương trình khuyến mãi" vẫn nạp được với giỏ rỗng
- [ ] Giỏ có hàng và có CTKM khớp → vẫn thấy trạng thái đang tải rồi ra số thật
- [x] `pnpm --filter @erp/pos-web build` sạch
- [ ] Demoed và accepted at gate G4

Hai ô còn trống là hồi quy **có chủ ý chưa tự động hoá**: cả hai cần giỏ hàng có hàng và một CTKM
khớp, tức phải dựng giỏ rồi bắt đúng khoảnh khắc đang tải — nhiều hơn 3 thao tác mà một bước cho
phép, và bắt trạng thái loading bằng script thì giòn. Người chạy demo tick sau khi xem tận mắt.

## Verification evidence
- [ ] `verify.py <feature-dir> --write` green on every required environment
- [ ] Evidence exists for every AC in `verifies`, at every declared viewport
- [ ] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description

**Hai ô đầu đã từng được tick rồi bị GỠ RA.** Lúc tick, `verify.py` vừa xanh 4/4 và
`evidence_check.py` báo UOW-07 sạch — nhưng ngay sau đó **đỏ 4 lần liên tiếp** với API còn sống.
Suite đang chập chờn (xem `07-verification.md`), nên một lần xanh không đủ làm căn cứ. Tick lại
khi nào chạy xanh lặp lại được.

Hai ô cuối:
- `run.json` ghi `commit_sha: null` còn HEAD là `15f866d2` — toàn bộ thay đổi đang **uncommitted**.
- Chưa có PR nào để dán contact sheet vào.
