---
id: UOW-01
slug: cash-voucher-grid
title: Lưới Thu chi tiền mặt tách Đối tượng khỏi Người, lọc và xuất khẩu độc lập
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-05]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-14]
risk: low
status: todo
rollback: revert 3 ticket; không có migration, không có dữ liệu nào bị đổi
---

# UOW-01 — Lưới Thu chi tiền mặt tách Đối tượng khỏi Người

## Demo script

1. Đăng nhập backoffice, vào **Quỹ tiền > Thu chi tiền mặt**, kỳ chứa PC000040.
2. Chỉ vào dòng PC000040: cột **Đối tượng nộp/nhận** = `kkkk`, cột **Người nộp/nhận** =
   `123123` — trước khi sửa, cột đối tượng hiện `123123` còn `kkkk` không xuất hiện ở đâu.
3. Gõ `kkkk` vào ô lọc cột **Người nộp/nhận** → **0 dòng**. Gõ `kkkk` vào ô lọc cột
   **Đối tượng nộp/nhận** → PC000040 quay lại. Hai cột lọc độc lập, không cột nào mượn
   giá trị của cột kia.
4. Bấm **Xuất khẩu** → mở file `.xlsx`: hai cột liền kề, đúng thứ tự và đúng giá trị lưới.

## In scope

- `POST /v2/cash-vouchers/search`: cột `counterparty` chỉ còn `partner_name_snapshot`,
  thêm cột `personName` (`payer_name` / `payee_name`), thêm bộ lọc `personName`.
- `POST /v2/cash-vouchers/export`: thêm cột vào `EXPORT_COLUMNS`.
- Lưới Thu chi tiền mặt: kiểu FE, adapter, hook cột.

## Not in scope

- Ba lưới còn lại (UOW-02, UOW-03, UOW-04).
- Sinh lại api-client (UOW-05) — lưới này gọi qua `apiClient` axios với kiểu FE viết tay,
  nên nó chạy được trước khi client được sinh lại.

## Risks

| Risk | Mitigation |
|---|---|
| UNION ALL lệch cột giữa hai nhánh | `search-cash-vouchers-v2.handler.spec.ts` phải khẳng định **thứ tự** cột, không chỉ sự tồn tại |
| Người dùng tưởng ô trống là mất dữ liệu (A-07) | Nêu trong ghi chú bàn giao; AC-03 khẳng định ô trống là đúng |

## Definition of done

- [ ] AC-01..AC-03 quan sát được trên lưới (đối tượng / người / cả hai / không cái nào)
- [x] AC-04, AC-05: lọc chéo hai cột đều cho 0 dòng
- [ ] AC-14: file .xlsx tải về **mở được**, hai cột liền kề đúng giá trị
- [x] `pnpm --filter @erp/api test -- --testPathPattern cash-voucher` xanh
- [x] `pnpm --filter @erp/backoffice-web build` xanh
- [ ] Demoed và được chấp nhận ở G4

Đã chạy (2026-09-09): unit 26 suite/355 test xanh cho `cash-voucher|deposit-voucher`;
e2e `cash-voucher-list-export` **4/4 xanh** (suite báo đỏ vì đua outbox lúc teardown — bẫy đã biết);
e2e `voucher-party-person-columns` 12/12 xanh. Ba ô còn lại cần người mở trình duyệt.
