# TKT-DFR-08 FE — Đối chiếu tiền gửi + Khóa sổ + số dư sổ sách/khả dụng

## Epic

[EPIC-15072026 Deposit Fund — Reconcile & Lock](../epics/EPIC-15072026-deposit-fund-reconcile-lock.md)

## Summary

Backoffice-web GĐ3: trang **Đối chiếu tiền gửi** (grid multi-select checkbox — clone pattern `DebtCollectionPickDialog`; cột bổ sung theo FR-09; lọc `Số tài khoản`/trạng thái; đối chiếu hàng loạt + hủy đối chiếu + xuất Excel), trang **Khóa sổ tiền gửi** (khóa/mở kỳ + xem snapshot), và hiển thị **Số dư sổ sách / Số dư khả dụng** (R2) trên màn số dư/sổ. Thay 3 link `/treasury/wip/*` placeholder bằng route thật. Chuỗi UI tiếng Việt; số/ngày format `Intl` locale `vi-VN`.

## Deliverables

- `apps/backoffice-web/src/pages/treasury/deposit-recon/DepositReconPage.tsx` — grid đối chiếu.
- `apps/backoffice-web/src/pages/treasury/deposit-recon/DepositReconBatchDialog.tsx` — nhập tổng sao kê + hiện chênh lệch + ghi chú lệch.
- `apps/backoffice-web/src/pages/treasury/deposit-period-lock/DepositPeriodLockPage.tsx` — khóa/mở kỳ + bảng snapshot số dư cuối kỳ.
- `apps/backoffice-web/src/hooks/treasury/use-deposit-recon.ts`, `use-deposit-period-lock.ts`, `use-deposit-balance.ts` — TanStack Query (queryKey theo prefix resource + filter).
- `apps/backoffice-web/src/hooks/treasury/treasury-query-keys.ts` — bổ sung key `deposit-recon`, `deposit-period-lock`, `deposit-balance`.
- Sửa `apps/backoffice-web/src/App.tsx` — route `/treasury/deposit-reconciliation` (DepositReconPage), `/treasury/deposit-period-lock` (DepositPeriodLockPage); bỏ mapping `/treasury/wip/deposit-reconciliation`.
- Sửa `apps/backoffice-web/src/components/layout/navConfig.ts` — section `treasury-deposit`: thay 3 link WIP → link thật (Đối chiếu, Khóa sổ; + số dư nằm trong sổ chi tiết GĐ1).

## Acceptance Criteria

- [ ] Grid đối chiếu: checkbox-per-row + toggle-all + tổng đã chọn (clone `DebtCollectionPickDialog`); mặc định trạng thái `Chưa đối chiếu`; filter **Số tài khoản** (dropdown deposit account), Trạng thái, Khoảng ngày, Số chứng từ, Loại giao dịch, Loại thẻ.
- [ ] Cột hiển thị FR-09: Số chứng từ, Loại giao dịch, Loại thẻ, **Số tài khoản** (không còn trống — vá §13), Ngày, Giờ, **Ngày ghi có**, **Số tiền thực nhận**, **Phí**, **Mã tham chiếu NH**, Số tiền, **Người/Ngày đối chiếu**, **Ghi chú lệch**, Trạng thái; dòng tổng `Số dòng` + `Tổng số tiền`.
- [ ] Đối chiếu hàng loạt: chọn dòng → dialog nhập tổng sao kê → hiện `diff`; khớp → xác nhận `DA`; lệch → **bắt buộc nhập ghi chú** trước khi gửi (BR-REC-02); hiển thị đề xuất bút toán phí (proposal) khi lệch (BR-REC-03), không hiện "đã giảm quỹ".
- [ ] Hủy đối chiếu: chỉ hiện nút cho user có quyền `accounting.deposit_recon.unreconcile`; bắt buộc nhập lý do; dòng đã đối chiếu hiển thị khóa (BR-REC-01).
- [ ] Xuất Excel theo filter hiện tại.
- [ ] Khóa sổ: chọn chi nhánh + kỳ (YYYY-MM) → khóa; hiện bảng snapshot số dư cuối kỳ/tài khoản; nút mở kỳ (reason bắt buộc) chỉ cho `accounting.deposit_period.unlock`; cảnh báo khi còn `CHUA` quá N ngày (BR-REC-04).
- [ ] Màn số dư/sổ hiện **cả** `Số dư sổ sách` và `Số dư khả dụng` (R2); tooltip giải thích chênh lệch (tiền đang về T+n).
- [ ] Data fetch qua `erpApi` + `requireErpData`/`requireErpSuccess`; TanStack Query invalidate theo prefix sau reconcile/lock; auth + `X-Branch-Id` auto-inject.
- [ ] Không thấy dữ liệu chi nhánh khác (server-scoped; FE truyền `X-Branch-Id` — UAT-13).
- [ ] Chuỗi UI tiếng Việt; số/ngày `Intl` `vi-VN`; primitives từ `@erp/ui`, icon `lucide-react`; named exports; `interface Props` tách rời.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh (typecheck qua generated client DFR-07).
- [ ] Nav + route mount; 3 link WIP không còn.
- [ ] Verify hình: grid multi-select, dialog đối chiếu lệch (ghi chú bắt buộc), bảng snapshot khóa sổ, 2 số dư.
- [ ] Server data ở TanStack Query (không Zustand).
- [ ] Không hard-code màu (dùng semantic tokens); reuse `@erp/ui`.

## Tech Approach

Grid clone `apps/backoffice-web/src/pages/treasury/documents/receipt-voucher-dialog/DebtCollectionPickDialog.tsx` (checkbox state Set<id>, toggleAll, selected-sum). Shell theo `pages/treasury/cash/*` + `hooks/treasury/*` (`use-cash-ledger.ts`, `use-cash-receipts.ts`, `treasury-query-keys.ts`).

```tsx
export function DepositReconPage() {
  const [filters, setFilters] = useState<ReconFilters>({ reconStatus: 'CHUA' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data } = useDepositRecon(filters); // TanStack Query ['deposit-recon', filters]
  const reconcile = useReconcile();          // POST /deposit-recon/reconcile → invalidate ['deposit-recon']
  // ... checkbox column + toggleAll + selectedSum; dialog nhập stmtTotal → diff → note bắt buộc nếu lệch
}
```

```ts
// use-deposit-recon.ts
export function useDepositRecon(filters: ReconFilters) {
  return useQuery({
    queryKey: treasuryKeys.depositRecon(filters),
    queryFn: () => requireErpData(erpApi.GET('/deposit-recon', { params: { query: filters } })),
  });
}
```

Route/nav: `App.tsx` thêm `<Route path="/treasury/deposit-reconciliation" element={<DepositReconPage/>}/>` + `/treasury/deposit-period-lock`; `navConfig.ts` section `treasury-deposit` (đang là 3 WIP link) → link thật.

## Testing Strategy

- Build + typecheck qua generated client (`@erp/api-client`).
- Verify visual (screenshot): grid multi-select + tổng chọn, dialog đối chiếu lệch bắt buộc ghi chú, bảng snapshot khóa sổ, 2 con số số dư. (Repo web app `test` chỉ echo — không có unit test FE.)

## Dependencies

- Depends on: TKT-DFR-07 (typed client). Consume mọi endpoint DFR-02/04/06.
- Blocks: TKT-DFR-09 (E2E chạy sau khi FE + BE khớp contract).
