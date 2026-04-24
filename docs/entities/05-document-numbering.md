# Document Numbering Module Entities

> Configurable auto-numbering system for business documents (sales receipts,
> invoices, transfers, journals, etc.). Each organization can define per-branch,
> per-document-type numbering rules with customizable prefixes, date formatting,
> and reset policies.

**Source path:** `apps/api/src/modules/document-numbering/`

---

## DocumentNumberRuleEntity

**Table:** `document_number_rules`
**Extends:** `BaseEntity`
**Description:** Defines how document numbers are formatted for a specific document type within an organization (and optionally a branch). The generated number follows the pattern: `{prefix}{date?}{sequence}{suffix?}`. Only one active rule is allowed per org + branch + document type combination.

**Unique constraints:** `(organizationId, branchId, documentType, isActive)` — ensures only one active rule per scope.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `documentType` | `document_type` | `enum` | NN | The type of document this rule applies to |
| `prefix` | `prefix` | `varchar(50)` | NN | Fixed string prepended to the number (e.g. "INV-", "SAL-") |
| `suffix` | `suffix` | `varchar(50)` | ? | Optional fixed string appended after the sequence |
| `includeDate` | `include_date` | `boolean` | default: `true` | Whether to embed a date segment in the number |
| `dateFormat` | `date_format` | `varchar(20)` | default: `YYYYMMDD` | Date format string (e.g. "YYYYMM", "YYYYMMDD") used when `includeDate` is true |
| `sequenceLength` | `sequence_length` | `smallint` | default: `5` | Number of digits for the sequence portion, zero-padded (e.g. 5 → "00001") |
| `resetPolicy` | `reset_policy` | `enum` | default: `NEVER` | When to reset the counter back to 1 |
| `isActive` | `is_active` | `boolean` | default: `true` | Whether this rule is currently in use |

### DocumentType Enum (shared)

| Value | Description |
|-------|-------------|
| `INVOICE` | Purchase or sales invoice |
| `SALE` | POS sale receipt |
| `RETURN` | POS return receipt |
| `TRANSFER` | Stock transfer document |
| `ADJUSTMENT` | Stock adjustment document |
| `JOURNAL` | Accounting journal entry |
| `PAYABLE` | Accounts payable document |
| `RECEIVABLE` | Accounts receivable document |

### ResetPolicy Enum (local)

| Value | Description |
|-------|-------------|
| `NEVER` | Counter never resets; monotonically increasing |
| `DAILY` | Counter resets to 1 each day |
| `MONTHLY` | Counter resets to 1 on the 1st of each month |
| `YEARLY` | Counter resets to 1 on January 1st |

---

## DocumentNumberCounterEntity

**Table:** `document_number_counters`
**Description:** Tracks the current sequence value for a given numbering rule and reset period. For a rule with `resetPolicy = MONTHLY`, a new counter row is created each month (identified by `resetKey`, e.g. "202601"). The `currentValue` is atomically incremented when a new document number is generated.

**Does NOT extend BaseEntity** — uses its own PK.

**Unique constraints:** `(ruleId, resetKey)` — one counter per rule per period.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK | Surrogate key |
| `ruleId` | `rule_id` | `uuid` | NN, FK → `document_number_rules.id` | The numbering rule this counter belongs to |
| `organizationId` | `organization_id` | `varchar` | NN | Organization scope |
| `branchId` | `branch_id` | `varchar` | ? | Branch scope (mirrors the rule's branch scope) |
| `currentValue` | `current_value` | `bigint` | default: `0` | The last used sequence number; next document gets `currentValue + 1` |
| `resetKey` | `reset_key` | `varchar(20)` | NN | Period identifier (e.g. "2026", "202604", "20260425", or "GLOBAL" for NEVER) |
| `createdAt` | `created_at` | `timestamptz` | auto | Row creation timestamp |
| `updatedAt` | `updated_at` | `timestamptz` | auto | Row last-update timestamp |

**Relations:**
- `rule` → `DocumentNumberRuleEntity` (ManyToOne, CASCADE delete)
