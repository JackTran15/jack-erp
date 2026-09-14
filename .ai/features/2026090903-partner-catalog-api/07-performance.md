---
feature: partner-catalog-api
kind: performance-check
date: 2026-09-13
db: erp_dev_3008
build: this checkout, apps/api/dist on :4200 (OUTBOX_RELAY_DISABLED=1)
---

# Kiểm tra hiệu năng — 3 API danh mục đối tác

Đo sau khi mọi ticket (23/23) đã xong: route chi tiết theo `products.code`, dòng kết quả thu hẹp theo biến thể
khớp, bộ lọc `inStock`, `in_stock` lấy từ một `LEFT JOIN` trên tập item còn tồn.

## Cách đo

- **Máy chủ:** build của chính checkout này, `node dist/main` trên `:4200`, `OUTBOX_RELAY_DISABLED=1`. `:4000`
  trống; `:4100` là API của checkout `jack-erp`, không dùng.
- **Dữ liệu:** `erp_dev_3008`, hai tổ chức có quy mô danh mục gần nhau nhưng tồn kho chênh 11,6 lần:

| Tổ chức | Nhóm ACTIVE | Product | Item active | Dòng `stock_balances` | Dòng > 0 | Item còn tồn |
|---|---|---|---|---|---|---|
| My Company `f1000000-…0001` | 31 | 2.374 | 20.318 | 13.013 | 12.487 | 9.557 |
| MT `e60e5f49-…288f` | 31 | 2.358 | 21.026 | **151.469** | 127.024 | 14.959 |

- **Xác thực:** mỗi tổ chức hai API key **thật** trên role "Đối tác" có sẵn (chỉ `partner.catalog.read`): một không
  giới hạn, một giới hạn 2 chi nhánh. Tạo tạm (shadow user + `user_roles` + `api_keys`, tiền tố `TMP-PERFALL`),
  xoá trong `finally`; đếm lại sau khi xoá: 0 key, 0 user.
- **Độ trễ:** tuần tự, 5 request khởi động rồi 50 request đo mỗi kịch bản, `X-Forwarded-For: 127.0.0.1`; thời
  gian phía client, gồm đọc body.
- **Tải:** 200 request, 10 client đồng thời, một tiến trình API.
- **Thời gian DB:** `EXPLAIN ANALYZE` đúng SQL các handler sinh ra, median 5 lần, trong
  `BEGIN TRANSACTION READ ONLY`. "Tập tồn" là phần cây kế hoạch chỉ đọc `stock_balances`.
- **Giới hạn:** client, API, Postgres, Redis, Redpanda cùng một máy — so các kịch bản với nhau và với ngưỡng,
  không so với production.
- Script và log: `scratchpad/perf-all-http.cjs`, `perf-all-results.json`, `explain-all.ts`, `explain-all.log`.

## Kết quả theo ngưỡng (NFR ở `02-requirements.md`)

| Endpoint | Ngưỡng | p95 xấu nhất · My Company | p95 xấu nhất · MT | Kết luận |
|---|---|---|---|---|
| `POST /v2/partner/catalog/categories/tree` | < 200 ms | 14,1 ms | 11,3 ms | Đạt |
| `POST /v2/partner/catalog/products/search` | < 500 ms | 134,9 ms | 261,0 ms | Đạt |
| `GET /v2/partner/catalog/products/:productCode` | chưa đặt | 4,4 ms | 4,2 ms | — |

## Độ trễ từng kịch bản (ms)

| Endpoint | Kịch bản | My Company p50 / p95 / p99 | MT p50 / p95 / p99 | Kết quả MC · MT |
|---|---|---|---|---|
| tree | toàn tổ chức | 12,0 / 13,4 / 14,2 | 10,1 / 11,0 / 14,0 | 3 gốc · 3 gốc |
| tree | key 2 chi nhánh | 11,1 / 14,1 / 14,2 | 10,6 / 11,3 / 15,8 | 3 gốc · 3 gốc |
| search | không lọc | 36,8 / 40,1 / 43,5 | 74,1 / 80,9 / 89,7 | 2317 · 2358 |
| search | keyword (3 ký tự đầu mã lớn nhất) | 44,3 / 50,7 / 52,8 | 81,3 / 84,0 / 86,6 | 31 · 31 |
| search | keyword không khớp | 41,7 / 45,2 / 59,0 | 77,8 / 80,7 / 88,3 | 0 · 0 |
| search | categoryId gốc lớn nhất | 37,7 / 41,6 / 54,9 | 75,6 / 79,8 / 90,4 | 1733 · 1779 |
| search | giá 500k–1M | 39,4 / 45,5 / 46,9 | 76,7 / 85,5 / 89,1 | 1388 · 1421 |
| search | màu BA + size 39 | 102,3 / 109,9 / 124,1 | 140,7 / 145,2 / 152,5 | 52 · 54 |
| search | màu BA + size 39 + `inStock=true` | 102,6 / 108,5 / 113,1 | 143,1 / **261,0** / **562,7** | 18 · 41 |
| search | `inStock=true` | 35,4 / 41,9 / 44,3 | 74,5 / 85,1 / 166,6 | 1434 · 2197 |
| search | `inStock=false` | 35,5 / 38,3 / 40,7 | 70,4 / 74,8 / 77,8 | 883 · 161 |
| search | mọi bộ lọc + `price_asc` | 121,8 / 134,9 / 140,8 | 158,7 / 166,0 / 171,7 | 8 · 23 |
| search | `price_desc` | 36,0 / 43,7 / 47,0 | 72,4 / 80,1 / 90,8 | 2317 · 2358 |
| search | trang 100 | 38,0 / 44,2 / 47,8 | 75,0 / 82,1 / 93,4 | 2317 · 2358 |
| search | `limit=100` | 48,6 / 53,2 / 69,6 | 87,3 / 90,0 / 90,8 | 2317 · 2358 |
| search | `inStock=true`, key 2 chi nhánh | 28,3 / 31,6 / 34,6 | 37,1 / 41,3 / 42,6 | 32 · 1178 |
| search | màu+size+`inStock=true`, key 2 chi nhánh | 96,1 / 102,5 / 113,0 | 105,1 / 113,1 / 115,5 | 1 · 24 |
| detail | 1 biến thể | 2,6 / 2,9 / 3,0 | 2,5 / 2,8 / 3,0 | — |
| detail | lớn nhất, 30 biến thể (`SAN7826`) | 3,1 / 3,5 / 12,5 | 3,4 / 4,2 / 6,5 | — |
| detail | lớn nhất, key 2 chi nhánh | 3,1 / 4,4 / 6,2 | 3,2 / 3,8 / 3,9 | — |
| detail | mã không tồn tại → 404 | 2,5 / 3,5 / 3,7 | 2,4 / 2,7 / 2,8 | — |

## Dưới tải (200 request, 10 đồng thời)

| Endpoint · kịch bản | My Company req/s · p50 · p95 · max | MT req/s · p50 · p95 · max | Lỗi |
|---|---|---|---|
| tree | 316 · 30,0 · 46,4 · 59,8 | 330 · 28,7 · 47,6 · 62,3 | 0 |
| search · màu+size+`inStock=true` | 38 · 258,1 · 337,7 · 421,3 | 27 · 365,6 · **463,5** · **569,5** | 0 |
| search · không lọc | 162 · 60,2 · 78,8 · 86,2 | 88 · 109,9 · 148,7 · 185,1 | 0 |
| detail · 30 biến thể | 1650 · 5,7 · 8,3 · 10,2 | 1703 · 5,5 · 8,3 · 12,4 | 0 |

## Thời gian trong DB (ms, median 5 lần `EXPLAIN ANALYZE`)

| Tổ chức | Kịch bản | Phạm vi | data · count · facets | Tập tồn |
|---|---|---|---|---|
| My Company | tree: pairs · danh sách nhóm | toàn tổ chức | 8,2 · 0,0 | — |
| My Company | search không lọc | toàn tổ chức | 36,7 · 10,6 · 1,2 | 5,1 |
| My Company | search `inStock=true` | toàn tổ chức | 36,2 · 18,7 · 0,9 | 10,4 |
| My Company | search màu+size+`inStock=true` | toàn tổ chức | 128,3 · 103,7 · 0,2 | 10,6 |
| My Company | search `limit=100` | toàn tổ chức | 37,0 · 10,5 · 16,5 | 5,2 |
| My Company | search `inStock=true` | 2 chi nhánh | 26,2 · 12,2 · 1,6 | 0,5 |
| My Company | detail 30 biến thể | toàn tổ chức | 0,5 | 0,1 |
| MT | tree: pairs · danh sách nhóm | toàn tổ chức | 7,5 · 0,0 | — |
| MT | search không lọc | toàn tổ chức | 73,3 · 10,3 · 1,8 | **41,9** |
| MT | search `inStock=true` | toàn tổ chức | 74,7 · 56,6 · 1,8 | **84,3** |
| MT | search màu+size+`inStock=true` | toàn tổ chức | 168,4 · 140,0 · 0,3 | **86,4** |
| MT | search `limit=100` | toàn tổ chức | 76,1 · 10,9 · 18,0 | 43,0 |
| MT | search không lọc | 2 chi nhánh | 40,2 · 10,6 · 1,7 | 7,6 |
| MT | search `inStock=true` | 2 chi nhánh | 38,6 · 22,3 · 1,7 | 15,6 |
| MT | search màu+size+`inStock=true` | 2 chi nhánh | 133,2 · 111,6 · 0,2 | 16,0 |
| MT | detail 30 biến thể | toàn tổ chức | 0,4 | 0,1 |

## Phát hiện

1. **Tree và detail gần như không tốn gì.** Tree p95 11–14 ms (ngưỡng 200), 8 ms trong DB. Detail p95 < 4,5 ms kể
   cả product 30 biến thể, < 1 ms trong DB. Dưới tải: ~320 và ~1.700 req/s.
2. **Search trên MT trả giá cho số dòng tồn ở mọi request.** Tập item còn tồn đọc toàn bộ `stock_balances` của
   tổ chức: 5 ms ở My Company, **42 ms ở MT** — 57% câu data không lọc. Có bộ lọc `inStock` thì câu count cũng dựng
   tập này: ~84 ms mỗi request. Key giới hạn 2 chi nhánh còn 8–16 ms nhờ index `(organization_id, branch_id,
   item_id)` có sẵn. Không index nào của `stock_balances` phục vụ `(organization_id, item_id) WHERE quantity > 0`.
3. **Lọc màu/size làm phần nặng nhất hai lần.** CTE thuộc tính chạy ở cả câu data lẫn câu count (104–168 ms mỗi
   câu trên MT). Hai câu chạy song song nên một request vẫn 145–261 ms p95, nhưng giữ hai connection làm cùng việc.
4. **Gần ngưỡng nhất khi có tải.** MT màu+size+`inStock=true`, 10 đồng thời: p95 463,5 ms, max 569,5 ms, 27 req/s,
   0 lỗi. Chạy tuần tự, 1/50 request mất 562,7 ms (p99). NFR là p95 từng request — **đạt**; chưa có NFR về tải.

## Hướng xử lý nếu cần thêm dư địa — chưa áp dụng, cần quyết định

| Cách | Tác động kỳ vọng | Đổi gì | Rủi ro / đánh đổi |
|---|---|---|---|
| Partial index `stock_balances (organization_id, item_id) WHERE quantity > 0` | Tập tồn đọc bằng index thay vì toàn bộ dòng của org | Migration | Thêm chi phí ghi cho `stock_balances`; cần đo lại trước khi chốt |
| Trả `total` bằng `COUNT(*) OVER ()` trong câu data | Bỏ câu count riêng: CTE thuộc tính và tập tồn chạy một lần mỗi request | Handler + test (T mới) | Câu data phải gộp hết nhóm trước khi `LIMIT` — hiện đã vậy |
| Cache ngắn hạn tập item còn tồn theo (org, phạm vi chi nhánh) | Gỡ 42–84 ms khỏi mọi search trên MT | Handler + Redis | `inStock` trễ tối đa bằng TTL — cần sửa ADR-06 |

Không cách nào ở trên cần cho NFR hiện tại. Nếu chọn làm, mở lại G1 (thêm NFR về tải) hoặc thêm ticket trong
UoW mới rồi đi lại G2–G3 như bình thường.
