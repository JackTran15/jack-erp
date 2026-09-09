---
id: UOW-01
slug: catalog-sql-pagination
title: Lưới hàng hoá POS phân trang trong SQL, bỏ cache catalog
demoable: true
duration: 2d
depends_on: []
requirements: [US-01, US-02]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07]
risk: medium
status: todo
rollback: một commit revert cho code; migration có `down()` xoá 3 index. Không đổi hợp đồng API, không đổi frontend
---

# UOW-01 — Lưới hàng hoá POS phân trang trong SQL

Đây là "Option B" mà [[2026090804-pos-catalog-list-stock-aggregate]] ADR-03 đã hoãn lại
thành một feature riêng.

## Demo script

1. Trỏ API vào `erp_dev_3008`, đăng nhập POS chi nhánh `71230276…` (org `e60e5f49…`).
2. **Trước khi đổi**, lưu lại trang 1 làm mốc:
   `curl '…/catalog/products?page=1&pageSize=20' > /tmp/before.json`
3. Chạy migration, khởi động lại API, gọi lại đúng URL đó → `diff` với `/tmp/before.json`
   **rỗng**: cùng thứ tự, cùng `quantityOnHand`, cùng `total`.
4. `redis-cli KEYS 'cache:pos-catalog:*'` → **không còn khoá nào**, kể cả sau khi mở lại
   màn bán hàng.
5. Lọc theo nhóm hàng cha có nhóm con → vẫn ra hàng của nhóm con (AC-05).
   Đổi `direction=SHOWROOM` rồi `WAREHOUSE` → `quantityOnHand` khớp mốc (AC-06).
   `sortBy=quantityOnHand&sortOrder=desc` → khớp mốc (AC-07).
6. Log `LoggingInterceptor`: `GET …/catalog/products` xuống dải vài chục ms, và
   **không còn** request nào lâu lâu vọt lên ~150 ms do dựng lại cache.
7. `node scripts/bench-catalog-page.js` (T-01-06) in ra trước/sau cho AC-04.

## In scope

- 3 index mới qua migration TypeORM, có `COLLATE "vi-VN-x-icu"` (ADR-02).
- Ba truy vấn mới trên `PosCatalogProductService`: khoá card có phân trang, đếm tổng,
  chi tiết trang.
- `loadListStockTotals` nhận thêm tham số `itemIds` tuỳ chọn.
- `listProducts` đảo trình tự: lọc → sắp → cắt → nạp chi tiết → nạp tồn.
- Đường chậm giữ nguyên cho `sortBy=quantityOnHand` (ADR-03).
- Gỡ khoá cache `pos-catalog:cards`, `buildOrgCards`, và điểm invalidate ở
  `item-crud.service.ts`.

## Not in scope

- `loadBranchStock` và đường detail — ADR-01 của feature trước vẫn có hiệu lực.
- Phương án lai (cache 135 KB danh sách khoá) — ADR-01 của feature này đã loại.
- `includeInactive` — A-10 giữ nguyên hành vi bỏ qua hiện tại.
- `bcryptjs`, restart tiến trình, cluster mode, DEBUG log.

## Risks

| Risk | Mitigation |
|---|---|
| Thứ tự sắp xếp lệch so với hôm nay | AC-02 so hai mảng đầy đủ 2 539 phần tử, không lấy mẫu. ADR-02 đã đo lệch 0/2539 |
| Postgres không dùng index vì thiếu `COLLATE` trong định nghĩa index | T-01-01 có test `EXPLAIN` khẳng định index được dùng |
| Đường nhanh và đường chậm trôi xa nhau | AC-03 bắt cả hai cho cùng `quantityOnHand` trên cùng dữ liệu |
| Gỡ cache làm hỏng caller khác | A-05; T-01-05 grep toàn repo trước khi xoá |

## Definition of done

- [x] Mọi AC từ AC-01 đến AC-07 có test phủ (`06-traceability.md` sinh lại sạch)
- [x] Đối chiếu toàn tập trên `erp_dev_3008`: 2539 card, **0 lệch** ở tập card, thứ tự, và
      cả 10 trường hiển thị — mạnh hơn `diff` một trang mà Demo script mô tả, nhưng
      **không thay thế** bước 3 của Demo script (cần API chạy thật, xem "Còn lại" bên dưới)
- [x] Không còn khoá cache catalog: `KEYS '*pos-catalog*'` trên Redis local trả **0**, và
      không còn đường code nào ghi khoá đó
- [x] `pnpm --filter @erp/api test` — 4262 pass. 2 fail còn lại là `AuthService › token TTL`,
      có sẵn trên branch trước feature này (xác nhận bằng `git stash`)
- [x] `pnpm test:e2e -- pos-catalog-pagination` — 13/13
- [x] `node scripts/bench-catalog-page.js` — 16.2 ms, ngân sách 40 ms
- [x] Không tiếng Việt trong source backend. Một ngoại lệ có chủ ý: chú thích ở
      `pos-catalog-product.service.ts` trích chuỗi `"Đầm"` làm ví dụ — đó là **dữ liệu** gây
      ra lỗi lowercase, không phải chú thích viết bằng tiếng Việt

## Còn lại (cần người chạy tay)

Bước 2–3 và 6 của Demo script: bật API trỏ vào `erp_dev_3008`, chụp `/tmp/before.json`
trên commit cũ, chạy migration, chụp lại và `diff`. Tôi đã đối chiếu ở tầng SQL cho cả
2539 card nhưng chưa chạy vòng HTTP đầu-cuối trên bản restore prod.
