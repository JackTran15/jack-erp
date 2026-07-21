# TKT-DEP-04 FE — Thu-chi & Đối chiếu bỏ gate chọn quỹ

## Epic

[EPIC-19072026 Deposit Screens — Branch Scope & MISA Parity](../epics/EPIC-19072026-deposit-screens-branch-scope.md)

## Summary

Hai màn "Thu, chi tiền gửi" và "Đối chiếu tiền gửi" đang chặn tải dữ liệu cho đến khi chọn một quỹ, dù **backend đã hỗ trợ sẵn** bỏ trống `depositAccountId`. Ticket này gỡ gate, đặt mặc định `Tất cả`, và bổ sung cột `Số tài khoản` cho màn Thu-chi (màn Đối chiếu đã có cột này). **Thuần frontend, không đụng backend.**

## Deliverables

- `pages/treasury/deposit/receipts-expenses/TreasuryDepositReceiptsPage.tsx`
  - bỏ auto-default `effectiveAccountId` (~:101) và gate `enabled` (~:135)
  - dropdown thêm mục `Tất cả`, mặc định rỗng = Tất cả
- `pages/treasury/deposit/receipts-expenses/useReceiptDepositTableColumns.tsx` — thêm cột `Số tài khoản`
- `pages/treasury/deposit/receipts-expenses/receipt-deposit.types.ts` + `receipt-deposit.utils.ts` — bổ sung `accountNo` / `accountName` vào row đã map (hiện chỉ có `depositAccountId`)
- `pages/treasury/deposit-recon/DepositReconPage.tsx` — bỏ effect auto-default (~:84-89) và gate `Boolean(accountId)` (~:122); dropdown thêm `Tất cả`

## Acceptance Criteria

- [ ] Mở mỗi trang → dữ liệu của **toàn bộ** quỹ trong chi nhánh hiện ngay, không cần thao tác.
- [ ] Dropdown `Tài khoản tiền gửi` (Thu-chi) / `Số tài khoản` (Đối chiếu) có mục `Tất cả` đứng đầu và là mặc định.
- [ ] Chọn một quỹ cụ thể → lọc đúng quỹ đó; chọn lại `Tất cả` → quay về toàn bộ.
- [ ] Màn Thu-chi có cột `Số tài khoản`, hiển thị dạng `Tên (Số TK)` giống cột sẵn có ở màn Đối chiếu.
- [ ] Đổi chi nhánh ở header → danh sách quỹ và dữ liệu load lại đúng chi nhánh mới; lựa chọn quỹ cũ không "dính" sang chi nhánh mới.
- [ ] Chi nhánh chưa có quỹ nào → empty state rõ ràng, không spinner treo, không gọi API lỗi.
- [ ] Query key đã chứa filter quỹ nên đổi lựa chọn là refetch đúng; không phải sửa key.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Không có `depositAccountId` bắt buộc còn sót trong 2 trang này.
- [ ] Chuỗi hiển thị tiếng Việt; format số/ngày qua `Intl` locale `vi-VN`.
- [ ] Không đụng file backend nào.

## Tech Approach

### Gỡ gate

Hiện tại (Thu-chi):

```ts
const effectiveAccountId = depositAccountId || accounts.find(a => a.isDefault)?.id || accounts[0]?.id || "";
const enabled = Boolean(effectiveAccountId);
```

Thành:

```ts
// "" = Tất cả quỹ của chi nhánh — BE bỏ qua filter khi param vắng mặt.
const enabled = true;
const query = { depositAccountId: depositAccountId || undefined, /* ... */ };
```

Màn Đối chiếu tương tự: xoá effect auto-default `:84-89`, đổi `useDepositReconList(query, Boolean(accountId))` → `useDepositReconList(query)` (hoặc truyền `true`).

`|| undefined` đã có sẵn ở cả hai chỗ dựng query nên param tự biến mất khỏi URL khi chọn Tất cả — không cần sửa tầng service.

### Cột Số tài khoản (Thu-chi)

Row hiện đã mang `depositAccountId` nhưng chưa có số tài khoản. Hai cách:

1. Nếu response `/bank-receipts` + `/bank-payments` đã kèm thông tin quỹ → map thẳng vào row trong `receipt-deposit.utils.ts`.
2. Nếu chưa → tra tại chỗ bằng `useDepositAccounts` rồi inline vào từng row (**không** trả map `{[id]: X}` ở root, theo convention repo).

Kiểm tra response thực tế trước khi chọn; ưu tiên (1) để tránh phụ thuộc thứ tự load.

### Reset khi đổi chi nhánh

`useDepositAccounts` nhận `branchId` nên tự refetch. Cần thêm effect reset lựa chọn quỹ về `""` khi `branchId` đổi, nếu không id quỹ của chi nhánh cũ sẽ được gửi lên và trả rỗng.

## Testing Strategy

- Thủ công trên chi nhánh Hồ Chí Minh (2 quỹ): Tất cả → thấy giao dịch cả 2 quỹ; chọn từng quỹ → lọc đúng.
- Thủ công trên chi nhánh Hà Nội (0 quỹ): empty state, không lỗi.
- Đổi chi nhánh qua lại, xác nhận không dính lựa chọn cũ.
- E2E gộp ở [TKT-DEP-07](./TKT-DEP-07-e2e-test-plan.md).

## Dependencies

- Depends on: [TKT-DEP-03](./TKT-DEP-03-fe-deposit-tabbar.md) (tránh sửa chồng cùng file trang)
- Blocks: [TKT-DEP-07](./TKT-DEP-07-e2e-test-plan.md)
