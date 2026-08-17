---
id: UOW-04
slug: pos-split-preview
title: POS hiện khoản tách trước khi xác nhận và bỏ ô "Tính vào công nợ"
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-14, AC-15, AC-16]
risk: medium
status: todo
rollback: revert FE; endpoint mới không có client gọi cũng vô hại
---

# UOW-04 — Màn hình POS

Sau UOW-01 việc tách đã đúng ở BE nhưng thu ngân **không nhìn thấy** nó: màn hình vẫn
hiện một con số hoàn duy nhất, và ô "Tính vào công nợ" vẫn còn đó dù không còn tác dụng
đúng nghĩa. Lát này làm con số trên màn hình khớp với thứ sẽ xảy ra.

## Demo script

1. POS → Đổi trả hàng → chọn hoá đơn bán chịu còn nợ 465.000, trả toàn bộ hàng
2. Khối thanh toán hiện: **Trừ công nợ 465.000** và **Chi tiền mặt 300.000**, tổng đúng 765.000
3. Không còn ô tích "Tính vào công nợ" ở luồng hoàn tiền
4. Xác nhận → phiếu trả in ra và số dư công nợ khách giảm đúng 465.000
5. Lặp với hoá đơn đã thu đủ → **không** hiện dòng "Trừ công nợ", chi đủ 765.000
6. Mở một đơn ĐỔI có `netAmount > 0` → ô ghi nợ cũ vẫn còn nguyên (không bị gỡ nhầm)

## In scope

- Endpoint đọc dư nợ hoá đơn gốc + hook React Query
- Khối hiển thị tách tiền ở `PaymentSection`
- Gỡ `RefundToDebtRow` và mọi đường gửi `refundMethod = OFFSET`

## Not in scope

- In phiếu / mẫu hoá đơn (giữ nguyên, `refundedAmount` vẫn là tổng khoản hoàn)
- Màn hình backoffice

## Risks

| Risk | Mitigation |
|---|---|
| Gỡ nhầm ô ghi nợ của đơn đổi `net > 0` | Hai cờ khác nhau (`refundToDebt` vs `debt`), render ở hai nhánh khác nhau của `PaymentSection` — demo bước 6 kiểm chính điều này |
| Số xem trước lệch số thật do đua | Xem trước là tham khảo; BE tính lại dưới khoá. Ghi rõ trong error taxonomy |

## Definition of done

- [x] AC-14, AC-15, AC-16 pass
- [x] `npx vitest run` trong `apps/pos-web` xanh
- [x] `pnpm build` 3 app xanh
- [x] `pnpm openapi:generate` đã chạy, `schema.ts` cập nhật và commit
- [x] Không còn chuỗi "Tính vào công nợ" nào ở luồng hoàn tiền
- [ ] Demoed và accepted at gate G4

## Verification evidence

Chỉ UOW-04 mang khối này: ba UoW còn lại xác minh tiền, công nợ và bút toán — không có bề mặt
UI nào chụp được, nên chúng đóng bằng test + demo API (xem `07-verification.md` §Not verified
here). Vì vậy kiểm bằng `evidence_check.py --uow UOW-04`, không phải toàn feature.

- [x] `verify.py .ai/features/return-debt-refund-split --write` green trên `local-pos` (4/4 bước)
- [x] Evidence có cho AC-14, AC-15, AC-16 ở viewport desktop đã khai báo
- [x] `08-evidence.md` đã sinh lại, commit sha `6a527e7b` khớp HEAD
- [x] `evidence_check.py --uow UOW-04` exit 0

