---
id: UOW-04
slug: deposit-ledger-grid
title: Sổ tiền gửi tách Đối tượng khỏi Người, giữ nguyên cột Nhân viên
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-04]
verifies: [AC-12, AC-13]
risk: medium
status: todo
rollback: revert 2 ticket; không migration
---

# UOW-04 — Sổ tiền gửi tách Đối tượng khỏi Người

## Demo script

1. **Quỹ tiền > Sổ tiền gửi**, chọn tài khoản và kỳ, bấm **Lấy dữ liệu**.
2. Một dòng phiếu chi: cột **Đối tượng** = tên đối tác, cột **Người nộp/nhận** = tên người
   nhận, cột **Nhân viên** giữ nguyên giá trị cũ.
3. Một dòng phiếu **thu** chỉ có "Người nộp" → cột Đối tượng trống, cột Người có giá trị.
   Đây là điểm dễ sai nhất của màn này: `COALESCE` cũ trộn lẫn hai nhánh chứng từ **và**
   hai loại trường trong cùng một biểu thức 4 tầng.

## In scope

- `deposit-ledger.service.ts`: `DERIVED_COLUMNS` (`:119-125`), danh sách cột `SELECT`
  ngoài cùng (`:638`), hàng trả về (`:462`), bộ lọc `personName`.
- `deposit-ledger-search-v2.dto.ts`: 1 trường lọc + 1 trường hàng.
- FE: kiểu dòng nội tuyến và mảng cột trong `LedgerDepositPage.tsx`.

## Not in scope

- Đổi nhãn cột "Đối tượng" thành "Đối tượng nộp/nhận" ở màn này (ADR-05).
- Export Excel của sổ tiền gửi: `deposit-ledger.service.ts:529-535` vốn không có cột đối
  tượng nào, nên không có gì để thêm (A-05).

## Risks

| Risk | Mitigation |
|---|---|
| `COALESCE` 4 tầng trộn cả hai chiều; tách sai ra hai biểu thức 2 tầng lệch nhánh | T-04-01 viết rõ hai biểu thức đích; spec kiểm cả dòng phiếu thu lẫn dòng phiếu chi |

## Definition of done

- [ ] AC-12, AC-13 quan sát được trên sổ tiền gửi
- [x] `pnpm --filter @erp/api test -- --testPathPattern deposit-ledger` xanh
- [x] `pnpm --filter @erp/backoffice-web build` xanh
- [ ] Demoed và được chấp nhận ở G4

Mức dữ liệu đã xanh (spec đơn vị + e2e); ô còn lại đòi quan sát trên sổ tiền gửi.
