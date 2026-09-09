# Verification — pos-catalog-list-stock-aggregate

Đo 2026-09-08 trên `erp_dev_3008` (bản restore prod), org
`e60e5f49-304d-4eb1-9735-3a2d10ba288f`, chi nhánh
`71230276-ba6d-4293-a40f-2dae480a46d4` — **cùng chi nhánh xuất hiện trong log prod**
đã dựng nên phần Problem. 14 015 dòng `stock_balances` đang theo dõi.

Chạy lại bằng:

```bash
pnpm --filter @erp/api build
cd apps/api && DB_NAME=erp_dev_3008 \
  BENCH_ORG=e60e5f49-304d-4eb1-9735-3a2d10ba288f \
  BENCH_BRANCH=71230276-ba6d-4293-a40f-2dae480a46d4 \
  node scripts/bench-catalog-stock.js
```

Cả hai đường đo trong **cùng một lần chạy**, nên so sánh không phụ thuộc vào máy hay
vào con số ghi lại từ hôm khác. Đường cũ vẫn còn nguyên trong source (nó phục vụ đường
detail), nên nó được đo trực tiếp chứ không phải dựng lại.

## AC-07 — chi phí nạp tồn của đường list

| | Thời gian | Ngưỡng |
|---|---|---|
| Trước — dựng entity cho cả chi nhánh | **81.7 ms** avg (best 78.2) | — |
| Sau — một truy vấn gộp | **17.3 ms** avg (best 16.1) | ≤ 25 ms ✅ |

Giảm **4.7 lần**. Mỗi request giờ chạy 1 truy vấn thay vì 4–5, và không dựng entity nào.

## AC-08 — hàng xóm không còn bị kéo chậm

Một `findOne` theo khoá chính của `organizations` (chính là `GET /organizations/current/pos-settings`)
bắn cùng lúc với 4 lượt nạp tồn của đường list:

| | Thời gian | Ngưỡng |
|---|---|---|
| Chạy một mình | 0.7 ms | — |
| Trước, khi có 4 lượt list song song | **168.5 ms** | — |
| Sau, khi có 4 lượt list song song | **1.0 ms** | ≤ 25 ms ✅ |

Đây là con số quan trọng nhất của feature. Truy vấn 0.7 ms đó chính là thứ log prod báo
**875 ms**; nó chưa bao giờ chậm, nó chỉ đứng sau người khác. Sau thay đổi nó về sát tốc
độ chạy một mình (1.0 ms so với 0.7 ms) — phần tranh chấp gần như biến mất.

## AC-01..AC-06 — đối chiếu ngữ nghĩa trên dữ liệu thật

Ngoài unit test, đường cũ và đường mới được chạy song song và so từng item trên **toàn
bộ** dữ liệu của org, không phải trên fixture:

```
15 chi nhánh × 3 giá trị direction (không truyền / SHOWROOM / WAREHOUSE)
45 tổ hợp — 0 tổ hợp có bất kỳ khác biệt nào
```

So cả **giá trị** (chênh lệch > 1e-9 là fail) lẫn **tập khoá** (item có trong map này mà
không có trong map kia). Bao gồm chi nhánh không cấu hình showroom và location có
`storage_id` NULL — hai nhánh biên mà `NOT IN` trần sẽ làm sai.

SQL sinh ra:

```sql
SELECT "sb"."item_id" AS "itemId", SUM("sb"."quantity") AS "total"
  FROM "stock_balances" "sb"
 INNER JOIN "locations" "l"
    ON "l"."id" = "sb"."location_id" AND "l"."organization_id" = $1 AND "l"."is_active" = true
 WHERE "sb"."organization_id" = $1 AND "sb"."branch_id" = $2 AND "sb"."is_tracked" = true
 GROUP BY "sb"."item_id"
```

## Test

```
pnpm --filter @erp/api test -- pos-catalog-product.service.spec.ts
Tests: 58 passed, 58 total
```

Toàn bộ suite `@erp/api`: 4237 passed, 2 failed — hai lỗi đó ở
`auth.service.spec.ts` ("token TTL"), **đã hỏng sẵn ở HEAD** trước thay đổi này
(kiểm bằng `git stash` rồi chạy lại), không liên quan.

## ADR-01 — `loadBranchStock` không bị chạm

`git diff` trên service chỉ xoá đúng hai dòng, cả hai nằm trong `listProducts`:

```
-    const stockByItem = await this.loadBranchStock(orgId, branchId, query.direction);
-          (sum, id) => sum + (stockByItem.get(id)?.total ?? 0),
```

`loadBranchStock`, `loadDetailStockExtras`, `buildProductDetail`, `buildItemDetail`:
không dòng nào. Hồi quy `sellableQuantity` là bất khả thi về mặt cơ học.

Trong spec, chỉ ba dòng bị xoá — đều là mock, không assert nào:

```
-      balanceRepo.find.mockResolvedValue(balances);
-      locationRepo.find.mockResolvedValue(locations);
-      balanceRepo.find.mockResolvedValue([{ itemId: 'I1', locationId: 'L1', quantity: 99 }]);
```

Mọi con số các test list cũ đang assert (`quantityOnHand: 10`, `99`, `8`…) giữ nguyên.

## Ghi chú còn lại

- Sau thay đổi, tham số `direction` của `loadBranchStock` không còn caller nào truyền
  (hai caller đường detail đều truyền `undefined`). Cố ý **không xoá**: ADR-01 cấm chạm,
  và luật repo là không dọn code chết không được yêu cầu.
- `uowg` cảnh báo plan viết theo ruleset 4 còn tool enforce 5. `.ai/aidlc.yaml` ghim
  ruleset ở mức repo cho cả 80+ feature, nên không đổi trong feature này. Ruleset 5 thêm
  yêu cầu evidence ở G4, mà repo chưa cấu hình khối `evidence:` nên không có tác dụng.
