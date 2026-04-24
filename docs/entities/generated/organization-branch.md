# Organization & Branch Entities

Generated from `docs/entities/entity-manifest.json`.

Total entities: **4**

---

## BranchEntity

- **Table:** `branches`
- **Source:** `apps/api/src/modules/branch/branch.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Physical store, warehouse, or logical division within an organization. Supports tree hierarchy via parentBranchId.

### Unique Constraints
- `['organizationId', 'name']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `name` | `name` | `varchar` | NN | Display name of the branch |
| `address` | `address` | `varchar` | - | Physical address of the branch |
| `phone` | `phone` | `varchar` | - | Branch phone number |
| `email` | `email` | `varchar` | - | Branch contact email |
| `status` | `status` | `enum` | NN, default: BranchStatus.ACTIVE | Branch lifecycle status (ACTIVE, SUSPENDED, ARCHIVED) |
| `isMainBranch` | `is_main_branch` | `varchar` | NN, default: false | If true, this is the organizations primary/headquarters branch |
| `parentBranchId` | `parent_branch_id` | `uuid` | - | FK to branches — enables hierarchical branch structures |

### Relations
- `ManyToOne` `parentBranch` → `BranchEntity`

---

## OrganizationEntity

- **Table:** `organizations`
- **Source:** `apps/api/src/modules/organization/organization.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Top-level tenant entity. All business data is scoped to one organization.

### Unique Constraints
- `['name']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `name` | `name` | `varchar` | NN | Legal or trading name of the business; globally unique |
| `contactEmail` | `contact_email` | `varchar` | NN | Primary contact email for the organization |
| `contactPhone` | `contact_phone` | `varchar` | - | Optional phone number |
| `mainBranchId` | `main_branch_id` | `uuid` | - | FK to branches — the default/headquarters branch |
| `status` | `status` | `enum` | NN, default: OrganizationStatus.ACTIVE | Current lifecycle status; SUSPENDED blocks all access |

---

## RegistrationRequestEntity

- **Table:** `registration_requests`
- **Source:** `apps/api/src/modules/registration/registration-request.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Self-service registration workflow for new organizations or branches.

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `type` | `type` | `enum` | NN | Whether this is an organization or branch registration |
| `requestData` | `request_data` | `jsonb` | NN | Freeform JSON containing submitted registration details (org name, owner email, etc.) |
| `status` | `status` | `enum` | NN, default: RegistrationStatus.PENDING_APPROVAL | Current state in the approval workflow |
| `reviewedBy` | `reviewed_by` | `uuid` | - | Admin who approved or rejected the request |
| `reviewedAt` | `reviewed_at` | `timestamptz` | - | When the review decision was made |
| `rejectionReason` | `rejection_reason` | `varchar` | - | Explanation provided when the request is rejected |

---

## UserBranchAssignmentEntity

- **Table:** `user_branch_assignments`
- **Source:** `apps/api/src/modules/branch/user-branch-assignment.entity.ts`
- **Extends BaseEntity:** No
- **Description:** Associates a user with a branch they are authorized to operate in.

### Unique Constraints
- `['userId', 'branchId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK, NN | - |
| `userId` | `user_id` | `uuid` | NN | The user being assigned to a branch |
| `branchId` | `branch_id` | `uuid` | NN | The target branch |
| `organizationId` | `organization_id` | `uuid` | NN | Organization scope for tenant isolation |
| `assignedAt` | `assigned_at` | `varchar` | NN | When the assignment was created |
| `assignedBy` | `assigned_by` | `uuid` | NN | Admin user who made the assignment |

---
