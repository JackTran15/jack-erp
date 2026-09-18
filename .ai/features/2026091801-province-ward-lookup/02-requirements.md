---
feature: province-ward-lookup
stories: 3
acceptance_criteria: 12
---

# Requirements — Tra cứu tỉnh/thành và phường/xã

Mọi endpoint dưới đây nằm sau `AuthGuard` toàn cục: JWT hoặc `X-Api-Key` đều được, không cần
`X-Branch-Id`, không có quyền riêng. Số liệu (35 / 126 / 14 428 …) đo trên dump 2026-09-18.

## US-01 — Tra cứu tỉnh/thành

Là client của ERP (backoffice, POS, mobile hoặc đối tác dùng API key), tôi muốn lấy danh sách
tỉnh/thành hiện hành và tìm theo tên không dấu, để dựng ô chọn địa chỉ đúng với cấu trúc sau
sáp nhập.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Danh sách đầy đủ
```gherkin
Given DB đã nạp bộ dữ liệu 2026
When gọi GET /v2/geo/provinces với JWT hợp lệ
Then 200 với { data: [...] } gồm 35 phần tử
And mỗi phần tử có code, name, isActive, effectiveFrom (YYYY-MM-DD), mergedFrom: [{ code, name }]
And thứ tự theo unaccent(lower(name)) rồi code (Hà Nội đứng trước Hải Phòng, Đà Nẵng nằm trong nhóm D)
```

**AC-02** — Tìm theo tên không dấu, ký tự đại diện là chữ thường
```gherkin
Given bộ dữ liệu 2026
When gọi GET /v2/geo/provinces?q=ha%20noi
Then 200 và data chỉ có đúng một phần tử code 2026_01 name "Hà Nội"
When gọi GET /v2/geo/provinces?q=%25
Then 200 và data rỗng (dấu % được escape, không phải wildcard)
```

**AC-03** — Tra theo mã
```gherkin
Given bộ dữ liệu 2026
When gọi GET /v2/geo/provinces/2026_79
Then 200 với name "Tp. Hồ Chí Minh" và mergedFrom có đúng 3 phần tử (1995_02, 1995_44, 1995_52)
When gọi GET /v2/geo/provinces/1995_02
Then 404 (mã cũ chỉ xuất hiện trong mergedFrom, không phải tỉnh)
```

**AC-04** — Ranh giới xác thực
```gherkin
Given không gửi Authorization lẫn X-Api-Key
When gọi GET /v2/geo/provinces hoặc GET /v2/geo/wards?provinceCode=2026_01
Then 401
Given một API key thuộc vai chỉ có quyền partner.catalog.read, không có quyền nào về geo
When gọi hai endpoint trên với X-Api-Key và không có X-Branch-Id
Then 200 và body giống hệt khi gọi bằng JWT
```

## US-02 — Tìm phường/xã

Là client của ERP, tôi muốn tìm phường/xã theo tên không dấu, lọc theo tỉnh, phân trang, và
tra một phường theo mã, để chọn đúng phường cho một địa chỉ — kể cả địa chỉ cũ ghi theo cấu
trúc trước sáp nhập.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-05** — Lọc theo tỉnh hiện hành
```gherkin
Given bộ dữ liệu 2026
When gọi GET /v2/geo/wards?provinceCode=2026_01&limit=100
Then 200 với total = 126, page = 1, limit = 100, data có 100 phần tử
And mỗi phần tử có isCurrent = true, districtCode = null, provinceCode = "2026_01", provinceName = "Hà Nội"
And phần tử đầu tiên theo thứ tự unaccent(lower(name)) — "Phường Ba Đình" (code "4") đứng trước "Phường Bạch Mai"
```

**AC-06** — Tìm không dấu, mặc định chỉ hiện hành
```gherkin
Given bộ dữ liệu 2026
When gọi GET /v2/geo/wards?q=ba%20dinh
Then 200, total = 3, data gồm "Phường Ba Đình" (2026_01), "Xã Ba Đình" (2026_38) và "Xã Ba Dinh" (2026_51), tất cả isCurrent = true
And không có phường cũ nào (4 dòng 1995 khớp "ba dinh" bị loại)
```

**AC-07** — Bao gồm phường cũ
```gherkin
Given bộ dữ liệu 2026
When gọi GET /v2/geo/wards?q=phuc%20xa
Then 200 với total = 0 (Phúc Xá chỉ tồn tại trong bộ 1995)
When gọi GET /v2/geo/wards?q=phuc%20xa&includeLegacy=true
Then 200 với total = 1, phần tử có code "001", provinceCode "1995_01", districtCode "01", isCurrent = false, provinceName = null
```

**AC-08** — Chỉ định tỉnh cũ thắng mặc định
```gherkin
Given bộ dữ liệu 2026
When gọi GET /v2/geo/wards?provinceCode=1995_01 (không có includeLegacy)
Then 200 với total = 583 và mọi phần tử isCurrent = false
```

**AC-09** — Phân trang và hợp đồng DTO
```gherkin
Given bộ dữ liệu 2026
When gọi GET /v2/geo/wards?provinceCode=2026_01&page=2&limit=50
Then 200 với total = 126, page = 2, limit = 50, data có 50 phần tử, không trùng phần tử nào của page=1
When gọi GET /v2/geo/wards?limit=101
Then 400
When gọi GET /v2/geo/wards?foo=1
Then 400 (forbidNonWhitelisted)
```

**AC-10** — Tra một phường theo mã
```gherkin
Given bộ dữ liệu 2026
When gọi GET /v2/geo/wards/4
Then 200 với name "Phường Ba Đình", provinceCode "2026_01", isCurrent = true
When gọi GET /v2/geo/wards/001
Then 404 (không có phường hiện hành mã 001)
When gọi GET /v2/geo/wards/001?provinceCode=1995_01
Then 200 với name "Phường Phúc Xá", districtCode "01", isCurrent = false
When gọi GET /v2/geo/wards/4?provinceCode=2026_79
Then 404
```

## US-03 — Bộ dữ liệu nạp được và tái tạo được

Là người vận hành ERP, tôi muốn bộ dữ liệu vào DB bằng `pnpm migration:run` như mọi thay đổi
schema khác, và có script chuyển dump mới thành bộ dữ liệu commit được, để cập nhật đợt sau
không cần sửa tay.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-11** — Migration nạp và gỡ được
```gherkin
Given DB trống đã tạo extension unaccent
When chạy pnpm migration:run
Then geo_provinces có 35 dòng, geo_wards có 14 428 dòng (3 321 is_current = true, 11 107 false)
And chạy lại pnpm migration:run không đổi gì (migration đã ghi trong bảng migrations)
When chạy pnpm migration:revert hai lần
Then hai bảng geo_wards, geo_provinces không còn
```

**AC-12** — Script chuyển đổi xác định và có kiểm tra toàn vẹn
```gherkin
Given hai file dump Mongo thô
When chạy node apps/api/scripts/geo/convert-web-gateway-dumps.mjs <provinces.json> <wards.json>
Then ghi provinces.json và wards.json vào apps/api/src/database/migrations/data/geo-2026/ không còn _id hay wrapper $oid/$date
And district_code rỗng thành null, thứ tự tỉnh theo code, phường theo (province_code, code)
And chạy lần hai cho ra file giống hệt byte
When dump có hai phường trùng (province_code, code) hoặc một phường trỏ tới province_code không có trong tỉnh lẫn merged_from
Then script thoát non-zero và nêu dòng vi phạm
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Performance | `GET /v2/geo/wards?q=` quét 14 428 dòng dưới 50 ms phía server (EXPLAIN ANALYZE ghi vào ticket) | T-02-01 |
| Contract | `pnpm openapi:generate` sau khi thêm 4 route; snapshot + `schema.ts` commit, diff chỉ gồm 4 path + DTO mới | T-02-03 |
| Test | e2e chạy sau `resetDatabase()` nên tự nạp dữ liệu bằng `upsertGeoDataset()` trong `beforeAll` | T-01-05, T-02-02 |
