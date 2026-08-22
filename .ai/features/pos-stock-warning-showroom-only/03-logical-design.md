---
feature: pos-stock-warning-showroom-only
adr_count: 4
---

# Logical design — Cảnh báo vượt tồn ở POS tính trên tồn showroom

## Approach

Không đổi schema, không đổi luật cảnh báo, không đổi đường trừ kho. Chỉ **thay số nạp vào**
một phép so sánh đã có, và số đó phải được BE tính chứ không phải FE suy ra.

Phép so sánh giữ nguyên (`checkoutUtils.ts:105`):

```
lineExceedsOnHandSnapshot(line) = line.qty > line.maxQty
```

Thứ đổi là nguồn của `maxQty`. Hôm nay:

```
maxQty ← PosCatalogLineDto.quantityOnHand = Σ quantity ∀ vị trí trong chi nhánh
```

Sau feature:

```
maxQty ← PosCatalogLineDto.showroomQuantity = Σ quantity ∀ vị trí có
         location.storage_id ∈ { storages.id : branch_id = <chi nhánh> ∧ is_main_storage }
```

Vế phải là **đúng bộ lọc** mà `resolveBranchItemLocations(..., { showroomOnly: true })` dùng
để chọn nơi trừ kho (`resolve-branch-item-locations.ts:49-63`: `mainStorageIds` = storage
của chi nhánh có `isMainStorage`, và fallback là location `Mặc định` của chính main storage
đó). Cảnh báo và trừ kho vì thế không phải "được canh cho khớp" mà **khớp theo cấu tạo**:
hai bên đọc cùng một tập storage (ADR-01).

`quantityOnHand` giữ nguyên, đứng cạnh trường mới. Không lọc bớt dòng nào khỏi kết quả — đó
là ràng buộc cứng của A-04: `aggregateStockRows` lọc theo *dòng stock_balances*, nên bất kỳ
cách nào dựa trên `direction=showroom` đều làm biến mất hẳn mặt hàng chỉ có tồn kho lưu trữ.
Thêm trường thì tập kết quả bất biến, và bán khống vẫn chạy.

### Ba đường đọc tồn phải cùng số

Cùng một mặt hàng vào giỏ được bằng ba lối, và cả ba hôm nay đều nạp `maxQty`:

| Lối | Endpoint | Hàm BE | Trạng thái |
|---|---|---|---|
| Gõ tìm / lưới catalog | `GET /pos/branches/:id/catalog` | `getCatalog` → `aggregateStockRows` | đã có cờ phân loại, thiếu cờ `is_main_storage` |
| Quét mã vạch / SKU | `GET /pos/branches/:id/catalog/lookup` | `lookupByCode` → `aggregateStockRows` | query **chưa** select cờ nào (A-10) |
| Dialog chọn biến thể | `GET /pos/branches/:id/catalog/products/:id` | `getProductDetail` → `loadBranchStock` | có `showroomRepo` nhưng phân loại theo bảng `showrooms` |

Cả ba dồn về hai điểm gom duy nhất — `aggregateStockRows` (2 lối đầu) và `loadBranchStock`
(lối thứ ba). Sửa hai chỗ đó là phủ hết ba lối; đó cũng là lý do bổ dọc được cắt theo *đường
đọc*, không theo tầng.

### Đường chảy của con số ở FE

```
BE showroomQuantity
   ├─ addProduct            (use-checkout-session-cart.ts:172)   → line.maxQty
   ├─ syncPurchaseCartOnHand(checkout-session.store.ts:355)      → line.maxQty (refetch)
   └─ variantToCatalogLine  (use-checkout-variant-selection.ts:39)
                                                                  → addProduct → line.maxQty
line.maxQty
   ├─ lineExceedsOnHandSnapshot → chấm đỏ + tooltip "Tồn: N"     (InvoiceLineItemWarningCell)
   └─ getOversellSaleLines      → dialog "Cảnh báo xuất quá số lượng tồn"
                                  (cột "Số lượng tồn", "Tồn khả dụng")
VariantRow (VariantRow.tsx:40,59,102)  → đọc thẳng variant.showroomQuantity
```

Bốn chỗ hiển thị (tooltip, hai cột của dialog bán khống, dòng biến thể) không có chỗ nào tự
tính lại — tất cả đọc `maxQty` hoặc trường mới, nên A-01/A-02 (số và ngưỡng không lệch) đúng
theo cấu tạo chứ không cần test canh từng chỗ.

## Alternatives rejected

| Option | Why not |
|---|---|
| Truyền `direction=showroom` ở lời gọi catalog của màn bán hàng | `aggregateStockRows` lọc **dòng stock_balances** trước khi gom, nên mặt hàng chỉ có tồn ở kho lưu trữ biến mất khỏi kết quả: không tìm ra, không nằm trong lưới, không bán khống được. Vá một triệu chứng bằng cách gãy một chức năng (A-04, A-R1) |
| FE tự cộng các phần tử `locations[]` thuộc showroom | FE không biết location nào thuộc showroom — `locations[]` chỉ có `locationId`, `name`, `quantity`. Suy từ chuỗi `name` là đoán mò, và breakdown có thể chứa cặp +/− bù trừ (A-09, A-R2) |
| Thay luôn ý nghĩa `quantityOnHand` thành tồn showroom | Chuyển kho nhanh và mọi consumer catalog khác đang đọc tổng chi nhánh sẽ đổi hành vi âm thầm; không có gì báo cho biết (A-07) |
| Chặn hẳn không cho bán vượt tồn showroom | Bán khống là hành vi có chủ đích của quầy; Out of scope của `00-intent.md`. Feature này chỉ dời ngưỡng cảnh báo |
| Thêm trạng thái cảnh báo thứ ba ("hết ở quầy nhưng kho còn") | Được cân nhắc và bị người dùng bác 2026-08-22 (A-03). Vẫn để lọt case showroom 4 / kho 8 bán 6 — đúng case đang chữa |
| Sửa `defaultLocationId` để ưu tiên vị trí showroom | Chỉ có tác dụng trong nhánh thoái lui hiếm A-11; đụng vào đường trừ kho là mở rộng phạm vi (A-12) |

## Contracts

**`PosCatalogLineDto`** (`pos-catalog.service.ts:6`) — thêm một trường, không sửa trường nào:

```ts
/** Tổng tồn tại chi nhánh (cộng mọi vị trí lưu). */
quantityOnHand: number;
/**
 * On-hand at the branch's main (showroom) storages only — the same storage set
 * POS deducts from (resolveBranchItemLocations, showroomOnly). This is the
 * oversell-warning basis; quantityOnHand is not.
 */
showroomQuantity: number;
```

Trả về ở cả `getCatalog`, `searchCatalogByTerm` và `lookupByCode`. Mặt hàng không có dòng
tồn nào ở main storage ⇒ `showroomQuantity = 0` (không phải `null`, không phải sentinel) —
`0` là con số đúng và cảnh báo bật là hành vi mong muốn (A-03).

**`PosProductVariantDto`** (`pos-catalog-product.response.dto.ts:67`) — thêm cùng trường,
kèm `@ApiProperty`. Đây là DTO **có** khai báo Swagger (`@ApiOkResponse({ type: PosProductDetailDto })`)
nên `openapi.snapshot.json` + `packages/api-client` phải regen; hai endpoint kia trả type
thuần, không đụng snapshot.

**FE** — `PosCatalogLine` và `PosProductVariant` (`catalog.interface.ts`) thêm
`showroomQuantity: number`. Không có adapter/mapping tay ở giữa: `catalogService` gọi
`http.get<PosCatalogLine[]>` thẳng, nên thêm trường vào interface là đủ.

**Không đổi:** `PosCatalogQueryDto.direction`, `PosProductCardDto.quantityOnHand`,
`CartLine.maxQty` (tên và ngữ nghĩa "trần cảnh báo" giữ nguyên), `lineExceedsOnHandSnapshot`,
`OversellCheckoutConfirmDialog`.

## Error taxonomy

Feature chỉ đụng đường **đọc**; không có mutation, không có mã lỗi mới, không có endpoint mới.

| Tình huống | Xử lý | Vì sao không phải lỗi |
|---|---|---|
| Chi nhánh không có storage nào `is_main_storage` | `showroomQuantity = 0` cho mọi mặt hàng ⇒ mọi dòng cảnh báo | Chính là hiện trạng của đường trừ kho: `resolveBranchItemLocations` cũng trả map rỗng, hoá đơn rơi vào nhánh thoái lui A-11. Cảnh báo toàn màn hình là phản ánh **đúng** một chi nhánh cấu hình thiếu |
| Mặt hàng chưa xếp kệ showroom | `showroomQuantity = 0` ⇒ cảnh báo | A-03, người dùng đã chốt |
| Tồn showroom âm (đã bán khống trước đó) | Giữ nguyên số âm, không kẹp về 0 | `qty > maxQty` với `maxQty < 0` vẫn đúng; kẹp về 0 chỉ giấu mất mức độ âm. Cột "Tồn khả dụng" của dialog đã tự kẹp `Math.max(0, …)` từ trước, không đụng |
| Dòng khôi phục từ nháp, không thấy trong catalog | `onHandUnknown = true`, cảnh báo bật, tooltip ghi "Chưa xác định được tồn kho" | Cơ chế có sẵn (`checkout-session.store.ts:346-352`), không đổi |
| BE cũ / FE mới (deploy lệch nhịp) | `showroomQuantity` thiếu ⇒ `undefined` ⇒ `qty > undefined` là `false` ⇒ **tắt sạch cảnh báo** | Đây **là** một rủi ro thật, không phải trường hợp bỏ qua — xem ADR-04 |

## ADRs

### ADR-01 — "Showroom" định nghĩa bằng `storages.is_main_storage`, không bằng bảng `showrooms`

**Status:** accepted (Akenzy, 2026-08-22)

**Bối cảnh.** BE đang có hai cách nói "showroom". `PosCatalogService` phân loại bằng
`EXISTS (SELECT 1 FROM showrooms sr WHERE sr.storage_id = l.storage_id)` cho tham số
`direction` (Chuyển kho nhanh dùng). `resolveBranchItemLocations` — đường **thực sự trừ kho**
của mọi hoá đơn POS — lọc bằng `storages.is_main_storage` trong phạm vi chi nhánh.
`BranchService.create` (:111-136) tạo cả hai cùng lúc trên cùng một storage, nên với chi
nhánh tạo qua đường chuẩn hai tập trùng nhau; chi nhánh cũ và seed thì chưa đối chiếu được
(A-06, DB dev không chạy lúc lập kế hoạch).

**Quyết định.** Tồn cảnh báo tính trên `storages.is_main_storage = true` của chi nhánh.

**Vì sao.** Cảnh báo này tồn tại để **dự đoán chỗ kho sẽ bị trừ**. Dùng đúng bộ lọc của
đường trừ kho thì hai bên khớp theo cấu tạo, kể cả khi dữ liệu `showrooms` lệch. Chọn bảng
`showrooms` thì phải *chứng minh* hai tập trùng nhau trên mọi chi nhánh, và lời chứng minh
đó hết hạn ngay khi ai đó thêm một storage.

**Đánh đổi (đã nêu trước khi chốt).** `PosCatalogService` từ nay mang hai định nghĩa
showroom cạnh nhau: `direction` vẫn theo bảng `showrooms`, `showroomQuantity` theo
`is_main_storage`. Đây là nợ có ý thức, phải ghi rõ bằng chú thích ngay tại chỗ. Không hợp
nhất `direction` trong feature này — làm thế là đổi hành vi Chuyển kho nhanh, một màn khác,
ngoài phạm vi (ADR-02).

**Hệ quả.** Truy vấn đối chiếu hai tập vẫn nằm trong Demo script của UOW-01, nhưng đổi vai:
không còn để chốt thiết kế, mà để **phát hiện lỗi dữ liệu** — nếu kho mà UI gọi là
"Showroom MT46" không phải main storage thì đó là một sự thật cần biết trước khi bàn giao.

### ADR-02 — Không đụng tham số `direction` và màn Chuyển kho nhanh

**Status:** accepted (2026-08-22)

Sau ADR-01 sẽ thấy hấp dẫn khi "dọn luôn" cho `direction` cùng dùng `is_main_storage`. Không
làm. `direction` phục vụ `FastStockTransferPage` — chọn nguồn/đích chuyển kho — và đang
chạy đúng thứ nó cần. Đổi phân loại ở đó là đổi hành vi một màn khác, không AC nào phủ, và
không ai yêu cầu. Nợ được ghi lại ở ADR-01 chứ không trả bằng cách mở rộng phạm vi.

### ADR-03 — Thêm trường mới, giữ nguyên `quantityOnHand`

**Status:** accepted (2026-08-22)

`showroomQuantity` đứng **cạnh** `quantityOnHand`, không thay thế nó. Hai lý do. Một: tập
mặt hàng trả về phải bất biến, mà mọi cách lọc theo showroom đều làm mất mặt hàng chỉ có tồn
kho lưu trữ (A-04). Hai: đổi ý nghĩa một trường đang có consumer là đổi hành vi âm thầm —
Chuyển kho nhanh đọc `quantityOnHand` và không có gì báo cho nó biết (A-07).

Cái giá là payload rộng thêm một số nguyên mỗi dòng, và một cái bẫy đọc nhầm: từ nay
`quantityOnHand` **không** còn là cơ sở cảnh báo. Trả bằng chú thích ở đúng ba chỗ đã từng
khẳng định ngược lại — `pos-catalog.service.ts` (DTO), `use-checkout-session-cart.ts:168-171`,
`checkout-session.store.ts:352-354` (A-08). Để nguyên chú thích cũ là gài bẫy cho lần sửa sau.

### ADR-04 — BE đi trước FE, và FE coi thiếu trường là "chưa xác định được tồn"

**Status:** accepted (2026-08-22)

**Vấn đề.** `qty > undefined` cho `false`. Nếu FE mới gặp BE cũ (chưa có `showroomQuantity`),
cảnh báo **tắt sạch** — im lặng, không lỗi, không log. Đúng cái thất bại tệ nhất: lớp bảo vệ
duy nhất biến mất mà không ai biết (`stock-ledger.service.ts` không chặn tồn âm).

**Quyết định.** Hai lớp:

1. **Thứ tự trong từng lát cắt.** Trong mỗi UoW, ticket BE (thêm trường vào payload) đứng
   **trước** ticket FE đọc trường đó, khoá bằng `depends_on` chứ không bằng lời dặn. Deploy
   cũng theo thứ tự đó: BE lên trước, FE lên sau.
2. **FE không tin trường thiếu.** Nơi gán `maxQty` đọc `showroomQuantity`; khi giá trị không
   phải số hữu hạn thì **không** rơi về `quantityOnHand` và **không** rơi về `0` — mà bật
   `onHandUnknown = true`, đúng cơ chế có sẵn cho dòng không xác định được tồn
   (`checkout-session.store.ts:346-352`). Kết quả: cảnh báo bật kèm chữ "Chưa xác định được
   tồn kho" thay vì tắt lặng.

**Vì sao không fallback về `quantityOnHand`.** Fallback đó khiến hệ thống chạy "có vẻ ổn" ở
đúng cấu hình sai, và tái lập chính con số 12 mà feature này đang bỏ. Thà ồn còn hơn im.

**Hệ quả trong nội bộ một lát cắt.** Quy tắc này cũng đỡ cho khoảng giữa hai UoW: khi UOW-01
đã đổi `addProduct` sang `showroomQuantity` mà UOW-02 chưa đụng `variantToCatalogLine`, dòng
thêm từ dialog biến thể rơi vào `onHandUnknown` — cảnh báo bật kèm "Chưa xác định được tồn
kho", chứ không im lặng. Trạng thái trung gian đó xấu nhưng an toàn, và UOW-02 dọn nốt.
