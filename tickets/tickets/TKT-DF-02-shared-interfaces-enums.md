# TKT-DF-02 Shared-interfaces enums + DTO shapes + JournalSource.BANK_MOVEMENT

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Nền tảng](../epics/EPIC-15072026-deposit-fund-foundation.md)

## Summary

Khai báo enum + interface DTO/response cho quỹ tiền gửi trong `@erp/shared-interfaces` để **cả BE (entity/service)
lẫn FE (hooks/pages)** dùng chung một nguồn type, và thêm `JournalSource.BANK_MOVEMENT` cho bút toán tiền gửi
(mirror `CASH_MOVEMENT`). Các enum phải khớp 1:1 với enum type Postgres đã tạo ở TKT-DF-01. Package này build ở
`postinstall`/`build:shared` nên phải build lại sau khi sửa.

## Deliverables

- `packages/shared-interfaces/src/deposit/index.ts` — **mới**. Enums + interfaces (dưới).
- `packages/shared-interfaces/src/index.ts` — thêm `export * from './deposit';`.
- `packages/shared-interfaces/src/accounting/index.ts` — thêm `BANK_MOVEMENT = 'BANK_MOVEMENT'` vào `enum JournalSource`
  (hiện có `SALE|RETURN|EXCHANGE|EXPENSE|CASH_MOVEMENT|MANUAL|TRANSFER` — L31-39).

**Enums (khớp DDL TKT-DF-01):**

```ts
export enum DepositAccountType { BANK_ACCOUNT = 'BANK_ACCOUNT', EWALLET = 'EWALLET', POS_MERCHANT = 'POS_MERCHANT' }
export enum DepositAccountStatus { ACTIVE = 'ACTIVE', INACTIVE = 'INACTIVE' }
export enum DepositMovementType { DEPOSIT = 'DEPOSIT', WITHDRAWAL = 'WITHDRAWAL', TRANSFER = 'TRANSFER', ADJUSTMENT = 'ADJUSTMENT' }
export enum DepositMovementSource { POS_INVOICE = 'POS_INVOICE', MANUAL = 'MANUAL', TRANSFER = 'TRANSFER', SYSTEM = 'SYSTEM' }
export enum TargetFund { DEPOSIT = 'DEPOSIT', OTHER = 'OTHER' } // DERIVED return value only — KHÔNG persist, KHÔNG có enum Postgres (target_fund suy ra theo COA, xem DF-04)
export enum FeeBearer { MERCHANT = 'MERCHANT', CUSTOMER = 'CUSTOMER' } // dùng bởi deposit_payment_policy.fee_bearer
export enum ReconStatus { CHUA = 'CHUA', DA = 'DA', LECH = 'LECH' }
export enum DepositTransferStatus { DANG_CHUYEN = 'DANG_CHUYEN', HOAN_TAT = 'HOAN_TAT' }
```

**Interfaces (response shapes FE consume — thuần data, không class-validator):**

```ts
export interface DepositAccount {
  id: string; organizationId: string; branchId: string;
  name: string; code: string; accountNo: string; accountName: string;
  bankId: string; bankBranch?: string | null; type: DepositAccountType;
  mid?: string | null; tid?: string | null; accountId: string; // COA 112x
  openingBalance: string; openingDate: string; balance: string;  // numeric → string
  allowNegative: boolean; isDefault: boolean; status: DepositAccountStatus;
  createdAt: string; updatedAt: string;
}

export interface DepositPaymentPolicy {
  id: string; organizationId: string; branchId?: string | null;   // branchId null = org-wide (mirror payment_accounts scoping)
  paymentMethod: string; cardType?: string | null;                // cardType null trong GĐ1 (invoice_payments chưa có cột cardType)
  depositAccountId?: string | null;                               // override quỹ, CHỈ khi COA-join nhập nhằng; null = suy ra theo COA
  feeRate: string; feeBearer?: FeeBearer | null; settlementDays: number;
  effectiveFrom: string; effectiveTo?: string | null; isActive: boolean;
}

export interface ResolveDepositTargetResult {
  fund: TargetFund;                                               // DEPOSIT | OTHER (suy ra từ COA)
  depositAccountId?: string | null;
  feeRate: string; feeBearer?: FeeBearer | null; settlementDays: number;
}

export interface DepositLedgerRow {
  id: string; docDate: string; documentNumber?: string | null;
  receiptNo?: string | null; paymentNo?: string | null;   // NTTK / UNC
  depositAccountNo: string; description?: string | null;
  amountIn: string; amountOut: string; runningBalance: string;
  counterpartyName?: string | null; staffName?: string | null;
  reconStatus: ReconStatus;
}

export interface DepositLedgerResponse {
  openingBalance: string; rows: DepositLedgerRow[];
  totalIn: string; totalOut: string; closingBalance: string;
  page: number; pageSize: number; total: number; // total EXCLUDES opening-balance row (ref.md §6.10)
}
```

## Acceptance Criteria

- [ ] Mọi enum value **khớp chính xác** enum type Postgres ở TKT-DF-01 (BANK_ACCOUNT/EWALLET/POS_MERCHANT; CHUA/DA/LECH; …). Ngoại lệ: `TargetFund` là type **suy ra** (return value), **KHÔNG** có enum Postgres tương ứng (DF-01 không tạo `target_fund_enum`).
- [ ] `JournalSource` có thêm `BANK_MOVEMENT` mà không đổi các value cũ (mirror `CASH_MOVEMENT`).
- [ ] Interfaces dùng `string` cho tiền (numeric serialize → string), **không** dùng `number` (NFR-06, tránh float precision loss ở JSON).
- [ ] `DepositLedgerResponse.total` được ghi chú **loại trừ** dòng `Số dư đầu kỳ` khỏi bộ đếm phân trang (ref.md §6.10 quan sát).
- [ ] `packages/shared-interfaces/src/index.ts` re-export `./deposit`; build ra `dist` không lỗi type.
- [ ] Không field thừa/thiếu so với DTO mà BE sẽ trả (DF-03/04/06) — FE (DF-09/10) import trực tiếp, không tự định nghĩa lại.

## Definition of Done

- [ ] `pnpm --filter @erp/shared-interfaces build` xanh; `pnpm build:shared` regenerate `dist`.
- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh (BE import type mới compile được).
- [ ] Không đụng migration/`synchronize`.
- [ ] Không có tiếng Việt trong source (chỉ ticket prose).
- [ ] Không có TODO/FIXME ngoài kế hoạch.

## Tech Approach

`accounting/index.ts` L31-39 hiện là:

```ts
export enum JournalSource {
  SALE = 'SALE', RETURN = 'RETURN', EXCHANGE = 'EXCHANGE',
  EXPENSE = 'EXPENSE', CASH_MOVEMENT = 'CASH_MOVEMENT',
  MANUAL = 'MANUAL', TRANSFER = 'TRANSFER',
  // + BANK_MOVEMENT = 'BANK_MOVEMENT',
}
```

Deposit enums/interfaces tách file riêng (`src/deposit/index.ts`) giống các domain khác (`pos/`, `inventory/`),
re-export ở root. BE dùng chúng cho DTO (`@ApiProperty({ enum: DepositMovementType })`) và entity `@Column({ type: 'enum', enum: ... })`;
FE dùng cho hooks/pages (DF-09/10). Money field là `string` khớp cách TypeORM serialize `numeric` (giống các interface accounting hiện có).

## Testing Strategy

- Build-time type check là verification chính (không endpoint mới → không unit runtime spec). `tsc` của shared-interfaces + api compile là gate.
- Sanity: BE spec ở DF-03/04/06 import các enum này (nếu type sai → spec compile fail).

## Dependencies

- Depends on: TKT-DF-01 (enum value phải khớp DDL).
- Blocks: TKT-DF-03 (entity/DTO dùng enum), và mọi ticket BE/FE dùng type deposit.
