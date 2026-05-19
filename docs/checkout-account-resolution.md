# Checkout Account Resolution — API GET Reference

Context: `POST /invoices/:id/checkout` (and `/invoices/:id/debt`) requires UUIDs for `revenueAccountId` and `payments[].accountId`. This doc lists the GET endpoints the frontend should call to resolve those UUIDs before submitting checkout.

## Error this resolves

```json
{
  "code": "HTTP_400",
  "message": [
    "payments.0.accountId must be a UUID",
    "revenueAccountId must be a UUID"
  ]
}
```

Source DTO: `apps/api/src/modules/pos/dto/checkout-invoice.dto.ts`

```ts
class InvoicePaymentLineDto {
  paymentMethod: InvoicePaymentMethod;
  amount: number;          // >= 0.01
  accountId: string;       // @IsUUID — cash/bank account
  reference?: string;
}

class CheckoutInvoiceDto {
  payments: InvoicePaymentLineDto[];
  revenueAccountId: string;     // @IsUUID
  receivableAccountId?: string; // @IsUUID, required when totalPaid < amountDue
}
```

## Chart of Accounts (revenue / receivable)

Controller: `apps/api/src/modules/accounting/coa/coa.controller.ts`
Permission: `accounting.journal.post`
Required header: `X-Branch-Id`

| Method | Path | Query | Returns |
|---|---|---|---|
| `GET` | `/accounts` | `page`, `pageSize`, `filters` (JSON string) | Paginated list of `AccountEntity` |
| `GET` | `/accounts/:id` | — | Single account |

`AccountType` enum (`account.entity.ts:17`):
`ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE`

Common filter usages:

- Revenue account: `?filters={"type":"REVENUE","isActive":true}`
- Receivable (AR) account: `?filters={"type":"ASSET","isActive":true}` then narrow by `code` (e.g. `131`).

## Cash / Bank accounts (payments[].accountId)

Controller: `apps/api/src/modules/accounting/cash/cash.controller.ts`
Permission: `accounting.cash.read`
Required header: `X-Branch-Id`

| Method | Path | Query | Returns |
|---|---|---|---|
| `GET` | `/cash/accounts` | `page`, `pageSize`, `branchId`, `type` | Paginated cash/bank accounts |
| `GET` | `/cash/accounts/:id` | — | Single cash account |
| `GET` | `/cash/movements` | `page`, `pageSize`, `cashAccountId`, `type`, `branchId` | Cash ledger entries |

`CashAccountType` (see `cash-account.entity.ts`): typically `CASH | BANK`.

Usage:

- Cash on hand: `GET /cash/accounts?branchId={branchId}&type=CASH`
- Bank / card / transfer: `GET /cash/accounts?branchId={branchId}&type=BANK`

## Other accounting GET endpoints

| Method | Path | Permission |
|---|---|---|
| `GET /journals` | List journal entries | `accounting.journal.post` |
| `GET /journals/:id` | Single journal entry | `accounting.journal.post` |
| `GET /receivables` | List receivables | `accounting.receivables.read` |
| `GET /receivables/:id` | Single receivable | `accounting.receivables.read` |
| `GET /payables` | List payables | `accounting.payables.read` |
| `GET /payables/:id` | Single payable | `accounting.payables.read` |
| `GET /expenses` | List expenses | `accounting.expenses.read` |
| `GET /expenses/:id` | Single expense | `accounting.expenses.read` |

## Suggested frontend flow

```ts
import { erpApi, requireErpData } from "@/lib/common/erp-api";

// 1. Revenue account (org-scoped)
const revAccs = await requireErpData(
  erpApi.GET("/accounts", {
    params: {
      query: {
        filters: JSON.stringify({ type: "REVENUE", isActive: true }),
      },
    },
  }),
);
const revenueAccountId = revAccs.items[0].id;

// 2. Cash + bank accounts (branch-scoped)
const cashAccs = await requireErpData(
  erpApi.GET("/cash/accounts", { params: { query: { branchId, type: "CASH" } } }),
);
const bankAccs = await requireErpData(
  erpApi.GET("/cash/accounts", { params: { query: { branchId, type: "BANK" } } }),
);

// 3. Map payment method -> accountId
const accountByMethod: Record<string, string> = {
  CASH: cashAccs.items[0].id,
  CARD: bankAccs.items[0].id,
  TRANSFER: bankAccs.items[0].id,
};

// 4. Build checkout payload
const payload = {
  payments: paymentLines.map((p) => ({
    paymentMethod: p.method,
    amount: p.amount,
    accountId: accountByMethod[p.method],
  })),
  revenueAccountId,
  // receivableAccountId: arAccountId, // only when totalPaid < amountDue
};
```

## Recommendation

Cache these account IDs per session/branch (TanStack Query with a long `staleTime`) rather than fetching on every checkout. The chart of accounts is configuration data — it rarely changes during a shift. A better long-term option is exposing default account mappings on the branch entity (e.g. `branch.defaultRevenueAccountId`, `branch.defaultCashAccountId`) and including them in the auth/branch bootstrap payload.
