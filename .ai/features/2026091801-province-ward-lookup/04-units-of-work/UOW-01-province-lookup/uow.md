---
id: UOW-01
slug: province-lookup
title: Bộ dữ liệu tỉnh/phường nạp bằng migration và tra cứu được tỉnh/thành qua /v2/geo/provinces
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-11, AC-12]
risk: low
status: todo
rollback: "`pnpm migration:revert` hai lần (LoadGeoDataset2026 rồi CreateGeoTables) và revert các commit của UoW — module `modules/geo` mới, một dòng import trong `app.module.ts`, không đổi bảng nào đang có, không feature flag."
---

# UOW-01 — Bộ dữ liệu + tra cứu tỉnh/thành

## Demo script
1. DB local trống bảng geo: `pnpm migration:run` (người dùng chạy bằng `!`) → log migration ghi
   `35 provinces, 14428 wards (3321 current)`.
2. `psql`: `SELECT count(*) FROM geo_provinces` = 35; `SELECT is_current, count(*) FROM geo_wards GROUP BY 1`
   = `t 3321 / f 11107`; `SELECT unaccent('Đà Nẵng')` = `Da Nang`.
3. API chạy trên :4000, đăng nhập backoffice lấy JWT:
   `curl -H "Authorization: Bearer $JWT" 'localhost:4000/v2/geo/provinces?q=ha%20noi'` → một dòng `2026_01 Hà Nội`.
4. `curl -H "Authorization: Bearer $JWT" localhost:4000/v2/geo/provinces/2026_79` → Tp. Hồ Chí Minh với 3 `mergedFrom`;
   `/v2/geo/provinces/1995_02` → 404.
5. Mint một API key ở `/admin/entities/api-keys/records` cho vai đối tác (chỉ `partner.catalog.read`):
   `curl -H "X-Api-Key: $KEY" localhost:4000/v2/geo/provinces` (không `X-Branch-Id`) → 200, body giống bước 3.
   Không header nào → 401.
6. Swagger `/docs` có tag **Geo** với hai route provinces.

## In scope
- Script chuyển dump → JSON commit được, kèm kiểm tra toàn vẹn.
- Entity + migration schema cho **cả hai bảng** (`geo_provinces`, `geo_wards`) — một migration, để UOW-02 chỉ còn API.
- Loader `upsertGeoDataset()` + migration dữ liệu nạp cả tỉnh lẫn phường.
- `GeoModule`, `GeoService`, `GeoController` với hai route provinces; đăng ký trong `app.module.ts`.
- e2e provinces + ranh giới xác thực + đếm dữ liệu.

## Not in scope
- Hai route wards (UOW-02).
- Sinh lại `@erp/api-client` (T-02-03, sau khi đủ 4 route).

## Risks
| Risk | Mitigation |
|---|---|
| `synchronize(true)` trong e2e dựng schema từ decorator, lệch với migration viết tay | T-01-02 done-when: sau `migration:run`, `migration:generate` không sinh diff |
| `unaccent` không map `đ` (A-06) | T-01-03 kiểm `SELECT unaccent('Đà Nẵng')` trên DB thật; nếu sai, thêm `replace` hai vế ở service (một chỗ) |
| Migration đọc file JSON theo `__dirname` (A-09) | Chạy `pnpm migration:run` thật ở local trước khi đóng T-01-03 |

## Definition of done
- [x] AC-01..04, AC-11 xanh trong `geo.e2e-spec.ts` (13/13); AC-12 kiểm tay ở T-01-01 (byte-stable, thoát 1 khi dump hỏng)
- [x] `pnpm migration:generate` probe: 0 dòng `geo_` (repo có sẵn ~500 KB drift ở bảng khác)
- [x] `pnpm --filter @erp/api test`: 407/407 suite, 5637 passed, 1 skipped — baseline `auth.service.spec.ts` cũng đã xanh
- [x] Demo: bước 1–2 (migration + psql) và bước 5-không-header (401) chạy tay trên :4177; bước 3–5 với JWT/API key chứng minh qua e2e vì credential trong `.ai/credentials.env` không còn khớp `erp_dev_3008`; bước 6 Swagger kiểm qua `/docs-json`
