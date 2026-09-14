---
id: UOW-02
slug: partner-product-search
title: Đối tác tìm sản phẩm theo từ khoá và nhóm hàng, có phân trang và sắp xếp
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-05, AC-06, AC-09, AC-10, AC-11, AC-13, AC-14]
risk: medium
status: todo
rollback: Gỡ route `products/search` khỏi controller; cây nhóm hàng của UOW-01 vẫn chạy độc lập
---

# UOW-02 — Đối tác tìm sản phẩm theo từ khoá và nhóm hàng, có phân trang và sắp xếp

## Demo script
1. Gọi search không tham số → trang 1, 20 dòng, `total` là tổng danh mục
2. Lọc `categoryId` = "GIÀY DÉP" (nhóm cha, 0 item trực tiếp) → vẫn ra hàng của nhóm con
3. Tìm `keyword: "búp bê"` rồi `keyword: "MY88610"` → cùng ra sản phẩm đó
4. Đổi `sort` qua `price_asc`, `price_desc`, `newest` → thứ tự đổi tương ứng
5. Nhảy tới `page: 6` → 7 dòng còn lại, `total` không đổi
6. Gửi `sort: "popular"` → 400; gửi `limit: 500` → 400
7. Chỉ ra response không có trường nào tên `purchasePrice`

## In scope
- Endpoint tìm sản phẩm: từ khoá, nhóm hàng (gồm nhánh con), phân trang, 3 kiểu sắp xếp
- Hình dạng dòng kết quả với `priceMin`/`priceMax` và `images: []`

## Not in scope
- Lọc theo giá, màu, size và cờ `inStock` (UOW-03)
- Chi tiết sản phẩm (UOW-04)
- Hàng lẻ không thuộc product nào (`product_id IS NULL`)
- Sắp xếp theo độ phổ biến (A-04 đã loại khỏi hợp đồng)

## Risks

| Risk | Mitigation |
|---|---|
| Lọc nhóm cha trả 0 dòng — đúng lỗi D1 đã gặp ở báo cáo kho | AC-06 có test riêng dùng đúng một nhóm cha không có item trực tiếp |
| `decimal` của TypeORM trả string làm `priceMin` thành `"750000.00"` | `::float` tường minh, và test khẳng định kiểu `number` |
| `OR EXISTS` trên lưới này từng chậm hơn bản gốc 20× ở feature POS catalog | T-02-03 phải đo trước khi chốt hình dạng truy vấn keyword |

## Definition of done

- [x] AC-05, AC-06, AC-09, AC-10, AC-11, AC-13, AC-14 pass — `pnpm --filter @erp/api test -- partner-catalog` 172/172, 10 suite (2026-09-13); e2e `partner-catalog.e2e-spec.ts` 38/38 (2026-09-13, `OUTBOX_RELAY_DISABLED=1`), nhóm product search
- [x] Mỗi bộ lọc có một test dùng giá trị không thể có và đòi 0 dòng — keyword: e2e 'returns zero rows for a keyword that cannot match anything'; categoryId: e2e 'returns nothing for a category id belonging to nobody'
- [x] Thứ tự phân trang ổn định: có khoá phụ `p.id` trong mọi mệnh đề `ORDER BY` — `partner-product-sort.ts`: cả 3 mệnh đề kết thúc `a.id ASC` (`agg.id` = `p.id`); e2e 'pages without repeating or dropping a row'
- [x] Không sửa file nào ngoài `modules/partner-catalog/` và test — theo `touches:` đã khai báo của T-02-01..05 (tất cả trong `modules/partner-catalog/` và `test/e2e/partner-catalog.e2e-spec.ts`), `aidlc lint-touches` sạch; commit gốc 27b6f406 gộp nhiều feature nên không tách được theo file thực tế
- [x] Demo và nghiệm thu tại gate G4 — nghiệm thu: Akenzy, 2026-09-14 ("please done it. pass G5"), dựa trên bằng chứng demo tự động: gói cURL `docs/partner-catalog-api-curls` 37/37 qua HTTP, e2e `partner-catalog.e2e-spec.ts` 38/38 và `partner-catalog-filters.e2e-spec.ts` 17/17, `07-performance.md`; không có buổi demo trực tiếp
