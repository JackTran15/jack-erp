---
feature: province-ward-lookup
adr_count: 4
---

# Logical design — Tra cứu tỉnh/thành và phường/xã

## Approach

Một module NestJS mới `apps/api/src/modules/geo/` sở hữu hai bảng **toàn cục** (không
`organization_id`, không soft-delete — dữ liệu tham chiếu chỉ được thay, không sửa) theo mẫu
`report_types`. Bộ dữ liệu là bản cắt gọn của hai dump `web_gateway`, commit tại
`apps/api/src/database/migrations/data/geo-2026/`, và được nạp bằng **một migration dữ liệu**
gọi hàm dùng chung `upsertGeoDataset()`; e2e gọi lại đúng hàm đó sau `resetDatabase()`.
Bốn route đọc `GET /v2/geo/...` đi qua service thường (không CQRS — truy vấn một bảng, lọc
đơn giản), sau `AuthGuard` toàn cục, không quyền riêng. Tìm không dấu dùng
`unaccent(lower(...))` của Postgres ở cả hai vế tại thời điểm truy vấn.

## Alternatives rejected

| Option | Why not |
|---|---|
| Đồng bộ lúc boot kiểu `ReportTypeSyncService` | Service đó `save()` từng dòng; 14 428 dòng ≈ hàng chục giây ở lần boot đầu, và cần thêm "cổng" phiên bản để không chạy lại mỗi lần restart (e2e boot app ~80 lần). Migration chạy đúng một lần mỗi môi trường và đã có bảng `migrations` làm cổng |
| Script `pnpm seed:geo` là cách nạp duy nhất | Seed là bước tay, prod có thể quên; `seed:*` trong repo là dữ liệu demo. Dữ liệu này là điều kiện để endpoint hoạt động nên phải đi cùng `migration:run` |
| Gọi live `web_gateway` để đồng bộ | Akenzy chọn dump là nguồn (A-02); thêm phụ thuộc runtime + cấu hình auth cho một bộ dữ liệu đổi vài năm một lần |
| Generic CRUD platform (`registerEntity`) | `applyScoping` luôn AND `organizationId` (`base-crud.service.ts:279-297`); `ScopingPolicy` chỉ có ORGANIZATION / BRANCH / MIXED — bảng toàn cục không lọt qua được |
| Cột `name_normalized` + index GIN trigram | Với 14k dòng, seq scan `unaccent(lower(name))` là vài ms; cột lưu sẵn mở ra lệch giữa cách chuẩn hoá lúc nạp và lúc truy vấn. Thêm sau nếu EXPLAIN ANALYZE ở T-02-01 vượt 50 ms |
| Prefix `/v2/partner/geo` + quyền `partner.geo.read` | Chỉ phục vụ đối tác; backoffice/mobile sẽ cần bản thứ hai. Dữ liệu không thuộc tổ chức nào nên ranh giới quyền không có gì để bảo vệ (ADR-03) |
| `@Public()` | Tiền lệ `partner-catalog` cấm; endpoint không xác thực đầu tiên của repo chỉ để tiết kiệm một header là không đáng |
| Mã phường làm khoá toàn cục | Trùng chéo hai thời kỳ 3 288 lần; khoá đúng là `(province_code, code)` |

## Domain model

| Entity | Fields | Notes |
|---|---|---|
| `ProvinceEntity` → `geo_provinces` | `id` uuid PK; `code` varchar(16) **unique**; `name` varchar(100); `isActive` bool; `effectiveFrom` date; `mergedFrom` jsonb `[{ code, name }]`; `createdAt`, `updatedAt` timestamptz | Không `organizationId`, không `deletedAt`. Không kế thừa `SoftDeleteEntity` |
| `WardEntity` → `geo_wards` | `id` uuid PK; `code` varchar(8); `name` varchar(100); `provinceCode` varchar(16); `districtCode` varchar(8) null; `isCurrent` bool; `createdAt`, `updatedAt` | **Unique** `(province_code, code)`; index `(is_current)`; index `(province_code)`. **Không FK** sang `geo_provinces`: mã `1995_xx` không có dòng tỉnh |
| `GeoDataset` (type) | `{ provinces: ProvinceSeed[], wards: WardSeed[] }` | Hình dạng của hai file JSON đã cắt gọn; `upsertGeoDataset(runner, dataset)` nhận đúng kiểu này |

`isCurrent` = `province_code IN (SELECT code FROM geo_provinces)`, tính bằng một `UPDATE` cuối
loader — không suy từ tiền tố năm, nên dump sau (ví dụ `2030_xx`) vẫn đúng.

## Contracts

Tất cả: `@Controller('geo')` + `@Version('2')` theo method; `@ApiTags('Geo')`, `@ApiBearerAuth()`,
`@ApiSecurity('api-key')`. Không `@RequirePermission`, không đọc `actor` (không có gì để scope).

### GET /v2/geo/provinces
Request: `?q=<string ≤100>` (tuỳ chọn)
Response 200:
```json
{ "data": [ { "code": "2026_01", "name": "Hà Nội", "isActive": true, "effectiveFrom": "2026-01-01",
              "mergedFrom": [ { "code": "1995_01", "name": "Hà Nội" } ] } ] }
```
Không phân trang (35 dòng). Thứ tự `unaccent(lower(name)), code`.
`q`: `unaccent(lower(name)) LIKE '%' || unaccent(lower(:q)) || '%'`, `:q` qua `escapeLikeTerm`.

### GET /v2/geo/provinces/:code
Response 200: một `ProvinceDto`. 404 khi không có dòng — kể cả mã `1995_xx`.

### GET /v2/geo/wards
Request (`WardSearchQueryDto`, mọi field tuỳ chọn):

| field | kiểu | mặc định | luật |
|---|---|---|---|
| `q` | string ≤100 | — | như trên, trên `w.name` |
| `provinceCode` | string ≤16 | — | lọc `province_code = :provinceCode` **chính xác**; thời kỳ suy ra từ mã nên `includeLegacy` không còn tác dụng |
| `includeLegacy` | boolean | `false` | khi **không** có `provinceCode`: `false` → thêm `is_current = true`; `true` → không lọc thời kỳ |
| `page` | int ≥1 | 1 | |
| `limit` | int 1..100 | 20 | 101 → 400 |

Response 200 (`WardSearchResponseDto`):
```json
{ "data": [ { "code": "4", "name": "Phường Ba Đình", "provinceCode": "2026_01", "provinceName": "Hà Nội",
              "districtCode": null, "isCurrent": true } ],
  "total": 126, "page": 1, "limit": 20 }
```
`provinceName` = LEFT JOIN `geo_provinces p ON p.code = w.province_code` → `null` cho phường cũ.
Thứ tự `unaccent(lower(w.name)), w.province_code, w.code` (tie-break ổn định cho phân trang).
`total` là `COUNT(*)` cùng điều kiện (hai truy vấn, `Promise.all`).

### GET /v2/geo/wards/:code
Request: `?provinceCode=<string ≤16>` (tuỳ chọn, `WardFindQueryDto`)
- không `provinceCode` → `WHERE code = :code AND is_current = true` (duy nhất theo A-07)
- có `provinceCode` → `WHERE code = :code AND province_code = :provinceCode`
Response 200: một `WardDto`; 404 khi không có.

### Nạp dữ liệu — `upsertGeoDataset(runner: QueryRunner | DataSource, dataset: GeoDataset)`
1. `INSERT INTO geo_provinces (...) VALUES (...) ON CONFLICT (code) DO UPDATE SET name, is_active, effective_from, merged_from, updated_at = now()` — một câu, 35 dòng.
2. `INSERT INTO geo_wards (...) ON CONFLICT (province_code, code) DO UPDATE SET name, district_code, updated_at = now()` — theo lô 1 000 dòng (15 câu).
3. `UPDATE geo_wards SET is_current = (province_code IN (SELECT code FROM geo_provinces))`.
Idempotent; chạy trong transaction của migration (`migrationsTransactionMode: 'each'`).
Migration `LoadGeoDataset2026` đọc hai JSON bằng `readFileSync(path.join(__dirname, 'data', 'geo-2026', ...))`;
`down` = `TRUNCATE geo_wards, geo_provinces`.

### Script chuyển đổi — `apps/api/scripts/geo/convert-web-gateway-dumps.mjs <provinces.json> <wards.json>`
Node thuần, không phụ thuộc. Bỏ `_id`, mở `$date` thành `YYYY-MM-DD`, `district_code: ''` → `null`,
sắp xếp tỉnh theo `code`, phường theo `(province_code, code)`, ghi JSON 2-space + newline cuối.
Fail non-zero: trùng `(province_code, code)`; phường trỏ `province_code` không có trong `code` tỉnh
lẫn `merged_from[].code`; trùng `code` tỉnh. In số dòng đã ghi.

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| `geo_provinces`, `geo_wards` | migration dữ liệu (`LoadGeoDataset2026`) qua `upsertGeoDataset` | Tới migration dữ liệu kế tiếp |
| Bộ dữ liệu JSON | repo (`migrations/data/geo-2026/`) | Bất biến sau khi commit; dump mới → thư mục `geo-<năm>` mới + migration mới |
| Kết quả tìm kiếm | không cache phía server (client tự cache bằng TanStack Query nếu cần) | Mỗi request |

## Cache & offline

Không cache server. Dữ liệu 14k dòng, truy vấn vài ms; thêm cache khi có số đo, không thêm trước.

## Observability

Không sự kiện Kafka (không có nghiệp vụ). Log một dòng ở migration dữ liệu với số dòng
tỉnh/phường đã upsert và số `is_current = true`. Lỗi 404 là `NotFoundException` chuẩn của Nest,
đi qua exception filter hiện có.

## Error taxonomy

| Condition | Failure subtype | UI |
|---|---|---|
| Field lạ trong query, `limit` > 100, `page` < 1, kiểu sai | 400 `BadRequestException` từ `ValidationPipe` toàn cục (`forbidNonWhitelisted`) | Client sửa request |
| Không có credential / JWT hỏng / key sai | 401 từ `AuthGuard` | Đăng nhập lại / kiểm tra key |
| Key hợp lệ nhưng IP ngoài whitelist | 403 từ `AuthGuard` → `ApiKeyAuthService` | Cấu hình whitelist ở `/admin/entities/api-keys` |
| Không có tỉnh/phường khớp | 404 `NotFoundException` (`GeoService`) | Client coi là "không có" |
| DB lỗi | 500 chuẩn | — |

## ADRs

### ADR-01 — Nạp dữ liệu tham chiếu bằng migration, qua loader dùng chung
**Context:** Dữ liệu 14k dòng phải có mặt ở mọi môi trường trước khi endpoint có ý nghĩa; e2e
`resetDatabase()` xoá sạch bằng `synchronize(true)`.
**Decision:** Một migration schema (`CreateGeoTables`) + một migration dữ liệu (`LoadGeoDataset2026`)
gọi `upsertGeoDataset()`; e2e gọi lại cùng hàm trong `beforeAll`. Không boot-sync, không seed tay.
**Consequences:** `migration:run` là bước duy nhất; cập nhật dữ liệu = thêm migration mới (lịch sử
rõ, có `down`). Entity phải khai đủ unique/index để `synchronize` (e2e) và migration cùng hình dạng —
kiểm bằng `migration:generate` không ra diff.
**Status:** accepted

### ADR-02 — Tìm không dấu bằng `unaccent(lower(...))` lúc truy vấn, không cột chuẩn hoá
**Context:** Người dùng gõ "ha noi", "phuc xa". Extension `unaccent` đã bật từ
`1782500000000-AddUnaccentExtension.ts`.
**Decision:** Cả cột lẫn tham số đều qua `unaccent(lower(...))` trong SQL; `q` qua `escapeLikeTerm`.
Không cột `name_normalized`, không index trigram.
**Consequences:** Không thể lệch giữa hai vế; seq scan 14k dòng vài ms (đo ở T-02-01). Nếu có lúc
vượt 50 ms: thêm cột tính lúc nạp + index GIN — không đổi hợp đồng.
**Status:** accepted

### ADR-03 — Không quyền, không tenant: ranh giới là `AuthGuard`
**Context:** `partner-catalog` ADR-02 đúc quyền `partner.catalog.read` vì danh mục hàng hoá thuộc
tổ chức. Tỉnh/phường là dữ liệu công khai của nhà nước, không có chủ.
**Decision:** Controller không dùng `PermissionGuard`, không `@RequirePermission`, không đọc
`ActorContext`. Bất kỳ JWT hay API key hợp lệ nào đều đọc được. Không `@Public()`.
**Consequences:** Một bề mặt cho mọi client; key đối tác vẫn chịu IP whitelist. e2e chứng minh bằng
key thuộc vai không có quyền geo nào vẫn 200 (AC-04).
**Status:** accepted

### ADR-04 — Giữ phường cũ, `is_current` suy từ bảng tỉnh, mặc định chỉ hiện hành
**Context:** Dump có cả 11 107 phường 1995; địa chỉ cũ trong ERP và ở đối tác vẫn ghi theo cấu trúc đó.
**Decision:** Lưu cả hai; `is_current` = `province_code` có trong `geo_provinces`; tìm kiếm mặc định
`is_current = true`, mở bằng `includeLegacy=true` hoặc `provinceCode=1995_xx`.
**Consequences:** Tra được địa chỉ cũ và ánh xạ sang tỉnh mới qua `mergedFrom`; client mặc định
không thấy dữ liệu đã hết hiệu lực. `district_code` giữ thô (A-11).
**Status:** accepted
