---
feature: pos-catalog-inline-search
adr_count: 3
---

# Logical design — pos-catalog-inline-search

## Approach

Backend không đổi một dòng. `GET /pos/branches/:branchId/catalog/products` đã nhận
`search` từ [[2026090805-pos-initial-load-latency]]; feature này chỉ là frontend cuối
cùng cũng dùng thứ đã có.

Ba mảnh:

### 1. Lưới hỏi server thay vì lọc trong bộ nhớ

`use-checkout-catalog.ts` hiện làm:

```
catalogQuery ──► filter(productCards, c.name.includes(q))   ← 20 card, chỉ theo tên
```

Đổi thành:

```
catalogQuery ──► useDebounce(150ms) ──► useCatalogProductsQuery(branchId, categoryId, search)
                                              └─► GET …/catalog/products?search=…
```

`useDebounce` đã có ở `hooks/common/use-debounce.ts`. `search` vào cả `queryKey` (để
TanStack Query fetch lại và dedupe) lẫn request. Bộ lọc `.filter(...)` bị xoá — nó vừa là
nguồn lỗi vừa là thứ duy nhất còn giữ `catalogQuery` ở dạng chưa debounce.

Ngưỡng của lưới là **1 ký tự** (ADR-02). `catalogQuery` rỗng ⇒ không gửi `search`.

### 2. Tắt dropdown mà không tháo popover

`PosSearchPopover` nhận thêm **một** prop opt-in — `suppressSuggestions?: boolean`, mặc
định `false`. Khi bật:

- `showDropdown` luôn `false` → không render khung danh sách, kể cả nhánh
  "Không có kết quả." (`:654`).
- `search(q)` **vẫn chạy** sau debounce như cũ. Đó là chỗ `searchWithAutoAdd` sống, tức
  là đường quét mã vạch (ADR-01).
- Điều hướng bàn phím, `onSubmitQuery` (Enter), `onClear`, nút clear: không đổi.

Chỉ `ProductCatalogHeader` truyền `suppressSuggestions`. Ba nơi dùng còn lại
(`POSToolbar/ProductSearchInput`, ô lọc nhóm hàng cùng file, `FastStockTransfer`) không
truyền gì nên giữ nguyên hành vi (AC-07).

### 3. Đúng một card thì mở dialog

Một hook nhỏ, `use-checkout-catalog-auto-open.ts`, mount ở `ProductCatalogGrid` — nơi
đã có sẵn cả kết quả lưới lẫn `useCheckoutVariantSelection`:

```ts
useCatalogAutoOpenVariant({ search, total, card, openForCatalogCard })
```

Luật: khi `search` không rỗng **và** `total === 1` **và** từ khoá này chưa được mở lần
nào → gọi `openForCatalogCard(card)`, rồi ghi từ khoá vào một `useRef` để không mở lại
(ADR-03). Ref được xoá khi `search` đổi.

## Alternatives rejected

| Option | Why not |
|---|---|
| Thay `PosSearchPopover` bằng `<input>` thường trong `ProductCatalogHeader` | Popover sở hữu debounce, điều hướng bàn phím, phân trang, nút clear và đường Enter. Dựng lại bốn thứ đó trong header để bỏ một thứ (danh sách gợi ý) là đổi một diff nhỏ lấy một bản sao. Rủi ro thật: đường `searchWithAutoAdd` nằm trong `search` callback của popover — chép sai là **quét mã vạch ngừng hoạt động**. Xem A-01 |
| Trả `[]` từ `search` để dropdown tự đóng | Không đủ. `showDropdown = open && trimmed.length >= minChars` (`:493`) không phụ thuộc số gợi ý, nên rỗng vẫn render khung "Không có kết quả." Đã có tiền lệ trong repo: nhánh `result === "added"` của `ProductCatalogHeader` trả `[]` kèm chú thích "đóng dropdown" — chú thích đó cũng không đúng |
| Đặt `minChars` rất lớn để tắt dropdown | `showDropdown` tắt thật, nhưng `:362` cũng dùng `minChars` để bỏ qua debounce+`search` → **giết luôn auto-add mã vạch**. Đây là cách hỏng âm thầm nhất trong ba cách |
| Dùng chung một `minChars` cho cả dropdown và lưới | Hai đường hỏi hai endpoint khác nhau với hai chỉ mục khác nhau. Ngưỡng 3 của dropdown là vì `pg_trgm`; lưới không đụng trigram. Gộp lại là bắt một đường chịu ràng buộc của đường kia. ADR-02 |
| Mở dialog theo `data.length === 1` | Trang cuối của kết quả 21 card cũng có `data.length === 1`. `total` mới là "khớp đúng một món". A-03 |
| Lên `POST /v2/.../catalog/products/search` (CQRS) | Chủ sở hữu chốt 2026-09-08: dùng GET hiện tại. GET đã nhận `search`, không có bộ lọc nào phức tạp đến mức cần `FilterBuilder` |
| Bỏ luôn `openForQuery()` (đường Enter) | Không ai yêu cầu, và máy quét gửi Enter. Giữ nguyên |

## Contracts

### `GET /pos/branches/:branchId/catalog/products`

**Không đổi.** Frontend bắt đầu gửi tham số `search` mà DTO đã khai báo từ trước
(`PaginationQueryDto.search`). Không chạy lại `openapi:generate`, không đổi
`packages/api-client`.

### `PosSearchPopover` — thêm một prop

```ts
/**
 * Tắt phần danh sách gợi ý mà vẫn chạy `search` sau debounce. Dành cho ô tìm
 * đã có nơi khác hiển thị kết quả (lưới sản phẩm), nhưng vẫn cần lượt gọi
 * `search` vì đó là chỗ auto-add mã vạch sống.
 */
suppressSuggestions?: boolean;   // default false
```

Đây là thay đổi **cộng thêm**: mọi nơi dùng hiện tại không truyền prop nên không đổi.

### `useCatalogProductsQuery` — thêm tham số

```ts
useCatalogProductsQuery(branchId: string, categoryId?: string, search?: string)
```

`search` vào `CATALOG_KEYS.PRODUCTS(branchId, categoryId, search)`.

### `useCheckoutCatalog` — trả thêm

```ts
catalogTotal: number;         // total của response, cho luật "đúng một card"
catalogSearch: string;        // giá trị đã debounce, để hook auto-open so khớp
```

`catalogProducts` giữ nguyên kiểu `CatalogProduct[]`.

## Error taxonomy

| Tình huống | Xử lý | Ghi chú |
|---|---|---|
| Request lưới lỗi khi đang gõ | `catalogProductsError` như hiện tại, lưới hiện alert | `CatalogErrorAlert` đã có |
| Từ khoá không khớp gì | Lưới hiện trạng thái trống sẵn có, **không** dialog | AC-13. Khác hôm nay ở chỗ trạng thái trống giờ nói đúng sự thật |
| Quét mã vạch trúng SKU | `searchWithAutoAdd` trả `added` → thêm vào giỏ + `setCatalogQuery("")` | Ô rỗng ⇒ không có `search` ⇒ `total` là toàn catalog ⇒ auto-open không kích hoạt (A-05, AC-08) |
| Dialog đang mở mà người dùng gõ tiếp | Không đóng dialog thay người dùng | Ngoài phạm vi; gõ tiếp chỉ đổi lưới bên dưới |
| `total === 1` nhưng `data[0]` chưa về | Không mở | Hook chỉ chạy khi có cả hai |

## ADRs

### ADR-01 — Thêm prop vào `PosSearchPopover`, không tháo nó ra

**Context:** Yêu cầu là bỏ dropdown gợi ý ở ô tìm sản phẩm. Nhưng lượt gọi `search` mà
popover thực hiện sau debounce **chính là** chỗ `searchWithAutoAdd` chạy — tức đường auto-add
mã vạch. Bỏ popover là bỏ luôn cái đó nếu không dựng lại.

**Decision:** Thêm `suppressSuggestions?: boolean` (mặc định `false`) vào popover. Chỉ
`ProductCatalogHeader` bật.

**Consequences:** Một component dùng chung có thêm một nhánh render — chi phí thật, và
nếu nhánh này sinh thêm nhánh nữa thì nên tách component chứ đừng cộng prop thứ hai. Đổi
lại, debounce, điều hướng bàn phím, nút clear, đường Enter và auto-add mã vạch **không bị
chạm dòng nào**, nên rủi ro với đường bán hàng bằng máy quét gần như bằng không. Ba nơi
dùng còn lại không phải sửa gì.

**Status:** accepted

### ADR-02 — Hai ngưỡng ký tự riêng, có chủ ý

**Context:** Popover chặn `search` dưới 3 ký tự vì `pg_trgm` cần ≥3 ký tự mới dùng được
index. Lưới hỏi endpoint khác, bằng `LIKE` trên cột đã `lower()`, không đụng trigram —
đo được luôn `Seq Scan`, 35–42 ms bất kể độ dài từ khoá.

**Decision:** Popover giữ `minChars = 3`. Lưới lọc từ **1 ký tự**.

**Consequences:** Gõ 1–2 ký tự sẽ lọc lưới nhưng chưa chạy auto-add mã vạch — đúng ý,
vì không mã vạch nào dài 2 ký tự. Cái giá là hai con số cùng nghĩa "bao nhiêu ký tự thì
bắt đầu tìm" nằm ở hai chỗ; chú thích ở cả hai phải nói rõ chúng gác hai đường khác nhau,
nếu không lần sửa sau sẽ có người "dọn dẹp" bằng cách gộp lại.

**Status:** accepted

### ADR-03 — Auto-open có guard theo từ khoá, không theo lần render

**Context:** `total === 1` đúng liên tục suốt thời gian từ khoá đó còn trên ô tìm. Mở
dialog mỗi lần điều kiện đúng thì đóng xong nó bật lại ngay.

**Decision:** Ghi từ khoá vừa mở vào một `useRef`; chỉ mở khi từ khoá hiện tại khác giá
trị trong ref. Ref không bị xoá khi đóng dialog.

**Consequences:** Đóng dialog rồi muốn mở lại đúng từ khoá đó thì phải click vào card —
chấp nhận được, và là hành vi ít gây bất ngờ nhất. Ref sống theo vòng đời component;
rời trang rồi quay lại sẽ mở lại một lần nữa cho cùng từ khoá. Không coi là lỗi:
màn hình mới, ngữ cảnh mới.

**Status:** accepted
