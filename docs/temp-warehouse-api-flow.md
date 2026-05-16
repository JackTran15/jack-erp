# Temp Warehouse API — Flow & Contract (for Frontend)

> **Audience:** Frontend developers building the "Phiên chuyển kho tạm" feature.
> **Backend module:** `apps/api/src/modules/inventory/temp-warehouse/`
> **Last updated:** 2026-05-16

---

## 1. Overview

A **temp warehouse session** captures every stock movement between a branch's **main warehouse** and **main showroom** during one shift. Throughout the shift, staff log each item moved as a **line** (1 line = 1 unit, quantity is always `1`). At the end of the shift, the session is **closed** in one of three modes that decide what happens with those movements.

### 1.1 What FE owns

| Action | API call |
|---|---|
| Resume the current shift / open a new one (auto) | `GET /inventory/temp-warehouse/sessions/active` (404 ⇒ no session yet) |
| Log a move (warehouse ↔ showroom) | `POST /inventory/temp-warehouse/lines` |
| Edit a logged line (wrong item / carrier / notes) | `PATCH /inventory/temp-warehouse/lines/:id` |
| Remove a logged line | `DELETE /inventory/temp-warehouse/lines/:id` |
| Show movement history (raw or netted) | `GET /inventory/temp-warehouse/lines` |
| End the shift | `POST /inventory/temp-warehouse/sessions/:id/close` |
| Resume a CLOSED session for review | `GET /inventory/temp-warehouse/sessions/:id` |

### 1.2 Key business rules

- **One ACTIVE session per branch** (DB partial unique index). The session is **opened lazily** the first time a line is added — FE never POSTs to open.
- **Quantity is always 1.** Each `POST /lines` adds exactly one unit. To move 5 of an item, call `POST /lines` 5 times.
- **Lines are immutable in spirit** — PATCH soft-deletes the old line (`status = DELETED`, `supersededById = newLineId`) and creates a new ACTIVE one. Same for DELETE (`status = DELETED`).
- **Direction is immutable.** PATCH cannot change `direction` — to flip a movement, DELETE the wrong line and POST a new one.
- **Closing is final.** A CLOSED session cannot reopen. Lines in a CLOSED session cannot be edited or deleted.

---

## 2. Auth & headers

Every request needs:

```
Authorization: Bearer <JWT>
X-Branch-Id:   <UUID — the active branch>
X-Idempotency-Key: <UUID — recommended for POST /lines and /close>
Content-Type:  application/json
```

`X-Idempotency-Key` is optional but **strongly recommended for `POST /lines`** (retry-safe). Same key + same body within 24h replays the original response without creating duplicate lines.

### Required permissions

| Endpoint | Permission key |
|---|---|
| `GET /inventory/temp-warehouse/sessions/*`, `GET /inventory/temp-warehouse/lines` | `inventory.temp-warehouse.read` |
| `POST /inventory/temp-warehouse/lines`, `PATCH /inventory/temp-warehouse/lines/:id`, `DELETE /inventory/temp-warehouse/lines/:id` | `inventory.temp-warehouse.write` |
| `POST /inventory/temp-warehouse/sessions/:id/close` | `inventory.temp-warehouse.close` |

---

## 3. State machines

### 3.1 Session

```
                ┌──────────┐  POST /lines (first call)         ┌──────────┐
                │  (none)  │ ────────────────────────────────► │  ACTIVE  │
                └──────────┘                                   └────┬─────┘
                                                                    │ POST /sessions/:id/close
                                                                    ▼
                                                              ┌──────────┐
                                                              │  CLOSED  │
                                                              └──────────┘
```

When `closeMode = CREATE_TRANSFERS`, the session also tracks a side state machine for the async transfer creation:

```
transferProcessingStatus:  NONE → PENDING → COMPLETED  (happy path)
                                       ↘
                                         FAILED       (consumer error — see `transferFailureReason`)
```

### 3.2 Line

```
                                  PATCH /lines/:id
                                  DELETE /lines/:id
        ┌──────────┐ POST /lines  ┌──────────┐                ┌──────────┐
        │  (none)  │ ───────────► │  ACTIVE  │ ─────────────► │ DELETED  │
        └──────────┘              └──────────┘                └──────────┘

                                  Close session, mode = NET_OFFSET
                                  (system-generated lines only — never seen at POST)
                                                              ┌────────────────┐
                                                              │ AUTO_BALANCED  │
                                                              └────────────────┘
```

---

## 4. DTOs

### 4.1 Enums (from `@erp/shared-interfaces`)

```ts
export enum TempWarehouseSessionStatus { ACTIVE = 'ACTIVE', CLOSED = 'CLOSED' }
export enum TempWarehouseLineStatus    { ACTIVE = 'ACTIVE', DELETED = 'DELETED', AUTO_BALANCED = 'AUTO_BALANCED' }
export enum TempWarehouseDirection     {
  WAREHOUSE_TO_SHOWROOM = 'warehouse_to_showroom',   // "Chuyển ra showroom"
  SHOWROOM_TO_WAREHOUSE = 'showroom_to_warehouse',   // "Trả về kho"
}
export enum TempWarehouseCloseMode {
  NET_OFFSET       = 'NET_OFFSET',         // Auto-balance, no real transfer
  CREATE_TRANSFERS = 'CREATE_TRANSFERS',   // Publish events → real StockTransfer
  NONE             = 'NONE',               // Close the books, do nothing else
}
export enum TempWarehouseTransferProcessingStatus {
  NONE = 'NONE', PENDING = 'PENDING', COMPLETED = 'COMPLETED', FAILED = 'FAILED',
}
```

### 4.2 Session response shape

```ts
interface TempWarehouseSession {
  id: string;                     // UUID
  organizationId: string;
  branchId: string;
  status: TempWarehouseSessionStatus;
  closeMode: TempWarehouseCloseMode | null;        // null while ACTIVE
  warehouseLocationId: string;                     // resolved at open
  showroomLocationId: string;                      // resolved at open
  openedBy: string;
  openedAt: string;                                // ISO timestamp
  closedBy: string | null;
  closedAt: string | null;                         // ISO
  transferProcessingStatus: TempWarehouseTransferProcessingStatus;
  transferW2sId: string | null;                    // FK stock_transfers, set by consumer
  transferS2wId: string | null;
  transferFailureReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lines?: TempWarehouseLine[];                     // only on GET /sessions/:id
}
```

### 4.3 Line response shape

```ts
interface TempWarehouseLine {
  id: string;
  organizationId: string;
  branchId: string;
  sessionId: string;
  itemId: string;
  direction: TempWarehouseDirection;
  quantity: string;                                // "1.00" — always 1, returned as numeric string
  carrierUserId: string | null;
  status: TempWarehouseLineStatus;
  supersededById: string | null;                   // set when PATCH replaces this line
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;

  // Inline-joined fields — present on list/get endpoints only (not on POST /lines response)
  carrier: PublicUser | null;
  item: PublicItem | null;
  sourceLocation: PublicLocation | null;
  destinationLocation: PublicLocation | null;
}

interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface PublicItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  variantLabel: string | null;
}

interface PublicLocation {
  id: string;
  code: string;
  name: string;
}
```

---

## 5. Endpoint reference

### 5.1 `GET /inventory/temp-warehouse/sessions/active?branchId=…`

Get the currently-open session for a branch. Return **404** if none — FE should treat that as "no shift in progress yet".

**Query**

| Name | Type | Required | Notes |
|---|---|---|---|
| `branchId` | UUID | yes | The branch whose session we want |

**Response 200** — `TempWarehouseSession` (without `lines`)

```json
{
  "id": "be0a…",
  "organizationId": "10000000-…",
  "branchId": "20000000-…",
  "status": "ACTIVE",
  "closeMode": null,
  "warehouseLocationId": "60000000-…-001",
  "showroomLocationId":  "60000000-…-003",
  "openedBy": "30000000-…",
  "openedAt": "2026-05-16T01:55:00.000Z",
  "closedBy": null,
  "closedAt": null,
  "transferProcessingStatus": "NONE",
  "transferW2sId": null,
  "transferS2wId": null,
  "transferFailureReason": null,
  "notes": null,
  "createdAt": "2026-05-16T01:55:00.000Z",
  "updatedAt": "2026-05-16T01:55:00.000Z",
  "createdBy": "30000000-…"
}
```

**Response 404**

```json
{
  "statusCode": 404,
  "code": "TEMP_WAREHOUSE_NO_ACTIVE_SESSION",
  "message": "Branch 20000000-… has no ACTIVE temp warehouse session"
}
```

---

### 5.2 `POST /inventory/temp-warehouse/lines`

Add a line. If no ACTIVE session exists for the branch, **the service opens one automatically** — both the new session and the new line are returned.

**Body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `branchId` | UUID | yes | Must match `X-Branch-Id` |
| `itemId` | UUID | yes | The item being moved |
| `direction` | `TempWarehouseDirection` | no | Lowercase enum value. **Omit to auto-resolve** from item stock balance (see below). |
| `carrierUserId` | UUID | no | Who physically moved the item |
| `notes` | string | no | Free text |

> **No `quantity` field.** Each call always logs 1 unit. To move 5 ⇒ call 5 times. Sending `quantity` ⇒ 400 (`forbidNonWhitelisted`).

> **Auto-resolve `direction`:** when omitted, the service looks up `stock_balances` for the item at the branch's main warehouse vs main showroom location.
> - Only warehouse has `quantity > 0` ⇒ `direction = warehouse_to_showroom`.
> - Only showroom has `quantity > 0` ⇒ `direction = showroom_to_warehouse`.
> - Both ⇒ 400 `TEMP_WAREHOUSE_DIRECTION_AMBIGUOUS` — FE must resend with explicit `direction`.
> - Neither ⇒ 400 `TEMP_WAREHOUSE_ITEM_NO_STOCK`.

```json
{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "itemId":   "70000000-0000-4000-8000-000000000002",
  "direction": "warehouse_to_showroom",
  "carrierUserId": "30000000-0000-4000-8000-000000000001",
  "notes": "Khách hỏi mẫu size 40"
}
```

**Response 200**

```json
{
  "session": {
    "id": "be0a…",
    "status": "ACTIVE",
    "branchId": "20000000-…",
    "warehouseLocationId": "60000000-…-001",
    "showroomLocationId":  "60000000-…-003",
    "...": "…"
  },
  "line": {
    "id": "f3a1…",
    "sessionId": "be0a…",
    "itemId": "70000000-…-002",
    "direction": "warehouse_to_showroom",
    "quantity": "1.00",
    "carrierUserId": "30000000-…",
    "status": "ACTIVE",
    "supersededById": null,
    "notes": "Khách hỏi mẫu size 40",
    "createdAt": "2026-05-16T02:01:14.512Z"
  }
}
```

**Common errors**

| Status | `code` | When |
|---|---|---|
| 400 | (validation) | Missing required field, invalid UUID, or stray `quantity` |
| 400 | `TEMP_WAREHOUSE_BRANCH_MISSING_MAIN_STORAGE` | Branch has no main storage configured |
| 400 | `TEMP_WAREHOUSE_BRANCH_MISSING_MAIN_SHOWROOM` | Branch has no main showroom configured |
| 400 | `TEMP_WAREHOUSE_ITEM_NO_STOCK` | `direction` omitted and item has no stock at either main warehouse or main showroom |
| 400 | `TEMP_WAREHOUSE_DIRECTION_AMBIGUOUS` | `direction` omitted and item has stock at both — FE must resend with explicit `direction` |
| 403 | — | Missing `inventory.temp-warehouse.write` |

---

### 5.3 `PATCH /inventory/temp-warehouse/lines/:id`

Edit a line's item / carrier / notes. The old row is soft-deleted (`status=DELETED`, `supersededById` set) and a new ACTIVE row is created with the updated fields. `direction` and `quantity` cannot be changed here — DELETE and re-POST instead.

**Body (at least one field required)**

| Field | Type | Notes |
|---|---|---|
| `itemId` | UUID | Replacement item — same direction |
| `carrierUserId` | UUID \| null | Pass `null` to clear |
| `notes` | string \| null | Pass `null` to clear |

```json
{ "carrierUserId": "30000000-…-001", "notes": "Đã đổi người chuyển" }
```

**Response 200**

```json
{
  "oldLine": {
    "id": "f3a1…",
    "status": "DELETED",
    "supersededById": "44b7…"
  },
  "newLine": {
    "id": "44b7…",
    "status": "ACTIVE",
    "direction": "warehouse_to_showroom",
    "quantity": "1.00",
    "carrierUserId": "30000000-…-001",
    "notes": "Đã đổi người chuyển"
  }
}
```

**Errors**

| Status | `code` | When |
|---|---|---|
| 400 | `TEMP_WAREHOUSE_UPDATE_LINE_EMPTY_BODY` | Body is `{}` |
| 400 | `TEMP_WAREHOUSE_LINE_NOT_EDITABLE` | Line is already DELETED / AUTO_BALANCED |
| 400 | `TEMP_WAREHOUSE_SESSION_CLOSED` | Cannot edit lines in a closed session |
| 404 | `TEMP_WAREHOUSE_LINE_NOT_FOUND` | Unknown id |

---

### 5.4 `DELETE /inventory/temp-warehouse/lines/:id`

Soft-delete a line. **Idempotent** — calling it twice returns the same (DELETED) row, no error.

**Response 200** — the line, now with `status = "DELETED"`.

**Errors**

| Status | `code` | When |
|---|---|---|
| 400 | `TEMP_WAREHOUSE_SESSION_CLOSED` | Cannot delete from a CLOSED session |
| 404 | `TEMP_WAREHOUSE_LINE_NOT_FOUND` | Unknown id |

---

### 5.5 `GET /inventory/temp-warehouse/lines`

List lines in either **raw** mode (default — every individual row) or **netted** mode (`hideOffsetting=true` — one aggregated row per item).

**Query**

| Name | Type | Default | Notes |
|---|---|---|---|
| `branchId` | UUID | — | Either this **or** `sessionId` is required. With `branchId`, the active session is auto-resolved. |
| `sessionId` | UUID | — | Look up a specific session (including CLOSED ones) |
| `status` | `ACTIVE \| DELETED \| AUTO_BALANCED \| ALL` | `ACTIVE` | Filter; `ALL` returns every status. Default already excludes `DELETED`. |
| `direction` | `TempWarehouseDirection` | — | Optional filter |
| `hideOffsetting` | boolean | `false` | When `true`, returns one netted row per item instead of raw rows |
| `hideBalanced` | boolean | `false` | Netted mode only. When `true`, items whose `totalW2s === totalS2w` are omitted. Requires `hideOffsetting=true`; otherwise 400 `TEMP_WAREHOUSE_HIDE_BALANCED_REQUIRES_NETTED`. |
| `page` | integer ≥ 1 | `1` | Raw mode only |
| `pageSize` | integer 1–500 | `50` | Raw mode only |

**Response 200 (raw mode)**

```json
{
  "sessionId": "be0a…",
  "data": [
    {
      "id": "f3a1…",
      "itemId": "70000000-…-002",
      "direction": "warehouse_to_showroom",
      "quantity": "1.00",
      "carrierUserId": "30000000-…",
      "status": "ACTIVE",
      "createdAt": "2026-05-16T02:01:14.512Z",
      "carrier": {
        "id": "30000000-…",
        "firstName": "Lan",
        "lastName": "Nguyễn",
        "email": "lan@example.com"
      },
      "item": {
        "id": "70000000-…-002",
        "code": "MONITOR-001",
        "name": "Monitor 24in",
        "unit": "cái",
        "variantLabel": null
      },
      "sourceLocation":      { "id": "60000000-…-001", "code": "WH-A", "name": "Kho chính – kệ A" },
      "destinationLocation": { "id": "60000000-…-003", "code": "SR-1", "name": "Showroom – tầng 1" }
    }
  ],
  "total": 4,
  "page": 1,
  "pageSize": 50
}
```

**Response 200 (netted mode, `hideOffsetting=true`)**

```json
{
  "sessionId": "be0a…",
  "items": [
    {
      "itemId": "70000000-…-002",
      "item": { "id": "70000000-…-002", "code": "MONITOR-001", "name": "Monitor 24in", "unit": "cái", "variantLabel": null },
      "totalW2s": 2,
      "totalS2w": 1,
      "netQuantity": 1,
      "netDirection": "warehouse_to_showroom",
      "lineIdsW2s": ["f3a1…", "44b7…"],
      "lineIdsS2w": ["8c25…"],
      "carriers": [
        { "id": "30000000-…", "firstName": "Lan", "lastName": "Nguyễn", "email": "lan@example.com" }
      ]
    },
    {
      "itemId": "70000000-…-001",
      "item": { "id": "70000000-…-001", "code": "LAPTOP-001", "name": "Laptop Pro", "unit": "cái", "variantLabel": null },
      "totalW2s": 1,
      "totalS2w": 0,
      "netQuantity": 1,
      "netDirection": "warehouse_to_showroom",
      "lineIdsW2s": ["a902…"],
      "lineIdsS2w": [],
      "carriers": []
    }
  ]
}
```

> Netted view aggregates **ACTIVE + AUTO_BALANCED** rows (ignores DELETED). Use it for the end-of-shift review screen.
> **Inline-joined fields** on raw lines: `carrier`, `item`, `sourceLocation`, `destinationLocation`. On netted items: `item`, `carriers` (deduped, sorted by id). Source/destination are derived per-line from `direction` + session's warehouse/showroom location. `passwordHash` never exposed.

**Errors**

| Status | `code` | When |
|---|---|---|
| 400 | `TEMP_WAREHOUSE_LIST_MISSING_SCOPE` | Neither `branchId` nor `sessionId` provided |
| 400 | `TEMP_WAREHOUSE_HIDE_BALANCED_REQUIRES_NETTED` | `hideBalanced=true` sent without `hideOffsetting=true` |

---

### 5.6 `GET /inventory/temp-warehouse/sessions/:id`

Fetch one session by id, including its lines (any status). Useful for reviewing a CLOSED session.

**Response 200** — `TempWarehouseSession` with `lines: TempWarehouseLine[]`. Each line carries its inline `carrier`, `item`, `sourceLocation`, `destinationLocation`; no root-level map.

**Errors**

| Status | `code` | When |
|---|---|---|
| 404 | `TEMP_WAREHOUSE_SESSION_NOT_FOUND` | Unknown id |

---

### 5.7 `POST /inventory/temp-warehouse/sessions/:id/close`

Close a session in one of three modes. **Replay-safe**: closing again with the same mode returns the same response without throwing.

**Body**

```json
{ "mode": "NONE" }
```

#### Mode comparison

| Mode | What happens | Use when |
|---|---|---|
| `NONE` | Session flips to CLOSED, no side effects. ACTIVE lines stay ACTIVE for history. | "Bookkeeping" close — nothing needs to settle |
| `NET_OFFSET` | For each item, the system computes `diff = totalW2s - totalS2w` and inserts an **AUTO_BALANCED** compensating line so the net becomes 0. Pure DB write, no real stock transfer. | Real items were moved both ways and physically self-cancel — only log the imbalance |
| `CREATE_TRANSFERS` | The system publishes one `temp-warehouse.transfer-requested` Kafka event per direction with active lines. A consumer creates → approves → posts real `StockTransfer`s. The session's `transferProcessingStatus` flows `NONE → PENDING → COMPLETED`. | Movements should produce actual ledger entries against the warehouse / showroom locations |

**Response 200**

```jsonc
{
  "session": {
    "id": "be0a…",
    "status": "CLOSED",
    "closeMode": "CREATE_TRANSFERS",
    "transferProcessingStatus": "PENDING",   // moves to COMPLETED async — poll
    "closedAt": "2026-05-16T03:00:00.000Z",
    "...": "…"
  },

  // Present only when mode = NET_OFFSET
  "autoBalancedLines": [
    {
      "id": "c801…",
      "itemId": "70000000-…-002",
      "direction": "showroom_to_warehouse",
      "quantity": "1.00",
      "status": "AUTO_BALANCED",
      "notes": "Auto-balanced on close (NET_OFFSET)"
    }
  ],

  // Present only when mode = CREATE_TRANSFERS (one entry per direction that has lines)
  "publishedEvents": [
    { "direction": "warehouse_to_showroom", "eventId": "<uuid v5>" },
    { "direction": "showroom_to_warehouse", "eventId": "<uuid v5>" }
  ]
}
```

#### Polling for `CREATE_TRANSFERS` completion

After the close call returns `transferProcessingStatus: "PENDING"`, FE should poll `GET /sessions/:id` every ~1–2 s until status is `COMPLETED` or `FAILED`. Typical latency: <2 seconds.

- `COMPLETED` ⇒ `transferW2sId` / `transferS2wId` are populated (link to the real StockTransfer detail page).
- `FAILED` ⇒ `transferFailureReason` is a human-readable message (show in a banner; ops will replay from DLQ).

**Errors**

| Status | `code` | When |
|---|---|---|
| 404 | `TEMP_WAREHOUSE_SESSION_NOT_FOUND` | Unknown id |
| 409 | `TEMP_WAREHOUSE_SESSION_ALREADY_CLOSED_DIFFERENT_MODE` | Session is already CLOSED and the new mode differs from the original |

---

## 6. Suggested UI flow

```
┌────────────────────────────────────────────────────────────────────┐
│ Page load                                                          │
│  ├─ GET /sessions/active?branchId=…                                │
│  ├─ 200 → render shift in progress, store sessionId                │
│  └─ 404 → render "Bắt đầu ca làm" empty state                      │
└────────────────────────────────────────────────────────────────────┘

User picks item + direction → click "Ghi nhận"
  └─ POST /lines                                       (1 unit at a time)
     ├─ For qty > 1, loop the request, optimistically  │
     │  increment local counter; on any failure roll   │
     │  back the optimistic state for that batch.      │
     └─ On 200 → append row to the "lines" list

User clicks "Hủy dòng" on a row
  └─ DELETE /lines/:id                                 (idempotent — safe to retry)

User clicks "Sửa dòng"
  └─ PATCH /lines/:id  { notes / carrierUserId / itemId }
     Replace the local row with `newLine` from the response.

User clicks "Xem tổng kết"
  └─ GET /lines?sessionId=…&hideOffsetting=true        (netted view)

User clicks "Kết ca"
  └─ Modal: choose mode (NONE / NET_OFFSET / CREATE_TRANSFERS)
  └─ POST /sessions/:id/close  { mode }
     ├─ mode = NONE / NET_OFFSET → done, navigate to summary page
     └─ mode = CREATE_TRANSFERS → start polling:
        repeat every 1.5s:
          GET /sessions/:id
          if transferProcessingStatus in [COMPLETED, FAILED] → stop
        on COMPLETED → show links to transferW2sId / transferS2wId
        on FAILED    → show `transferFailureReason` + retry hint
```

### React Query keys (recommendation)

```ts
['temp-wh', 'active', branchId]                 // GET /sessions/active
['temp-wh', 'session', sessionId]               // GET /sessions/:id
['temp-wh', 'lines', sessionId, filters]        // GET /lines (raw)
['temp-wh', 'lines-netted', sessionId]          // GET /lines hideOffsetting=true
```

Invalidate the relevant prefix after every mutation. After `close`, invalidate the entire `['temp-wh']` tree.

---

## 7. Validation summary (quick reference)

| Field | Rule |
|---|---|
| `branchId` | UUID, required, must match `X-Branch-Id` |
| `itemId` | UUID, required |
| `direction` | Optional. One of `warehouse_to_showroom` \| `showroom_to_warehouse`. If omitted, BE auto-resolves from item stock balance. |
| `carrierUserId` | UUID, optional |
| `notes` | string, optional |
| `quantity` | **not accepted** — sending the field ⇒ 400 |
| `mode` (close) | `NONE` \| `NET_OFFSET` \| `CREATE_TRANSFERS` |

---

## 8. Error code reference

| `code` | HTTP | Meaning |
|---|---|---|
| `TEMP_WAREHOUSE_NO_ACTIVE_SESSION` | 404 | `GET /sessions/active` — branch has no open session |
| `TEMP_WAREHOUSE_SESSION_NOT_FOUND` | 404 | Session id does not exist in the org |
| `TEMP_WAREHOUSE_LINE_NOT_FOUND` | 404 | Line id does not exist in the org |
| `TEMP_WAREHOUSE_LIST_MISSING_SCOPE` | 400 | List call without `branchId` or `sessionId` |
| `TEMP_WAREHOUSE_UPDATE_LINE_EMPTY_BODY` | 400 | PATCH with empty body |
| `TEMP_WAREHOUSE_LINE_NOT_EDITABLE` | 400 | PATCH a non-ACTIVE line |
| `TEMP_WAREHOUSE_SESSION_CLOSED` | 400 | Edit/delete a line in a CLOSED session |
| `TEMP_WAREHOUSE_BRANCH_MISSING_MAIN_STORAGE` | 400 | Branch needs a `is_main_storage=true` row |
| `TEMP_WAREHOUSE_MAIN_STORAGE_MISSING_LOCATION` | 400 | Main storage has no active location |
| `TEMP_WAREHOUSE_BRANCH_MISSING_MAIN_SHOWROOM` | 400 | Branch needs a `is_main_showroom=true` row |
| `TEMP_WAREHOUSE_MAIN_SHOWROOM_MISSING_LOCATION` | 400 | Showroom storage has no active location |
| `TEMP_WAREHOUSE_ITEM_NO_STOCK` | 400 | `POST /lines` without `direction` and item has zero stock at both main locations |
| `TEMP_WAREHOUSE_DIRECTION_AMBIGUOUS` | 400 | `POST /lines` without `direction` and item has stock at both main locations — send explicit `direction` |
| `TEMP_WAREHOUSE_HIDE_BALANCED_REQUIRES_NETTED` | 400 | `GET /lines?hideBalanced=true` without `hideOffsetting=true` |
| `TEMP_WAREHOUSE_SESSION_ALREADY_CLOSED_DIFFERENT_MODE` | 409 | Re-close with a different mode |

All errors follow the standard `{ statusCode, code, message }` envelope from `HttpExceptionFilter`.
