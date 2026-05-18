# Temp Warehouse — Postman Mock & Test Plan

> **Audience:** QA / dev test trên Postman sau khi merge BE enhancements (auto-resolve direction, hideBalanced, carriers map).
> **API root:** `http://localhost:4000` (Nest API, không có global prefix).
> **Prereq:** `docker compose up -d` + `pnpm --filter @erp/api seed:inventory` + `make dev-api`.
> **Last updated:** 2026-05-16

---

## 0. Seed data (dùng làm mock)

Dev seed (`apps/api/src/database/seeds/inventory.seed.ts`) tạo sẵn:

| Tên | UUID |
|---|---|
| Organization | `10000000-0000-4000-8000-000000000001` |
| Branch (chi nhánh chính) | `20000000-0000-4000-8000-000000000001` |
| User (carrier) — Inventory Admin | `30000000-0000-4000-8000-000000000001` |
| Storage chính (`isMainStorage=true`) | `50000000-0000-4000-8000-000000000001` |
| Showroom chính (`isMainShowroom=true`) | `55000000-0000-4000-8000-000000000001` |
| Storage showroom (FK của showroomMain) | `50000000-0000-4000-8000-000000000003` |
| Location — kho chính | `60000000-0000-4000-8000-000000000001` |
| Location — showroom | `60000000-0000-4000-8000-000000000003` |
| Item — Laptop | `70000000-0000-4000-8000-000000000001` |
| Item — Monitor | `70000000-0000-4000-8000-000000000002` |
| Item — Shoe 39 Nâu | `A3000000-0000-4000-8000-000000000001` |
| Item — Shoe 40 Đen | `A3000000-0000-4000-8000-000000000004` |

**Stock balances tạo bởi seed**:
- Laptop ở kho chính (location `…001`) — qty > 0
- Laptop ở storage reserve (location `…002`) — qty > 0 (không liên quan auto-resolve)
- Monitor ở kho chính — qty > 0
- **Showroom location (`…003`)**: seed mặc định KHÔNG có stock cho item nào → dùng để test "Item no stock at showroom".

> Để test các scenario AMBIGUOUS / no-stock, có 2 cách:
> 1. **Chỉnh `stock_balances` thủ công** qua psql / Adminer (`docker compose up -d adminer` → `http://localhost:18088`).
> 2. **Tạo movement** qua API hiện có để chuyển item vào showroom location.

Phần "Bước chuẩn bị" bên dưới sẽ hướng dẫn dùng SQL trực tiếp cho nhanh.

---

## 1. Auth & headers chung

### 1.1 Login lấy JWT

```
POST http://localhost:4000/auth/login
Content-Type: application/json

{
  "email": "inventory.admin@erp.local",
  "password": "password123",
  "organizationId": "10000000-0000-4000-8000-000000000001"
}
```

Response trả `{ accessToken, refreshToken, user }`. Copy `accessToken` → set Postman environment variable `{{token}}`.

### 1.2 Mọi request bên dưới đều cần headers

```
Authorization: Bearer {{token}}
X-Branch-Id: 20000000-0000-4000-8000-000000000001
Content-Type: application/json
X-Idempotency-Key: {{$guid}}     # Postman dynamic UUID, recommend cho POST /lines & /close
```

> Postman: trong tab Headers, dùng `{{$guid}}` để mỗi request có UUID mới. Để test replay-idempotency, copy ra biến cố định.

---

## 2. Bước chuẩn bị stock-balances cho từng scenario

Chạy SQL trực tiếp (Adminer / psql) trước mỗi nhóm test. Connection: `postgres://erp:erp@localhost:5433/erp`.

### 2.1 Reset stock theo từng scenario

```sql
-- Reset Monitor về chỉ-có-stock-ở-kho (cho scenario auto W2S)
UPDATE stock_balances
SET quantity = 10
WHERE item_id = '70000000-0000-4000-8000-000000000002'
  AND location_id = '60000000-0000-4000-8000-000000000001';

DELETE FROM stock_balances
WHERE item_id = '70000000-0000-4000-8000-000000000002'
  AND location_id = '60000000-0000-4000-8000-000000000003';

-- Shoe 39 Nâu chỉ-có-stock-ở-showroom (cho scenario auto S2W)
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

-- Shoe 40 Đen có stock ở CẢ HAI (cho scenario AMBIGUOUS)
INSERT INTO stock_balances (organization_id, branch_id, item_id, location_id, quantity, created_at, updated_at, created_by)
VALUES
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'A3000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000001', 3, NOW(), NOW(),
   '30000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'A3000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000003', 2, NOW(), NOW(),
   '30000000-0000-4000-8000-000000000001')
ON CONFLICT (organization_id, item_id, location_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Laptop (`…0001`) — đảm bảo KHÔNG có stock ở cả 2 location chính (cho scenario NO_STOCK)
DELETE FROM stock_balances
WHERE item_id = '70000000-0000-4000-8000-000000000001'
  AND location_id IN ('60000000-0000-4000-8000-000000000001',
                       '60000000-0000-4000-8000-000000000003');
```

### 2.2 Reset session (chạy giữa các đợt test)

```sql
-- Xóa các session test cũ để khỏi vướng partial unique index
DELETE FROM temp_warehouse_lines WHERE session_id IN (
  SELECT id FROM temp_warehouse_sessions
  WHERE branch_id = '20000000-0000-4000-8000-000000000001'
);
DELETE FROM temp_warehouse_sessions
WHERE branch_id = '20000000-0000-4000-8000-000000000001';
```

---

## 3. Scenario A — Auto-resolve direction = W2S (item chỉ ở kho chính)

> Mock: Monitor chỉ ở kho chính (đã setup ở §2.1). POST /lines không gửi `direction`.

```
POST http://localhost:4000/inventory/temp-warehouse/lines
Authorization: Bearer {{token}}
X-Branch-Id: 20000000-0000-4000-8000-000000000001
Content-Type: application/json
X-Idempotency-Key: 11111111-1111-1111-1111-111111111111

{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "itemId":   "70000000-0000-4000-8000-000000000002",
  "carrierUserId": "30000000-0000-4000-8000-000000000001",
  "notes": "Monitor demo W2S auto-resolve"
}
```

**Expected 200** — `line.direction === "warehouse_to_showroom"`, session auto-opened.

```json
{
  "session": { "id": "<uuid>", "status": "ACTIVE", "warehouseLocationId": "60000000-…-001", "showroomLocationId": "60000000-…-003", ... },
  "line": {
    "id": "<uuid>",
    "direction": "warehouse_to_showroom",
    "quantity": "1.00",
    "carrierUserId": "30000000-0000-4000-8000-000000000001",
    "status": "ACTIVE",
    ...
  }
}
```

---

## 4. Scenario B — Auto-resolve direction = S2W (item chỉ ở showroom)

> Mock: Shoe 39 Nâu chỉ ở showroom.

```
POST http://localhost:4000/inventory/temp-warehouse/lines
Authorization: Bearer {{token}}
X-Branch-Id: 20000000-0000-4000-8000-000000000001
Content-Type: application/json
X-Idempotency-Key: 22222222-2222-2222-2222-222222222222

{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "itemId":   "A3000000-0000-4000-8000-000000000001",
  "carrierUserId": "30000000-0000-4000-8000-000000000001",
  "notes": "Shoe trả về kho"
}
```

**Expected 200** — `line.direction === "showroom_to_warehouse"`.

---

## 5. Scenario C — Direction AMBIGUOUS (item có ở cả 2)

> Mock: Shoe 40 Đen có stock ở cả 2 location.

```
POST http://localhost:4000/inventory/temp-warehouse/lines
Authorization: Bearer {{token}}
X-Branch-Id: 20000000-0000-4000-8000-000000000001
Content-Type: application/json
X-Idempotency-Key: 33333333-3333-3333-3333-333333333333

{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "itemId":   "A3000000-0000-4000-8000-000000000004"
}
```

**Expected 400**

```json
{
  "statusCode": 400,
  "code": "TEMP_WAREHOUSE_DIRECTION_AMBIGUOUS",
  "message": "Item A3000000-…-000004 has stock at both main warehouse and main showroom; explicit direction is required"
}
```

### 5.1 Resend với direction explicit → 200

```json
{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "itemId":   "A3000000-0000-4000-8000-000000000004",
  "direction": "warehouse_to_showroom"
}
```

> Header `X-Idempotency-Key` đổi sang UUID mới — same key + different body sẽ trả lại response cũ (400) hoặc lỗi conflict.

---

## 6. Scenario D — Item NO_STOCK

> Mock: Laptop không có stock ở cả 2 location chính.

```
POST http://localhost:4000/inventory/temp-warehouse/lines
Authorization: Bearer {{token}}
X-Branch-Id: 20000000-0000-4000-8000-000000000001
Content-Type: application/json
X-Idempotency-Key: 44444444-4444-4444-4444-444444444444

{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "itemId":   "70000000-0000-4000-8000-000000000001"
}
```

**Expected 400**

```json
{
  "statusCode": 400,
  "code": "TEMP_WAREHOUSE_ITEM_NO_STOCK",
  "message": "Item 70000000-…-001 has no stock at either main warehouse or main showroom for this branch"
}
```

---

## 7. Scenario E — Explicit direction vẫn hoạt động như cũ

```
POST http://localhost:4000/inventory/temp-warehouse/lines
X-Idempotency-Key: 55555555-5555-5555-5555-555555555555

{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "itemId":   "70000000-0000-4000-8000-000000000002",
  "direction": "warehouse_to_showroom",
  "carrierUserId": "30000000-0000-4000-8000-000000000001",
  "notes": "Explicit W2S — backward compatible"
}
```

**Expected 200** — y như cũ, không gọi resolver.

---

## 8. Scenario F — Idempotent replay

> Gửi lại cùng `X-Idempotency-Key: 11111111-…` + same body như Scenario A. Response identical → KHÔNG tạo line mới.

```
POST http://localhost:4000/inventory/temp-warehouse/lines
X-Idempotency-Key: 11111111-1111-1111-1111-111111111111

{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "itemId":   "70000000-0000-4000-8000-000000000002",
  "carrierUserId": "30000000-0000-4000-8000-000000000001",
  "notes": "Monitor demo W2S auto-resolve"
}
```

**Expected 200** — `line.id` giống lần gọi đầu, không tạo thêm line trong DB.

```sql
-- Verify
SELECT id, item_id, direction, status FROM temp_warehouse_lines
WHERE item_id = '70000000-0000-4000-8000-000000000002' ORDER BY created_at DESC;
-- chỉ có 1 row Monitor + (line từ scenario E nếu có)
```

---

## 9. Scenario G — List raw (default, exclude DELETED, có `carriers` map)

```
GET http://localhost:4000/inventory/temp-warehouse/lines?branchId=20000000-0000-4000-8000-000000000001
Authorization: Bearer {{token}}
X-Branch-Id: 20000000-0000-4000-8000-000000000001
```

**Expected 200**

```jsonc
{
  "sessionId": "<uuid>",
  "data": [
    { "id": "…", "itemId": "70000000-…-002", "direction": "warehouse_to_showroom", "status": "ACTIVE", "carrierUserId": "30000000-…-001", "...": "…" }
  ],
  "total": 3,
  "page": 1,
  "pageSize": 50,
  "carriers": {
    "30000000-0000-4000-8000-000000000001": {
      "id": "30000000-0000-4000-8000-000000000001",
      "firstName": "Inventory",
      "lastName": "Admin",
      "email": "inventory.admin@erp.local"
    }
  }
}
```

> **Verify**: KHÔNG có row nào `status: "DELETED"`. Response KHÔNG chứa `passwordHash`.

### 9.1 Xóa 1 line rồi list lại → vẫn không thấy

```
DELETE http://localhost:4000/inventory/temp-warehouse/lines/<lineId>
```
Rồi `GET /lines` — row đó biến mất. Gọi lại `DELETE` cùng id → 200, idempotent (status=DELETED, không lỗi).

### 9.2 Trả về cả DELETED bằng `status=ALL`

```
GET http://localhost:4000/inventory/temp-warehouse/lines?branchId=…&status=ALL
```

Row DELETED xuất hiện kèm `supersededById` / `null`.

---

## 10. Scenario H — Netted view có `carrierUserIds[]`

```
GET http://localhost:4000/inventory/temp-warehouse/lines?branchId=20000000-0000-4000-8000-000000000001&hideOffsetting=true
```

**Expected 200**

```jsonc
{
  "sessionId": "<uuid>",
  "items": [
    {
      "itemId": "70000000-…-002",
      "totalW2s": 2,
      "totalS2w": 0,
      "netQuantity": 2,
      "netDirection": "warehouse_to_showroom",
      "lineIdsW2s": ["…","…"],
      "lineIdsS2w": [],
      "carrierUserIds": ["30000000-…-001"]
    },
    {
      "itemId": "A3000000-…-001",
      "totalW2s": 0,
      "totalS2w": 1,
      "netQuantity": 1,
      "netDirection": "showroom_to_warehouse",
      "lineIdsW2s": [],
      "lineIdsS2w": ["…"],
      "carrierUserIds": ["30000000-…-001"]
    }
  ],
  "carriers": {
    "30000000-0000-4000-8000-000000000001": { "id": "…", "firstName": "Inventory", "lastName": "Admin", "email": "inventory.admin@erp.local" }
  }
}
```

---

## 11. Scenario I — `hideBalanced=true` (ẩn item w2s == s2w)

> Mock thêm: add 1 line W2S và 1 line S2W cho Monitor để totals bằng nhau. Có 2 cách:

### 11.1 Setup: tạo cặp W2S/S2W cùng item

```
POST /inventory/temp-warehouse/lines    (W2S)
{ "branchId": "…", "itemId": "70000000-…-002", "direction": "warehouse_to_showroom", "carrierUserId": "30000000-…-001" }

POST /inventory/temp-warehouse/lines    (S2W — direction explicit vì sau lần W2S item vẫn ở kho)
{ "branchId": "…", "itemId": "70000000-…-002", "direction": "showroom_to_warehouse", "carrierUserId": "30000000-…-001" }
```

Bây giờ Monitor có `totalW2s == totalS2w` (cộng dồn các line đã có ở Scenario A + E + new).

### 11.2 Call netted với `hideBalanced=true`

```
GET http://localhost:4000/inventory/temp-warehouse/lines?branchId=20000000-0000-4000-8000-000000000001&hideOffsetting=true&hideBalanced=true
```

**Expected 200** — Monitor BIẾN MẤT khỏi `items` vì `totalW2s === totalS2w`. Các item còn lại (Shoe 39 Nâu = 1 S2W) vẫn xuất hiện.

### 11.3 `hideBalanced=true` mà thiếu `hideOffsetting=true` → 400

```
GET http://localhost:4000/inventory/temp-warehouse/lines?branchId=…&hideBalanced=true
```

**Expected 400**

```json
{
  "statusCode": 400,
  "code": "TEMP_WAREHOUSE_HIDE_BALANCED_REQUIRES_NETTED",
  "message": "hideBalanced=true requires hideOffsetting=true"
}
```

---

## 12. Scenario J — `GET /sessions/:id` có `carriers`

```
GET http://localhost:4000/inventory/temp-warehouse/sessions/<sessionId>
```

**Expected 200** — body trả session + `lines: TempWarehouseLine[]` + `carriers: Record<userId, PublicUser>` ở root. Mỗi `carrierUserId` non-null trong `lines` đều có entry trong `carriers`.

---

## 13. Scenario K — Close session (sanity, không hồi quy)

```
POST http://localhost:4000/inventory/temp-warehouse/sessions/<sessionId>/close
X-Idempotency-Key: 99999999-9999-9999-9999-999999999999

{ "mode": "NET_OFFSET" }
```

Verify response trả `autoBalancedLines` đầy đủ; replay cùng key + mode → response identical. Không có change về behavior này.

---

## 14. Postman Collection — gợi ý structure

```
Temp Warehouse / 0. Auth / Login → set {{token}}
Temp Warehouse / 1. Setup / SQL Reset (note in description)
Temp Warehouse / 2. Add Line - W2S Auto
Temp Warehouse / 3. Add Line - S2W Auto
Temp Warehouse / 4. Add Line - AMBIGUOUS (expects 400)
Temp Warehouse / 5. Add Line - NO_STOCK (expects 400)
Temp Warehouse / 6. Add Line - Explicit Direction
Temp Warehouse / 7. Replay Idempotent
Temp Warehouse / 8. List Raw (carriers)
Temp Warehouse / 9. List Netted
Temp Warehouse / 10. List Netted hideBalanced
Temp Warehouse / 11. List hideBalanced sai (expects 400)
Temp Warehouse / 12. Get Session By Id
Temp Warehouse / 13. Close NET_OFFSET
```

Trong tab `Tests` của từng request, dùng assertion mẫu:

```js
pm.test("status 200", () => pm.response.to.have.status(200));
pm.test("auto W2S", () => {
  const j = pm.response.json();
  pm.expect(j.line.direction).to.eql("warehouse_to_showroom");
});
pm.test("no passwordHash leak", () => {
  pm.expect(pm.response.text()).to.not.include("passwordHash");
});
```

Cho test 400:

```js
pm.test("400 ambiguous", () => {
  pm.response.to.have.status(400);
  pm.expect(pm.response.json().code).to.eql("TEMP_WAREHOUSE_DIRECTION_AMBIGUOUS");
});
```

---

## 15. Cleanup sau khi test

```sql
DELETE FROM temp_warehouse_lines WHERE session_id IN (
  SELECT id FROM temp_warehouse_sessions WHERE branch_id = '20000000-0000-4000-8000-000000000001'
);
DELETE FROM temp_warehouse_sessions WHERE branch_id = '20000000-0000-4000-8000-000000000001';
-- Stock balances giữ nguyên là OK; lần seed sau sẽ `ON CONFLICT DO NOTHING`.
```
