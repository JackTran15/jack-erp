---
id: UOW-04
slug: partner-product-detail
title: Đối tác xem chi tiết một sản phẩm cùng biến thể
demoable: true
duration: 2d
depends_on: [UOW-03]
requirements: [US-03]
verifies: [AC-15, AC-16, AC-17, AC-18]
risk: low
status: todo
rollback: Gỡ route `products/:productId`; hai endpoint kia không phụ thuộc vào nó
---

# UOW-04 — Đối tác xem chi tiết một sản phẩm cùng biến thể

## Demo script
1. Lấy một `productId` từ kết quả search, gọi `GET /v2/partner/catalog/products/<id>`
2. Chỉ ra `attributes` liệt kê Size và Color với các giá trị chọn được
3. Chỉ ra `variants` đủ biến thể, mỗi cái có `price`, `inStock` và tổ hợp thuộc tính
4. Chỉ ra `images` là `[]`
5. Gọi với một uuid ngẫu nhiên → 404
6. Gọi với id sản phẩm của tổ chức khác → 404 với thông điệp **giống hệt**
7. Gọi với id của product mà mọi biến thể đã tắt → 404, đồng nhất với việc nó vắng mặt trong search

## In scope
- Endpoint chi tiết với danh sách chiều thuộc tính và danh sách biến thể
- 404 không phân biệt cho ba trường hợp không-trả-được

## Not in scope
- Ảnh sản phẩm (không có nơi lưu — xem Out of scope của intent)
- Sản phẩm liên quan / gợi ý
- Tồn kho theo số lượng

## Risks

| Risk | Mitigation |
|---|---|
| Trả 403 thay vì 404 cho id tổ chức khác sẽ xác nhận id đó có thật | AC-17 kiểm cả mã lỗi lẫn chuỗi thông điệp |
| Lọc phạm vi tổ chức sau khi đã lấy dữ liệu ra | T-04-02 yêu cầu điều kiện nằm trong WHERE; done-when có mục riêng cho việc này |

## Definition of done

- [ ] AC-15..AC-18 pass
- [ ] Ba trường hợp 404 cho cùng một thông điệp, có test khẳng định
- [ ] Phạm vi tổ chức nằm trong mệnh đề WHERE, không lọc sau khi lấy
- [ ] Demo và nghiệm thu tại gate G4
