---
id: UOW-04
slug: partner-product-detail
title: Đối tác xem chi tiết một sản phẩm cùng biến thể
demoable: true
duration: 2d
depends_on: [UOW-03]
requirements: [US-03]
verifies: [AC-15, AC-16, AC-17, AC-18, AC-25]
risk: low
status: todo
rollback: Gỡ route `products/:productCode`; hai endpoint kia không phụ thuộc vào nó
---

# UOW-04 — Đối tác xem chi tiết một sản phẩm cùng biến thể

## Demo script
1. Lấy `code` của một dòng từ kết quả search (ví dụ `TN398`), gọi `GET /v2/partner/catalog/products/TN398`
2. Chỉ ra `attributes` liệt kê Size và Color với các giá trị chọn được
3. Chỉ ra `variants` đủ biến thể, mỗi cái có `price`, `inStock` và tổ hợp thuộc tính
4. Chỉ ra `images` là `[]`
5. Gọi với một mã không tồn tại → 404
6. Gọi với mã chỉ tồn tại ở tổ chức khác → 404 với thông điệp **giống hệt**
7. Gọi với mã của product mà mọi biến thể đã tắt → 404, đồng nhất với việc nó vắng mặt trong search
8. Gọi với UUID `products.id` của `TN398`, với `tn398` viết thường, và với SKU biến thể `TN398-BO-38` → cả ba 404

## In scope
- Endpoint chi tiết với danh sách chiều thuộc tính và danh sách biến thể
- Khoá route là `products.code`, khớp chính xác (ADR-09)
- 404 không phân biệt cho mọi trường hợp không-trả-được

## Not in scope
- Ảnh sản phẩm (không có nơi lưu — xem Out of scope của intent)
- Sản phẩm liên quan / gợi ý
- Tồn kho theo số lượng
- Tra theo UUID hoặc SKU biến thể (A-17)
- Bộ lọc màu/size trên trang chi tiết (A-18)

## Risks

| Risk | Mitigation |
|---|---|
| Trả 403 thay vì 404 cho mã của tổ chức khác sẽ xác nhận mã đó có thật | AC-17 kiểm cả mã lỗi lẫn chuỗi thông điệp |
| Lọc phạm vi tổ chức sau khi đã lấy dữ liệu ra | T-04-02 yêu cầu điều kiện nằm trong WHERE; done-when có mục riêng cho việc này |
| Tra không phân biệt hoa thường hoặc thêm `OR p.id` "cho tiện" tạo hai khoá cho một route | T-04-04 khoá SQL `p.code = $2`; AC-25 có ca UUID, chữ thường, SKU biến thể |

## Definition of done

- [x] AC-15..AC-18, AC-25 pass — e2e `partner-catalog.e2e-spec.ts` 38/38 (2026-09-13, `OUTBOX_RELAY_DISABLED=1`), nhóm product detail; unit `get-partner-product.handler.spec.ts` 15/15
- [x] Mọi trường hợp 404 cho cùng một thông điệp, có test khẳng định — unit 'throws the identical 404 for missing, foreign and retired products'; e2e AC-17 so `{statusCode, message, error}` của mã tổ chức khác với mã không tồn tại; e2e AC-25 (UUID, chữ thường, SKU biến thể)
- [x] Phạm vi tổ chức nằm trong mệnh đề WHERE, không lọc sau khi lấy — unit 'scopes by organization inside the WHERE clause'; e2e 'returns this organization's product when another organization reuses the code'
- [x] Demo và nghiệm thu tại gate G4 — nghiệm thu: Akenzy, 2026-09-14 ("please done it. pass G5"), dựa trên bằng chứng demo tự động: gói cURL `docs/partner-catalog-api-curls` 37/37 qua HTTP, e2e `partner-catalog.e2e-spec.ts` 38/38 và `partner-catalog-filters.e2e-spec.ts` 17/17, `07-performance.md`; không có buổi demo trực tiếp
