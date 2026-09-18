# Geo API — Provinces and Wards (Third-Party Lookup)

> **Audience:** Third-party developers integrating with jack-erp (storefronts, mobile apps,
> address forms), and the backend engineers maintaining the surface.
> **Backend module:** `apps/api/src/modules/geo/`
> **Feature plan:** `.ai/features/2026091801-province-ward-lookup/`
> **Last updated:** 2026-09-18

---

## 1. Scope and status

Four read-only endpoints over Vietnam's administrative divisions after the 2025 merger.
Nothing here writes.

| # | Endpoint | Purpose | Status |
| - | -------- | ------- | ------ |
| 1 | `GET /v2/geo/provinces` | All current provinces; optional accent-insensitive name search | **Live** |
| 2 | `GET /v2/geo/provinces/:code` | One province, with the pre-merger provinces it absorbed | **Live** |
| 3 | `GET /v2/geo/wards` | Search wards by name, filter by province, paginate | **Live** |
| 4 | `GET /v2/geo/wards/:code` | One ward by code | **Live** |

The data is public reference data — it belongs to no organization. The same key or token
sees the same rows whichever tenant it belongs to.

---

## 2. Authentication

Any credential the API already accepts works. Send **either**:

```http
GET /v2/geo/provinces?q=ha%20noi HTTP/1.1
X-Api-Key: <raw key issued to the partner>
```

or

```http
GET /v2/geo/provinces?q=ha%20noi HTTP/1.1
Authorization: Bearer <JWT>
```

- **No permission is required.** A partner key that carries only `partner.catalog.read`
  (the seeded "Đối tác" role) can call every endpoint here; no new role or permission has
  to be granted. There is no organization scoping either, so the response is identical
  for every caller.
- **`X-Branch-Id` is not needed** and is ignored if sent.
- Keys are created by an organization admin at `/admin/api-keys`, shown once, hashed at
  rest, and carry an **IP whitelist** — a request from outside it is `403`, distinct from
  the `401` for a missing or bad credential. See
  [Partner Catalog API §2](./partner-catalog-api.md#2-authentication) for key lifecycle.
- No route here is `@Public()`: an unauthenticated request is `401`.

---

## 3. Data model — read this before designing a picker

The dataset holds **two generations** of wards but only **one** generation of provinces.

| Set | Rows | Codes | Notes |
| --- | ---- | ----- | ----- |
| Provinces (current) | 35 | `2026_xx` | Post-merger structure. Each carries `mergedFrom`: the `1995_xx` provinces folded into it. `2026_99 Cục nhà trường` is a pseudo-entry with no wards. |
| Wards, current | 3 321 | unpadded (`4`, `70`, `16171`) | `provinceCode` is `2026_xx`, `districtCode` is `null` (no district level any more), `isCurrent: true`. |
| Wards, legacy | 11 107 | zero-padded (`001`, `004`) | Pre-merger. `provinceCode` is `1995_xx` (not a province row — only found inside some province's `mergedFrom`), `districtCode` is set, `isCurrent: false`. |

Rules that follow from this:

1. **A ward `code` is not globally unique.** It is unique within a generation, and unique
   on the pair `(provinceCode, code)`. 3 288 codes exist in both generations. Store the
   pair, not the code alone.
2. **Legacy province codes are not provinces.** `GET /v2/geo/provinces/1995_02` is `404`.
   To map an old address to a current province, search `provinces[].mergedFrom[].code`.
3. **Default is current only.** Ward search returns `isCurrent: true` rows unless you ask
   for legacy explicitly (§5). Legacy rows exist so you can resolve addresses recorded
   under the old structure, not so pickers show them by default.
4. **Names are verbatim** from the source, including one lowercase entry
   (`6325 xã Bắc Sơn`). Do not normalise on your side; search is already accent- and
   case-insensitive (§7).

---

## 4. Endpoints 1–2 — Provinces

### `GET /v2/geo/provinces`

| Query | Type | Rules |
| ----- | ---- | ----- |
| `q` | string ≤ 100 | Optional. Accent- and case-insensitive substring match on `name`. `%` and `_` are literal. |

Response `200` — the whole list, no pagination (35 rows), ordered by the unaccented name
then code:

```json
{
  "data": [
    {
      "code": "2026_01",
      "name": "Hà Nội",
      "isActive": true,
      "effectiveFrom": "2026-01-01",
      "mergedFrom": [{ "code": "1995_01", "name": "Hà Nội" }]
    }
  ]
}
```

`?q=ha%20noi` returns exactly `2026_01`. `?q=%25` returns `[]`.

### `GET /v2/geo/provinces/:code`

Response `200` — one `ProvinceDto` as above. `2026_79` (Tp. Hồ Chí Minh) carries three
`mergedFrom` entries (`1995_02`, `1995_44`, `1995_52`). Unknown codes and legacy codes are
`404`.

---

## 5. Endpoint 3 — Ward search

### `GET /v2/geo/wards`

| Query | Type | Default | Rules |
| ----- | ---- | ------- | ----- |
| `q` | string ≤ 100 | — | Accent- and case-insensitive substring match on `name`. `%` and `_` are literal. |
| `provinceCode` | string ≤ 16 | — | Exact match. `2026_xx` → current wards of that province; `1995_xx` → legacy wards of that old province. **When present, `includeLegacy` is ignored** — the generation is implied by the code. |
| `includeLegacy` | boolean | `false` | Only consulted when `provinceCode` is absent. `false` → current wards only; `true` → both generations. Accepts `true/false/1/0`; anything else is `400`. |
| `page` | int ≥ 1 | `1` | |
| `limit` | int 1–100 | `20` | `101` is `400`. |

Response `200`:

```json
{
  "data": [
    {
      "code": "4",
      "name": "Phường Ba Đình",
      "provinceCode": "2026_01",
      "provinceName": "Hà Nội",
      "districtCode": null,
      "isCurrent": true
    }
  ],
  "total": 126,
  "page": 1,
  "limit": 20
}
```

- `provinceName` is the current province's name, or **`null` for legacy wards** (their
  `1995_xx` code has no province row).
- Ordering is stable for paging: unaccented `name`, then `provinceCode`, then `code`.
- `total` counts all matches, not just the page.

Worked examples (numbers from the 2026 dataset, identical in every environment):

| Request | Result |
| ------- | ------ |
| `?provinceCode=2026_01` | `total: 126`, all `isCurrent: true`, `districtCode: null`, first row `4 Phường Ba Đình` |
| `?q=ba%20dinh` | `total: 3` — `4` (Hà Nội), `16171` (Thanh Hoá), `21499` (Quảng Ngãi); the 4 legacy matches are hidden |
| `?q=phuc%20xa` | `total: 0` — Phúc Xá only exists in the legacy set |
| `?q=phuc%20xa&includeLegacy=true` | `total: 1` — `001 Phường Phúc Xá`, `provinceCode 1995_01`, `districtCode "01"`, `provinceName null` |
| `?provinceCode=1995_01` | `total: 583` legacy wards of old Hà Nội, no `includeLegacy` needed |

---

## 6. Endpoint 4 — Ward detail

### `GET /v2/geo/wards/:code`

| Query | Type | Rules |
| ----- | ---- | ----- |
| `provinceCode` | string ≤ 16 | Optional. Absent → the **current** ward with that code (codes are unique within the current generation). Present → exact `(provinceCode, code)`, which is how you reach a legacy ward. |

| Request | Result |
| ------- | ------ |
| `/v2/geo/wards/4` | `200` Phường Ba Đình (2026_01) |
| `/v2/geo/wards/001` | `404` — no current ward has code `001` |
| `/v2/geo/wards/001?provinceCode=1995_01` | `200` Phường Phúc Xá, `isCurrent: false` |
| `/v2/geo/wards/4?provinceCode=2026_79` | `404` |

---

## 7. Search semantics

`q` is matched with Postgres `unaccent(lower(name)) LIKE '%' || unaccent(lower(q)) || '%'`.
Both sides go through the same function, so `ha noi`, `Hà Nội`, `HA NOI` and `hà nôi`
all match "Hà Nội", and `đ` matches `d`. `%`, `_` and `\` in `q` are escaped before the
`LIKE`, so they match themselves.

Whitespace is trimmed; an empty `q` is the same as no `q`. There is no ranking — results
are in name order, not relevance order. Measured on the full 14 428-row table:
3.7 ms for a current-only search, 14.5 ms across both generations.

---

## 8. Errors

| Condition | Status | Body |
| --------- | ------ | ---- |
| No `X-Api-Key` and no bearer token | `401` | `Missing or invalid Authorization header` |
| Unknown or revoked key | `401` | `Invalid API key` |
| Expired or malformed JWT | `401` | `Unauthorized` |
| Valid key from a non-whitelisted IP | `403` | `Forbidden` |
| Unknown query field, `limit > 100`, `page < 1`, `includeLegacy` not a boolean, `q` > 100 chars | `400` | class-validator messages |
| No province with that code (including every `1995_xx` code) | `404` | `Không tìm thấy tỉnh/thành` |
| No ward for `(code)` in the current set, or for `(provinceCode, code)` | `404` | `Không tìm thấy phường/xã` |

There is no `403` for "not your organization" because there is no organization.

---

## 9. Dataset and updates

The rows are **not** synced from anywhere at runtime. They are loaded once per
environment by the migration `1790040000000-LoadGeoDataset2026.ts` from two committed
files, `apps/api/src/database/migrations/data/geo-2026/{provinces,wards}.json`, and are
never edited through the API.

To ship a newer dataset:

1. Export the `provinces` and `wards` collections from `web_gateway` (Mongo) as JSON.
2. `node apps/api/scripts/geo/convert-web-gateway-dumps.mjs <provinces.json> <wards.json> --out apps/api/src/database/migrations/data/geo-<year>`
   — strips Mongo wrappers, sorts deterministically, and **exits 1** on duplicate codes,
   duplicate `(provinceCode, code)`, a ward whose province is neither a province nor in
   any `mergedFrom`, or a duplicate code within the current generation.
3. Add a migration that calls `upsertGeoDataset()` from
   `apps/api/src/modules/geo/geo-dataset.loader.ts` with the new files. If the new dataset
   replaces the province generation, `DELETE` the superseded `geo_provinces` rows first —
   the loader only upserts, and `isCurrent` is recomputed as "province code exists in
   `geo_provinces`", so leftover rows would keep two generations current at once.
4. `pnpm migration:run`.

Integrators can treat the data as immutable between deployments and cache it freely.

---

## 10. OpenAPI

The live contract is at `/docs` (Swagger UI) and `/docs-json`, tagged **Geo**, with both
the `access-token` (bearer) and `api-key` security schemes declared. All four endpoints
return concrete schemas: `ProvinceListResponseDto`, `ProvinceDto`,
`WardSearchResponseDto`, `WardDto`.

After changing any endpoint here: run the API, then `pnpm openapi:generate`, and commit
`packages/api-client/src/generated/schema.ts` and
`packages/api-client/openapi.snapshot.json`. Generate from a build of your own checkout —
another checkout serving `:4000` will silently produce a snapshot of code you did not
write (`OPENAPI_URL=http://127.0.0.1:<port>/docs-json` points the generator elsewhere).

---

## 11. Implementation map

| Concern | File |
| ------- | ---- |
| Module wiring | `geo.module.ts` (registered in `app.module.ts`) |
| Entities | `province.entity.ts` (`geo_provinces`), `ward.entity.ts` (`geo_wards`) |
| Schema migration | `database/migrations/1790030000000-CreateGeoTables.ts` |
| Data migration + loader | `database/migrations/1790040000000-LoadGeoDataset2026.ts`, `geo-dataset.loader.ts` |
| Committed dataset | `database/migrations/data/geo-2026/{provinces,wards}.json` |
| Dump converter | `apps/api/scripts/geo/convert-web-gateway-dumps.mjs` |
| Queries | `geo.service.ts` — `listProvinces`, `findProvince`, `searchWards`, `findWard` |
| DTOs | `dto/province.dto.ts`, `dto/ward.dto.ts` |
| Controller | `geo.controller.ts` — `@Controller('geo')`, `@Version('2')` per method, no `PermissionGuard` |
| End-to-end | `apps/api/test/e2e/geo.e2e-spec.ts` (AC-01..AC-12) |
| cURL / Postman cases | `docs/geo-api-curls/` — local only, git-ignored; regenerate from the tables in §4–§6 |

Design decisions (migration-loaded data, query-time `unaccent`, no permission, legacy
wards kept with `isCurrent`) are recorded as ADR-01..04 in
`.ai/features/2026091801-province-ward-lookup/03-logical-design.md`.
