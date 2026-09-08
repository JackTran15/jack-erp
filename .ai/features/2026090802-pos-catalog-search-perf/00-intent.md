# Intent — pos-catalog-search-perf

## Problem

Gõ **một ký tự** vào ô tìm hàng của POS checkout (`(F3) Nhập tên hàng hóa, mã vạch, mã SKU`)
phát **hai** request nối tiếp và kéo về gần **4 MB JSON** để hiển thị **8 dòng** gợi ý.

Đo trên `erp_dev_3008` (bản restore prod), chi nhánh `64f44dbe…` (Nha Trang),
org `e60e5f49…`, term `2`:

| Đường | Endpoint | Hàng SQL | Hàng trả về | Client dùng | Thời gian |
|---|---|---|---|---|---|
| 1 | `GET …/catalog/lookup?code=2` | quét toàn bảng `items` (21 024) + `item_barcodes` (21 023) | 0 | 0 | **25 ms** |
| 2 | `GET …/catalog?search=2` | 11 519 | **10 394 dòng ≈ 3 922 kB** | **8** | **88 ms** |

Ba nguyên nhân độc lập, mỗi cái đo được:

1. **Hai request là do thiết kế FE, không phải bug ngẫu nhiên.**
   `ProductSearchInput.search()` gọi `tryAutoAdd(q)` trước — đường auto-add mã
   vạch, bắn `/catalog/lookup`. Chỉ khi lookup trả `miss` (0 hoặc >1 kết quả)
   mới rơi xuống `productSearchAdapter(q)` → `/catalog?search=`. Hai lời gọi
   **nối tiếp** (`await`), nên độ trễ cộng dồn chứ không chồng lấn.

2. **`/catalog?search=` không có LIMIT.** Service trả *toàn bộ* item khớp kèm
   mảng `locations[]` của từng item; FE mới `slice(0, 8)` (checkout) hoặc
   `slice(0, 40)` (chuyển kho nhanh). 10 386 dòng bị vứt đi sau khi đã
   serialize, truyền và parse.

3. **Với term 1–2 ký tự, index trigram sẵn có vô dụng.** `pg_trgm` cần ≥3 ký tự;
   `%2%` rơi về quét `IDX_items_org_pos_catalog` (21 024 dòng). Cùng câu truy vấn
   với `%235%` dùng được `IDX_items_name_trgm` + `IDX_items_code_trgm` →
   **87 dòng, 3,7 ms**. Ô tìm đang đặt `minChars = 1`.

Câu hỏi "cần index gì" có câu trả lời đo được, và **không phải cái ta nghĩ**:

- `/catalog/lookup` **không thiếu index nào**. `items` đã có `UQ(organization_id, code)`,
  `item_barcodes` đã có `UQ(organization_id, code)` và `IDX_item_barcodes_item(item_id)`.
  Vấn đề là mệnh đề `i.code = $3 OR b.code = $3` bắc qua một `LEFT JOIN` nên Postgres
  không đẩy được vào index nào cả. Viết lại thành `UNION` hai nhánh:
  **25 ms → 1,1 ms**, không thêm một index nào.
- `/catalog?search=` **thiếu đúng một index**: `item_barcodes.code` không có trigram
  (migration `1781800000000-AddTrigramSearchIndexes` phủ `items`, `customers`,
  `products.name` nhưng bỏ sót `item_barcodes.code` và `products.code`).
  Nhánh `b.code ILIKE '%235%'` quét tuần tự 41 714 dòng — **18 ms** ngay cả với
  term 3 ký tự.

## Success signal

Trên `erp_dev_3008`, chi nhánh Nha Trang, gõ `2` rồi `235` vào ô tìm hàng POS:

1. Số request phát ra cho một lần gõ: **≤ 1** (hiện tại 2).
2. Payload trả về cho term `2`: **≤ 60 kB** (hiện tại 3 922 kB).
3. Thời gian SQL cho term `235`: **≤ 5 ms** (hiện tại 18 ms vì quét `item_barcodes`).
4. Quét mã vạch vẫn auto-add đúng 1 lần, không hồi quy `claimRef`
   (xem [[project_temp_warehouse_scan_add_line]]).
5. Chuyển kho nhanh (`FastStockTransferProductSearchInput`) vẫn nhận đủ
   `locations[]` để `catalogLocationsForLine` chọn được vị trí nguồn.

## Out of scope

- `GET …/catalog` **không có** `search` (tải toàn bộ catalog chi nhánh lúc mở trang,
  10 493 dòng qua `useCatalogQuery`). Cùng service, cùng bệnh, nhưng là đường tải
  danh sách chứ không phải đường tìm kiếm — tách feature riêng.
- `GET …/catalog/products` và `/catalog/products/:id` (lưới card + dialog biến thể).
- Backoffice `POST /v2/inventory-items/search` — đã tối ưu ở
  [[project_inventory_item_search_v2]].
- Đổi `PosCatalogLine` thành shape mới cho *mọi* consumer; feature này chỉ được
  thêm đường gọn, không được phá hợp đồng đang dùng.

## Constraints

- `PosCatalogLine.locations[]` **đang có consumer thật**:
  `fast-stock-transfer-pickers.ts:20` và `picker-cache.ts:59`. Không thể bỏ
  trường này khỏi endpoint dùng chung.
- `/pos/branches/:id/catalog` gác bằng `inventory.read`, **không** phải
  `pos.sale.create` — cùng picker phục vụ cả checkout lẫn chuyển kho tạm.
- Không được viết tiếng Việt vào source backend (xem [[feedback_no_vietnamese_in_backend_source]]).
- Migration viết tay, không dùng `migration:generate` (xem [[feedback_handwrite_migrations]]).
- `CREATE INDEX` trên bảng 41 714 dòng phải cân nhắc `CONCURRENTLY` + chế độ
  transaction (xem [[reference_migrations_transaction_mode_each]]).
