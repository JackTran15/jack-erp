# Temp Warehouse — Partial Transfer & Carrier Picker (FE Integration)

> **Audience:** Frontend developers wiring up the partial-transfer action and the carrier picker inside the "Phiên chuyển kho tạm" feature.
> **Backend module:** `apps/api/src/modules/inventory/temp-warehouse/`
> **Companion doc:** [`temp-warehouse-api-flow.md`](./temp-warehouse-api-flow.md) — session lifecycle, line CRUD, and `closeSession`.
> **Last updated:** 2026-05-17

---

## 1. Scope

This doc covers two endpoints added in branch `ERP-15052026`:

| #   | Endpoint                                                     | Purpose                                                                                                  |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1   | `POST /inventory/temp-warehouse/sessions/:id/transfer-lines` | Materialize a chosen subset of ACTIVE lines into real stock transfer(s) **without closing the session**. |
| 2   | `GET /inventory/temp-warehouse/carriers`                     | List active users assigned to a branch — feeds the carrier dropdown when adding/editing a line.          |

Both endpoints sit under the same controller (`temp-warehouse.controller.ts`) and share the standard auth + branch-scoping conventions described in §2.

---

## 2. Auth & headers

Every request requires:

```
Authorization: Bearer <JWT>
X-Branch-Id:   <activeBranchId>
X-Request-Id:  <uuid v4 per request>
```

For `transfer-lines`, also send:

```
X-Idempotency-Key: <uuid v4 per user action>
```

Replays with the same idempotency key + same body within 24h get the original response back. See §3.4 for what makes the request *itself* idempotent at the domain level.

Required permissions:

| Endpoint                  | Permission                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `POST .../transfer-lines` | `inventory.temp-warehouse.close`                                                                                |
| `GET .../carriers`        | `inventory.temp-warehouse.read` (+ `@RequireBranchScope()`, so `branchId` must be in the actor's `branchIds[]`) |

---

## 3. `POST /inventory/temp-warehouse/sessions/:id/transfer-lines`

### 3.1 What it does

Takes a list of ACTIVE line IDs in the given session, splits them by direction (W→S vs S→W), and publishes one Kafka event per direction onto `temp-warehouse.transfer.requested`. A consumer then creates → approves → posts a real `StockTransfer` for each direction and flips the listed lines from `ACTIVE` to `TRANSFERRED`, recording the resulting `transferId` on each line.

The session **stays ACTIVE** — staff can keep logging more lines, and run more partial transfers later.

Returns **`202 Accepted`** — the stock transfers are created asynchronously.

### 3.2 Request

```http
POST /inventory/temp-warehouse/sessions/8e9c…/transfer-lines
Content-Type: application/json
X-Idempotency-Key: 7c1f…

{
  "lineIds": [
    "a1b2c3d4-e5f6-7890-abcd-1234567890aa",
    "a1b2c3d4-e5f6-7890-abcd-1234567890bb"
  ],
  "notes": "Chuyển sớm các đôi giày size 39"
}
```

Body schema (`TransferTempWarehouseLinesDto`):

| Field     | Type              | Required | Constraints                                                            |
| --------- | ----------------- | -------- | ---------------------------------------------------------------------- |
| `lineIds` | `string[]` (UUID) | yes      | 1–500 items; each must exist in the session and have `status = ACTIVE` |
| `notes`   | `string`          | no       | ≤ 500 chars; attached to the resulting StockTransfer's `notes` field   |

### 3.3 Response — `202 Accepted`

```json
{
  "session": {
    "id": "8e9c…",
    "status": "ACTIVE",
    "branchId": "…",
    "warehouseLocationId": "…",
    "showroomLocationId": "…",
    "transferProcessingStatus": "NONE",
    "openedAt": "2026-05-17T08:00:00.000Z",
    "…": "…"
  },
  "publishedEvents": [
    {
      "direction": "warehouse_to_showroom",
      "eventId": "f3a8…",
      "lineIds": ["a1b2…aa", "a1b2…bb"]
    }
  ]
}
```

Notes:
- `session.transferProcessingStatus` is **not** mutated by partial transfers — that field tracks `closeSession(CREATE_TRANSFERS)` only.
- `publishedEvents` contains one entry per direction that had at least one line. If you submitted only W→S lines, only one entry appears.
- `lineIds` inside `publishedEvents` is the **sorted, de-duplicated** subset for that direction (the same canonicalization used to derive `eventId`).

### 3.4 Idempotency — two layers

1. **Interceptor (HTTP layer):** `X-Idempotency-Key` + body hash, 24h cache via Redis. Any retry with the same key + body replays the original 202.
2. **Domain (event layer):** `eventId` is deterministic on `(sessionId, direction, sha256(sorted lineIds))`. Submitting the **same subset** again — even without an idempotency key, or after Redis expiry — produces the same `eventId`, which the consumer dedupes via `processed_events`. So no duplicate StockTransfer is ever created for the same subset.

This means:
- ✅ Re-sending `[lineA, lineB]` is safe at any time.
- ✅ Re-sending `[lineB, lineA]` (different order) is treated as the same request — same hash, same `eventId`.
- ⚠️ Sending `[lineA, lineB]` then `[lineA, lineC]` is **two different transfers** — `lineA` was already flipped to `TRANSFERRED` after the first call, so the second call will fail validation (see §3.5, `TEMP_WAREHOUSE_LINES_NOT_TRANSFERABLE`).

### 3.5 Errors

| HTTP  | `code`                                      | When                                                                                                                                              |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400` | `TEMP_WAREHOUSE_LINES_NOT_FOUND_IN_SESSION` | One or more `lineIds` don't exist under this session+org. Response includes `missingLineIds: string[]`.                                           |
| `400` | `TEMP_WAREHOUSE_LINES_NOT_TRANSFERABLE`     | At least one line is not in status `ACTIVE` (typically already `DELETED` or `TRANSFERRED`). Response includes `offendingLines: { id, status }[]`. |
| `404` | `TEMP_WAREHOUSE_SESSION_NOT_FOUND`          | Session id doesn't exist in the actor's org.                                                                                                      |
| `409` | `TEMP_WAREHOUSE_SESSION_CLOSED`             | Session is not `ACTIVE` (closed sessions cannot receive partial transfers — use the regular flow).                                                |

All errors follow the project's standard envelope (`{ statusCode, code, message, …extras }`) and surface through `requireErpData`'s `HttpError`.

### 3.6 Effect on a line's lifecycle

```
ACTIVE  ──── POST transfer-lines ──▶  (consumer creates StockTransfer)  ──▶  TRANSFERRED
                                                                              └── line.transferId = <stock_transfer.id>
```

Once a line is `TRANSFERRED`:
- It is **excluded** from `GET /lines` (raw mode) and from `GET /sessions/:id`.
- It is **excluded** from the netted view (`hideOffsetting=true`).
- It is **excluded** from the AUTO_BALANCED computation if the session is later closed with `NET_OFFSET`.

In short, transferred lines drop out of the working set entirely.

### 3.7 Sequence

```text
FE ── POST /sessions/:id/transfer-lines ──▶ API
                                            │ validate lines (ACTIVE, in session)
                                            │ split by direction
                                            │ build deterministic eventId per direction
                                            │ publish to temp-warehouse.transfer.requested
                                            ▼
                                       Kafka topic
                                            │
                                            ▼
                              TempWarehouseTransferConsumer
                                            │ (kind=PARTIAL branch)
                                            │ StockTransferService.create → approve → post
                                            │ markLinesTransferred(lineIds, transferId)
                                            ▼
                              temp_warehouse_lines updated: status=TRANSFERRED, transfer_id=<id>
```

The 202 returns before the consumer runs. FE should:
1. Optimistically remove the transferred lines from the local list.
2. Invalidate the lines query (see §5) to pull the server's truth.
3. Optionally poll/refetch `GET /sessions/:id` if you want to surface the resulting `transferId` per line (the line entity now carries `transferId`).

### 3.8 cURL

```bash
curl -X POST "$API/inventory/temp-warehouse/sessions/$SESSION_ID/transfer-lines" \
  -H "Authorization: Bearer $JWT" \
  -H "X-Branch-Id: $BRANCH_ID" \
  -H "X-Request-Id: $(uuidgen)" \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{
    "lineIds": ["a1b2c3d4-e5f6-7890-abcd-1234567890aa"],
    "notes": "Chuyển sớm"
  }'
```

---

## 4. `GET /inventory/temp-warehouse/carriers`

### 4.1 What it does

Returns active users assigned to the given `branchId` (via `user_branch_assignments`), filtered to the actor's organization and optionally narrowed by a free-text search. Feeds the **carrier picker** on the add-line / edit-line forms.

### 4.2 Request

```http
GET /inventory/temp-warehouse/carriers?branchId=…&search=tran&page=1&pageSize=50
```

Query schema (`ListCarriersQueryDto`):

| Field      | Type      | Required | Default | Notes                                                                             |
| ---------- | --------- | -------- | ------- | --------------------------------------------------------------------------------- |
| `branchId` | UUID      | yes      | —       | Must be one of the actor's `branchIds[]` — `@RequireBranchScope()` enforces this. |
| `search`   | string    | no       | —       | ILIKE match on `firstName`, `lastName`, or `email`. ≤ 100 chars.                  |
| `page`     | int ≥ 1   | no       | `1`     |                                                                                   |
| `pageSize` | int 1–200 | no       | `50`    |                                                                                   |

### 4.3 Response — `200 OK`

```json
{
  "data": [
    {
      "id": "u1…",
      "firstName": "Trần",
      "lastName": "Văn A",
      "email": "tran.a@company.vn"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 50
}
```

`data[]` is `PublicUser[]` — the same shape used inline on line responses (`line.carrier`) and netted view responses (`items[].carriers`). Sorted by `firstName ASC, lastName ASC`.

### 4.4 Errors

| HTTP  | `code`                                          | When                                         |
| ----- | ----------------------------------------------- | -------------------------------------------- |
| `400` | validation envelope from `ValidationPipe`       | Bad UUID, `pageSize > 200`, etc.             |
| `403` | `BRANCH_SCOPE_DENIED` (from `BranchScopeGuard`) | `branchId` not in the actor's `branchIds[]`. |

Returns empty `data: []` (with correct `total: 0`) when no user matches — not 404.

### 4.5 cURL

```bash
curl "$API/inventory/temp-warehouse/carriers?branchId=$BRANCH_ID&search=tran" \
  -H "Authorization: Bearer $JWT" \
  -H "X-Branch-Id: $BRANCH_ID" \
  -H "X-Request-Id: $(uuidgen)"
```

---

## 5. TanStack Query keys & invalidation

Recommended query keys (follow the project convention of resource-name prefix + all filters):

```ts
// Carrier picker
["temp-warehouse", "carriers", branchId, search ?? "", page, pageSize] as const

// Lines (existing — referenced here for invalidation guidance)
["temp-warehouse", "lines", { sessionId, branchId, status, direction, hideOffsetting, hideBalanced, page, pageSize }] as const

// Session
["temp-warehouse", "session", sessionId] as const
```

After a successful `POST .../transfer-lines`, invalidate by prefix to refresh anything that depends on the working set:

```ts
queryClient.invalidateQueries({ queryKey: ["temp-warehouse", "lines"] });
queryClient.invalidateQueries({ queryKey: ["temp-warehouse", "session", sessionId] });
```

The carrier list does **not** change on transfer — no need to invalidate it.

---

## 6. Typed client usage

Both endpoints are reachable through the generated `@erp/api-client` after running `pnpm openapi:generate`. Wrap calls in `requireErpData`:

```ts
import { erpApi, requireErpData } from "../lib/erp-api";
import type {
  TransferTempWarehouseLinesDto,
  PublicUser,
} from "@erp/api-client";

// Partial transfer
const result = await requireErpData(
  erpApi.inventoryTempWarehouse.transferLines({
    id: sessionId,
    transferTempWarehouseLinesDto: { lineIds, notes },
  }),
);

// Carriers
const carriers = await requireErpData(
  erpApi.inventoryTempWarehouse.listCarriers({
    branchId,
    search,
    page,
    pageSize,
  }),
);
```

Headers (`Authorization`, `X-Branch-Id`, `X-Request-Id`, `X-Idempotency-Key`) are auto-injected by the `erpApi` wrapper.

---

## 7. Quick reference — line statuses after each action

| Action                                               | Resulting line status                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `POST /lines`                                        | `ACTIVE`                                                                                 |
| `PATCH /lines/:id`                                   | old → `DELETED` (with `supersededById`), new → `ACTIVE`                                  |
| `DELETE /lines/:id`                                  | `DELETED`                                                                                |
| `POST /sessions/:id/close` mode = `NET_OFFSET`       | originals stay `ACTIVE`; compensating lines inserted with `AUTO_BALANCED`                |
| `POST /sessions/:id/close` mode = `CREATE_TRANSFERS` | lines stay `ACTIVE`; session-level `transferW2sId`/`transferS2wId` populated by consumer |
| **`POST /sessions/:id/transfer-lines`**              | **listed lines flip from `ACTIVE` to `TRANSFERRED`; each gets `line.transferId`**        |

Once `TRANSFERRED`, a line is no longer part of the working set and is filtered out of all list/aggregation endpoints.
