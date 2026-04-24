# Organization & Branch Module Entities

> Multi-tenant hierarchy. An **Organization** is the top-level tenant. Each org
> has one or more **Branches** (physical locations or logical divisions).
> **UserBranchAssignment** controls which branches a user can operate in.
> **RegistrationRequest** handles the self-service onboarding flow.

**Source paths:**
- `apps/api/src/modules/organization/`
- `apps/api/src/modules/branch/`
- `apps/api/src/modules/registration/`

---

## OrganizationEntity

**Table:** `organizations`
**Extends:** `BaseEntity`
**Description:** Top-level tenant entity. Every piece of business data in the system is scoped to exactly one organization. An organization can be suspended to block all access.

**Unique constraints:** `(name)` — organization names are globally unique.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `name` | `name` | `varchar` | NN, UQ | Legal or trading name of the business |
| `contactEmail` | `contact_email` | `varchar` | NN | Primary contact email for the organization |
| `contactPhone` | `contact_phone` | `varchar` | ? | Optional phone number for the organization |
| `mainBranchId` | `main_branch_id` | `uuid` | ? | FK → `branches.id`; the default/headquarters branch |
| `status` | `status` | `enum` | default: `ACTIVE` | Current lifecycle status of the organization |

### OrganizationStatus Enum

| Value | Description |
|-------|-------------|
| `ACTIVE` | Organization is operational; all features available |
| `SUSPENDED` | All access blocked; data preserved but users cannot log in |

---

## BranchEntity

**Table:** `branches`
**Extends:** `BaseEntity`
**Description:** A physical store, warehouse, or logical division within an organization. Branches form a tree via `parentBranchId` for multi-level hierarchies (e.g. regional office → store). Each branch has its own inventory, POS sessions, and financial data.

**Unique constraints:** `(organizationId, name)` — branch names are unique within an org.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `name` | `name` | `varchar` | NN, UQ per org | Display name of the branch (e.g. "Downtown Store") |
| `address` | `address` | `varchar` | ? | Physical address of the branch |
| `phone` | `phone` | `varchar` | ? | Branch phone number |
| `email` | `email` | `varchar` | ? | Branch contact email |
| `status` | `status` | `enum` | default: `ACTIVE` | Branch lifecycle status |
| `isMainBranch` | `is_main_branch` | `boolean` | default: `false` | If true, this is the organization's primary/headquarters branch |
| `parentBranchId` | `parent_branch_id` | `uuid` | ? | FK → `branches.id`; enables hierarchical branch structures |

### BranchStatus Enum

| Value | Description |
|-------|-------------|
| `ACTIVE` | Branch is operational |
| `SUSPENDED` | Branch is temporarily disabled |
| `ARCHIVED` | Branch is permanently closed; data retained for historical reporting |

**Relations:**
- `parentBranch` → `BranchEntity` (self-referencing ManyToOne)

---

## UserBranchAssignmentEntity

**Table:** `user_branch_assignments`
**Description:** Associates a user with a branch they are authorized to operate in. A user without any branch assignment cannot perform branch-scoped operations (POS, inventory, etc.). Tracks who made the assignment for audit purposes.

**Does NOT extend BaseEntity** — uses its own PK and timestamps.

**Unique constraints:** `(userId, branchId)` — a user can only be assigned to a branch once.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK | Surrogate key |
| `userId` | `user_id` | `uuid` | NN, FK → `users.id` | The user being assigned |
| `branchId` | `branch_id` | `uuid` | NN, FK → `branches.id` | The target branch |
| `organizationId` | `organization_id` | `uuid` | NN | Org context for the assignment |
| `assignedAt` | `assigned_at` | `timestamptz` | auto | When the assignment was created |
| `assignedBy` | `assigned_by` | `uuid` | NN, FK → `users.id` | Admin user who made the assignment |

---

## RegistrationRequestEntity

**Table:** `registration_requests`
**Extends:** `BaseEntity`
**Description:** Self-service registration workflow. A prospective organization submits a request (type `ORGANIZATION`) which is reviewed by a super-admin. After approval, the organization and its owner user are created. Branch-level registration follows the same flow.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `type` | `type` | `enum` | NN | Whether this is an organization or branch registration |
| `requestData` | `request_data` | `jsonb` | NN | Freeform JSON containing the submitted registration details (org name, owner email, etc.) |
| `status` | `status` | `enum` | default: `PENDING_APPROVAL` | Current state in the approval workflow |
| `reviewedBy` | `reviewed_by` | `uuid` | ? | FK → `users.id`; admin who approved or rejected |
| `reviewedAt` | `reviewed_at` | `timestamptz` | ? | When the review decision was made |
| `rejectionReason` | `rejection_reason` | `varchar` | ? | Explanation provided when the request is rejected |

### RegistrationType Enum (local)

| Value | Description |
|-------|-------------|
| `ORGANIZATION` | Request to create a new organization (tenant) |
| `BRANCH` | Request to add a new branch to an existing organization |

### RegistrationStatus Enum (shared)

| Value | Description |
|-------|-------------|
| `PENDING_APPROVAL` | Awaiting admin review |
| `APPROVED` | Accepted; org/branch has been provisioned |
| `REJECTED` | Denied with a reason |
| `RESUBMITTED` | Previously rejected, then re-submitted with corrections |
