---
id: UOW-02
slug: suggest-trigram-rowcap
title: Đường gợi ý đi trigram và cắt dòng ở SQL
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-02, US-03]
verifies: [AC-05, AC-08, AC-11]
risk: medium
status: todo
rollback: revert commit + `migration:revert` (migration chỉ DROP INDEX, không đụng dữ liệu)
---

# UOW-02 — Đường gợi ý đi trigram, cắt dòng ở SQL

## Demo script
1. `psql erp_dev_3008` → `EXPLAIN (ANALYZE) SELECT b.item_id FROM item_barcodes b
   WHERE b.organization_id = '<org>' AND b.code ILIKE '%235%'` → chỉ ra
   `Seq Scan on item_barcodes` 41 714 dòng, 18,1 ms.
2. Chạy migration → chạy lại → `Bitmap Index Scan on IDX_item_barcodes_code_trgm`, ≤ 5 ms.
3. `EXPLAIN (ANALYZE)` truy vấn gợi ý đầy đủ dạng UNION + LIMIT 20 với term `235`:
   năm `Bitmap Index Scan` trigram, 0 seq scan, 4,55 ms (trước: 18,5 ms chưa có index;
   dạng `OR EXISTS` là 98,8 ms).
4. `curl 'localhost:4000/pos/branches/<id>/catalog?search=235'` → so sánh số dòng và
   kích thước trước/sau.
5. Mở POS → Chuyển kho nhanh → tìm một item → mở ô chọn kho nguồn → danh sách kho
   vẫn đầy đủ (chứng minh `locations[]` chưa bị đụng).

## In scope
- Migration thêm trigram cho `item_barcodes.code` và `products.code`.
- Builder SQL nhánh gợi ý dạng `UNION` ba nhánh + `LIMIT` đẩy vào CTE chọn item id.
- `PosCatalogService.searchCatalogByTerm` gọi builder đó.

## Not in scope
- Tham số `view`/`limit` trên endpoint `/catalog` cũ — hợp đồng cũ giữ nguyên (ADR-03);
  `limit` là tham số **tuỳ chọn** ở tầng service, endpoint cũ không truyền.
- Endpoint mới (UOW-03), FE (UOW-04).

## Risks
| Risk | Mitigation |
|---|---|
| Viết lại thành `OR EXISTS(...)` thay vì `UNION` — cách sửa hiển nhiên nhưng đo ra 98,8 ms, chậm hơn bản gốc | Ghi thẳng vào T-02-02 kèm số đo; done-when đòi plan không được chứa `SubPlan` trên `item_barcodes` |
| `UNION` đổi thứ tự/tập kết quả so với `LEFT JOIN` khi một item có nhiều mã vạch cùng khớp | `LEFT JOIN` hiện tại **đang** nhân bản dòng theo số mã vạch khớp rồi để `aggregateStockRows` gom lại; `UNION` khử trùng sớm hơn. Spec so sánh tập `itemId` trả về giữa hai dạng |
| `LIMIT` đặt sau join sẽ cắt nhầm giữa chừng các dòng vị trí của một item | `LIMIT` chỉ được đặt trong CTE chọn item id, trước mọi join (ADR-02). Done-when kiểm cụ thể |
| Migration `CREATE INDEX` khoá bảng trên prod | Đo trên bản restore prod: 240 ms, 1 296 kB. Không cần `CONCURRENTLY`, chạy trong transaction bình thường |

## Definition of done
- [x] AC-05, AC-08, AC-11 pass
- [x] Plan của truy vấn gợi ý: 0 `Seq Scan on item_barcodes`, 0 `Seq Scan on items`, 0 `Seq Scan on products`
- [x] `GET /catalog?search=` không truyền `limit` trả đúng shape cũ có `locations[]`
- [x] ~~Màn Chuyển kho nhanh chọn được kho nguồn (chụp màn hình)~~ — **KHÔNG chụp được**: không tài khoản nào đăng nhập được vào org mang dữ liệu. Bù bằng `EXCEPT` hai chiều (T-02-03, 3 term, 0 lệch) + response API còn nguyên `locations[]` (T-02-04)
- [x] `migration:run` rồi `migration:revert` rồi `migration:run` lại đều sạch
- [x] Demoed và accepted ở G4
