# Accounting Module Entities

> Double-entry bookkeeping system. The **Chart of Accounts** (COA) organizes
> ledger accounts in a tree. **Journal entries** record all financial
> transactions as balanced debit/credit pairs. **Cash accounts** track physical
> cash balances. **Payables** and **Receivables** manage vendor and customer
> obligations. **Expenses** track operational costs.

**Source path:** `apps/api/src/modules/accounting/`

---

## AccountEntity

**Table:** `accounts`
**Extends:** `BaseEntity`
**Description:** A node in the Chart of Accounts tree. Accounts are categorized by type (Asset, Liability, Equity, Revenue, Expense) and can be nested via `parentAccountId` for sub-account groupings. Every journal line references an account. The `code` field is used in financial reports (e.g. "1000" for Cash, "4000" for Sales Revenue).

**Unique constraints:** `(organizationId, code)` — account codes are unique per org.

**Indexes:**
- `(organizationId, type)` — filter by account type
- `(parentAccountId)` — tree traversal

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `code` | `code` | `varchar(50)` | NN, UQ per org | Alphanumeric account code (e.g. "1010", "5200") |
| `name` | `name` | `varchar(200)` | NN | Account name (e.g. "Cash on Hand", "Cost of Goods Sold") |
| `type` | `type` | `enum` | NN | Fundamental accounting type |
| `parentAccountId` | `parent_account_id` | `uuid` | ? | FK → `accounts.id`; creates a hierarchy (e.g. "Cash" under "Current Assets") |
| `isActive` | `is_active` | `boolean` | default: `true` | Inactive accounts cannot be used in new journal entries |

### AccountType Enum (shared)

| Value | Description |
|-------|-------------|
| `ASSET` | Resources owned (cash, inventory, equipment) |
| `LIABILITY` | Obligations owed (payables, loans) |
| `EQUITY` | Owner's stake (retained earnings, capital) |
| `REVENUE` | Income earned (sales, service fees) |
| `EXPENSE` | Costs incurred (rent, salaries, COGS) |

**Relations:**
- `parentAccount` → `AccountEntity` (self-referencing ManyToOne, nullable)

---

## JournalEntryEntity

**Table:** `journal_entries`
**Extends:** `BaseEntity`
**Description:** A complete double-entry accounting transaction. Each entry has one or more balanced debit/credit lines. Journal entries are created automatically by the system (e.g. when a sale is completed, a cash movement occurs, or an expense is posted) or manually for corrections. Supports reversal: a reversed entry links to its reversal and vice versa.

**Unique constraints:** `(organizationId, documentNumber)`

**Indexes:**
- `(organizationId, source)` — filter by origin
- `(organizationId, status)` — filter posted vs reversed
- `(organizationId, branchId)` — branch reporting
- `(postedAt)` — date range queries
- `(sourceReferenceId)` — trace back to source document

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `documentNumber` | `document_number` | `varchar(100)` | NN, UQ per org | Auto-generated journal number (e.g. "JNL-20260425-00001") |
| `source` | `source` | `enum` | NN | System module that created this entry |
| `sourceReferenceId` | `source_reference_id` | `uuid` | ? | FK to the originating document (sale, expense, etc.) |
| `description` | `description` | `text` | ? | Human-readable description of the transaction |
| `notes` | `notes` | `text` | ? | Internal notes not shown in reports |
| `status` | `status` | `enum` | default: `POSTED` | Whether this entry is active or has been reversed |
| `postedAt` | `posted_at` | `timestamptz` | NN | Financial posting date (may differ from `createdAt`) |
| `postedBy` | `posted_by` | `uuid` | NN, FK → `users.id` | User who posted the entry |
| `reversedByJournalId` | `reversed_by_journal_id` | `uuid` | ? | FK → `journal_entries.id`; the reversing entry (if this entry was reversed) |
| `reversalOfJournalId` | `reversal_of_journal_id` | `uuid` | ? | FK → `journal_entries.id`; the original entry (if this is a reversal) |

### JournalSource Enum (shared)

| Value | Description |
|-------|-------------|
| `SALE` | Auto-generated from a POS sale |
| `RETURN` | Auto-generated from a POS return |
| `EXCHANGE` | Auto-generated from an exchange |
| `EXPENSE` | Auto-generated from an expense posting |
| `CASH_MOVEMENT` | Auto-generated from a cash deposit/withdrawal |
| `MANUAL` | Manually created by an accountant |
| `TRANSFER` | Auto-generated from a cash transfer between accounts |

### JournalStatus Enum (shared)

| Value | Description |
|-------|-------------|
| `POSTED` | Entry is active and affects account balances |
| `REVERSED` | Entry has been fully reversed by another journal entry |

**Relations:**
- `lines` → `JournalLineEntity[]` (OneToMany, cascade)

---

## JournalLineEntity

**Table:** `journal_lines`
**Extends:** `BaseEntity`
**Description:** A single debit or credit line within a journal entry. Exactly one of `debitAmount` or `creditAmount` should be non-zero for each line. The sum of all debits must equal the sum of all credits within an entry (balanced).

**Indexes:**
- `(journalEntryId)` — lines of an entry
- `(accountId)` — account activity

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `journalEntryId` | `journal_entry_id` | `uuid` | NN, FK → `journal_entries.id` | Parent journal entry |
| `accountId` | `account_id` | `uuid` | NN, FK → `accounts.id` | The ledger account affected |
| `debitAmount` | `debit_amount` | `numeric(18,2)` | default: `0` | Amount debited to this account (0 if this is a credit line) |
| `creditAmount` | `credit_amount` | `numeric(18,2)` | default: `0` | Amount credited to this account (0 if this is a debit line) |
| `description` | `description` | `text` | ? | Per-line description (e.g. "Revenue from sale SAL-001") |
| `lineOrder` | `line_order` | `int` | NN | Display order of lines within the entry (1-based) |

**Relations:**
- `journalEntry` → `JournalEntryEntity` (ManyToOne)

---

## CashAccountEntity

**Table:** `cash_accounts`
**Extends:** `BaseEntity`
**Description:** A physical or logical cash drawer / register / petty cash fund at a branch. Maintains a running `balance` that is updated with each cash movement. Linked to a ledger account in the Chart of Accounts for double-entry integration.

**Indexes:**
- `(organizationId, branchId)` — branch cash accounts
- `(accountId)` — ledger link

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `name` | `name` | `varchar(200)` | NN | Display name (e.g. "Register 1", "Petty Cash") |
| `balance` | `balance` | `numeric(18,2)` | default: `0` | Current cash balance; updated in real-time with each movement |
| `accountId` | `account_id` | `uuid` | NN, FK → `accounts.id` | Corresponding general ledger account |

---

## CashMovementEntity

**Table:** `cash_movements`
**Extends:** `BaseEntity`
**Description:** Records each deposit, withdrawal, transfer, or adjustment affecting a cash account. Every movement triggers a journal entry for double-entry compliance.

**Indexes:**
- `(cashAccountId)` — movements for a cash account
- `(organizationId, branchId)` — branch activity

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `cashAccountId` | `cash_account_id` | `uuid` | NN, FK → `cash_accounts.id` | The cash account affected |
| `type` | `type` | `enum` | NN | Nature of the cash movement |
| `amount` | `amount` | `numeric(18,2)` | NN | Movement amount (always positive; direction determined by `type`) |
| `reference` | `reference` | `varchar(255)` | ? | External reference (receipt number, bank slip, etc.) |
| `notes` | `notes` | `text` | ? | Free-text notes |

### CashMovementType Enum (local)

| Value | Description |
|-------|-------------|
| `DEPOSIT` | Cash added to the account (e.g. from bank, till top-up) |
| `WITHDRAWAL` | Cash removed from the account (e.g. bank deposit, payout) |
| `TRANSFER` | Cash moved between two cash accounts |
| `ADJUSTMENT` | Manual correction of the cash balance |

**Relations:**
- `cashAccount` → `CashAccountEntity` (ManyToOne)

---

## PayableEntity

**Table:** `payables`
**Extends:** `BaseEntity`
**Description:** An amount owed to a vendor/supplier. Tracks the full lifecycle from draft through posting to settlement. When fully paid, status transitions to SETTLED. Supports partial payments via settlement records.

**Unique constraints:** `(organizationId, documentNumber)`

**Indexes:**
- `(organizationId, status)` — filter outstanding payables
- `(organizationId, branchId)` — branch payables
- `(dueDate)` — aging analysis

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `documentNumber` | `document_number` | `varchar(100)` | ?, UQ per org | Auto-generated or manually assigned reference number |
| `vendorName` | `vendor_name` | `varchar(255)` | NN | Name of the vendor/supplier (free text; no vendor master yet) |
| `amount` | `amount` | `numeric(18,2)` | NN | Total amount owed |
| `currency` | `currency` | `varchar(10)` | default: `USD` | ISO 4217 currency code |
| `dueDate` | `due_date` | `date` | NN | Payment deadline |
| `status` | `status` | `enum` | default: `DRAFT` | Current lifecycle status |
| `accountId` | `account_id` | `uuid` | NN, FK → `accounts.id` | Expense or liability account to debit |
| `settledAmount` | `settled_amount` | `numeric(18,2)` | default: `0` | Running total of all payments made against this payable |
| `postedAt` | `posted_at` | `timestamptz` | ? | When the payable was posted to the books |
| `postedBy` | `posted_by` | `uuid` | ? | User who posted |

### PayableStatus Enum (shared)

| Value | Description |
|-------|-------------|
| `DRAFT` | Payable recorded but not yet posted |
| `POSTED` | Payable posted; included in reports and aging |
| `PARTIALLY_SETTLED` | Some payments made but balance remains |
| `SETTLED` | Fully paid (`settledAmount >= amount`) |
| `VOIDED` | Cancelled/reversed |

**Relations:**
- `settlements` → `PayableSettlementEntity[]` (OneToMany, cascade)

---

## PayableSettlementEntity

**Table:** `payable_settlements`
**Extends:** `BaseEntity`
**Description:** Records a single payment event against a payable. Multiple settlements can exist for a single payable (partial payments). Each settlement updates the parent's `settledAmount`.

**Indexes:** `(payableId)`

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `payableId` | `payable_id` | `uuid` | NN, FK → `payables.id` | The payable being paid |
| `amount` | `amount` | `numeric(18,2)` | NN | Amount of this payment |
| `settlementDate` | `settlement_date` | `date` | NN | Date the payment was made |
| `method` | `method` | `varchar(50)` | NN | Payment method (e.g. "CASH", "BANK_TRANSFER", "CHECK") |
| `reference` | `reference` | `varchar(255)` | ? | External reference (bank transaction ID, check number, etc.) |

**Relations:**
- `payable` → `PayableEntity` (ManyToOne)

---

## ReceivableEntity

**Table:** `receivables`
**Extends:** `BaseEntity`
**Description:** An amount owed by a customer to the organization. Mirrors the payable structure for the revenue side. Supports partial settlement and write-offs for uncollectible amounts.

**Unique constraints:** `(organizationId, documentNumber)`

**Indexes:**
- `(organizationId, status)` — filter outstanding receivables
- `(organizationId, branchId)` — branch receivables
- `(dueDate)` — aging analysis
- `(customerId)` — customer balance lookup

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `documentNumber` | `document_number` | `varchar(100)` | ?, UQ per org | Reference number |
| `customerId` | `customer_id` | `uuid` | NN, FK → `customers.id` | The customer who owes the amount |
| `amount` | `amount` | `numeric(18,2)` | NN | Total amount owed by the customer |
| `currency` | `currency` | `varchar(10)` | default: `USD` | ISO 4217 currency code |
| `dueDate` | `due_date` | `date` | NN | Payment deadline |
| `status` | `status` | `enum` | default: `DRAFT` | Current lifecycle status |
| `accountId` | `account_id` | `uuid` | NN, FK → `accounts.id` | Revenue or asset account to credit |
| `settledAmount` | `settled_amount` | `numeric(18,2)` | default: `0` | Running total of all payments received |
| `postedAt` | `posted_at` | `timestamptz` | ? | When posted to the books |
| `postedBy` | `posted_by` | `uuid` | ? | User who posted |
| `writeOffReason` | `write_off_reason` | `text` | ? | Explanation when the receivable is written off as uncollectible |

### ReceivableStatus Enum (shared)

| Value | Description |
|-------|-------------|
| `DRAFT` | Receivable recorded but not yet posted |
| `POSTED` | Posted; included in aging reports |
| `PARTIALLY_SETTLED` | Some payments received but balance remains |
| `SETTLED` | Fully collected |
| `VOIDED` | Cancelled/reversed |
| `WRITTEN_OFF` | Marked as uncollectible; `writeOffReason` documents the decision |

**Relations:**
- `settlements` → `ReceivableSettlementEntity[]` (OneToMany, cascade)

---

## ReceivableSettlementEntity

**Table:** `receivable_settlements`
**Extends:** `BaseEntity`
**Description:** Records a single payment received from a customer against a receivable. Identical structure to `PayableSettlement` but on the receivables side.

**Indexes:** `(receivableId)`

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `receivableId` | `receivable_id` | `uuid` | NN, FK → `receivables.id` | The receivable being paid |
| `amount` | `amount` | `numeric(18,2)` | NN | Payment amount |
| `settlementDate` | `settlement_date` | `date` | NN | Date payment was received |
| `method` | `method` | `varchar(50)` | NN | Payment method |
| `reference` | `reference` | `varchar(255)` | ? | External reference |

**Relations:**
- `receivable` → `ReceivableEntity` (ManyToOne)

---

## ExpenseEntity

**Table:** `expenses`
**Extends:** `BaseEntity`
**Description:** Records an operational expense (e.g. rent, utilities, supplies). Expenses go through an approval workflow (DRAFT → APPROVED → POSTED). When posted, a journal entry is automatically created to debit the expense account. Optionally linked to a payable if the expense creates a vendor obligation.

**Indexes:**
- `(organizationId, status)` — filter by status
- `(organizationId, branchId)` — branch expenses
- `(accountId)` — expense account activity

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `description` | `description` | `text` | NN | What the expense is for (e.g. "Office rent for April 2026") |
| `amount` | `amount` | `numeric(18,2)` | NN | Expense amount |
| `accountId` | `account_id` | `uuid` | NN, FK → `accounts.id` | The expense account to debit |
| `payableId` | `payable_id` | `uuid` | ? | FK → `payables.id`; if this expense created a vendor obligation |
| `status` | `status` | `enum` | default: `DRAFT` | Workflow status |
| `approvedBy` | `approved_by` | `uuid` | ? | User who approved |
| `approvedAt` | `approved_at` | `timestamptz` | ? | When approved |
| `postedAt` | `posted_at` | `timestamptz` | ? | When posted and journal entry created |
| `postedBy` | `posted_by` | `uuid` | ? | User who posted |

### ExpenseStatus Enum (local)

| Value | Description |
|-------|-------------|
| `DRAFT` | Expense recorded but not yet submitted |
| `APPROVED` | Approved by a manager; ready to post |
| `POSTED` | Finalized; journal entry has been created |
