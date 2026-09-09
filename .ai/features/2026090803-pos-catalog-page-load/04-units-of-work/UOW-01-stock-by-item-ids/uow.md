---
id: UOW-01
slug: stock-by-item-ids
title: Endpoint trả tồn cho đúng một danh sách itemIds
demoable: true
duration: 1d
depends_on: []
requirements: [US-02]
verifies: [AC-07, AC-12]
risk: low
status: todo
rollback: gỡ route khỏi controller — endpoint biến mất, chưa consumer nào gọi, ba endpoint catalog cũ không đụng
---

# UOW-01 — Tồn theo itemIds

## Demo script
1. `curl -X POST '…/pos/branches/<id>/catalog/stock' -d '{"itemIds":["<i1>","<i2>"]}'`
   → 200, đúng 2 phần tử shape `PosCatalogLine`, kèm `locations[]` và `sellableQuantity`.
2. So `sellableQuantity` của một item với `GET /catalog/search?q=<code>&mode=exact`
   → hai số bằng nhau (AC-07).
3. `itemIds: []` → 400. `itemIds` chứa 201 phần tử → 400. Một id lạ → 200, ít phần tử hơn.
4. `curl 'GET …/catalog?search=235'` → shape cũ không đổi (AC-12).
5. `/docs` → endpoint mới có schema đầy đủ.

## In scope
- CTE lọc theo `itemIds`, service `getStockForItems`, DTO, route, regenerate api-client.

## Not in scope
- Mọi thay đổi FE (UOW-02..04).
- Đụng vào `GET /catalog` — endpoint đó giữ nguyên.

## Risks
| Risk | Mitigation |
|---|---|
| Dùng `IN (...)` nội suy chuỗi thay vì tham số → SQL injection | Truyền mảng qua `= ANY($3::uuid[])`, một tham số. Done-when kiểm SQL không có nội suy id |
| `sellableQuantity` lệch với đường `search` vì tính bằng đường khác | Bắt buộc đi qua `aggregateStockRows` + `getBranchDelta` như hai đường kia; demo bước 2 là bài kiểm |
| Route `POST /catalog/stock` bị `IdempotencyInterceptor` chặn | Đây là đường đọc; không gửi `X-Idempotency-Key` thì interceptor cho qua. Done-when có curl chứng minh gọi hai lần cùng body đều 200 |

## Definition of done
- [x] AC-07, AC-12 pass
- [x] SQL dùng `= ANY($n::uuid[])`, không nội suy id vào chuỗi
- [x] `EXPLAIN ANALYZE` dùng `IDX_stock_balances_org_branch_item`, không seq scan
- [x] Spec phủ: 3 id → 3 phần tử; id lạ → bỏ qua; `sellableQuantity` gồm delta kho tạm
- [x] `/docs-json` có schema đầy đủ, `openapi.snapshot.json` + `schema.ts` đã regenerate
- [x] Demoed và accepted ở G4
