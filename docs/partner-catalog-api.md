# Partner Catalog API (Third-Party Storefront Integration)

> **Audience:** Third-party developers building a storefront on top of jack-erp, and the
> backend engineers maintaining that surface.
> **Backend module:** `apps/api/src/modules/partner-catalog/`
> **Reference storefront:** <https://giaymt.com.vn/> — the shape of these responses is
> driven by the three screens that site needs (category menu, listing, product page).
> **Feature plan:** `.ai/features/2026090903-partner-catalog-api/`
> **Last updated:** 2026-09-09

---

## 1. Scope and status

Three read-only endpoints. Nothing here writes.

| # | Endpoint | Purpose | Status |
| - | -------- | ------- | ------ |
| 1 | `POST /v2/partner/catalog/categories/tree` | Nested category menu with product counts | **Live** |
| 2 | `POST /v2/partner/catalog/products/search` | Listing: filter, sort, paginate | **Live** |
| 3 | `GET /v2/partner/catalog/products/:productId` | Product page: variants + attributes | **Not routable yet** — see §7 |

Endpoint 3's query handler, DTOs and unit tests exist
(`queries/get-partner-product.handler.ts`, 13 unit tests green), but **no controller is
registered for it**, so the route does not resolve. Do not integrate against it yet.

### Why a separate surface

The obvious alternative was to hand a partner an API key and point it at the existing
`POST /v2/inventory-items/search`. That endpoint returns **`purchasePrice`** —
average cost price — in `InventoryItemGroupRowDto`, and it is shared with the backoffice,
so the field cannot simply be removed. `GET /inventory/items/products` has the same
problem.

A partner-only module with its own DTOs makes the published field list a closed set that
can be reviewed in one file, and a test enforces it (§6).

---

## 2. Authentication

Send an API key in the **`X-Api-Key`** header. No `Authorization: Bearer` is required.

```http
POST /v2/partner/catalog/products/search HTTP/1.1
X-Api-Key: <raw key issued to the partner>
Content-Type: application/json

{"page":1,"limit":20}
```

- Keys are created by an organization admin at `/admin/api-keys` in the backoffice.
- The key is shown **once**, at creation. Only its SHA-256 hash is stored.
- Each key carries an **IP whitelist**. A request from an address outside it is rejected
  with `403`, distinct from the `401` for a bad key. An empty whitelist rejects everything.
- The key resolves to an organization; the partner cannot select or reach another one.
- The key must hold the permission **`partner.catalog.read`**, and should hold nothing
  else. Assign the seeded role **"Đối tác"**, which carries exactly that one permission.

> **Do not grant `inventory.read` to a partner key.** It would let the key call the
> internal inventory endpoints that expose cost price, which is the entire thing this
> surface exists to prevent.

The global `AuthGuard` accepts a JWT or an API key on every non-public endpoint, so no
route here is marked `@Public()`.

---

## 3. Endpoint 1 — Category tree

```
POST /v2/partner/catalog/categories/tree
```

Request body: `{}` — no parameters yet. Unknown fields are rejected with `400`, which
leaves room to add filters later without changing the verb.

**Response `200`**

```json
{
  "data": [
    {
      "id": "e1000000-0000-4000-8000-000000000001",
      "code": "01",
      "name": "GIÀY DÉP",
      "parentId": null,
      "productCount": 40,
      "children": [
        {
          "id": "e1000000-0000-4000-8000-000000000002",
          "code": "1002",
          "name": "Giày nữ",
          "parentId": "e1000000-0000-4000-8000-000000000001",
          "productCount": 40,
          "children": []
        }
      ]
    }
  ]
}
```

| Field | Notes |
| ----- | ----- |
| `id` | Stable; use it as `categoryId` for endpoint 2 |
| `code` | Nullable |
| `parentId` | `null` at the root. The tree may have several roots |
| `productCount` | Distinct active products in this category **and everything below it** |
| `children` | Recursive; the tree is up to three levels deep in practice |

Two behaviours worth relying on:

- **Only `ACTIVE` categories are returned.** A category whose parent is inactive surfaces
  as a root rather than disappearing.
- **`productCount` rolls up.** Parent categories in this ERP usually have no items
  attached directly — counting only direct links would report `0` for every top-level
  menu entry. A product whose variants sit in two sibling categories is counted **once**
  at the shared parent, not twice.

---

## 4. Endpoint 2 — Product search

```
POST /v2/partner/catalog/products/search
```

The unit of the result is a **product**, not a SKU. One card per product, the way a
storefront listing works.

### Request

```json
{
  "keyword": "ABA",
  "categoryId": "e1000000-0000-4000-8000-000000000001",
  "priceFrom": 500000,
  "priceTo": 1000000,
  "colors": ["BA"],
  "sizes": ["38", "39"],
  "sort": "newest",
  "page": 1,
  "limit": 20
}
```

| Field | Type | Default | Notes |
| ----- | ---- | ------- | ----- |
| `keyword` | string ≤ 200 | — | Matches product name, product code, or any variant SKU. Case-insensitive |
| `categoryId` | uuid | — | Includes every descendant category. An id from another organization matches nothing rather than erroring |
| `priceFrom` / `priceTo` | number ≥ 0 | — | Inclusive, against variant selling price |
| `colors` | string[] ≤ 50 | — | **Raw ERP colour codes**, see §5 |
| `sizes` | string[] ≤ 50 | — | Size values as stored, e.g. `"38"` |
| `sort` | enum | `newest` | `newest` \| `price_asc` \| `price_desc` |
| `page` | int ≥ 1 | `1` | |
| `limit` | int 1–100 | `20` | |

**Filter semantics that matter:**

- Several values of **one** dimension are alternatives (`sizes: ["38","39"]` → 38 *or* 39).
- Different dimensions must be satisfied by the **same variant**. `colors:["BA"]` with
  `sizes:["39"]` returns products that have one variant which is *both* BA and 39. A
  product available in BA/38 and in D/39 does **not** match. This is what a shopper means
  by "BA in size 39".
- `priceFrom`/`priceTo` apply to that same variant, so "BA, size 39, under 800k" is one
  coherent statement.

### Response `200`

```json
{
  "data": [
    {
      "id": "…",
      "code": "MY88610",
      "name": "MY88610",
      "categoryId": "…",
      "categoryName": "Giày nữ",
      "priceMin": 495000,
      "priceMax": 750000,
      "colors": ["BA", "D"],
      "sizes": ["38", "39"],
      "inStock": true,
      "images": []
    }
  ],
  "total": 107,
  "page": 1,
  "limit": 20
}
```

| Field | Notes |
| ----- | ----- |
| `priceMin` / `priceMax` | Numbers, in VND. A **range**, because price lives on the variant, not the product |
| `categoryId` / `categoryName` | Derived from the variants; `products` has no category column |
| `colors` / `sizes` | Values across all active variants — see §5 |
| `inStock` | Boolean only. True when any active variant has stock in any branch the key may see. **No quantity is ever returned** |
| `images` | **Always `[]`** — see §5 |
| `total` | Total matching products, not the size of this page. Drives "Hiển thị 1–20 của 107 kết quả" |

`sort` orders by product creation date or by `priceMin`/`priceMax`, and always breaks ties
on a unique key, so paging never repeats or skips a row.

### Measured performance

Against the reference dataset (`erp_dev_3008`: 4,731 products / 41,718 items /
2,315 sellable products), 20 requests per scenario, `:4100`, 2026-09-09:

| Scenario | p50 | p95 |
| -------- | --- | --- |
| No filter, page 1 | 38.7 ms | **45.7 ms** |
| Keyword | 39.4 ms | **41.3 ms** |
| Colour + size | 156.2 ms | **167.6 ms** |
| Colour + size + price + category | 151.6 ms | **168.0 ms** |
| Deep page (100) | 37.7 ms | **45.1 ms** |

The attribute join is only added when a `colors`/`sizes` filter is present, which is why
unfiltered requests stay under 50 ms. Deep paging costs nothing extra at this scale.

---

## 5. Known limitations — read before designing the UI

These are properties of the data, not bugs. Each one changes what a storefront can render.

### Colour values are internal codes, not names

`colors` returns what the ERP stores: 35 short codes such as `B`, `BA`, `BO`, `CC`, `D`,
`Đ`, `N`, `X`, `XD`. There is **no** Vietnamese colour name and **no** hex value anywhere
in the schema. The reference storefront paints 17 colour swatches; that cannot be built
from this data. The partner must keep its own code → name/hex mapping, and re-check it
whenever the catalogue gains a code.

### `images` is always empty

There is no image column, no media table, and no upload module anywhere in the ERP. The
field is in the contract so images can appear later without a breaking change, but today
it is unconditionally `[]`. The storefront needs its own image source.

### Product `name` is currently the SKU code

On the reference dataset, `products.name` holds values like `HQSAZ125`, `ABA2799`,
`TP3178` — zero products carry a Vietnamese descriptive name. A storefront rendering
`name` as the product title will show SKU codes, not "Giày búp bê MY88610". The API is
returning what is stored; the catalogue has no commercial names yet.

### Keyword matching is diacritic-sensitive

Matching is `ILIKE`: case-insensitive but **accent-sensitive**. `"bup be"` will not match
`"búp bê"`. Vietnamese shoppers routinely type without diacritics, so the partner should
either normalise before sending or accept the gap. Closing it server-side would mean
`unaccent` plus a matching index.

### Other deliberate exclusions

- **Standalone stock items** (rows with no parent product) never appear — a storefront
  sells products, and those rows have no product page.
- **Promotions are not applied.** `priceMin`/`priceMax` are the base selling prices.
- **No rate limiting** exists on this surface yet.
- **Sort by popularity is not offered.** Nothing in the schema counts units sold, so the
  value was removed from the contract rather than faked; `sort: "popular"` returns `400`.

---

## 6. Errors

| Condition | Status | Body |
| --------- | ------ | ---- |
| No `X-Api-Key` and no bearer token | `401` | `Unauthorized` |
| Unknown or revoked key | `401` | `Invalid API key` |
| Valid key from a non-whitelisted IP | `403` | `Forbidden` |
| Key lacks `partner.catalog.read` | `403` | `Forbidden` |
| Unknown field, `limit > 100`, bad `sort`, malformed `categoryId` | `400` | class-validator messages |
| Product not found / other organization / no active variant | `404` | `Product not found` |

The three `404` cases return an **identical** message on purpose. Answering `403` for
"belongs to another organization" would confirm that the id exists, which is what an
enumeration attempt is looking for.

### Guarantees under test

- `partner-catalog-contract.spec.ts` scans every partner DTO and fails if
  `purchasePrice`, `isPosVisible`, `branchId`, `createdBy`, `organizationId` or
  `quantity` ever appears, and locks the exact key set of all three responses. Verified by
  deliberately leaking a `purchasePrice` and confirming the suite goes red.
- `X-Branch-Id` does not change any result. The catalogue is an organization-wide view, so
  the same key gives the same answer whichever branch a caller names.

---

## 7. Endpoint 3 — Product detail (not yet routable)

The handler and DTOs are written and unit-tested; the controller is not. Once wired, the
contract will be:

```
GET /v2/partner/catalog/products/:productId
```

**Response `200`** — the listing row plus:

```json
{
  "description": "…",
  "attributes": [
    { "name": "Size",  "options": ["38", "39"] },
    { "name": "Color", "options": ["BA", "D"] }
  ],
  "variants": [
    {
      "id": "…",
      "code": "MY88610-BA-38",
      "variantLabel": "38 · BA",
      "price": 750000,
      "inStock": true,
      "attributes": { "Size": "38", "Color": "BA" }
    }
  ]
}
```

`attributes` lists the selectable dimensions; `variants` says which combinations actually
exist. Both are needed — the dimension lists alone would imply combinations that are not
sold. `variantLabel` is the pre-composed string stored on the variant; use `attributes`
when you need the parts rather than the label.

Remaining work to make it live: register `GET products/:productId` on
`PartnerProductV2Controller` (**after** the static `products/search` route — Express 5
matches in registration order), then regenerate the OpenAPI client.

---

## 8. OpenAPI

The live contract is published at `/docs` (Swagger UI) and `/docs-json`, tagged
**Partner catalog**, with the `api-key` security scheme declared. Both live endpoints
return a concrete response schema rather than `unknown`.

After changing any endpoint here: run the API, then `pnpm openapi:generate`, and commit
`packages/api-client/src/generated/schema.ts` and
`packages/api-client/openapi.snapshot.json`. Generate from a build of your own checkout —
another checkout serving `:4000` will silently produce a snapshot of code you did not write.

---

## 9. Implementation map

| Concern | File |
| ------- | ---- |
| Module wiring | `partner-catalog.module.ts` |
| Permission + attribute-name aliases | `partner-catalog.constants.ts` |
| Category tree | `queries/search-partner-categories.{query,handler}.ts`, `dto/partner-category-tree.dto.ts` |
| Category subtree expansion (shared) | `category-subtree.util.ts` |
| Product search | `queries/search-partner-products.{query,handler}.ts`, `dto/partner-product-search.dto.ts` |
| Sort lookup table | `partner-product-sort.ts` |
| Stock predicate (shared) | `partner-stock.sql.ts` |
| Product detail | `queries/get-partner-product.{query,handler}.ts`, `dto/partner-product-detail.dto.ts` |
| Controllers | `controllers/partner-category-v2.controller.ts`, `controllers/partner-product-v2.controller.ts` |
| Contract guard | `partner-catalog-contract.spec.ts` |
| End-to-end | `apps/api/test/e2e/partner-catalog.e2e-spec.ts` |
| Permission seed | `modules/rbac/permissions.seed.ts`, `database/seeds/org-role-permissions.ts` |

No migration is involved: the module owns no table and reads the existing inventory
schema.
