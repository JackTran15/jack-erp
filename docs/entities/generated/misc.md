# Miscellaneous Entities

Generated from `docs/entities/entity-manifest.json`.

Total entities: **11**

---

## DeadLetterEventEntity

- **Table:** `dead_letter_events`
- **Source:** `apps/api/src/modules/events/entities/dead-letter-event.entity.ts`
- **Extends BaseEntity:** No
- **Description:** Records Kafka messages that exhausted DLQ retries. Admin can replay or ignore.

### Indexes
- `'idx_dle_status_topic', ['status', 'topic']`
- `'idx_dle_org_created', ['organizationId', 'createdAt']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK, NN | - |
| `organizationId` | `organization_id` | `uuid` | NN | - |
| `branchId` | `branch_id` | `uuid` | - | - |
| `topic` | `topic` | `varchar` | NN | - |
| `partition` | `partition` | `integer` | - | - |
| `offset` | `offset` | `bigint` | - | - |
| `key` | `key` | `varchar` | - | - |
| `payload` | `payload` | `jsonb` | NN | - |
| `error` | `error` | `text` | - | - |
| `retryCount` | `retry_count` | `integer` | NN, default: 3 | - |
| `status` | `status` | `enum` | NN, default: DeadLetterStatus.PENDING | - |
| `resolvedBy` | `resolved_by` | `uuid` | - | - |
| `resolvedAt` | `resolved_at` | `timestamptz` | - | - |
| `notes` | `notes` | `text` | - | - |
| `createdAt` | `created_at` | `varchar` | NN | - |
| `updatedAt` | `updated_at` | `varchar` | NN | - |
| `createdBy` | `created_by` | `uuid` | - | - |

---

## DiscountCodeEntity

- **Table:** `discount_codes`
- **Source:** `apps/api/src/modules/promotion/discount-code.entity.ts`
- **Extends BaseEntity:** Yes

### Indexes
- `'uq_discount_code_org', ['organizationId', 'code'], { unique: true }`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `code` | `code` | `varchar` | NN | - |
| `discountType` | `discount_type` | `enum` | NN | - |
| `discountValue` | `discount_value` | `numeric` | NN | - |
| `minOrderValue` | `min_order_value` | `numeric` | NN, default: 0 | - |
| `maxUses` | `max_uses` | `int` | - | - |
| `usedCount` | `used_count` | `int` | NN, default: 0 | - |
| `validFrom` | `valid_from` | `timestamptz` | NN | - |
| `validTo` | `valid_to` | `timestamptz` | NN | - |
| `isActive` | `is_active` | `boolean` | NN, default: true | - |

---

## EmployeeAccessScheduleEntity

- **Table:** `employee_access_schedules`
- **Source:** `apps/api/src/modules/rbac/employee/employee-access-schedule.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Per-weekday software access time window for an employee (used when access_mode = SCHEDULED).

### Indexes
- `'uq_employee_access_profile_weekday', ['employeeProfileId', 'weekday'], { unique: true }`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `employeeProfileId` | `employee_profile_id` | `uuid` | NN | FK to employee_profiles |
| `weekday` | `weekday` | `enum` | NN | Day of week this window applies to |
| `enabled` | `enabled` | `varchar` | NN, default: true | Whether access is allowed on this day |
| `startTime` | `start_time` | `time` | NN, default: '00:00' | Window start (HH:mm) |
| `endTime` | `end_time` | `time` | NN, default: '23:59' | Window end (HH:mm) |

### Relations
- `ManyToOne` `employeeProfile` → `EmployeeProfileEntity`

---

## EmployeeAddressEntity

- **Table:** `employee_addresses`
- **Source:** `apps/api/src/modules/rbac/employee/employee-address.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Permanent or current residence address for an employee profile.

### Indexes
- `'uq_employee_address_profile_type', ['employeeProfileId', 'type'], { unique: true }`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `employeeProfileId` | `employee_profile_id` | `uuid` | NN | FK to employee_profiles |
| `type` | `type` | `enum` | NN | PERMANENT (hộ khẩu) or CURRENT (chỗ ở hiện tại) |
| `address` | `address` | `varchar` | - | Street address line |
| `country` | `country` | `varchar` | - | Country |
| `province` | `province` | `varchar` | - | Province / city |
| `district` | `district` | `varchar` | - | District |
| `ward` | `ward` | `varchar` | - | Ward |

### Relations
- `ManyToOne` `employeeProfile` → `EmployeeProfileEntity`

---

## EmployeeEmergencyContactEntity

- **Table:** `employee_emergency_contacts`
- **Source:** `apps/api/src/modules/rbac/employee/employee-emergency-contact.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Emergency contact for an employee profile (1:1).

### Indexes
- `'uq_employee_emergency_profile', ['employeeProfileId'], { unique: true }`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `employeeProfileId` | `employee_profile_id` | `uuid` | NN | FK to employee_profiles |
| `fullName` | `full_name` | `varchar` | - | Contact full name |
| `relationship` | `relationship` | `varchar` | - | Relationship to the employee |
| `mobile` | `mobile` | `varchar` | - | Mobile phone |
| `homePhone` | `home_phone` | `varchar` | - | Home phone |
| `email` | `email` | `varchar` | - | Email address |
| `address` | `address` | `varchar` | - | Address |

### Relations
- `OneToOne` `employeeProfile` → `EmployeeProfileEntity`

---

## EmployeeProfileEntity

- **Table:** `employee_profiles`
- **Source:** `apps/api/src/modules/rbac/employee/employee-profile.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** HR profile data for a user/employee. One-to-one with `users`; `users` stays auth-only.

### Indexes
- `'uq_employee_profile_user', ['userId'], { unique: true }`
- `'uq_employee_profile_org_code', ['organizationId', 'code'], { unique: true }`
- `'idx_employee_profile_org_job', ['organizationId', 'jobPositionId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `userId` | `user_id` | `uuid` | NN | FK to users — the authenticated identity this profile belongs to |
| `code` | `code` | `varchar` | NN | Employee code, unique per organization (e.g. NV000002) |
| `mobile` | `mobile` | `varchar` | - | Mobile phone number |
| `homePhone` | `home_phone` | `varchar` | - | Landline / home phone |
| `idCardNumber` | `id_card_number` | `varchar` | - | National ID / CMND number |
| `idCardIssuePlace` | `id_card_issue_place` | `varchar` | - | Place where the ID card was issued |
| `idCardIssueDate` | `id_card_issue_date` | `date` | - | Date the ID card was issued |
| `birthDate` | `birth_date` | `date` | - | Date of birth |
| `gender` | `gender` | `enum` | - | Gender |
| `maritalStatus` | `marital_status` | `enum` | - | Marital status |
| `employmentStatus` | `employment_status` | `enum` | NN, default: EmploymentStatus.OFFICIAL | HR employment status; independent from users.is_active (login flag) |
| `photoUrl` | `photo_url` | `varchar` | - | URL of the employee photo |
| `jobPositionId` | `job_position_id` | `uuid` | - | FK to job_positions |
| `probationDate` | `probation_date` | `date` | - | Probation start date |
| `officialDate` | `official_date` | `date` | - | Official employment start date |
| `salary` | `salary` | `numeric` | NN, default: 0 | Monthly salary |
| `deposit` | `deposit` | `numeric` | NN, default: 0 | Deposit held |
| `originalDocumentsNote` | `original_documents_note` | `varchar` | - | Notes on original documents on file |
| `accessMode` | `access_mode` | `enum` | NN, default: EmployeeAccessMode.FREE | Software access mode: free anytime or restricted to scheduled time slots |

### Relations
- `OneToOne` `user` → `UserEntity`
- `ManyToOne` `jobPosition` → `JobPositionEntity`
- `OneToMany` `addresses` → `EmployeeAddressEntity`
- `OneToOne` `emergencyContact` → `EmployeeEmergencyContactEntity`
- `OneToMany` `accessSchedule` → `EmployeeAccessScheduleEntity`

---

## InvoicePromotionEntity

- **Table:** `invoice_promotions`
- **Source:** `apps/api/src/modules/promotion/invoice-promotion.entity.ts`
- **Extends BaseEntity:** Yes

### Indexes
- `['invoiceId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `invoiceId` | `invoice_id` | `uuid` | NN | - |
| `promotionType` | `promotion_type` | `enum` | NN | - |
| `refId` | `ref_id` | `uuid` | NN | - |
| `discountAmount` | `discount_amount` | `numeric` | NN | - |
| `note` | `note` | `text` | - | - |

---

## JobPositionEntity

- **Table:** `job_positions`
- **Source:** `apps/api/src/modules/hr/job-position/job-position.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Job position / title an employee can hold (e.g. Cashier, Store Manager). Reference data, org-scoped.

### Indexes
- `'uq_job_position_org_name', ['organizationId', 'name'], { unique: true }`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `name` | `name` | `varchar` | NN | Human-readable position name; unique per organization |
| `code` | `code` | `varchar` | - | Optional short code |
| `description` | `description` | `varchar` | - | Optional description |
| `isActive` | `is_active` | `varchar` | NN, default: true | Inactive positions are hidden from assignment dropdowns |

---

## ProcessedEventEntity

- **Table:** `processed_events`
- **Source:** `apps/api/src/modules/events/entities/processed-event.entity.ts`
- **Extends BaseEntity:** No

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `topic` | `topic` | `varchar` | NN | - |
| `organizationId` | `organization_id` | `uuid` | - | - |
| `processedAt` | `processed_at` | `varchar` | NN | - |

---

## PromotionEntity

- **Table:** `promotions`
- **Source:** `apps/api/src/modules/promotion/promotion.entity.ts`
- **Extends BaseEntity:** Yes

### Indexes
- `['organizationId', 'isActive']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `name` | `name` | `varchar` | NN | - |
| `type` | `type` | `enum` | NN | - |
| `conditions` | `conditions` | `jsonb` | - | - |
| `benefits` | `benefits` | `jsonb` | - | - |
| `validFrom` | `valid_from` | `timestamptz` | NN | - |
| `validTo` | `valid_to` | `timestamptz` | NN | - |
| `applicableBranchIds` | `applicable_branch_ids` | `text` | NN, default: '{}' | - |
| `isActive` | `is_active` | `boolean` | NN, default: true | - |

---

## VoucherEntity

- **Table:** `vouchers`
- **Source:** `apps/api/src/modules/promotion/voucher.entity.ts`
- **Extends BaseEntity:** Yes

### Indexes
- `'uq_voucher_org_code', ['organizationId', 'code'], { unique: true }`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `code` | `code` | `varchar` | NN | - |
| `faceValue` | `face_value` | `numeric` | NN | - |
| `customerId` | `customer_id` | `uuid` | - | - |
| `validFrom` | `valid_from` | `timestamptz` | NN | - |
| `validTo` | `valid_to` | `timestamptz` | NN | - |
| `isUsed` | `is_used` | `boolean` | NN, default: false | - |
| `redeemedInvoiceId` | `redeemed_invoice_id` | `uuid` | - | - |
| `isActive` | `is_active` | `boolean` | NN, default: true | - |

---
