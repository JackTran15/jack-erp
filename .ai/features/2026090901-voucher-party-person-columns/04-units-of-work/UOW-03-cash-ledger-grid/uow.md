---
id: UOW-03
slug: cash-ledger-grid
title: Sổ quỹ tiền mặt tách Đối tượng khỏi Người, giữ nguyên cột nhân viên
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-03]
verifies: [AC-09, AC-10, AC-11]
risk: medium
status: todo
rollback: revert 2 ticket; không migration
---

# UOW-03 — Sổ quỹ tiền mặt tách Đối tượng khỏi Người

## Demo script

1. **Quỹ tiền > Sổ quỹ tiền mặt**, chọn quỹ và kỳ chứa PC000040, bấm **Lấy dữ liệu**.
2. Dòng PC000040: **Đối tượng nộp/nhận** = `kkkk`, **Người nộp/nhận** = `123123`, và
   **Đối tượng thu/chi** vẫn = tên nhân viên (`002 Nguyễn Nhựt Hào`) — ba cột, ba nguồn.
3. Một phiếu chỉ có "Người nộp": cột Đối tượng trống (trước khi sửa, màn này ưu tiên đối
   tượng nên đã hiện đúng — điểm cần chứng minh là **cột Người** giờ có giá trị riêng).
4. Lọc cột **Đối tượng nộp/nhận** bằng tên người đó → 0 dòng.

## In scope

- `cash-ledger.service.ts`: `DERIVED_COLUMNS`, danh sách cột `SELECT` ngoài cùng
  (`:559`), kiểu `RawRow`, hàng trả về (`:442`), bộ lọc `personName`.
- `cash-ledger-search-v2.dto.ts`: 1 trường lọc + 1 trường hàng.
- FE: `LedgerCashRow`, **cả hai** adapter sinh ra nó, `useLedgerCashTableColumns.tsx`.

## Not in scope

- Cột "Đối tượng thu/chi" (nhân viên) — giữ nguyên, và AC-09 khẳng định nó không đổi.
- Nút "Xuất khẩu" của màn này: hiện là stub `toast.info` (`LedgerCashPage.tsx:251`), không
  có file nào để sửa (A-05).

## Risks

| Risk | Mitigation |
|---|---|
| Sửa `DERIVED_COLUMNS` mà quên danh sách `SELECT` ngoài cùng → cột luôn `undefined`, lưới trống lặng lẽ | Ghi rõ hai vị trí trong T-03-01; spec khẳng định giá trị đọc được, không chỉ SQL sinh ra |
| `LedgerCashRow` có hai adapter; sửa một cái, cái kia im lặng trả `undefined` | T-03-02 liệt kê cả hai; `tsc` bắt được vì trường mới là bắt buộc |

## Definition of done

- [ ] AC-09: ba cột đối tượng / người / nhân viên hiện ba giá trị riêng
- [ ] AC-10, AC-11 quan sát được trên sổ
- [x] `pnpm --filter @erp/api test -- --testPathPattern cash-ledger` xanh
- [x] `pnpm --filter @erp/backoffice-web build` xanh
- [ ] Demoed và được chấp nhận ở G4

AC-11 đã có e2e xanh; AC-09/AC-10 mức dữ liệu có spec đơn vị, nhưng ô ở đây đòi **quan sát
trên sổ** nên để cho người ký G4.
