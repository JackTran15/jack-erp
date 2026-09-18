---
id: UOW-02
slug: ward-search
title: Tìm phường/xã không dấu, lọc theo tỉnh, phân trang, tra theo mã qua /v2/geo/wards
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-05, AC-06, AC-07, AC-08, AC-09, AC-10]
risk: low
status: todo
rollback: "Revert các commit của UoW — thêm 2 route và 1 file DTO trong `modules/geo`, sinh lại api-client; không migration, không đổi bảng. Sau revert UOW-01 vẫn nguyên."
---

# UOW-02 — Tìm phường/xã

## Demo script
1. API :4000, JWT backoffice. `curl '.../v2/geo/wards?provinceCode=2026_01&limit=5'` → `total: 126`,
   5 dòng, dòng đầu `4 Phường Ba Đình`, `provinceName: "Hà Nội"`, `districtCode: null`, `isCurrent: true`.
2. `curl '.../v2/geo/wards?q=phuc%20xa'` → `total: 0`; thêm `&includeLegacy=true` → `001 Phường Phúc Xá`,
   `provinceCode 1995_01`, `districtCode "01"`, `isCurrent false`, `provinceName null`.
3. `curl '.../v2/geo/wards?provinceCode=1995_01'` → `total: 583` dù không `includeLegacy`.
4. `curl '.../v2/geo/wards?limit=101'` → 400; `?foo=1` → 400.
5. `curl .../v2/geo/wards/4` → Phường Ba Đình; `/wards/001` → 404; `/wards/001?provinceCode=1995_01` → Phúc Xá.
6. Cùng các lệnh với `X-Api-Key` (không `X-Branch-Id`) → giống hệt; không header → 401.
7. Swagger `/docs` tag Geo có đủ 4 route; `git diff --stat packages/api-client` chỉ có snapshot + `schema.ts`.

## In scope
- `WardSearchQueryDto`, `WardFindQueryDto`, `WardDto`, `WardSearchResponseDto`.
- `GeoService.searchWards`, `findWard`; hai route wards trên `GeoController`.
- e2e wards (mở rộng `geo.e2e-spec.ts`).
- `pnpm openapi:generate` + commit snapshot và `schema.ts`.

## Not in scope
- Bất kỳ consumer FE nào; cache; index trigram (chỉ khi đo vượt 50 ms).

## Risks
| Risk | Mitigation |
|---|---|
| Seq scan `unaccent(lower(name))` trên 14k dòng chậm hơn dự kiến | T-02-01 ghi `EXPLAIN ANALYZE`; ngưỡng 50 ms; vượt thì mở ticket thêm cột + index, không đổi hợp đồng |
| `includeLegacy` boolean từ query string đến DTO là chuỗi `"true"` | `@Transform` như `mobile-debt.dto.ts` làm với số; e2e AC-07 chốt |

## Definition of done
- [x] AC-05..AC-10 xanh trong `geo.e2e-spec.ts` (13/13)
- [x] `EXPLAIN ANALYZE`: 3.7 ms (hiện hành) / 14.5 ms (toàn bộ 14 428 dòng) — T-02-01
- [x] `openapi.snapshot.json` + `schema.ts` sinh lại (chưa commit — Akenzy chọn tự commit); tsc backoffice-web + pos-web exit 0
- [x] Demo: bước 1–5 qua e2e (JWT), bước 6 qua e2e (API key) + curl 401 trên :4177, bước 7 qua `git diff --stat packages/api-client`
