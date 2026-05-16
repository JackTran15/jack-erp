# Temp Warehouse — cURL Test Suite (Postman Import)

> **Usage:** mỗi block là 1 cURL độc lập. Copy block → trong Postman: **File → Import → Raw text** → paste → Continue → Import. Postman tự convert sang request có sẵn headers + body.
> **Prereq:** `docker compose up -d` + `pnpm --filter @erp/api seed:inventory` + `make dev-api`.
> Sau mỗi response trả về, set Postman environment variables: `token`, `sessionId`, `lineMonitorId`, v.v. để dùng cho request kế.

---

## 0. Setup SQL (chạy trước, không phải cURL)

Adminer `http://localhost:18088` (server `postgres`, user `erp`, pass `erp`, db `erp`) hoặc psql `postgres://erp:erp@localhost:5433/erp`:

```sql
-- Reset session cũ
DELETE FROM temp_warehouse_lines WHERE session_id IN (
  SELECT id FROM temp_warehouse_sessions
  WHERE branch_id = '20000000-0000-4000-8000-000000000001'
);
DELETE FROM temp_warehouse_sessions
WHERE branch_id = '20000000-0000-4000-8000-000000000001';

-- Monitor: chỉ ở kho chính (scenario A — W2S auto)
UPDATE stock_balances
SET quantity = 10
WHERE item_id = '70000000-0000-4000-8000-000000000002'
  AND location_id = '60000000-0000-4000-8000-000000000001';
DELETE FROM stock_balances
WHERE item_id = '70000000-0000-4000-8000-000000000002'
  AND location_id = '60000000-0000-4000-8000-000000000003';

-- Shoe 39 Nâu: chỉ ở showroom (scenario B — S2W auto)
INSERT INTO stock_balances (organization_id, branch_id, item_id, location_id, quantity, created_at, updated_at, created_by)
VALUES ('10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        'A3000000-0000-4000-8000-000000000001',
        '60000000-0000-4000-8000-000000000003',
        5, NOW(), NOW(), '30000000-0000-4000-8000-000000000001')
ON CONFLICT (organization_id, item_id, location_id) DO UPDATE SET quantity = 5;
DELETE FROM stock_balances
WHERE item_id = 'A3000000-0000-4000-8000-000000000001'
  AND location_id = '60000000-0000-4000-8000-000000000001';

-- Shoe 40 Đen: stock ở cả 2 (scenario C — AMBIGUOUS)
INSERT INTO stock_balances (organization_id, branch_id, item_id, location_id, quantity, created_at, updated_at, created_by)
VALUES
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'A3000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000001', 3, NOW(), NOW(),
   '30000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'A3000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000003', 2, NOW(), NOW(),
   '30000000-0000-4000-8000-000000000001')
ON CONFLICT (organization_id, item_id, location_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Laptop: không có stock cả 2 (scenario D — NO_STOCK)
DELETE FROM stock_balances
WHERE item_id = '70000000-0000-4000-8000-000000000001'
  AND location_id IN ('60000000-0000-4000-8000-000000000001',
                       '60000000-0000-4000-8000-000000000003');
```

---

## 1. Login → lấy JWT

```bash
curl --location 'http://localhost:4000/auth/login' \
--header 'Content-Type: application/json' \
--data-raw '{
  "email": "inventory.admin@erp.local",
  "password": "password123",
  "organizationId": "10000000-0000-4000-8000-000000000001"
}'
```

Response → copy `accessToken` vào Postman variable `{{token}}`.

---

## 2. Scenario A — Auto-resolve W2S (Monitor chỉ ở kho chính)

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/lines' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001' \
--header 'X-Idempotency-Key: 11111111-1111-1111-1111-111111111111' \
--header 'Content-Type: application/json' \
--data-raw '{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "itemId": "70000000-0000-4000-8000-000000000002",
  "carrierUserId": "30000000-0000-4000-8000-000000000001",
  "notes": "Monitor demo W2S auto-resolve"
}'
```

**Expected 200** — `line.direction === "warehouse_to_showroom"`. Copy `session.id` → `{{sessionId}}`, `line.id` → `{{lineMonitorId}}`.

---

## 3. Scenario B — Auto-resolve S2W (Shoe 39 Nâu chỉ ở showroom)

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/lines' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001' \
--header 'X-Idempotency-Key: 22222222-2222-2222-2222-222222222222' \
--header 'Content-Type: application/json' \
--data-raw '{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "itemId": "A3000000-0000-4000-8000-000000000001",
  "carrierUserId": "30000000-0000-4000-8000-000000000001",
  "notes": "Shoe tra ve kho"
}'
```

**Expected 200** — `line.direction === "showroom_to_warehouse"`.

---

## 4. Scenario C — AMBIGUOUS (Shoe 40 Đen có cả 2 nơi)

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/lines' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001' \
--header 'X-Idempotency-Key: 33333333-3333-3333-3333-333333333333' \
--header 'Content-Type: application/json' \
--data-raw '{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "itemId": "A3000000-0000-4000-8000-000000000004"
}'
```

**Expected 400** — `code: "TEMP_WAREHOUSE_DIRECTION_AMBIGUOUS"`.

### 4.1 Resend với direction explicit → 200

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/lines' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001' \
--header 'X-Idempotency-Key: 33333333-3333-3333-3333-333333333334' \
--header 'Content-Type: application/json' \
--data-raw '{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "itemId": "A3000000-0000-4000-8000-000000000004",
  "direction": "warehouse_to_showroom"
}'
```

**Expected 200** — line created với direction explicit.

---

## 5. Scenario D — NO_STOCK (Laptop không có stock cả 2 nơi)

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/lines' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001' \
--header 'X-Idempotency-Key: 44444444-4444-4444-4444-444444444444' \
--header 'Content-Type: application/json' \
--data-raw '{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "itemId": "70000000-0000-4000-8000-000000000001"
}'
```

**Expected 400** — `code: "TEMP_WAREHOUSE_ITEM_NO_STOCK"`.

---

## 6. Scenario E — Explicit direction (backward compat)

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/lines' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001' \
--header 'X-Idempotency-Key: 55555555-5555-5555-5555-555555555555' \
--header 'Content-Type: application/json' \
--data-raw '{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "itemId": "70000000-0000-4000-8000-000000000002",
  "direction": "warehouse_to_showroom",
  "carrierUserId": "30000000-0000-4000-8000-000000000001",
  "notes": "Explicit W2S - backward compatible"
}'
```

**Expected 200** — resolver KHÔNG được gọi.

---

## 7. Scenario F — Idempotent replay (cùng key + same body như §2)

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/lines' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001' \
--header 'X-Idempotency-Key: 11111111-1111-1111-1111-111111111111' \
--header 'Content-Type: application/json' \
--data-raw '{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "itemId": "70000000-0000-4000-8000-000000000002",
  "carrierUserId": "30000000-0000-4000-8000-000000000001",
  "notes": "Monitor demo W2S auto-resolve"
}'
```

**Expected 200** — `line.id` giống §2, KHÔNG tạo row mới.

Verify DB:
```sql
SELECT id, item_id, direction, status FROM temp_warehouse_lines
WHERE item_id = '70000000-0000-4000-8000-000000000002'
ORDER BY created_at DESC;
```

---

## 8. Scenario G — List raw (mỗi row inline `carrier` + `item` + `sourceLocation` + `destinationLocation`)

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/lines?branchId=20000000-0000-4000-8000-000000000001' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001'
```

**Expected 200** — `data[]` không có row DELETED. Mỗi row có 4 field inline-joined: `carrier`, `item`, `sourceLocation`, `destinationLocation`. `passwordHash` KHÔNG xuất hiện.

```jsonc
{
  "sessionId": "<uuid>",
  "data": [
    {
      "id": "…",
      "itemId": "70000000-…-002",
      "direction": "warehouse_to_showroom",
      "quantity": "1.00",
      "status": "ACTIVE",
      "carrierUserId": "30000000-…-001",
      "carrier":              { "id": "30000000-…-001", "firstName": "Inventory", "lastName": "Admin", "email": "inventory.admin@erp.local" },
      "item":                 { "id": "70000000-…-002", "code": "MONITOR-001", "name": "Monitor 24in", "unit": "cái", "variantLabel": null },
      "sourceLocation":       { "id": "60000000-…-001", "code": "WH-A", "name": "Kho chính – kệ A" },
      "destinationLocation":  { "id": "60000000-…-003", "code": "SR-1", "name": "Showroom – tầng 1" }
    }
  ],
  "total": 2, "page": 1, "pageSize": 50
}
```

### 8.1 Delete 1 line

```bash
curl --location --request DELETE 'http://localhost:4000/inventory/temp-warehouse/lines/{{lineMonitorId}}' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001'
```

**Expected 200** — `status: "DELETED"`. Gọi lại lần 2 cùng id → vẫn 200, idempotent.

### 8.2 List lại (default) — line vừa xóa không xuất hiện

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/lines?branchId=20000000-0000-4000-8000-000000000001' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001'
```

### 8.3 List `status=ALL` — line DELETED hiện ra

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/lines?branchId=20000000-0000-4000-8000-000000000001&status=ALL' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001'
```

---

## 9. Scenario H — Netted view (mỗi item inline `item` + `carriers`)

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/lines?branchId=20000000-0000-4000-8000-000000000001&hideOffsetting=true' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001'
```

**Expected 200** — mỗi item trong `items[]` có `item: PublicItem | null` (id/code/name/unit/variantLabel) + `carriers: PublicUser[]` (inline, deduped, sort theo id). Netted KHÔNG có `sourceLocation/destinationLocation` (vì 1 item có thể đi cả 2 chiều).

```jsonc
{
  "sessionId": "<uuid>",
  "items": [
    {
      "itemId": "70000000-…-002",
      "item": { "id": "70000000-…-002", "code": "MONITOR-001", "name": "Monitor 24in", "unit": "cái", "variantLabel": null },
      "totalW2s": 2, "totalS2w": 0, "netQuantity": 2,
      "netDirection": "warehouse_to_showroom",
      "lineIdsW2s": ["…","…"], "lineIdsS2w": [],
      "carriers": [
        { "id": "30000000-…-001", "firstName": "Inventory", "lastName": "Admin", "email": "inventory.admin@erp.local" }
      ]
    }
  ]
}
```

---

## 10. Scenario I — `hideBalanced=true`

### 10.1 Setup: thêm 1 W2S + 1 S2W cùng item (Monitor) để totals bằng nhau

```bash
# W2S thêm
curl --location 'http://localhost:4000/inventory/temp-warehouse/lines' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001' \
--header 'X-Idempotency-Key: 66666666-6666-6666-6666-666666666661' \
--header 'Content-Type: application/json' \
--data-raw '{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "itemId": "70000000-0000-4000-8000-000000000002",
  "direction": "warehouse_to_showroom",
  "carrierUserId": "30000000-0000-4000-8000-000000000001"
}'
```

```bash
# S2W thêm
curl --location 'http://localhost:4000/inventory/temp-warehouse/lines' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001' \
--header 'X-Idempotency-Key: 66666666-6666-6666-6666-666666666662' \
--header 'Content-Type: application/json' \
--data-raw '{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "itemId": "70000000-0000-4000-8000-000000000002",
  "direction": "showroom_to_warehouse",
  "carrierUserId": "30000000-0000-4000-8000-000000000001"
}'
```

Lặp số lần W2S = S2W trên Monitor để `totalW2s === totalS2w`.

### 10.2 Netted view với `hideBalanced=true`

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/lines?branchId=20000000-0000-4000-8000-000000000001&hideOffsetting=true&hideBalanced=true' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001'
```

**Expected 200** — Monitor biến mất khỏi `items[]` vì `totalW2s === totalS2w`. Shoe 39 Nâu vẫn còn (chỉ S2W).

### 10.3 `hideBalanced=true` thiếu `hideOffsetting=true` → 400

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/lines?branchId=20000000-0000-4000-8000-000000000001&hideBalanced=true' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001'
```

**Expected 400** — `code: "TEMP_WAREHOUSE_HIDE_BALANCED_REQUIRES_NETTED"`.

---

## 11. Scenario J — `GET /sessions/:id` (mỗi line inline `carrier` + `item` + locations)

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/sessions/{{sessionId}}' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001'
```

**Expected 200** — body trả session + `lines[]` với mỗi line có inline `carrier`, `item`, `sourceLocation`, `destinationLocation`. Không có map nào ở root.

---

## 12. Scenario K — `GET /sessions/active`

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/sessions/active?branchId=20000000-0000-4000-8000-000000000001' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001'
```

**Expected 200** — session ACTIVE của branch hiện tại (nếu chưa close).

---

## 13. Scenario L — Update line (PATCH soft-delete + new line)

```bash
curl --location --request PATCH 'http://localhost:4000/inventory/temp-warehouse/lines/{{lineMonitorId}}' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001' \
--header 'X-Idempotency-Key: 77777777-7777-7777-7777-777777777777' \
--header 'Content-Type: application/json' \
--data-raw '{
  "notes": "Da doi nguoi chuyen",
  "carrierUserId": "30000000-0000-4000-8000-000000000001"
}'
```

**Expected 200** — `{ oldLine, newLine }`. `oldLine.status === "DELETED"`, `oldLine.supersededById === newLine.id`.

---

## 14. Scenario M — Close session NET_OFFSET

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/sessions/{{sessionId}}/close' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001' \
--header 'X-Idempotency-Key: 99999999-9999-9999-9999-999999999999' \
--header 'Content-Type: application/json' \
--data-raw '{ "mode": "NET_OFFSET" }'
```

**Expected 200** — `session.status === "CLOSED"`, có `autoBalancedLines[]` cho item lệch. Replay cùng key → response identical.

---

## 15. Scenario N — Close session CREATE_TRANSFERS

> Mở session mới trước (POST /lines bất kỳ), rồi close.

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/sessions/{{sessionId}}/close' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001' \
--header 'X-Idempotency-Key: AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA' \
--header 'Content-Type: application/json' \
--data-raw '{ "mode": "CREATE_TRANSFERS" }'
```

**Expected 200** — `transferProcessingStatus === "PENDING"`, `publishedEvents[]` có entry per direction.

### 15.1 Poll cho đến khi COMPLETED

```bash
curl --location 'http://localhost:4000/inventory/temp-warehouse/sessions/{{sessionId}}' \
--header 'Authorization: Bearer {{token}}' \
--header 'X-Branch-Id: 20000000-0000-4000-8000-000000000001'
```

Lặp ~1.5s/lần. `transferProcessingStatus` → `COMPLETED` (kèm `transferW2sId` / `transferS2wId`) hoặc `FAILED` (kèm `transferFailureReason`).

---

## 16. Cleanup

```sql
DELETE FROM temp_warehouse_lines WHERE session_id IN (
  SELECT id FROM temp_warehouse_sessions WHERE branch_id = '20000000-0000-4000-8000-000000000001'
);
DELETE FROM temp_warehouse_sessions WHERE branch_id = '20000000-0000-4000-8000-000000000001';
```

---

## Postman variables gợi ý

| Variable | Set từ response của |
|---|---|
| `token` | §1 Login → `accessToken` |
| `sessionId` | §2 (đầu tiên), hoặc §11/§12 |
| `lineMonitorId` | §2 → `line.id` |
| `lineShoeId` | §3 → `line.id` |

Tab **Tests** của §1 (auto-set token):
```js
const j = pm.response.json();
pm.environment.set("token", j.accessToken);
```

Tab **Tests** của §2:
```js
const j = pm.response.json();
pm.environment.set("sessionId", j.session.id);
pm.environment.set("lineMonitorId", j.line.id);
pm.test("auto W2S", () => pm.expect(j.line.direction).to.eql("warehouse_to_showroom"));
pm.test("no passwordHash leak", () => pm.expect(pm.response.text()).to.not.include("passwordHash"));
```
