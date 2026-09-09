---
id: UOW-02
slug: deposit-voucher-grid
title: Lưới Thu chi tiền gửi tách Đối tượng khỏi Người
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-02]
verifies: [AC-06, AC-07, AC-08]
risk: low
status: todo
rollback: revert 2 ticket; không migration
---

# UOW-02 — Lưới Thu chi tiền gửi tách Đối tượng khỏi Người

## Demo script

1. **Quỹ tiền > Thu chi tiền gửi**, kỳ có ít nhất một phiếu thu và một phiếu chi.
2. Một phiếu có cả hai trường → hai cột hiện hai giá trị khác nhau.
3. Một phiếu chỉ gõ "Người nộp" → cột **Đối tượng nộp/nhận** trống; lọc cột đó bằng chính
   tên người đó cho **0 dòng**.
4. Lặp lại bước 3 với một phiếu **chi** — hai nhánh của `UNION ALL` phải cùng hành xử.

## In scope

- `POST /v2/deposit-vouchers/search`: `counterparty` chỉ còn `partner_name_snapshot` ở cả
  hai nhánh UNION, thêm cột và bộ lọc `personName`.
- Lưới Thu chi tiền gửi: `receipt-deposit.types.ts`, `receipt-deposit.utils.ts`,
  `useReceiptDepositTableColumns.tsx`.

## Not in scope

- Xuất khẩu: màn này **không có** nút Xuất khẩu (A-05).
- Sổ tiền gửi (UOW-04) — khác nguồn dữ liệu hoàn toàn.

## Risks

| Risk | Mitigation |
|---|---|
| Sửa nhánh thu, quên nhánh chi | AC-07 kiểm cả hai chiều trong cùng một kịch bản |

## Definition of done

- [ ] AC-06, AC-07 quan sát được trên lưới (cả nhánh thu lẫn nhánh chi)
- [x] AC-08: lọc cột Đối tượng bằng tên người cho 0 dòng
- [x] `pnpm --filter @erp/api test -- --testPathPattern deposit-voucher` xanh
- [x] `pnpm --filter @erp/backoffice-web build` xanh
- [ ] Demoed và được chấp nhận ở G4

AC-08 chứng minh bằng e2e `voucher-party-person-columns` (deposit voucher list: lọc cột
Đối tượng bằng tên người ⇒ 0 dòng, kèm đối chứng dương). Hai ô còn lại cần trình duyệt.
