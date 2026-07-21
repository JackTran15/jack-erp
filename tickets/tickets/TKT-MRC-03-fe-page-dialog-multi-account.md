# TKT-MRC-03 FE — bỏ chặn nút "Đối chiếu" + dialog nhiều tài khoản

## Epic

[EPIC-21072026 Đối chiếu tiền gửi — nhiều tài khoản](../epics/EPIC-21072026-multi-account-deposit-reconcile.md)

## Summary

Sửa đúng bug người dùng báo: nút "Đối chiếu" xám khi filter "Số tài khoản" = Tất cả. Bỏ điều kiện `!accountId`, đổi state chọn dòng sang `Map<id, row>` để giữ được `depositAccountId`/`netAmount` của cả dòng ngoài trang hiện tại, và dựng lại `DepositReconBatchDialog` thành một khối nhập liệu cho mỗi tài khoản.

## Deliverables

- `apps/backoffice-web/src/pages/treasury/deposit-recon/DepositReconPage.tsx`
- `apps/backoffice-web/src/pages/treasury/deposit-recon/DepositReconBatchDialog.tsx`

## Acceptance Criteria

- [ ] Toolbar `reconcile`: `disabled = reconStatus !== ReconStatus.CHUA || selected.size === 0` — không còn phụ thuộc filter tài khoản.
- [ ] `selected` là `Map<string, DepositReconSearchRow>`; chọn ở trang 1 rồi sang trang 2 chọn thêm → summary "Đã chọn"/"Tổng đã chọn" và payload đều tính đủ cả 2 trang (trước đây `movementIds` gửi cả id ngoài trang nhưng tổng tiền chỉ cộng dòng đang hiển thị).
- [ ] `toggleAll` chỉ bỏ chọn các dòng của trang hiện tại khi đang chọn hết trang đó, không xóa lựa chọn ở trang khác.
- [ ] Dialog nhóm theo `depositAccountId`, nhãn lấy từ `depositAccountName`/`depositAccountNo` có sẵn trong row (không gọi thêm API).
- [ ] Mỗi khối: tổng thực nhận hệ thống, ô nhập tổng sao kê (mặc định = tổng hệ thống), chênh lệch, ghi chú **bắt buộc khi chênh lệch ≠ 0**.
- [ ] Nút "Xác nhận đối chiếu" chỉ bật khi mọi khối hợp lệ.
- [ ] Panel kết quả liệt kê từng tài khoản: trạng thái, số hệ thống / số sao kê / chênh lệch, cảnh báo `proposalId` nếu có.
- [ ] Chuỗi UI tiếng Việt, số tiền qua `formatMoneyInteger`.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Không đổi `packages/ui` (nằm ngoài scope epic).

## Tech Approach

```ts
// DepositReconPage — chọn dòng giữ nguyên cả row để nhóm được theo tài khoản
const [selected, setSelected] = useState<Map<string, DepositReconSearchRow>>(new Map());
const selectedRows = useMemo(() => Array.from(selected.values()), [selected]);

// DepositReconBatchDialog — group + state nhập liệu theo tài khoản
const groups = useMemo(() => {
  const byAccount = new Map<string, { accountId: string; label: string; rows: Row[]; systemTotal: number }>();
  for (const r of rows) { /* gom theo r.depositAccountId, cộng netAmount */ }
  return Array.from(byAccount.values());
}, [rows]);
const [inputs, setInputs] = useState<Record<string, { stmtTotalAmount: number | ""; note: string }>>({});
```

## Dependencies

- Depends on: TKT-MRC-02.
- Blocks: TKT-MRC-04 (phần kiểm thủ công).
