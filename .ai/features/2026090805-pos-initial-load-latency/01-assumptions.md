# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | Postgres của dev server và prod có collation ICU `vi-VN-x-icu` (đã xác nhận trên `erp_dev_3008`, postgres:16-alpine) | medium | yes | Toàn bộ thiết kế UOW-01 phụ thuộc vào việc sắp xếp trong SQL. Không có ICU thì `ORDER BY name` lệch 86.6% vị trí so với hiện tại → phải quay lại sắp xếp trong JS (phương án lai, cache 135KB danh sách khoá) | resolved | Chủ sở hữu chạy `SELECT 'Áo' < 'Ăn' COLLATE "vi-VN-x-icu"` và báo kết quả `t` (2026-09-08) — collation có sẵn, đi phương án SQL thuần. Phương án lai bị loại, ghi lại ở ADR-02 |
| A-02 | `sortBy=quantityOnHand` hiếm được dùng, nên giữ đường chậm riêng cho nó là chấp nhận được | high | no | Nếu thực tế dùng nhiều, phần lớn request vẫn đi đường chậm và khoản tiết kiệm bốc hơi | resolved | Chủ sở hữu chốt 2026-09-08: giữ đường chậm riêng, không bỏ tính năng |
| A-03 | `search` hiện là so khớp chuỗi con (`String.includes`) trên chuỗi ghép `name + categoryName + (code + name + variantLabel của MỌI biến thể)`, đã lowercase. Bản SQL tương đương là `EXISTS` + `ILIKE '%term%'` trên `items.code / items.name / items.variant_label` cộng `products.name` và tên nhóm | high | no | Kết quả tìm kiếm lệch so với hiện tại ở các trường hợp biên (dấu cách, ký tự đặc biệt) | resolved | **Đúng về kết quả, sai một chi tiết đắt.** Bản SQL dùng `bool_or` + `LIKE` trên cột đã `lower()`, phủ đúng `products.name`, tên nhóm, `items.code/name/variant_label`. Nhưng vế **term** ban đầu không được `toLowerCase()` → tìm bất kỳ chuỗi có chữ hoa nào trả 0 kết quả. E2E `pos-catalog-pagination` bắt được; unit test không, vì fixture `'giay'` vốn lowercase. Đã sửa và đổi fixture thành `'  Đầm Dạ  '` để bắt cả `trim` lẫn `toLowerCase` |
| A-04 | `items.variant_label` không có index trigram (chỉ `name`, `code`, `brand` có — xem `\d items`), nên tìm theo variant label sẽ quét tuần tự | high | no | Đường tìm kiếm chậm hơn dự kiến; cần thêm một index trigram nữa | resolved | **Đúng, và đo được.** 20 848/21 024 item có `variant_label`. `EXPLAIN ANALYZE` trên bản restore prod: tìm `'đen'` **41.8 ms**, `'aba'` 35.9 ms, `'xanh'` 35.1 ms — so với **10 ms** cho trang không lọc, và luôn là `Seq Scan on items` 21 024 dòng. Index trigram sẵn có trên `items.name/code` **không dùng được** ở đây vì vị từ bọc trong `lower()` và nằm trong `bool_or` của một `GROUP BY` — index chỉ lọc được trước khi gộp, mà `bool_or` cố ý không lọc trước để biến thể không khớp vẫn tính vào MIN/MAX. Không sửa trong feature này: không AC nào phủ hiệu năng tìm kiếm. Xem mục "Việc kéo theo" |
| A-05 | Bỏ cache `pos-catalog:cards` thì gỡ luôn được điểm invalidate ở `item-crud.service.ts:116` mà không ai khác phụ thuộc | high | no | Còn chỗ khác đọc cache đó → lỗi runtime | resolved | **Đúng, và còn hơn thế.** `rtk proxy grep` không lọc trên `apps/api/src`, `apps/api/test`, `packages`: ngoài `item-crud.service.ts` (6 điểm gọi) không còn ai đọc cache đó. `PosCatalogProductService.invalidateCatalogCache` có **0 caller** — đã là code chết từ trước feature này. Sau khi gỡ: `KEYS '*pos-catalog*'` trên Redis local trả 0, `item-crud` spec 22/22 xanh |
| A-06 | `imageUrl` luôn `null` (placeholder theo `PosProductCardDto`), không cần đưa vào truy vấn | high | no | Không có — đã đọc DTO | resolved | Xác nhận 2026-09-08: `pos-catalog-product.service.ts:213` gán cứng `imageUrl: null`, DTO ghi rõ "always null until image storage is implemented" |
| A-07 | Giảm corpus lọc khách từ 50 → 20 không làm thu ngân phải gõ tìm nhiều hơn đáng kể | medium | no | Ô tìm khách gọi API nhiều hơn, cảm giác chậm khi gõ | resolved | Chủ sở hữu chốt 2026-09-08: chọn 20 thay vì 10 chính vì đánh đổi này |
| A-08 | Các đường ghi cần invalidate cache `users/me`: sửa user, gán/bỏ role, gán/bỏ chi nhánh, sửa profile nhân sự. TTL 15 phút đỡ cho đường nào bỏ sót | medium | no | Người dùng thấy quyền/chi nhánh cũ tối đa 15 phút sau khi admin đổi | resolved | Chủ sở hữu chốt 2026-09-08: cache + invalidate khi ghi, TTL 15 phút làm lưới an toàn |
| A-09 | 641ms của `/admin/users/me` chủ yếu là thời gian **chờ** event loop bị chặn, không phải thời gian làm việc — nên cache sẽ cải thiện ít hơn con số log gợi ý | high | no | Đặt sai kỳ vọng cho success signal của endpoint này; phần còn lại phải do feature xử lý `bcryptjs` giải quyết | resolved | **Chưa kiểm chứng được, và đó chính là kết luận.** Không có quyền đo trên dev server, nên không xác nhận được 641 ms là thời gian chờ hay thời gian làm. Điều đo được: handler `getMe` chạy ~5 truy vấn có index và giờ đọc từ cache. Hệ quả phải nói rõ — **success signal `p99 /admin/users/me < 100 ms` của feature này không thể tuyên bố là đạt** chỉ bằng cache; muốn biết thì chạy PromQL trên `erp_http_request_duration_seconds` sau khi triển khai, và phần còn lại thuộc feature xử lý `bcryptjs` (đo được chặn 67/73 ms mỗi lần gọi) và 89 lần restart tiến trình |
| A-10 | `includeInactive` của `PaginationQueryDto` hiện bị `buildOrgCards` bỏ qua (hardcode `is_active = true`). Bản SQL mới giữ nguyên hành vi đó, không sửa | high | no | Thay đổi hành vi ngoài phạm vi yêu cầu | resolved | Xác nhận 2026-09-08: `pos-catalog-product.service.ts:253` lọc cứng `i.isActive = true`; giữ nguyên |
| A-11 | Index tên có `COLLATE "vi-VN-x-icu"` sẽ được planner dùng cho `ORDER BY … COLLATE`, đưa truy vấn 1 từ 14.4 ms về 8.8 ms | medium | no | Tạo 2 index chết trên hai bảng nóng: chi phí ghi thuần, không lợi đọc | resolved | **Sai.** Đo lại lúc làm T-01-01 (bỏ từng index, 12 lượt/lần): bỏ index tên không đổi gì (7.3 → 6.0 / 6.2 ms), bỏ `IDX_items_org_product_pos` mất 1.9 ms. `EXPLAIN` cho `Seq Scan on products`. Migration còn 1 index; đính chính ghi trong `03-logical-design.md` § Migration |

## Cách gỡ A-01

Chạy trên Postgres của dev server và prod:

```sql
SELECT 'Áo' < 'Ăn' COLLATE "vi-VN-x-icu" AS icu_available;
```

Trả `t`/`f` là có ICU. Báo `ERROR: collation "vi-VN-x-icu" for encoding "UTF8" does not exist`
là không có — khi đó chuyển sang phương án lai đã đo (8.1 ms, cache 135 KB chỉ chứa
`id/kind/name`, sắp xếp bằng `Intl.Collator` trong JS).

## Việc kéo theo (không thuộc feature này)

**Tìm kiếm catalog quét tuần tự.** 35–42 ms so với 10 ms của trang không lọc — vẫn dưới
ngân sách 40 ms của AC-04 nhưng sát trần, và `'đen'` đã vượt. Nguyên nhân cấu trúc: `bool_or`
trong `GROUP BY` không cho index lọc trước khi gộp. Hướng có thể đi: tách một CTE lọc
`items` bằng trigram (`i.name ILIKE`, không bọc `lower()`) để thu hẹp tập card **trước**,
rồi mới gộp MIN/MAX trên toàn bộ biến thể của các card sống sót. Cần đo trước khi làm —
đây là giả thuyết, không phải kết luận.
