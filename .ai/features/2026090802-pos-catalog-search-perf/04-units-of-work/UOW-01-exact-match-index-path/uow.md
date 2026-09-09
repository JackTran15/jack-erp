---
id: UOW-01
slug: exact-match-index-path
title: Tra khớp tuyệt đối mã SKU/mã vạch đi index thay vì quét bảng
demoable: true
duration: 1d
depends_on: []
requirements: [US-03]
verifies: [AC-07]
risk: low
status: todo
rollback: revert 1 commit — `lookupByCode` quay lại dạng `OR` cũ; không có migration, không có thay đổi hợp đồng
---

# UOW-01 — Tra khớp tuyệt đối đi index

## Demo script
1. `psql erp_dev_3008` → chạy `EXPLAIN (ANALYZE) …` cho dạng cũ, chỉ ra hai dòng
   `Seq Scan on items` (21 024) và `Seq Scan on item_barcodes` (21 023), 25,3 ms.
2. Chạy lại với truy vấn sau thay đổi → hai `Index Scan`
   (`UQ_72337e6413e97c8b8fc2e1aaabf`, `UQ_item_barcodes_org_code`), ≤ 5 ms, 0 seq scan.
3. Mở POS checkout chi nhánh Nha Trang, quét một mã vạch có thật → item vào giỏ
   đúng 1 lần, y như trước.
4. Quét một mã không tồn tại → dropdown gợi ý mở ra như cũ (đường `miss` không đổi).

## In scope
- Một hàm dựng SQL dùng chung cho nhánh khớp tuyệt đối, dạng `UNION` hai nhánh index.
- `PosCatalogService.lookupByCode` gọi hàm đó.

## Not in scope
- Đường gợi ý ILIKE (UOW-02).
- Endpoint mới (UOW-03), FE (UOW-04).
- Thêm index — ADR-06: đường này không thiếu index nào.

## Risks
| Risk | Mitigation |
|---|---|
| `UNION` khử trùng theo `id` làm mất dòng khi một item khớp cả `items.code` lẫn `item_barcodes.code` | Đúng hành vi mong muốn — `aggregateStockRows` vốn đã gom theo `itemId`. Spec phủ ca item có mã vạch trùng chính mã SKU của nó |
| Hai bản sao SQL (`lookupByCode` và handler mới ở UOW-03) trôi lệch nhau | Builder dùng chung ngay từ ticket đầu, không copy-paste. Tiền lệ: [[project_invoice_number_format]] |

## Definition of done
- [x] AC-07 pass
- [x] `EXPLAIN ANALYZE` sau thay đổi không chứa `Seq Scan on items` và `Seq Scan on item_barcodes`
- [x] `pos-catalog.service.spec.ts` xanh, có ca khớp qua `items.code`, ca khớp qua `item_barcodes.code`, ca khớp cả hai, ca 0 khớp
- [x] Hợp đồng `GET /catalog/lookup` không đổi — `openapi.snapshot.json` không có diff
- [x] Demoed và accepted ở G4
