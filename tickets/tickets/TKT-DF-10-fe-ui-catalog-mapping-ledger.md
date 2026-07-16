# TKT-DF-10 FE UI — catalog + payment policy + Sổ chi tiết tiền gửi (replace 3 WIP placeholders)

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Nền tảng](../epics/EPIC-15072026-deposit-fund-foundation.md)

## Summary

Thay 3 placeholder `/treasury/wip/deposit-*` trong section nav `treasury-deposit` bằng 3 màn hình thật của GĐ1:
(1) danh mục **Tài khoản tiền gửi**, (2) **Chính sách thanh toán tiền gửi** (phí / ngày ghi có / hiệu lực + tùy chọn override quỹ khi COA nhập nhằng — **KHÔNG** map phương thức→tài khoản, đó vẫn là màn `payment_accounts` hiện có), (3) **Sổ chi tiết tiền gửi**. Catalog
và payment policy dùng generic `/admin/:entityKey` `CrudListPage` (đã có sẵn từ đăng ký CRUD ở DF-03) nơi phù hợp; Sổ chi
tiết clone `LedgerCashPage`. Thêm route trong `App.tsx` + nav thật trong `navConfig.ts`. Mọi string tiếng Việt. Reuse
toàn bộ pattern UI tiền mặt (NFR-08 — người dùng không học lại).

## Deliverables

- `apps/backoffice-web/src/pages/treasury/deposit/LedgerDepositPage.tsx` — clone `pages/treasury/ledger-cash/LedgerCashPage.tsx`, dùng `useDepositLedger` (DF-09); dòng `Số dư đầu kỳ` + running balance + tổng cuối; export Excel.
- Catalog + payment policy: reuse `/admin/:entityKey` `CrudListPage` (route `/admin/deposit_accounts`, `/admin/deposit_payment_policy`) **hoặc** wrapper page mỏng `pages/treasury/deposit/DepositAccountsPage.tsx` / `DepositPaymentPolicyPage.tsx` nếu cần layout treasury; ưu tiên `CrudListPage` để đỡ code.
- `apps/backoffice-web/src/App.tsx` — thêm route: `/treasury/deposit/ledger` → `LedgerDepositPage`; `/treasury/deposit/accounts` + `/treasury/deposit/payment-policy` (hoặc trỏ thẳng `/admin/deposit_accounts` + `/admin/deposit_payment_policy`).
- `apps/backoffice-web/src/components/layout/navConfig.ts` — section `treasury-deposit` (L185-199): thay 3 link WIP `deposit-*` bằng 3 entry thật.

## Acceptance Criteria

- [ ] Nav `treasury-deposit` không còn link `/treasury/wip/deposit-*`; thay bằng: **Tài khoản tiền gửi**, **Chính sách thanh toán tiền gửi**, **Sổ chi tiết tiền gửi** (mỗi cái có `<Route>` trong `App.tsx` + `NavChild` trong `navConfig.ts` — cả hai bắt buộc theo convention).
- [ ] **Tài khoản tiền gửi**: list + create/update với field FR-01 (Mã, Số TK, Tên chủ TK, Ngân hàng [dropdown `useBanks`], Loại `BANK_ACCOUNT/EWALLET/POS_MERCHANT`, MID/TID, Số dư đầu kỳ, Ngày bắt đầu, Cho phép số dư âm, Mặc định, Trạng thái). Không cho xóa TK đã có giao dịch (BR-ACC-01 → chỉ INACTIVE) — hiển thị lỗi BE rõ ràng.
- [ ] **Chính sách thanh toán tiền gửi**: list + create/update field FR-02 của `deposit_payment_policy` (Phương thức, Loại thẻ [GĐ1 để trống], **TK tiền gửi override** [chỉ dùng khi 1 COA ↔ nhiều quỹ], Tỷ lệ phí, Bên chịu phí, Số ngày ghi có, Hiệu lực từ/đến). **Không** có trường "Quỹ đích/Phương thức→Tài khoản" — định tuyến quỹ suy ra từ COA, còn map phương thức→COA nằm ở màn `payment_accounts` hiện có.
- [ ] **Sổ chi tiết tiền gửi**: chọn tài khoản + khoảng ngày → hiển thị dòng `Số dư đầu kỳ`, các dòng phát sinh với `Số tiền còn lại` (running), cột `Số phiếu thu`/`Số phiếu chi`/`Số tài khoản`/`Diễn giải`/`Thu`/`Chi`/`Đối tượng`/`Nhân viên`, dòng tổng cuối, nút Xuất Excel.
- [ ] **ref.md §6.10**: chân trang "X trên Y kết quả" dùng `total` từ API (đã loại dòng đầu kỳ) — không đếm nhầm dòng `Số dư đầu kỳ` thành record. Dòng đầu kỳ render tách khỏi bộ đếm phân trang.
- [ ] Dữ liệu scope theo chi nhánh đang chọn (`X-Branch-Id`); đổi chi nhánh → refetch (UAT-13).
- [ ] Import primitive từ `@erp/ui`, icon từ `lucide-react`, `cn()` + semantic Tailwind token; named export; `interface Props` tách rời (React convention repo).
- [ ] Mọi nhãn tiếng Việt; format số/ngày `Intl` `vi-VN` (NFR-07).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` + `lint` xanh.
- [ ] Screenshot 3 màn (catalog list, payment policy form, ledger có opening + running) — verify visual.
- [ ] Không còn route/nav `/treasury/wip/deposit-*`.
- [ ] Server data trong TanStack Query, không Zustand.
- [ ] Không có TODO/FIXME ngoài kế hoạch.

## Tech Approach

`navConfig.ts` L185-199 hiện tại:

```ts
{ id: "treasury-deposit", label: "TIỀN GỬI", children: [
  { to: "/treasury/wip/deposit-receipts-expenses", label: "Thu, chi tiền gửi" },   // → GĐ2 (DFS), tạm bỏ khỏi GĐ1
  { to: "/treasury/wip/deposit-reconciliation", label: "Đối chiếu tiền gửi" },      // → GĐ3 (DFR), tạm bỏ khỏi GĐ1
  { to: "/treasury/wip/deposit-ledger", label: "Sổ chi tiết tiền gửi" },
]}
```

thay bằng (GĐ1):

```ts
{ id: "treasury-deposit", label: "TIỀN GỬI", children: [
  { to: "/treasury/deposit/accounts", label: "Tài khoản tiền gửi" },
  { to: "/treasury/deposit/payment-policy", label: "Chính sách thanh toán tiền gửi" },
  { to: "/treasury/deposit/ledger", label: "Sổ chi tiết tiền gửi" },
]}
```

> **Note**: "Thu, chi tiền gửi" (GĐ2/DFS) và "Đối chiếu tiền gửi" (GĐ3/DFR) sẽ được các epic sau tự thêm lại nav
> entry của mình. GĐ1 chỉ populate 3 màn nền tảng.

`App.tsx` thêm import `LedgerDepositPage` + `<Route path="/treasury/deposit/ledger" element={<LedgerDepositPage />} />`.
Nếu catalog/payment policy trỏ thẳng `/admin/deposit_accounts` (generic CRUD route đã có), nav `to` set đúng path đó; nếu cần
khung treasury thì wrapper page render `CrudListPage` với `entityKey`. `LedgerDepositPage` clone `LedgerCashPage.tsx`
đổi hook sang `useDepositLedger` + label "Sổ chi tiết tiền gửi".

## Testing Strategy

- Visual: screenshot 3 màn (before nav = WIP stub, after = real). Verify ledger opening + running + đếm phân trang loại dòng đầu kỳ.
- Manual flow: tạo 1 tài khoản tiền gửi mặc định có `account_id` (COA) khớp `payment_accounts` của thẻ + (tùy chọn) 1 payment policy phí, rồi bán POS thẻ → dòng route vào quỹ tiền gửi (COA-derived), thấy trong Sổ chi tiết (kết nối với E2E DF-11 UAT-01).
- Không unit runtime (web app echo test).

## Dependencies

- Depends on: TKT-DF-09 (hooks + query keys).
- Blocks: TKT-DF-11 (E2E gate của epic).
