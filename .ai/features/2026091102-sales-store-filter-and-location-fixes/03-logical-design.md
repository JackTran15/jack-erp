---
feature: sales-store-filter-and-location-fixes
adr_count: 4
---

# Logical design — sales-store-filter-and-location-fixes

## Approach

Ba thay đổi độc lập, không chung file nào, mỗi thay đổi sửa đúng chỗ gốc đã khoanh trong `00-intent.md`.
Phần (3) — Kho tạm — đã tách sang `2026091103-temp-warehouse-line-shelf` ngày 11/09/2026.

### (1) P1 — Ghim chi nhánh header ở payload FE, chép mẫu báo cáo kho

- Bỏ `REPORT_FILTERS_LINE.STORE` khỏi 4 mảng `single_filterRegistry*`; mảng `chain_` giữ nguyên.
- `buildSearchFilters(filters, ctx?)` nhận thêm
  `ctx?: { branch: STORE_TYPE; activeBranchId?: string | null; backendKey: string }` — cùng hình dạng
  `InventorySearchContext`. Khi `ctx.branch === STORE_TYPE.SINGLE`, có `activeBranchId`, và `backendKey`
  thuộc tập `SINGLE_MODE_HEADER_STORE_SALES_REPORTS` (4 backend key của 4 báo cáo Bán hàng) ⇒
  `payload.store = { scope: "group", storeIds: [activeBranchId] }`, đè mọi giá trị đang nằm trong state.
- Hai nơi gọi truyền `ctx`: `invoiceDataFetcher` (`report-data-source.ts:61`) và nhánh invoice của
  `buildExportBody` (`report-export.api.ts:114`, In dùng chung body).
- Backend không đổi: `resolveReportBranchIds` với `scope: 'group'` trả `[X]` cho người có quyền tổng hợp
  và kiểm `permitted` cho người còn lại (`report-query.util.ts:101-110`); `resolveLocationBranchId` nhận
  đúng một chi nhánh nên cột vị trí có giá trị.
- Request cột không đổi: catalog của revenue-by-item giống nhau ở mọi phạm vi
  (`revenue-by-item.report.ts:149-154`).

### (2) P2 — Cuộn bằng phần tử native trong `MultiSelectChips`

`<ScrollArea className="max-h-60">…</ScrollArea>` ⇒ `<div className="max-h-60 overflow-y-auto overscroll-contain">…</div>`
(`multi-select-chips.tsx:186-216`), bỏ import `ScrollArea` (`:4`). `itemRefs` và `scrollIntoView` giữ
nguyên nên phím mũi tên vẫn chạy.

### (4) P4 — Thêm chặn `is_tracked` vào `resolveAssignedLocation`

- `ItemStorageLocationService` inject `Repository<StockBalanceEntity>`; `ProductModule` thêm
  `StockBalanceEntity` vào `TypeOrmModule.forFeature` (`product.module.ts:21-30`).
- Sau khi tìm được kệ đang hoạt động: tra `stock_balances` theo `(organizationId, itemId, locationId)`, chỉ
  chọn `id, isTracked`; có dòng mà `isTracked === false` ⇒ trả `null`. Chưa có dòng ⇒ giữ kệ (A-09).
- Sửa chú thích `:300`; đổi tên và assert của spec `:348`; thêm case "đang theo dõi" và "chưa có dòng tồn".
- Không đổi FE dialog, không đổi `arrange`; chỉ thêm test hồi quy cho nhánh bật lại dòng tồn của `arrange`.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| P1 — BE mặc định `actor.branchId` khi request không có `store` | Chuỗi cửa hàng là chế độ FE, `X-Branch-Id` vẫn trỏ chi nhánh cũ ⇒ Chuỗi cửa hàng bị kẹp về một chi nhánh. BE không phân biệt được hai chế độ — cùng lý do báo cáo kho ghim ở FE |
| P1 — Chỉ ẩn dòng "Cửa hàng", không ghim payload | Payload không có `store` ⇒ BE vẫn trả toàn tổ chức cho người có quyền tổng hợp; lỗi dữ liệu còn nguyên, cột vị trí vẫn trống |
| P1 — Gửi `branchId` thay cho `store.group` | Hai đường cho cùng một việc; báo cáo kho đã chuẩn hoá `store.group`; không lợi thêm gì |
| P1 — Ghim cho mọi báo cáo nguồn invoice, không dùng allowlist | Báo cáo không khai `backendSource` đều rơi về `invoice` (`report-type.constant.ts:482-486`); blast radius không tường minh và lệch mẫu `SINGLE_MODE_HEADER_STORE_REPORTS` |
| P2 — Sửa riêng ở `StoreScopeField` | Gốc lỗi nằm ở `MultiSelectChips`; form khuyến mãi vẫn hỏng |
| P2 — Sửa `ScrollArea` dùng chung (đặt `max-h` lên Viewport) | Đổi hành vi mọi nơi đang dùng `ScrollArea` với chiều cao cố định; không cần thiết |
| P4 — Xoá hoặc dời liên kết khi "Ngừng theo dõi" | Trái A-05 của `2026090301-inventory-qa-defects` (chốt 03/09/2026) |
| P4 — Bỏ kiểm tra (b) trong dialog | Mất ràng buộc "1 hàng hoá 1 vị trí" (#137) khi kệ cũ vẫn đang theo dõi |
| P4 — Gọi `InventoryLocationStockService.isBalanceTracked` | Hàm private; module location đã phụ thuộc `ItemStorageLocationService` (`pslService`, `inventory-location-stock.service.ts:226`) ⇒ vòng phụ thuộc |
| P4 — Dùng `islRepo.manager` để khỏi sửa module | Lách quy ước `@InjectRepository` + `forFeature` của codebase; mock trong spec khó hơn |

## Contracts

### Search / export / print-payload của nhóm báo cáo invoice

Không đổi schema. Ở chế độ một chi nhánh, với 4 báo cáo Bán hàng, FE luôn gửi:

```json
{ "filters": { "store": { "scope": "group", "storeIds": ["<chi nhánh header>"] } } }
```

### GET /products/storage-location?itemId=&storageId=

Response giữ `{ locationId, code }` hoặc `null`. Thêm một trường hợp trả `null`: dòng tồn
(item, kệ liên kết) tồn tại và `is_tracked = false`.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Chế độ Chuỗi / một chi nhánh, chi nhánh header | `branch.store.ts` (Zustand, localStorage) | App |
| Bộ lọc báo cáo | report store, khoá theo category và chế độ chi nhánh | Trang |

## Error taxonomy

| Condition | Where | Behaviour |
| --- | --- | --- |
| Chế độ một chi nhánh nhưng `activeBranchId` rỗng | `buildSearchFilters` | Không ghim, giữ payload như cũ |
| Người không có quyền tổng hợp gửi chi nhánh header không được gán (A-03) | `resolveReportBranchIds` | 403 `Access denied for stores: …` → toast lỗi sẵn có của trang báo cáo |
| Kệ liên kết cũ còn đang theo dõi | `ArrangeLocationDialog` | Toast cũ "Hàng hoá đã ở vị trí …" |
| Lỗi mạng khi gọi `/products/storage-location` | `ArrangeLocationDialog` | `catch` sẵn có → `getUserFacingApiErrorMessage` |

## Observability

Không thêm log hay metric: các thay đổi là sửa đường đọc/hiển thị, không có đường ghi mới.

## ADRs

### ADR-01 — Ghim báo cáo Bán hàng về chi nhánh header ở payload FE, theo allowlist như báo cáo kho
**Context:** BE không phân biệt Chuỗi cửa hàng với một chi nhánh; báo cáo kho đã giải bằng
`SINGLE_MODE_HEADER_STORE_REPORTS`.
**Decision:** Bỏ dòng `STORE` khỏi 4 mảng `single_`; `buildSearchFilters` nhận `ctx` và ghim
`store.group = [activeBranchId]` cho 4 backend key; truyền `ctx` ở data fetcher và export/print.
**Consequences:** Người có quyền tổng hợp muốn xem nhiều chi nhánh phải chuyển sang Chuỗi cửa hàng. Gọi
thẳng API mà không gửi `store` vẫn nhận phạm vi cũ — đây không phải ranh giới bảo mật. Bổ sung 2026-09-11 (review
T-01-02): vì payload luôn mang một chi nhánh, tiêu đề Xuất khẩu/In của ba báo cáo dùng `invoiceFilterSummary` in thừa
"Cửa hàng: 1 cửa hàng được chọn"; T-01-03 bỏ dòng này khi nhóm đúng bằng chi nhánh header, vì khối chi nhánh trên tiêu
đề đã in chi nhánh đó. Akenzy yêu cầu sửa.
**Status:** accepted — Akenzy, 11/09/2026

### ADR-02 — Sửa cuộn trong `MultiSelectChips`, không sửa `ScrollArea`
**Context:** `ScrollArea` chỉ cuộn khi Root có chiều cao cố định; `MultiSelectChips` lại dùng `max-h`.
**Decision:** Thay `ScrollArea` bằng `div` `max-h-60 overflow-y-auto overscroll-contain` trong
`MultiSelectChips`.
**Consequences:** Dropdown này dùng thanh cuộn của trình duyệt thay cho thanh cuộn Radix, giống
`single-select.tsx`; form khuyến mãi được sửa theo.
**Status:** accepted — Akenzy, 11/09/2026

### ADR-03 — POS hiển thị kệ theo `sourceLocationId` qua trường mới `sourceShelf`
**Context:** Akenzy chấp nhận ngày 11/09/2026 cùng lúc chọn tách mục 9 ra plan riêng.
**Decision:** Quyết định sống tiếp ở `2026091103-temp-warehouse-line-shelf` dưới id ADR-01.
**Consequences:** Plan này không còn thiết kế nào cho Kho tạm.
**Status:** moved — `2026091103-temp-warehouse-line-shelf` ADR-01

### ADR-04 — Chặn `is_tracked` trong `resolveAssignedLocation` bằng repository `StockBalanceEntity` của `ProductModule`
**Context:** A-05 của `2026090301-inventory-qa-defects` yêu cầu mọi chỗ đọc liên kết tự chặn; resolver này
bị sót; không gọi được `isBalanceTracked` vì hàm private và sẽ tạo vòng phụ thuộc.
**Decision:** Đăng ký `StockBalanceEntity` trong `ProductModule`, inject vào `ItemStorageLocationService`,
áp quy tắc "không có dòng tồn, hoặc dòng tồn đang theo dõi".
**Consequences:** Quy tắc nằm ở hai nơi (resolver này và `isBalanceTracked`) — chấp nhận, vì gộp lại phải
phá vòng phụ thuộc. Form Nhập kho thôi tự điền kệ đã ngừng theo dõi (A-10).
**Status:** accepted — Akenzy, 11/09/2026
