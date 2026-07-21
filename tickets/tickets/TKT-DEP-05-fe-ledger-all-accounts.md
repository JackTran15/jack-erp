# TKT-DEP-05 FE — Sổ chi tiết chế độ Tất cả

## Epic

[EPIC-19072026 Deposit Screens — Branch Scope & MISA Parity](../epics/EPIC-19072026-deposit-screens-branch-scope.md)

## Summary

Nối FE "Sổ chi tiết tiền gửi" vào khả năng nhiều quỹ mà [TKT-DEP-01](./TKT-DEP-01-deposit-ledger-branch-scope.md) mở ra: bỏ gate `canQuery`, thêm mục `Tất cả` làm mặc định, và hiển thị số dư gộp cả chi nhánh. Cột `Số tài khoản` đã có sẵn nên không phải thêm.

## Deliverables

- `apps/backoffice-web/src/hooks/treasury/use-deposit-ledger.ts` — bỏ `depositAccountId` khỏi điều kiện `canQuery` (~:21-24); chỉ còn yêu cầu `dateFrom` + `dateTo`. Bỏ `depositAccountId!` non-null assertion (~:30).
- `apps/backoffice-web/src/pages/treasury/deposit/LedgerDepositPage.tsx`
  - bỏ effect auto-default quỹ (~:115-120)
  - dropdown thêm `Tất cả`, mặc định
  - bỏ chặn export `"Vui lòng chọn tài khoản tiền gửi."` (~:219)
  - nhãn dòng `Số dư đầu kỳ` phản ánh phạm vi đang xem

## Acceptance Criteria

- [ ] Mở trang → thấy ngay sổ của **toàn bộ** quỹ trong chi nhánh, không cần chọn quỹ.
- [ ] Dropdown có `Tất cả` đứng đầu, là mặc định; chọn một quỹ → về đúng hành vi cũ.
- [ ] Chế độ Tất cả: `Số dư đầu kỳ` là **một dòng duy nhất** (tổng các quỹ), cột `Còn lại` là **một cột liền mạch** — không nhóm theo quỹ.
- [ ] Chuyển quỹ nội bộ hiện **2 dòng** (chi ở quỹ nguồn, thu ở quỹ đích) và không làm đổi `Số dư cuối kỳ`.
- [ ] Cột `Số tài khoản` có giá trị đúng trên **mọi** dòng ở chế độ Tất cả.
- [ ] `Xuất khẩu` hoạt động ở cả hai chế độ; file xuất khớp đúng bộ lọc đang áp.
- [ ] Phân trang: `Còn lại` dòng đầu trang sau nối tiếp dòng cuối trang trước.
- [ ] Chi nhánh chưa có quỹ → empty state, `Số dư đầu kỳ` = 0, không lỗi.
- [ ] Ba ô tổng kết chân trang (`Số dư sổ sách` = `bookBalance`, `Số dư khả dụng` = `availableBalance`) hiển thị đúng cho phạm vi nhiều quỹ — **đã xác nhận ở TKT-DEP-01**: BE gộp bằng cách cộng `getBalances()` của từng quỹ trong phạm vi, nên hiện thẳng như bình thường, không cần ẩn.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Format tiền qua `Intl` locale `vi-VN`.
- [ ] Không còn non-null assertion `depositAccountId!`.
- [ ] Đã chạy [TKT-DEP-02](./TKT-DEP-02-openapi-snapshot.md) trước khi wire.

## Tech Approach

### Hook

```ts
// Trước
const canQuery = Boolean(params.depositAccountId) && Boolean(params.dateFrom) && Boolean(params.dateTo);

// Sau — quỹ là tuỳ chọn; "" = mọi quỹ ACTIVE của chi nhánh
const canQuery = Boolean(params.dateFrom) && Boolean(params.dateTo);
```

Query key đã trải `{...params}` nên `depositAccountId: undefined` vẫn tạo key khác với một id cụ thể → cache tách đúng, không phải sửa key.

### Đã xác nhận ở TKT-DEP-01

`DepositLedgerService.getScopedBalances()` gọi `DepositBalanceService.getBalances()` **cho từng quỹ** trong phạm vi rồi cộng dồn `bookBalance`/`availableBalance`/`pendingClearingAmount` — không cần sửa `DepositBalanceService`. Một chuyển quỹ nội bộ đóng góp `−amount` vào quỹ nguồn và `+amount` vào quỹ đích nên tự triệt tiêu khi cộng, giống hệt cách `closingBalance` đã tự đúng ở service. Ba ô chân trang dùng thẳng `bookBalance`/`availableBalance` response trả về, không cần logic riêng ở FE.

### Nhãn số dư đầu kỳ

Chế độ Tất cả nên ghi rõ đang cộng gộp, ví dụ `Số dư đầu kỳ (tất cả tài khoản)`, để kế toán không nhầm là số dư của một quỹ.

## Testing Strategy

- Thủ công chi nhánh Hồ Chí Minh (Lam Hoang An 199118899 + SHB 123123123):
  - Tất cả → đủ giao dịch cả 2 quỹ, `Số dư cuối kỳ` == tổng `balance` 2 quỹ;
  - tạo 1 chuyển quỹ nội bộ → 2 dòng, số dư cuối kỳ không đổi;
  - chọn từng quỹ → khớp số liệu trước khi có epic này;
  - phân trang với `pageSize` nhỏ → kiểm `Còn lại` bắc cầu;
  - xuất khẩu ở cả 2 chế độ.
- E2E gộp ở [TKT-DEP-07](./TKT-DEP-07-e2e-test-plan.md).

## Dependencies

- Depends on: [TKT-DEP-01](./TKT-DEP-01-deposit-ledger-branch-scope.md), [TKT-DEP-02](./TKT-DEP-02-openapi-snapshot.md), [TKT-DEP-03](./TKT-DEP-03-fe-deposit-tabbar.md)
- Blocks: [TKT-DEP-07](./TKT-DEP-07-e2e-test-plan.md)
