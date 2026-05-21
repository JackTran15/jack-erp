# TKT-CV-07 Permissions seed + COA seed (TK 711/811)

## Epic

[EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)](../epics/EPIC-18052026-cash-vouchers.md)

## Layer

🟦 Backend only.

## Summary

Seed permission keys cho toàn module cash-vouchers + bổ sung tài khoản kế toán TK 711 (Thu nhập khác) / TK 811 (Chi phí khác) vào COA seeder nếu thiếu (cash-count variance cần 2 TK này).

## Deliverables

- Permission seed:
  - `accounting.cash_receipt.{create,read,update,delete,post,reverse}`
  - `accounting.cash_payment.{create,read,update,delete,post,reverse}`
  - `accounting.cash_count.{create,read,update,post}`
  - `accounting.cash_ledger.read`
  - `accounting.cash_voucher_category.{create,read,update,delete}`
- Gán vào role mặc định (admin/accountant) theo convention seed hiện có.
- COA seeder bổ sung TK 711, TK 811 nếu org chưa có.

## Acceptance Criteria

- [x] Permission keys xuất hiện trong bảng permission sau seed; idempotent (chạy lại không nhân đôi).
- [x] Role admin/accountant có đủ permission để thao tác toàn module.
- [x] Thiếu permission cụ thể → guard trả 403 (verify với 1-2 key).
- [x] TK 711/811 tồn tại trong COA sau seed; cash-count variance resolve được contra account.

## Definition of Done

- [x] PR cập nhật permission seeder + COA seeder; pass build.
- [x] Chạy seed trên DB sạch → permission + TK đầy đủ.
- [x] Source tiếng Anh.

## Tech Approach

- Theo pattern permission seed hiện có trong repo (xem TKT-052 COA seed + IAM seed).
- COA: chỉ INSERT TK 711/811 khi `NOT EXISTS` cùng org/code.

## Dependencies

- Phụ thuộc: TKT-CV-02 (module), TKT-052 (COA & doc numbering seed pattern).
- Blocks: TKT-CV-06 (variance cần TK 711/811), TKT-CV-12.
