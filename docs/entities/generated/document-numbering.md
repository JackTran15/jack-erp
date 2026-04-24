# Document Numbering Entities

Generated from `docs/entities/entity-manifest.json`.

Total entities: **2**

---

## DocumentNumberCounterEntity

- **Table:** `document_number_counters`
- **Source:** `apps/api/src/modules/document-numbering/document-number-counter.entity.ts`
- **Extends BaseEntity:** No
- **Description:** Tracks the current sequence value for a numbering rule per reset period. Atomically incremented when generating document numbers.

### Unique Constraints
- `'UQ_rule_reset_key', ['ruleId', 'resetKey']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK, NN | - |
| `ruleId` | `rule_id` | `uuid` | NN | The numbering rule this counter belongs to |
| `organizationId` | `organization_id` | `varchar` | NN | Organization scope |
| `branchId` | `branch_id` | `varchar` | - | Branch scope (mirrors the rules branch scope) |
| `currentValue` | `current_value` | `bigint` | NN, default: 0 | Last used sequence number; next document gets currentValue + 1 |
| `resetKey` | `reset_key` | `varchar` | NN | Period identifier (e.g. 2026, 202604, or GLOBAL for NEVER) |
| `createdAt` | `created_at` | `varchar` | NN | - |
| `updatedAt` | `updated_at` | `varchar` | NN | - |

### Relations
- `ManyToOne` `rule` → `DocumentNumberRuleEntity`

---

## DocumentNumberRuleEntity

- **Table:** `document_number_rules`
- **Source:** `apps/api/src/modules/document-numbering/document-number-rule.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Defines how document numbers are formatted for a specific document type. Pattern: {prefix}{date?}{sequence}{suffix?}.

### Unique Constraints
- `'UQ_active_rule_scope', [
  'organizationId',
  'branchId',
  'documentType',
  'isActive',
]`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `documentType` | `document_type` | `enum` | NN | The type of document this rule applies to (SALE, INVOICE, etc.) |
| `prefix` | `prefix` | `varchar` | NN | Fixed string prepended to the number (e.g. INV-, SAL-) |
| `suffix` | `suffix` | `varchar` | - | Optional fixed string appended after the sequence |
| `includeDate` | `include_date` | `varchar` | NN, default: true | Whether to embed a date segment in the number |
| `dateFormat` | `date_format` | `varchar` | NN, default: 'YYYYMMDD' | Date format string used when includeDate is true |
| `sequenceLength` | `sequence_length` | `smallint` | NN, default: 5 | Number of digits for the sequence portion, zero-padded |
| `resetPolicy` | `reset_policy` | `enum` | NN, default: ResetPolicy.NEVER | When to reset the counter back to 1 (NEVER, DAILY, MONTHLY, YEARLY) |
| `isActive` | `is_active` | `varchar` | NN, default: true | Whether this rule is currently in use |

---
