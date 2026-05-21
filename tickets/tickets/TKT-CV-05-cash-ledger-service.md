# TKT-CV-05 CashLedgerService + Controller

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only.

## Summary

Báo cáo read-only Sổ chi tiết tiền mặt: `GET /cash-ledger` với cursor-based pagination, opening/closing balance, running balance tính trong RAM (memory rule), voucher/partner JOIN inline per-row.

## Deliverables

- `CashLedgerService.getLedger(query, actor)` trả:
  - `openingBalance` — SQL `SUM(signed)` cho movements `date < dateFrom` (toàn range).
  - `pageOpeningBalance` = openingBalance + Δ (SUM signed của rows `[dateFrom, cursor)`).
  - `rows[]` — limit ~100 (`LIMIT :limit+1` để biết `nextCursor`); running balance tính trong RAM cộng dồn từ `pageOpeningBalance`.
  - `pageClosingBalance`, `nextCursor`.
  - `closingBalance` — SUM signed tới `dateTo`.
  - `totalDebit` / `totalCredit` — SQL `SUM` riêng cho cả range (không GROUP BY).
- `CashLedgerController` — `GET /cash-ledger` với filter: `cashAccountId`, `dateFrom`, `dateTo`, `branchId`, `cursor`, `limit`.
- Unit test `getLedger` (opening/running/closing/cursor).

## Acceptance Criteria

- [x] `openingBalance` + `rows` + `closingBalance` chính xác; running balance = cộng dồn debit−credit theo thứ tự `(movementDate, id)`.
- [x] Mỗi row có `voucherNumber`, `kind` (PT/PC/Khác), `description`, `partnerName` JOIN **inline** (không trả root `{[id]: X}` map — xem memory `feedback_inline_relations_over_root_map`).
- [x] Movement không có voucher (data cũ) → LEFT JOIN, `voucherNumber = '(Chưa có chứng từ)'`.
- [x] Signed convention TRANSFER: +DEPOSIT/+TRANSFER_IN, −WITHDRAWAL/−TRANSFER_OUT (verify schema EPIC-009 TRANSFER tạo 1 hay 2 row trước khi tính).
- [x] `totalDebit`/`totalCredit` = SQL `SUM` scalar (không window function, không GROUP BY — memory `feedback_prefer_in_memory_aggregation`).
- [x] Cursor pagination ổn định: trang kế tiếp không trùng/sót row.
- [x] Multi-tenant + branch scope đúng.
- [x] Permission `accounting.cash_ledger.read`.

## Definition of Done

- [x] Unit test pass (opening, running balance trên page, cursor, totals).
- [x] Source tiếng Anh.

## Tech Approach

- Chỉ aggregate scalar dùng SQL `SUM`; chi tiết per-row tính trong JS.
- Verify EPIC-009 schema `cash_movements` về cách TRANSFER lưu (1 row 2 account hay 2 row) trước khi viết signed expression — note rõ trong PR.

## Dependencies

- Phụ thuộc: TKT-CV-03, TKT-CV-04 (voucher rows để JOIN), EPIC-009 (`cash_movements`).
- Blocks: TKT-CV-12.
