---
id: UOW-03
slug: fix-sibling-affected-count
title: Sửa chỗ thứ hai dính bẫy [rows, rowCount] — setBalanceTracking trả sai số dòng
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-11]
risk: low
status: todo
rollback: revert 1 commit; không migration, không đổi hợp đồng HTTP
---

# UOW-03 — `setBalanceTracking` báo đúng số dòng đã cập nhật

## Demo script

1. Mở màn quản lý theo dõi tồn ở backoffice, chọn **5** vị trí đang không theo dõi.
2. Bấm lưu. Trước khi sửa: phản hồi API trả `updated: 2` — con số vô nghĩa, đúng bằng
   độ dài của `[rows, rowCount]`.
3. Sau khi sửa: phản hồi trả `updated: 5`.
4. Chọn 1 vị trí duy nhất, lưu → `updated: 1`. Chọn một vị trí đã ở đúng trạng thái
   (mệnh đề `sb.is_tracked <> $4` không khớp) → `updated: 0`, không còn ra 2.

## In scope

- `StockLedgerService.setBalanceTracking` (`stock-ledger.service.ts:703-714`) dùng
  `affectedRowCount` của T-01-01 thay cho `rows.length`.
- Rà nốt `apps/api/src` để chắc không còn chỗ thứ ba.

## Not in scope

- `stock-ledger.service.ts:937` — đó là `INSERT … ON CONFLICT … RETURNING`, lệnh INSERT
  rơi vào nhánh `default:` của TypeORM nên vốn đã trả đúng mảng dòng (A-11). Không sửa
  thứ đang chạy đúng.
- Đổi hợp đồng phản hồi của API: vẫn là `{ updated: number }`, chỉ là số cho đúng.

## Risks

| Risk | Mitigation |
| --- | --- |
| Có nơi đang phụ thuộc vào con số sai `2` | Rà nơi gọi trước khi sửa; `updated` chỉ dùng để hiển thị, không dùng để rẽ nhánh |
| Còn chỗ thứ ba chưa tìm ra | Rà toàn `apps/api/src` theo cặp `RETURNING` + `.length`, ghi kết quả rà vào PR |

## Definition of done

- [x] AC-11 đậu
- [x] Đã rà toàn `apps/api/src`, kết quả rà ghi trong PR (kể cả khi không tìm thêm được gì)
- [x] `pnpm --filter @erp/api test` xanh
- [ ] Demoed và được chấp nhận ở G4

## Verification (2026-09-04)

- AC-11: `stock-ledger.service.spec.ts` — 32/32 passed, including the RED/GREEN
  revert check in T-02-01's "Kết quả chạy" proving the test actually catches the
  `[rows, rowCount]` misread.
- Independently re-ran the `apps/api/src` audit for `RETURNING` + `.length`
  misreads (not just re-reading T-03-01's table): same result — one documented
  exception in a completed migration (`1789000000000`, log-line only, `down()`
  doesn't depend on it), no new spot found.
- `pnpm --filter @erp/api test` → green for every file this UoW touches; the
  only suite-level failure in a full run is the pre-existing, unrelated
  `auth.service.spec.ts` TTL test (confirmed failing on clean `main` too).
