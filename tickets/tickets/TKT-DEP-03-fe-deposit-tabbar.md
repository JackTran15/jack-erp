# TKT-DEP-03 FE — DepositTabBar sub-nav cho 3 màn

## Epic

[EPIC-19072026 Deposit Screens — Branch Scope & MISA Parity](../epics/EPIC-19072026-deposit-screens-branch-scope.md)

## Summary

Ba màn Tiền gửi hiện không có cách nhảy qua lại trực tiếp — phải quay ra sidebar. Thêm thanh điều hướng phụ cạnh tiêu đề trang: trang đang mở in đậm (không phải link), hai trang còn lại là link. **Không viết component mới** — `PageTabBar` và prop `tabs` của `DocumentListShell` đã có sẵn và đang được Quỹ tiền mặt dùng; ticket này chỉ tạo bản cấu hình cho tiền gửi.

## Deliverables

- `apps/backoffice-web/src/components/document/depositTabs.tsx` (mới) — nhân bản cấu trúc của `treasuryTabs.tsx`:
  - `DepositTabIdEnum` (`RECEIPTS_EXPENSES` | `RECONCILIATION` | `LEDGER`)
  - `DEPOSIT_TABS` — đúng 3 mục, nhãn tiếng Việt + path
  - `DepositTabBar` — bọc `PageTabBar`, render bằng `Link` của react-router
- Gắn `tabs={<DepositTabBar active={...} />}` vào `DocumentListShell` của 3 trang:
  - `pages/treasury/deposit/receipts-expenses/TreasuryDepositReceiptsPage.tsx`
  - `pages/treasury/deposit-recon/DepositReconPage.tsx`
  - `pages/treasury/deposit/LedgerDepositPage.tsx`

## Acceptance Criteria

- [ ] Ba trang đều hiện thanh tab cạnh tiêu đề, đúng thứ tự: Thu, chi tiền gửi → Đối chiếu tiền gửi → Sổ chi tiết tiền gửi.
- [ ] Tab của **trang hiện tại** in đậm và **không** phải link (khớp mẫu MISA và mẫu `TreasuryTabBar` bên tiền mặt).
- [ ] Điều hướng bằng `Link` của react-router (không `<a href>` gây full reload).
- [ ] Tiêu đề trang thống nhất: `TreasuryDepositReceiptsPage` và `LedgerDepositPage` hiện đều đặt title `"Tiền gửi"` — đổi thành `"Thu, chi tiền gửi"` và `"Sổ chi tiết tiền gửi"` để khớp nhãn tab.
- [ ] Không đụng logic query/filter của bất kỳ trang nào.
- [ ] Không tạo file `index.ts` re-export.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Named export, không default export.
- [ ] Import primitives từ `@erp/ui`, không import trực tiếp Radix.
- [ ] Icon (nếu có) chỉ từ `lucide-react`.

## Tech Approach

Mẫu tham chiếu: `apps/backoffice-web/src/components/document/treasuryTabs.tsx` (`TreasuryCashTabIdEnum` / `TREASURY_CASH_TABS` / `TreasuryTabBar`). Bám sát cấu trúc đó để hai nhóm màn hình nhất quán.

```tsx
export enum DepositTabIdEnum {
  RECEIPTS_EXPENSES = "receipts-expenses",
  RECONCILIATION = "reconciliation",
  LEDGER = "ledger",
}

interface DepositTab {
  id: DepositTabIdEnum;
  label: string;
  to: string;
}

export const DEPOSIT_TABS: readonly DepositTab[] = [
  { id: DepositTabIdEnum.RECEIPTS_EXPENSES, label: "Thu, chi tiền gửi", to: "/treasury/deposit/receipts-expenses" },
  { id: DepositTabIdEnum.RECONCILIATION,    label: "Đối chiếu tiền gửi", to: "/treasury/deposit-reconciliation" },
  { id: DepositTabIdEnum.LEDGER,            label: "Sổ chi tiết tiền gửi", to: "/treasury/deposit/ledger" },
];

interface DepositTabBarProps {
  active: DepositTabIdEnum;
}

export const DepositTabBar = ({ active }: DepositTabBarProps) => ( /* PageTabBar + Link */ );
```

Path lấy đúng từ `App.tsx` (`/treasury/deposit/receipts-expenses`, `/treasury/deposit-reconciliation`, `/treasury/deposit/ledger`) — chú ý hai path đầu **không** cùng tiền tố, dễ gõ nhầm.

## Testing Strategy

- Thủ công: mở từng trang, xác nhận tab active đúng, bấm qua lại 3 trang không reload.
- Không thêm unit test (thuần presentational, backoffice-web chưa có test runner).

## Dependencies

- Depends on: —
- Blocks: [TKT-DEP-04](./TKT-DEP-04-fe-receipts-recon-all-accounts.md), [TKT-DEP-05](./TKT-DEP-05-fe-ledger-all-accounts.md)
