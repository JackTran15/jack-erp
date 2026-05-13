# Inventory Setup Flow — Frontend Integration Guide

End-to-end onboarding flow for inventory data. This document walks through the **13 happy-path steps** plus common validation errors a frontend client must handle.

Source of truth: `apps/api/scripts/pos-e2e-py/test_inventory_setup_flow.py`.

---

## 1. Preconditions

- API base URL: `http://localhost:4000` (dev). Production URL TBD by env.
- Auth: Bearer access token (JWT). Refresh token kept in `localStorage("refresh_token")`. Access token is held in memory only.
- All requests go through the typed client wrapper (`erpApi` from `apps/*/src/lib/erp-api.ts`). The wrapper auto-injects:
  - `Authorization: Bearer <accessToken>`
  - `X-Branch-Id: <activeBranchId>`
  - `X-Request-Id: <uuid>` (per request)
  - `X-Idempotency-Key: <uuid>` (per POST/PATCH)

### Multi-tenant scoping rules

| Scope        | Header / Body                                                           | Notes                                           |
| ------------ | ----------------------------------------------------------------------- | ----------------------------------------------- |
| Organization | derived from JWT `organizationId`                                       | Items, providers, products are org-scoped only. |
| Branch       | `X-Branch-Id` header **and** `branchId` in body for branch-scoped POSTs | Storages, locations require `branchId` in body. |

> **Important**: Creating a new branch via `POST /branches` does **NOT** auto-grant the current access token access to that branch — its `branchIds` claim is fixed at login. To operate inside a new branch you must re-login (or refresh) so the JWT includes the new branch.

### TanStack Query keys

Use array keys starting with the resource name and include all filters. Invalidate by prefix.

```ts
queryKey: ["inventory-items", page, search]
queryKey: ["inventory-storages", branchId]
queryKey: ["inventory-providers"]
```

---

## 2. The 13-step happy path

The flow builds a complete inventory tree:

```
Branch
 └─ Storage (kho)
     └─ Location (kệ / thùng)
Provider (NCC)
Product (parent)
 └─ Variants (skipped — requires attributes)
Item (SKU)
 ├─ Item ↔ Provider link
 ├─ Barcode
 └─ Stock threshold (per location)
```

### Step 1 — Create branch

```
POST /branches
```

**Request body** (`CreateBranchDto`):

```json
{
  "name": "Chi nhánh test",
  "address": "optional, ≤ 500 chars",
  "phone": "optional, ≤ 30 chars",
  "email": "optional, valid email",
  "parentBranchId": "optional UUID"
}
```

- `name` is required, 2–200 chars.
- Server returns `201` with `{ id, name, status: "ACTIVE", ... }`.

**FE expectations**: store `branch.id`. Note: token does not yet have access to this branch — see preconditions.

---

### Step 2 — Create main storage (kho chính)

```
POST /inventory/storages
```

**Request body** (`CreateStorageDto`):

```json
{
  "name": "Kho chính",
  "branchId": "<branchId from token>",
  "isMainStorage": false
}
```

- `name` 1–200 chars, required.
- `branchId` must be one of `actor.branchIds` (enforced by `@RequireBranchScope()` / `BranchScopeGuard`).
- `isMainStorage`: at most one main storage per branch (HTTP `409` if duplicated, see step E03).

Returns `{ id, name, branchId, isMainStorage, ... }`.

---

### Step 3 — Create secondary storage (kho tạm)

Same endpoint as Step 2, send `isMainStorage: false`. Multiple secondary storages per branch are allowed.

---

### Step 4 — Create location inside main storage

```
POST /inventory/locations
```

**Request body** (`CreateLocationDto`):

```json
{
  "name": "Kệ A",
  "code": "RACK-A-01",
  "storageId": "<storageId>",
  "branchId": "<branchId>",
  "type": "RACK"
}
```

- `code` is **practically required** (DB column is `NOT NULL` from `InitSchema` migration even though DTO marks it optional). FE must always send a code.
- `code` 1–50 chars; `name` 1–200 chars.
- `type` enum (`LocationType`): `SHELF | RACK | BIN | ZONE`.
- `storageId` and `branchId` must belong to actor's accessible scope.

Returns `{ id, name, code, storageId, branchId, type, ... }`.

---

### Step 5 — Create location inside secondary storage

Same endpoint; pick a different `type` (e.g. `BIN`). Same DTO contract.

---

### Step 6 — Create provider (NCC)

```
POST /inventory/providers
```

**Request body** (`CreateProviderDto`):

```json
{
  "code": "NCC-001",
  "name": "Nhà cung cấp A",
  "email": "ncc@example.com",
  "phone": "0901234567",
  "notes": "ghi chú",
  "isActive": true
}
```

- `code` is required, 1–50 chars, **unique per organization** → `409` on conflict (step E05).
- `email` validated by `@IsEmail()` → `400` on invalid format (step E06).

Returns `{ id, code, name, email, phone, notes, isActive: true, ... }`.

---

### Step 7 — Create product (parent SKU group)

```
POST /products
```

**Request body** (`CreateProductDto`):

```json
{
  "name": "Sản phẩm test",
  "description": "optional, ≤ 1000 chars",
  "isActive": true,
  "defaultProviderId": "<providerId>"
}
```

- Organization-scoped (no `branchId`).
- `defaultProviderId` optional but recommended.

Returns `{ id, name, description, defaultProviderId, isActive, ... }`.

---

### Step 8 — (Optional) Generate variants

```
POST /products/:id/generate-variants
```

**Request body** (`GenerateVariantsDto`):

```json
{ "force": false }
```

- Requires the product to already have **attribute definitions + options** configured via `/products/:productId/attributes` endpoints.
- Without attributes, server returns `400` with message `"Sản phẩm chưa có thuộc tính nào..."`.

> **FE flow**: a typical UI flow is — create product → open attributes editor → add attributes & options → generate variants. The generate-variants button should be disabled until at least one attribute with options exists.

---

### Step 9 — Create standalone item (SKU)

```
POST /inventory/items
```

**Request body** (`CreateItemDto`):

```json
{
  "code": "SKU-001",
  "name": "Hàng hóa A",
  "unit": "cái",
  "sellingPrice": 150000,
  "purchasePrice": 100000,
  "isPosVisible": true,
  "description": "optional",
  "categoryId": "optional UUID",
  "isActive": true,
  "weightGram": 0,
  "lengthCm": 0,
  "widthCm": 0,
  "heightCm": 0,
  "manufactureYear": 2026,
  "composition": "optional, ≤ 2000 chars",
  "productId": "optional UUID — link to parent product"
}
```

Required fields: `code` (1–50), `name` (1–200), `unit` (1–50). All numerics must be ≥ 0. `manufactureYear` must be 1900–2100.

Money fields (`sellingPrice`, `purchasePrice`) stored as `numeric(18, 2)` server-side; the API may return strings — FE must `Number(...)` / `parseFloat(...)` before computing.

Returns `{ id, code, name, unit, sellingPrice, purchasePrice, ... }`.

---

### Step 10 — Link item ↔ provider

```
POST /inventory/items/:id/providers
```

**Request body** (`LinkItemProviderDto`):

```json
{ "providerId": "<providerId>", "isPrimary": true }
```

- At most one primary provider per item (server flips others to `false` when setting a new primary).
- Returns the link record `{ id, itemId, providerId, isPrimary, ... }`.

To list links:
```
GET /inventory/items/:id/providers
```
Returns an **array** (no pagination envelope).

To toggle primary on existing link:
```
PATCH /inventory/items/:id/providers/:providerId/set-primary
```

To unlink:
```
DELETE /inventory/items/:id/providers/:providerId   → 204
```

---

### Step 11 — Add barcode to item

```
POST /inventory/items/:id/barcodes
```

**Request body** (`CreateItemBarcodeDto`):

```json
{
  "code": "8934567890123",
  "notes": "primary barcode"
}
```

- `code` required, 1–100 chars (`@MinLength(1)` → step E09 returns `400` for empty string).

Returns `{ id, itemId, code, notes, ... }`.

**Barcode lookup** (used by POS scan):
```
GET /inventory/barcodes/lookup?code=<barcode>
```

Response shape (note: wraps the item):

```json
{
  "itemId": "<uuid>",
  "item": { "id": "<uuid>", "code": "SKU-001", "name": "...", ... }
}
```

FE must read `response.item.*` for item details, not `response.*`.

---

### Step 12 — Set stock threshold per location

```
PATCH /inventory/items/:id/thresholds/:locationId
```

**Request body** (`SetStockThresholdDto`):

```json
{ "minQty": 5, "maxQty": 100 }
```

- DTO field names are `minQty` / `maxQty` — **not** `minimumQuantity` / `maximumQuantity`.
- Both fields are optional (use `null` to clear); both must be ≥ 0 (step E10 returns `400` for negative).

Returns `{ itemId, locationId, minQty, maxQty, ... }`.

**Read endpoints**:
- `GET /inventory/items/:id/thresholds` — list all thresholds across locations.
- `GET /inventory/items/:id/thresholds/:locationId` — single record.

**Default threshold** (org/item-level fallback when no per-location threshold):
- `PATCH /inventory/items/:id/thresholds/default`

**Delete**:
- `DELETE /inventory/items/:id/thresholds/:locationId` → `204`.

---

### Step 13 — Verify listing endpoints

All list endpoints share the same paginated envelope:

```json
{
  "data": [ ... ],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

Endpoints to verify after a setup wizard:
- `GET /branches?page=1&pageSize=20`
- `GET /inventory/storages?branchId=<id>&page=1&pageSize=20`
- `GET /inventory/providers?page=1&pageSize=20&activeOnly=true`
- `GET /inventory/items?page=1&pageSize=20`

> **Gotcha (critical for FE)**: inventory controllers type the query as `PaginationQueryDto & { branchId?: string }`. TypeScript intersection types lose Nest's reflect metadata, so the `ValidationPipe` `transform` does **not** run — `page` defaults to `undefined` instead of `1`, causing `skip = NaN` and a broken query.
>
> **FE must always send `page` and `pageSize` explicitly** on inventory list calls. Recommended defaults: `page=1, pageSize=20`. `pageSize` is capped at `100` by `@Max(100)`.

---

## 3. Validation errors to handle in the UI

These cases match the `test_e0*` tests at the bottom of the e2e file. FE should surface server messages (Vietnamese-ready) and show inline field errors when available.

| #   | Scenario                             | Endpoint                                                | HTTP           | Server signal                         | FE UX                                              |
| --- | ------------------------------------ | ------------------------------------------------------- | -------------- | ------------------------------------- | -------------------------------------------------- |
| E01 | Branch name < 2 chars                | `POST /branches`                                        | `400`          | `@MinLength(2)` on `name`             | Inline error on the `name` field                   |
| E02 | Missing `branchId` on storage create | `POST /inventory/storages`                              | `400`          | `@IsUUID branchId`                    | Disable Submit until branch picker has a value     |
| E03 | 2nd main storage in same branch      | `POST /inventory/storages` (with `isMainStorage: true`) | `409`          | `"main storage"` in error message     | Show toast: "Chi nhánh này đã có kho chính"        |
| E04 | `storageId` does not exist           | `POST /inventory/locations`                             | `400` or `404` | service throws when storage not found | Toast: "Không tìm thấy kho", re-fetch storage list |
| E05 | Provider `code` already used in org  | `POST /inventory/providers`                             | `409`          | unique index violation                | Inline error on the `code` field                   |
| E06 | Invalid email format on provider     | `POST /inventory/providers`                             | `400`          | `@IsEmail()`                          | Inline error on the `email` field                  |
| E07 | Missing `unit` on item create        | `POST /inventory/items`                                 | `400`          | `@IsString unit`                      | Required-field validation in form                  |
| E08 | Linking item to nonexistent provider | `POST /inventory/items/:id/providers`                   | `400` or `404` | provider lookup fails                 | Toast + invalidate provider list                   |
| E09 | Empty barcode `code`                 | `POST /inventory/items/:id/barcodes`                    | `400`          | `@MinLength(1)`                       | Inline error on barcode input                      |
| E10 | Negative `minQty` on threshold       | `PATCH /inventory/items/:id/thresholds/:locationId`     | `400`          | `@Min(0)`                             | Inline error; min/max inputs `min=0`               |

### Standard error envelope

NestJS `HttpException` returns:

```json
{
  "statusCode": 400,
  "message": ["unit must be a string"],   // or string for single message
  "error": "Bad Request",
  "timestamp": "2026-05-13T08:00:00.000Z",
  "path": "/inventory/items"
}
```

The `erpApi` wrapper exposes this as `HttpError` with `.status` and `.body`. Use `requireErpData(...)` to throw on error, or branch on `.success === false` in raw calls.

---

## 4. Recommended FE wizard flow

A reasonable "first-time setup" UI follows the same order as the e2e:

1. **Branches** page → create branches → user must re-login to access new branches.
2. **Storages** page (per branch) → create one main + N secondary storages.
3. **Locations** page (per storage) → create racks/bins inside each storage.
4. **Providers** page → create suppliers.
5. **Products** page → create parent products → optionally add attributes & generate variants.
6. **Items** page → create standalone SKUs (or use variant generation).
7. **Item detail** page tabs:
   - **Suppliers tab** → link providers, set one primary.
   - **Barcodes tab** → add/remove barcodes.
   - **Thresholds tab** → set min/max per location.

Each step should invalidate the relevant TanStack Query cache key on success.

---

## 5. Quick reference — endpoint summary

| Resource         | List                                  | Get                                               | Create                                          | Update                                                         | Delete                                               |
| ---------------- | ------------------------------------- | ------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| Branches         | `GET /branches`                       | `GET /branches/:id`                               | `POST /branches`                                | `PATCH /branches/:id`                                          | n/a (archive/suspend instead)                        |
| Storages         | `GET /inventory/storages`             | `GET /inventory/storages/:id`                     | `POST /inventory/storages`                      | `PATCH /inventory/storages/:id`                                | —                                                    |
| Locations        | `GET /inventory/locations`            | `GET /inventory/locations/:id`                    | `POST /inventory/locations`                     | `PATCH /inventory/locations/:id`                               | —                                                    |
| Providers        | `GET /inventory/providers`            | `GET /inventory/providers/:id`                    | `POST /inventory/providers`                     | `PATCH /inventory/providers/:id`                               | `DELETE /inventory/providers/:id` (deactivate)       |
| Products         | `GET /products`                       | `GET /products/:id`                               | `POST /products`                                | `PATCH /products/:id`                                          | —                                                    |
| Items            | `GET /inventory/items`                | `GET /inventory/items/:id`                        | `POST /inventory/items`                         | `PATCH /inventory/items/:id`                                   | —                                                    |
| Item ↔ Provider  | `GET /inventory/items/:id/providers`  | —                                                 | `POST /inventory/items/:id/providers`           | `PATCH /inventory/items/:id/providers/:providerId/set-primary` | `DELETE /inventory/items/:id/providers/:providerId`  |
| Barcodes         | `GET /inventory/items/:id/barcodes`   | `GET /inventory/barcodes/lookup?code=`            | `POST /inventory/items/:id/barcodes`            | —                                                              | `DELETE /inventory/items/:id/barcodes/:barcodeId`    |
| Stock thresholds | `GET /inventory/items/:id/thresholds` | `GET /inventory/items/:id/thresholds/:locationId` | `PATCH /inventory/items/:id/thresholds/default` | `PATCH /inventory/items/:id/thresholds/:locationId`            | `DELETE /inventory/items/:id/thresholds/:locationId` |

---

## 6. Related references

- DTO source: `apps/api/src/modules/branch/dto/`, `apps/api/src/modules/inventory/location/dto/`, `apps/api/src/modules/inventory/product/dto/`.
- Controllers: `apps/api/src/modules/branch/branch.controller.ts`, `apps/api/src/modules/inventory/location/inventory-location.controller.ts`, `apps/api/src/modules/inventory/product/product.controller.ts`.
- E2E test: `apps/api/scripts/pos-e2e-py/test_inventory_setup_flow.py`.
- Swagger UI: `http://localhost:4000/docs` (dev only) — interactive request/response schema.
- Typed FE client: `packages/api-client/src/generated/schema.ts` (regenerate with `pnpm openapi:generate`).
