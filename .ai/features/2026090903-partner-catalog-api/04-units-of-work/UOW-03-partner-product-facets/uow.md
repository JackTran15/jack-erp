---
id: UOW-03
slug: partner-product-facets
title: Đối tác lọc theo giá, màu, size và thấy tình trạng còn hàng
demoable: true
duration: 2d
depends_on: [UOW-02]
requirements: [US-02]
verifies: [AC-07, AC-08, AC-12]
risk: medium
status: todo
rollback: Gỡ các mệnh đề lọc thuộc tính và cột `inStock` khỏi handler; endpoint search của UOW-02 vẫn chạy
---

# UOW-03 — Đối tác lọc theo giá, màu, size và thấy tình trạng còn hàng

## Demo script
1. Thêm `priceFrom`/`priceTo` vào search → số dòng giảm đúng theo khoảng giá
2. Thêm `colors: ["BA"], sizes: ["39"]` → chỉ còn sản phẩm có đúng biến thể đó
3. Đổi sang `colors: ["D"], sizes: ["39"]` (tổ hợp không tồn tại) → 0 dòng, chứng minh khớp trên cùng một biến thể chứ không phải giao hai tập rời
4. Chỉ ra `colors`/`sizes` trong dòng kết quả là mã thô của ERP, đúng chốt A-02
5. Chỉ ra một dòng có `inStock: true` dù chi nhánh đang đăng nhập đã hết hàng
6. Gọi lại đúng request đó nhưng thêm header `X-Branch-Id` khác → kết quả không đổi
7. Đọc số đo p95 của request có lọc màu + size

## In scope
- Lọc khoảng giá, màu, size — khớp trên cùng một biến thể
- `colors`/`sizes` trong dòng kết quả
- Cờ `inStock` gộp toàn tổ chức
- Đo hiệu năng trên dữ liệu erp_dev

## Not in scope
- Số lượng tồn chính xác (ADR-06 loại tường minh)
- Tên màu hoặc mã hex (A-02 chốt trả mã thô)
- Dọn dữ liệu option bẩn `35,` / `36,` / `D,` (A-13)

## Risks

| Risk | Mitigation |
|---|---|
| Lọc rời từng thuộc tính rồi giao ở mức product cho kết quả sai | AC-08 có ca kiểm chính xác trường hợp này: tổ hợp không tồn tại phải ra 0 dòng |
| `EXISTS` lồng qua 3 bảng thuộc tính có thể sập hiệu năng | T-03-02 bắt buộc chạy `EXPLAIN ANALYZE`; T-03-03 ghi số đo thật, không suy luận |
| Đo trên API `:4000` đang chạy từ checkout khác trỏ DB khác | T-03-03 dựng cổng riêng `:4100` và ghi lại cổng cùng tên DB đã đo |

## Definition of done

- [x] AC-07, AC-08, AC-12 pass — e2e `partner-catalog.e2e-spec.ts` 38/38 (2026-09-13, `OUTBOX_RELAY_DISABLED=1`), nhóm price, colour, size and stock; `pnpm --filter @erp/api test -- partner-catalog` 172/172, 10 suite (2026-09-13)
- [x] Có ca kiểm tổ hợp màu+size không tồn tại trả đúng 0 dòng — e2e 'matches colour and size only when the SAME variant satisfies both' (BA/39 → total 0) và 'combines price, colour and size on one variant' (D/39 + priceTo 500000 → 0)
- [x] `EXPLAIN ANALYZE` của truy vấn lọc màu+size đính kèm ticket — T-03-02 "Đo thực tế" (18,9 / 120,4 ms), đo lại ở T-06-01 và T-06-03
- [x] Số đo p95 < 500 ms ghi kèm cổng và tên DB — T-03-03: 167,6 ms, `:4100`, erp_dev_3008 (2026-09-09); đo lại qua HTTP 2026-09-13: 105,3 ms, `:4200`, erp_dev_3008 (docs §4)
- [x] Demo và nghiệm thu tại gate G4 — nghiệm thu: Akenzy, 2026-09-14 ("please done it. pass G5"), dựa trên bằng chứng demo tự động: gói cURL `docs/partner-catalog-api-curls` 37/37 qua HTTP, e2e `partner-catalog.e2e-spec.ts` 38/38 và `partner-catalog-filters.e2e-spec.ts` 17/17, `07-performance.md`; không có buổi demo trực tiếp
