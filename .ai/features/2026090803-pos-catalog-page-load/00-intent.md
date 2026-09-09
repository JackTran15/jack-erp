# Intent — pos-catalog-page-load

## Problem

Mở trang bán hàng POS kéo về **toàn bộ** catalog của chi nhánh qua
`GET /pos/branches/:id/catalog` (không tham số `search`), rồi giữ nguyên trong bộ nhớ
suốt phiên. Đây là mục đã ghi "Out of scope" ở
[[project_pos_catalog_search_perf]] và nhìn thấy lại trên network panel lúc verify
feature đó.

Đo trên `erp_dev_3008` (bản restore prod), org `e60e5f49…` ("MT"):

| Chi nhánh | Dòng `stock_balances` | Item | JSON ước tính |
|---|---|---|---|
| Cà Mau | 12 318 | **10 400** | **3 835 kB** |
| Nha Trang | 10 493 | **8 187** | **3 092 kB** |
| Hồ Chí Minh | 1 761 | 1 730 | — |

Cùng service, cùng `PosCatalogService.getCatalog`, nhưng **khác bệnh** với feature
trước: lần đó là đường tìm kiếm gọi hai lần và trả quá nhiều; lần này là **đường tải
danh sách** trả mọi thứ dù gần như không ai đọc.

Truy ngược `useCatalogQuery` (`hooks/react-query/use-query-catalog.ts:29`) cho thấy
mảng 10 400 phần tử đó chỉ còn **hai** người dùng thật:

1. **`useSyncCartOnHand`** (`use-sync-cart-on-hand.ts:18`) — làm tươi `maxQty` (snapshot
   tồn) cho các dòng **đang nằm trong giỏ**, tức là cần tồn của 1–20 item, không phải
   10 400.
2. **`filteredProducts`** = `catalog.filter(matchesCatalogQuery(p, toolbar.query))`
   (`use-checkout-catalog.ts:116`) — dùng ở đúng hai chỗ, và cả hai đều hỏi cùng một
   câu: "chuỗi này khớp đúng một mặt hàng không?"
   - `addProductByQuery()` — fallback khi Enter không khớp mã tuyệt đối
   - `useCheckoutVariantSelection.openForQuery()` — mở dialog biến thể theo chuỗi

Người dùng thứ ba **là code chết**: `addProductByCatalogCard`
(`use-checkout-cart-actions.ts:90`) và `handleCatalogSelect`
(`use-checkout-session-cart.ts:262`) được khai báo, định nghĩa và trả ra, nhưng
**không component nào gọi**. `ProductCard` bấm vào thì gọi `openForCatalogCard`, đi
thẳng theo `kind` + `id` của card, không cần catalog phẳng. Đây là lý do duy nhất
`catalog` (nguyên mảng, chưa lọc) còn bị truyền đi.

Lưới sản phẩm **không** đọc mảng này: `catalogProducts` dựng từ `productCards`
(`GET /catalog/products?page=1&pageSize=30`), một endpoint khác đã phân trang sẵn.

## Success signal

Mở trang bán hàng POS ở chi nhánh Cà Mau (`erp_dev_3008`), DevTools > Network:

1. **Không** còn request `GET /catalog` không có `search`.
2. Tổng payload catalog lúc mở trang: **≤ 100 kB** (hiện tại 3 835 kB).
3. Thêm hàng vào giỏ rồi tải lại trang: cảnh báo bán vượt tồn trên từng dòng vẫn
   đúng như trước — snapshot `maxQty` được điền, không dòng nào kẹt `onHandUnknown`.
4. Enter với chuỗi khớp đúng 1 mặt hàng theo tên/mã → vẫn thêm được vào giỏ.
5. Enter với chuỗi khớp 0 → "Không tìm thấy hàng hoá"; khớp nhiều → "Nhiều kết quả".
6. Dialog chọn biến thể mở được từ chuỗi tìm (`openForQuery`).

## Out of scope

- `GET /catalog/products` (lưới card) — đã phân trang `pageSize=30`, không phải vấn đề.
- `GET /catalog?search=` — đã xử lý ở [[project_pos_catalog_search_perf]]; endpoint
  giữ nguyên hợp đồng cho Chuyển kho nhanh.
- `FastStockTransferPage` — nó gọi `useSearchPosBranchCatalog`, không gọi
  `useCatalogQuery`, nên không bị ảnh hưởng.
- Bỏ hẳn `getCatalog` khỏi backend. Endpoint còn consumer khác; feature này chỉ gỡ
  **trang POS** khỏi nó.

## Constraints

- `sellableQuantity` là cơ sở cảnh báo bán vượt tồn ([[project_pos_stock_warning_temp_warehouse]]).
  Mọi đường thay thế phải trả đúng trường này, tính từ cùng nguồn (`aggregateStockRows`
  + `getBranchDelta`), không được để FE tự suy.
- `syncPurchaseCartOnHand` hiện nhận `PosCatalogLine[]` và tự tra theo `itemId`. Dòng
  chưa có tồn bị coi là `onHandUnknown`, và `lineExceedsOnHandSnapshot` **coi
  `onHandUnknown` là vượt tồn** — nên thiếu dữ liệu không im lặng, nó bật cảnh báo oan
  (`checkoutUtils.ts:132-135`).
- Hoá đơn lưu tạm khôi phục dòng vào giỏ **sau** lần fetch cuối; vòng lặp effect trong
  `use-sync-cart-on-hand.ts` tồn tại chính vì ca đó ([[project_pos_draft_invoice_fixes]]).
- Không viết tiếng Việt vào source backend ([[feedback_no_vietnamese_in_backend_source]]).
