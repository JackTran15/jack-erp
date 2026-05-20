# Accounting Entities

Generated from `docs/entities/entity-manifest.json`.

Total entities: **10**

---

## AccountEntity

- **Table:** `accounts`
- **Source:** `apps/api/src/modules/accounting/coa/account.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Node in the Chart of Accounts tree. Categorized by type (Asset, Liability, Equity, Revenue, Expense).

### Indexes
- `'uq_account_org_code', ['organizationId', 'code'], { unique: true }`
- `'idx_account_org_type', ['organizationId', 'type']`
- `'idx_account_parent', ['parentAccountId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `code` | `code` | `varchar` | NN | Alphanumeric account code (e.g. 1010, 5200); unique per org |
| `name` | `name` | `varchar` | NN | Account name (e.g. Cash on Hand, Cost of Goods Sold) |
| `type` | `type` | `enum` | NN | Fundamental accounting type (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE) |
| `parentAccountId` | `parent_account_id` | `uuid` | - | FK to accounts — creates hierarchy (e.g. Cash under Current Assets) |
| `isActive` | `is_active` | `varchar` | NN, default: true | Inactive accounts cannot be used in new journal entries |

### Relations
- `ManyToOne` `parentAccount` → `AccountEntity`

---

## CashAccountEntity

- **Table:** `cash_accounts`
- **Source:** `apps/api/src/modules/accounting/cash/cash-account.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Physical or logical cash drawer/register/petty cash fund at a branch. Linked to a COA account.

### Indexes
- `'idx_cash_account_org_branch', ['organizationId', 'branchId']`
- `'idx_cash_account_ledger', ['accountId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `name` | `name` | `varchar` | NN | Display name (e.g. Register 1, Petty Cash) |
| `type` | `type` | `enum` | NN, default: CashAccountType.REGISTER | REGISTER=két quầy POS, SAFE=két chính chi nhánh, PETTY_CASH=quỹ lẻ |
| `balance` | `balance` | `numeric` | NN, default: 0 | Current cash balance; updated in real-time with each movement |
| `accountId` | `account_id` | `uuid` | NN | Corresponding general ledger account in the COA |

---

## CashMovementEntity

- **Table:** `cash_movements`
- **Source:** `apps/api/src/modules/accounting/cash/cash-movement.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Records each deposit, withdrawal, transfer, or adjustment on a cash account. Triggers journal entries.

### Indexes
- `'idx_cash_movement_account', ['cashAccountId']`
- `'idx_cash_movement_org_branch', ['organizationId', 'branchId']`
- `'idx_cash_movement_to_account', ['toAccountId']`
- `'idx_cash_movement_session', ['sessionId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `cashAccountId` | `cash_account_id` | `uuid` | NN | The cash account affected (source for TRANSFER) |
| `toAccountId` | `to_account_id` | `uuid` | - | Destination cash account when type=TRANSFER |
| `type` | `type` | `enum` | NN | Nature of the cash movement (DEPOSIT, WITHDRAWAL, TRANSFER, ADJUSTMENT) |
| `amount` | `amount` | `numeric` | NN | Movement amount (always positive; direction determined by type) |
| `reference` | `reference` | `varchar` | - | External reference (receipt number, bank slip, etc.) |
| `notes` | `notes` | `text` | - | Free-text notes |
| `sessionId` | `session_id` | `uuid` | - | POS session that recorded this movement, if any |

### Relations
- `ManyToOne` `cashAccount` → `CashAccountEntity`
- `ManyToOne` `toAccount` → `CashAccountEntity`
- `ManyToOne` `session` → `PosSessionEntity`

---

## ExpenseEntity

- **Table:** `expenses`
- **Source:** `apps/api/src/modules/accounting/expenses/expense.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Operational expense record. Workflow: DRAFT → APPROVED → POSTED. Posting auto-creates a journal entry.

### Indexes
- `'idx_expense_org_status', ['organizationId', 'status']`
- `'idx_expense_org_branch', ['organizationId', 'branchId']`
- `'idx_expense_account', ['accountId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `description` | `description` | `text` | NN | What the expense is for (e.g. Office rent for April 2026) |
| `amount` | `amount` | `numeric` | NN | Expense amount |
| `accountId` | `account_id` | `uuid` | NN | The expense account to debit in the COA |
| `payableId` | `payable_id` | `uuid` | - | FK to payables — if this expense created a vendor obligation |
| `status` | `status` | `enum` | NN, default: ExpenseStatus.DRAFT | Workflow status (DRAFT, APPROVED, POSTED) |
| `approvedBy` | `approved_by` | `uuid` | - | User who approved the expense |
| `approvedAt` | `approved_at` | `timestamptz` | - | When approved |
| `postedAt` | `posted_at` | `timestamptz` | - | When posted and journal entry created |
| `postedBy` | `posted_by` | `uuid` | - | User who posted |

---

## JournalEntryEntity

- **Table:** `journal_entries`
- **Source:** `apps/api/src/modules/accounting/journal/journal-entry.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Double-entry journal entry with balanced debit/credit lines. Auto or manually created. Supports reversal.

### Indexes
- `'uq_journal_doc_number', ['organizationId', 'documentNumber'], {
  unique: true,
}`
- `'idx_journal_org_source', ['organizationId', 'source']`
- `'idx_journal_org_status', ['organizationId', 'status']`
- `'idx_journal_org_branch', ['organizationId', 'branchId']`
- `'idx_journal_posted_at', ['postedAt']`
- `'idx_journal_source_ref', ['sourceReferenceId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `documentNumber` | `document_number` | `varchar` | NN | Auto-generated journal number (e.g. JNL-20260425-00001) |
| `source` | `source` | `enum` | NN | System module that created this entry (SALE, RETURN, MANUAL, etc.) |
| `sourceReferenceId` | `source_reference_id` | `uuid` | - | FK to originating document (sale, expense, etc.) |
| `description` | `description` | `text` | - | Human-readable description of the transaction |
| `notes` | `notes` | `text` | - | Internal notes not shown in reports |
| `status` | `status` | `enum` | NN, default: JournalStatus.POSTED | Whether this entry is active or has been reversed |
| `postedAt` | `posted_at` | `timestamptz` | NN | Financial posting date (may differ from createdAt) |
| `postedBy` | `posted_by` | `uuid` | NN | User who posted the entry |
| `reversedByJournalId` | `reversed_by_journal_id` | `uuid` | - | FK to journal_entries — the reversing entry (if reversed) |
| `reversalOfJournalId` | `reversal_of_journal_id` | `uuid` | - | FK to journal_entries — the original entry (if this is a reversal) |

### Relations
- `OneToMany` `lines` → `JournalLineEntity`

---

## JournalLineEntity

- **Table:** `journal_lines`
- **Source:** `apps/api/src/modules/accounting/journal/journal-line.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Single debit or credit line within a journal entry. Sum of debits must equal sum of credits.

### Indexes
- `'idx_journal_line_entry', ['journalEntryId']`
- `'idx_journal_line_account', ['accountId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `journalEntryId` | `journal_entry_id` | `uuid` | NN | Parent journal entry |
| `accountId` | `account_id` | `uuid` | NN | The ledger account affected |
| `debitAmount` | `debit_amount` | `numeric` | NN, default: 0 | Amount debited to this account (0 if this is a credit line) |
| `creditAmount` | `credit_amount` | `numeric` | NN, default: 0 | Amount credited to this account (0 if this is a debit line) |
| `description` | `description` | `text` | - | Per-line description (e.g. Revenue from sale SAL-001) |
| `lineOrder` | `line_order` | `int` | NN | Display order of lines within the entry (1-based) |

### Relations
- `ManyToOne` `journalEntry` → `JournalEntryEntity`

---

## PayableEntity

- **Table:** `payables`
- **Source:** `apps/api/src/modules/accounting/payables/payable.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Amount owed to a vendor/supplier. Lifecycle: DRAFT → POSTED → PARTIALLY_SETTLED → SETTLED.

### Indexes
- `'uq_payable_doc_number', ['organizationId', 'documentNumber'], {
  unique: true,
}`
- `'idx_payable_org_status', ['organizationId', 'status']`
- `'idx_payable_org_branch', ['organizationId', 'branchId']`
- `'idx_payable_due_date', ['dueDate']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `documentNumber` | `document_number` | `varchar` | - | Auto-generated or manually assigned reference number |
| `vendorName` | `vendor_name` | `varchar` | NN | Name of the vendor/supplier (free text; no vendor master yet) |
| `amount` | `amount` | `numeric` | NN | Total amount owed to the vendor |
| `currency` | `currency` | `varchar` | NN, default: 'USD' | ISO 4217 currency code |
| `dueDate` | `due_date` | `date` | NN | Payment deadline |
| `status` | `status` | `enum` | NN, default: PayableStatus.DRAFT | Current lifecycle status (DRAFT, POSTED, PARTIALLY_SETTLED, SETTLED, VOIDED) |
| `accountId` | `account_id` | `uuid` | NN | Expense or liability account to debit |
| `settledAmount` | `settled_amount` | `numeric` | NN, default: 0 | Running total of all payments made against this payable |
| `postedAt` | `posted_at` | `timestamptz` | - | When the payable was posted to the books |
| `postedBy` | `posted_by` | `uuid` | - | User who posted |

### Relations
- `OneToMany` `settlements` → `PayableSettlementEntity`

---

## PayableSettlementEntity

- **Table:** `payable_settlements`
- **Source:** `apps/api/src/modules/accounting/payables/payable-settlement.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Records a single payment event against a payable. Multiple settlements for partial payments.

### Indexes
- `'idx_payable_settlement_payable', ['payableId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `payableId` | `payable_id` | `uuid` | NN | The payable being paid |
| `amount` | `amount` | `numeric` | NN | Amount of this payment |
| `settlementDate` | `settlement_date` | `date` | NN | Date the payment was made |
| `method` | `method` | `varchar` | NN | Payment method (e.g. CASH, BANK_TRANSFER, CHECK) |
| `reference` | `reference` | `varchar` | - | External reference (bank txn ID, check number, etc.) |

### Relations
- `ManyToOne` `payable` → `PayableEntity`

---

## ReceivableEntity

- **Table:** `receivables`
- **Source:** `apps/api/src/modules/accounting/receivables/receivable.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Amount owed by a customer to the organization. Supports partial settlement and write-offs.

### Indexes
- `'uq_receivable_doc_number', ['organizationId', 'documentNumber'], {
  unique: true,
}`
- `'idx_receivable_org_status', ['organizationId', 'status']`
- `'idx_receivable_org_branch', ['organizationId', 'branchId']`
- `'idx_receivable_due_date', ['dueDate']`
- `'idx_receivable_customer', ['customerId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `documentNumber` | `document_number` | `varchar` | - | Reference number |
| `customerId` | `customer_id` | `uuid` | NN | The customer who owes the amount |
| `amount` | `amount` | `numeric` | NN | Total amount owed by the customer |
| `currency` | `currency` | `varchar` | NN, default: 'USD' | ISO 4217 currency code |
| `dueDate` | `due_date` | `date` | NN | Payment deadline |
| `status` | `status` | `enum` | NN, default: ReceivableStatus.DRAFT | Current lifecycle status |
| `accountId` | `account_id` | `uuid` | NN | Revenue or asset account to credit |
| `settledAmount` | `settled_amount` | `numeric` | NN, default: 0 | Running total of all payments received from the customer |
| `postedAt` | `posted_at` | `timestamptz` | - | When posted to the books |
| `postedBy` | `posted_by` | `uuid` | - | User who posted |
| `writeOffReason` | `write_off_reason` | `text` | - | Explanation when the receivable is written off as uncollectible |

### Relations
- `OneToMany` `settlements` → `ReceivableSettlementEntity`

---

## ReceivableSettlementEntity

- **Table:** `receivable_settlements`
- **Source:** `apps/api/src/modules/accounting/receivables/receivable-settlement.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Records a single payment received from a customer against a receivable.

### Indexes
- `'idx_receivable_settlement_receivable', ['receivableId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `receivableId` | `receivable_id` | `uuid` | NN | The receivable being paid |
| `amount` | `amount` | `numeric` | NN | Payment amount received |
| `settlementDate` | `settlement_date` | `date` | NN | Date payment was received |
| `method` | `method` | `varchar` | NN | Payment method (e.g. CASH, BANK_TRANSFER) |
| `reference` | `reference` | `varchar` | - | External reference |

### Relations
- `ManyToOne` `receivable` → `ReceivableEntity`

---
