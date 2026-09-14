---
id: UOW-06
slug: partner-filter-truthful-rows
title: Đối tác lọc còn hàng/hết hàng và dòng kết quả nói đúng về biến thể khớp
demoable: true
duration: 2d
depends_on: [UOW-03]
requirements: [US-02]
verifies: [AC-23, AC-24]
risk: medium
status: todo
rollback: Revert handler về gộp trên mọi biến thể và gỡ trường `inStock` khỏi request DTO; đối tác không gửi `inStock` không bị ảnh hưởng, đối tác đã gửi sẽ nhận 400
---

# UOW-06 — Đối tác lọc còn hàng/hết hàng và dòng kết quả nói đúng về biến thể khớp

Change request 2026-09-13 (ADR-07, ADR-08). Trước thay đổi, trên erp_dev_3008 org
`f1000000-…0001`, `colors: ["BA"], sizes: ["39"]` trả 52 sản phẩm và nhiều dòng báo
`inStock: true` dù chính đôi BA/39 đã hết.

## Demo script
1. Search `colors: ["BA"]` → mọi dòng có `colors: ["BA"]`; không dòng nào còn lộ `D`
2. Search `colors: ["BA"], sizes: ["39"]` → mọi dòng có `colors: ["BA"]`, `sizes: ["39"]`, và
   `priceMin`/`priceMax` là giá của biến thể BA/39; chỉ ra một dòng `inStock: false` mà trước thay
   đổi báo `true`
3. Thêm `inStock: true` → dòng đó biến mất; mọi dòng còn lại có `inStock: true`
4. Đổi sang `inStock: false` → chỉ còn product mà biến thể BA/39 hết hàng; mọi dòng `inStock: false`;
   total bước 3 + total bước 4 = total bước 2
5. Search không có bộ lọc mức biến thể → response giống hệt bản chụp trước thay đổi
6. Gửi `inStock: "yes"` → 400
7. Đọc số đo p95 của request `colors + sizes + inStock`

## In scope
- Thu hẹp `priceMin`/`priceMax`/`colors`/`sizes`/`inStock` về biến thể khớp khi có bộ lọc mức biến thể (ADR-07)
- Sort giá theo giá đã thu hẹp
- Bộ lọc `inStock` true/false trên cùng biến thể (ADR-08)
- e2e và đo hiệu năng trên dữ liệu thật

## Not in scope
- Thu hẹp dòng theo `keyword`/`categoryId` (A-19)
- Mở rộng bí danh tên chiều hay so mã màu không phân biệt hoa thường — chờ payload thật của đối tác (A-14)
- Dọn option bẩn `D,` / `35,` / `36,` (A-13)
- Bộ lọc trên endpoint chi tiết (A-18)

## Risks

| Risk | Mitigation |
|---|---|
| Điều kiện "khớp" bị viết hai lần (truy vấn chính và truy vấn facet) rồi lệch nhau | T-06-02 lấy tập biến thể khớp từ truy vấn chính, không dựng lại điều kiện |
| `EXISTS` tồn kho lặp ở `FILTER` và `HAVING` làm chậm truy vấn | T-06-01 tính một lần mỗi biến thể thành cột; T-06-04 đo p95 thật |
| Thu hẹp dòng làm lệch sort hoặc phân trang | AC-23 có ca sort theo giá thu hẹp; tiebreak `a.id` giữ nguyên |
| Hồi quy khi đối tác không lọc gì | Demo bước 5; T-06-01 và T-06-02 có test cho ca không bộ lọc mức biến thể |

## Definition of done

- [x] AC-23, AC-24 pass — e2e `partner-catalog-filters.e2e-spec.ts` 17/17 ba lượt liên tiếp (T-06-04); unit 172/172; chứng minh trên dữ liệu thật ở T-06-03 (0 lỗi, cả actor giới hạn chi nhánh ở review)
- [x] Không có bộ lọc mức biến thể → response không đổi so với trước — review T-06-01: 6.743 dòng giống HEAD trên erp_dev_3008; T-06-02: page 1 giống từng byte handler trước đó; T-06-03: dạng join cho cùng dòng với dạng EXISTS ở ca không lọc; unit 'applies no FILTER … when no variant-level filter is supplied'
- [x] `total(inStock=true) + total(inStock=false) = total(không inStock)` có test khẳng định — e2e T-06-04 trên 4 tổ hợp (không lọc, màu+size, khoảng giá, categoryId); dữ liệu thật T-06-03 (4 tổ hợp, 0 lỗi)
- [x] Số đo p95 < 500 ms của `colors + sizes + inStock` ghi kèm cổng và tên DB — 106,9 ms, `:4200`, erp_dev_3008, API key thật (T-06-04 "Đo hiệu năng qua HTTP")
- [x] Demo và nghiệm thu tại gate G4 — nghiệm thu: Akenzy, 2026-09-14 ("please done it. pass G5"), dựa trên bằng chứng demo tự động: gói cURL `docs/partner-catalog-api-curls` 37/37 qua HTTP, e2e `partner-catalog.e2e-spec.ts` 38/38 và `partner-catalog-filters.e2e-spec.ts` 17/17, `07-performance.md`; không có buổi demo trực tiếp
