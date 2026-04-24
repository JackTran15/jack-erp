# POS Module

## Purpose

Provide fast, controlled checkout and return operations with end-of-shift reconciliation and accounting linkage.

Access note:

- Salesman and sales manager accounts can access POS features within assigned branch scope.

## Core Entities

- PosTerminal
- PosSession
- Sale
- SaleLine
- Payment
- Return

## POS Session Lifecycle

```mermaid
flowchart LR
  open[Open] --> active[ActiveSales]
  active --> closing[Closing]
  closing --> closed[Closed]
```

## Checkout Workflow

1. Open POS session with opening cash amount.
2. Add sale lines (item, qty, unit price, discount, tax).
3. Validate stock availability per branch/location policy.
4. Confirm payment method(s):
   - cash
   - card
   - transfer/e-wallet (optional)
5. Post sale:
   - generate invoice number using active numbering rule (example `HD-{YYYYMMDD}-{SEQ:5}`)
   - create sale and payment records
   - write stock ledger (`sale_issue`)
   - write accounting journal entries
   - emit WebSocket acknowledgement event to cashier session
6. Print/email receipt (optional).

## Return Workflow

1. Reference original sale where possible.
2. Validate return policy window and condition.
3. Record returned lines and refund method.
4. Post return:
   - write stock ledger (`return_in`)
   - write reversing/adjusting accounting entries
5. Issue return receipt.

## Aftersales Exchange Workflow

1. Reference original sale and verify exchange eligibility window/policy.
2. Capture returned item condition and reason.
3. Select replacement item and validate availability.
4. Post exchange:
   - write stock ledger for returned item (`exchange_in`)
   - write stock ledger for replacement item (`exchange_out`)
5. Settle difference:
   - collect additional payment if replacement is higher value
   - issue refund/credit if replacement is lower value
6. Emit WebSocket acknowledgement event to cashier/session.
7. Issue exchange receipt referencing original sale.

## Shift Reconciliation

- Expected cash = opening cash + cash sales - cash refunds +/- cash movements.
- Actual cash is counted at close.
- Variance is recorded and requires manager approval beyond threshold.

## Performance and UX Targets

- Typical checkout under 2 seconds.
- Search and add item under 300 ms in common scenarios.
- Offline mode is optional in V1 and should be documented if added later.

## Fraud and Risk Controls

- Void/discount above threshold requires supervisor approval.
- Return without original receipt requires elevated permission.
- Exchange without original sale reference requires elevated permission and reason.
- Session close requires no pending transaction drafts.

## Acceptance Criteria

- Session cannot close without reconciliation.
- Every sale and return writes inventory and accounting effects.
- Every exchange writes inventory and accounting effects with original sale linkage.
- High-risk actions are permission-gated and audited.
