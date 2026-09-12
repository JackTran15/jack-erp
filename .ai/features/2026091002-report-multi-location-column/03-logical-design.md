---
feature: report-multi-location-column
adr_count: 5
---

# Logical design — Cột "Vị trí" liệt kê đủ mọi kho–vị trí

## Approach

Toàn bộ lời giải nằm trong **một file**: `apps/api/src/modules/reporting/report-core/item-warehouse-location.util.ts`.
Bốn nơi gọi **không phải sửa dòng nào**, vì kiểu trả về bên ngoài giữ nguyên
`Map<itemId, { code, name }>` — chỉ khác là hai chuỗi đó nay là chuỗi đã nối nhiều cặp
thay vì một cặp (ADR-01).

Bên trong, `resolveWithinStorages` đổi từ "chọn một kệ" sang "gom mọi kệ":

1. Nạp `storages` đang hoạt động của chi nhánh (giữ nguyên), tách kho lưu trữ / showroom
   bằng `isMainStorage` (giữ nguyên).
2. Nạp `locations` đang hoạt động thuộc các kho đó (giữ nguyên), dựng `byLocationId`.
3. **Kệ ưu tiên** — mọi dòng `item_storage_locations` khớp `(itemId, storageId)`; bỏ chốt
   `if (!locationIdByItemId.has(...))`, giữ **tất cả**.
4. **Kệ đang có tồn** — `stock_balances` với `quantity > 0`, `isTracked = true`,
   `loc.isActive = true`, `loc.storageId IN (warehouseIds)`. Trước đây chỉ chạy cho các
   mặt hàng chưa có kệ ưu tiên (`remaining`); nay chạy cho **mọi** mặt hàng của trang.
   Bỏ `ORDER BY sb.quantity DESC` — không còn ý nghĩa khi không phải chọn một cái.
5. **Hợp và khử trùng** hai tập trên theo cặp `(itemId, locationId)`.
6. **Loại cặp "Ngừng theo dõi"** — giữ nguyên truy vấn `isTracked = false` hiện có
   (`:130-146`), nhưng loại **đúng cặp** khỏi tập thay vì xoá cả mặt hàng. Bước (4) đã tự
   lọc `isTracked = true`, nên thực chất bước này chỉ còn dọn các cặp đến từ kệ ưu tiên.
7. **Sắp xếp** tất định theo `(storageCode, locationCode)` rồi **nối chuỗi**: ô mã chỉ gồm
   `locationCode`, khử trùng theo mã; ô tên gồm `TênKho-TênVịTrí`, không khử trùng
   (ADR-05, sửa 2026-09-12).

`showroomFallback` giữ nguyên ngữ nghĩa: chỉ chạy vòng hai trên kho showroom cho những mặt
hàng **không** ra kệ kho lưu trữ nào (A-08). Ba báo cáo doanh thu/lợi nhuận không truyền cờ
này nên không đổi (A-09).

Về độ rộng, chỉ nới cột vị trí: hai cột của Tổng hợp nhập xuất tồn kho ở khai báo backend và registry frontend (T-01-04), và cột vị trí của ba báo cáo doanh thu/lợi nhuận ở bảng dùng chung `REPORT_COLUMN_WIDTHS` cùng registry frontend (T-02-03, bổ sung khi mở lại G1).

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Đẩy việc tính vị trí xuống SQL bằng `string_agg` trong CTE của `stock-period.service.ts` | Engine trả `NULL::text` cho hai cột này ở grain `item` (`:222-224`); vị trí cố ý **không** phải `le.location_id` của chứng từ (lý do ở `item-warehouse-location.util.ts:22-27`). Viết `string_agg` trong CTE là trả lời sai câu hỏi. Chỉ đáng làm nếu cần lọc theo vị trí — đã loại ở A-05 |
| Dùng `LEFT JOIN LATERAL` như `temp-warehouse-report.service.ts:502-544` | Mẫu đó tồn tại để cột **lọc được**; nó vẫn `LIMIT 1`. Chuyển sang lateral mà không cần lọc là gánh chi phí kiến trúc không đổi lấy gì (A-05) |
| Trả `Map<itemId, ItemShelf[]>` và để từng báo cáo tự nối chuỗi | Bốn nơi gọi phải sửa, ba trong số đó chỉ để lặp lại đúng một dòng `.join(', ')`. `profit-by-item.report.ts:222-229` còn phải viết thêm vì nó chỉ lấy `code`. Nhiều diff hơn, cùng kết quả |
| Thêm cột "Kho" riêng | Không được yêu cầu. Sau khi A-03 đảo (2026-09-12), thông tin kho nằm ở cột "Tên vị trí" sẵn có — thêm cột thứ ba là dư |
| Giữ tiền tố mã kho ở ô mã để phân biệt hai kho trùng mã | Akenzy đã xem trên prod và chốt ngược (ADR-05): ô mã phải là mã vị trí. Việc phân biệt kho chuyển sang cột "Tên vị trí" |
| Cắt danh sách sau N cặp kèm "+N" | Đã loại ở A-02; kéo theo phải tách riêng đường xuất Excel để file không bị cắt |

## Domain model

| Entity | Fields | Notes |
| --- | --- | --- |
| `ItemShelf` (mới, nội bộ file) | `storageCode: string \| null`, `storageName: string`, `locationCode: string`, `locationName: string` | Value object, chỉ sống trong `item-warehouse-location.util.ts`; không export |
| `ItemWarehouseLocation` (giữ nguyên tên, đổi ngữ nghĩa) | `code: string \| null`, `name: string \| null` | Nay là chuỗi **đã nối**: `"A101, A201"` / `"Kho A1-Kệ A101, Kho A2-Kệ A201"` (ADR-05). `code` khử trùng theo mã nên có thể ít mục hơn `name`. `null` khi không có kệ nào |

Nguồn dữ liệu không đổi: `storages`, `locations`, `item_storage_locations`, `stock_balances`.

## Contracts

Không có endpoint nào đổi. Hợp đồng duy nhất bị đụng là hợp đồng **nội bộ** của hàm dùng chung:

```ts
// trước và sau — chữ ký giữ nguyên
resolveItemWarehouseLocations(
  repos, itemIds, organizationId, branchId,
  options?: { showroomFallback?: boolean },
): Promise<Map<string, ItemWarehouseLocation>>
```

Payload của bốn báo cáo giữ nguyên tên trường (`positionCode` / `positionName` ở
Tổng hợp nhập xuất tồn kho; `locationCode` / `locationName` ở các báo cáo doanh thu), chỉ
đổi **nội dung chuỗi**. Không cần chạy lại `pnpm openapi:generate` vì không có DTO nào đổi.

Quy tắc nối chuỗi:

```
// sau ADR-05 (2026-09-12) — pairs đã sắp theo (storageCode, locationCode)
code = [...new Set(pairs.map(p => p.locationCode))].join(', ')
name = pairs.map(p => `${p.storageName}-${p.locationName}`).join(', ')
```

Hai ô nay **không** còn đối xứng: ô mã khử trùng theo mã vị trí (A-18), ô tên giữ đủ mọi cặp vì
tên kho làm chúng khác nhau. `Set` giữ thứ tự chèn nên thứ tự tất định của A-07 và AC-06 không
đổi. Nhánh phòng thủ `storageCode` rỗng của A-06 không còn cần ở ô mã.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Tập kệ của mỗi mặt hàng | `resolveWithinStorages`, cục bộ trong một lần gọi | Một request, phạm vi một trang báo cáo |
| Chuỗi đã nối | Hàng của báo cáo (`positionCode` / `positionName`) | Một response |
| Độ rộng cột | Khai báo tĩnh ở `stock-summary.report.ts` và registry frontend | Build-time |

Không có cache, không có trạng thái dùng lại giữa các request. Vị trí được tra lại mỗi lần
tải — nguyên tắc có sẵn, giữ nguyên.

## Error taxonomy

| Condition | Failure subtype | UI |
| --- | --- | --- |
| Mặt hàng không nằm trên kệ kho lưu trữ nào, và không có showroom fallback | không phải lỗi — `{ code: null, name: null }` | Ô trống, y như hiện nay |
| Chế độ xem chuỗi (`viewMode === 'chain'`) | không phải lỗi — hai cột bị loại khỏi danh mục | Cột không xuất hiện |
| Chọn nhiều cửa hàng, không có chi nhánh duy nhất | không phải lỗi — trả `Map` rỗng, không truy vấn | Ô trống |
| `storages.code` rỗng (A-06, không kỳ vọng xảy ra) | không còn liên quan tới ô mã: từ ADR-05 ô mã không có tiền tố kho; ô tên dùng `storageName` (không nullable) | Không ảnh hưởng |
| Hai kệ khác kho trùng mã vị trí | không phải lỗi — ô mã gộp còn một mục (A-18) | Ô mã `999`, ô tên `Kho A1-999, Kho A2-999` |
| Một cặp `(mặt hàng, vị trí)` bị Ngừng theo dõi | không phải lỗi — loại đúng cặp | Cặp đó biến mất, các cặp khác giữ nguyên |
| Truy vấn `stock_balances` lỗi | lỗi hạ tầng, ném lên như hiện nay | Báo cáo trả 500 — hành vi không đổi |

Feature này **không thêm** nhánh lỗi mới. Mọi tình huống "không có dữ liệu" đều là ô trống,
đúng như hợp đồng hiện tại.

## Cache & offline

Không áp dụng. Báo cáo chạy trực tiếp trên cơ sở dữ liệu, không có tầng cache nào giữa
`resolveItemWarehouseLocations` và Postgres, và cả hai frontend đều không hỗ trợ offline.

## Observability

Không thêm log hay metric mới. Số truy vấn mỗi lần tra vị trí giữ nguyên bốn
(`storages`, `locations`, `item_storage_locations`, `stock_balances`) cộng một truy vấn
`isTracked = false` như hiện nay — điều đáng theo dõi duy nhất là số dòng trả về của truy vấn
`stock_balances`, nay không còn giới hạn ở tập `remaining`. T-01-01 chốt điều này bằng test
đếm số lần gọi repository.

## ADRs

### ADR-01 — Nối chuỗi ngay trong hàm dùng chung, không trả danh sách cho từng báo cáo
**Context:** Bốn báo cáo đều chỉ đọc `loc.code` và `loc.name` để đổ thẳng vào ô bảng. Không
nơi nào cần từng cặp riêng lẻ.
**Decision:** `resolveItemWarehouseLocations` giữ nguyên chữ ký và kiểu trả về; chuỗi được
nối bên trong. `ItemShelf` là chi tiết nội bộ, không export.
**Consequences:** Diff gọn — một file thay vì năm; bốn nơi gọi không sửa gì. Đổi lại, hàm này
mang thêm trách nhiệm định dạng hiển thị, và báo cáo nào sau này cần từng cặp riêng sẽ phải
export thêm một hàm. Chấp nhận: hôm nay không có nhu cầu đó.
**Status:** accepted

### ADR-02 — "Ở vị trí nào" là hợp của kệ ưu tiên và kệ còn tồn, không phải thứ tự ưu tiên
**Context:** Hàm hiện tại coi kệ ưu tiên và kệ còn tồn là hai nguồn **thay thế nhau**: có
cái đầu thì không xét cái sau. Yêu cầu QA coi chúng là hai mảnh của cùng một sự thật.
**Decision:** Lấy hợp của hai tập, khử trùng theo `(itemId, locationId)`.
**Consequences:** Một mặt hàng có kệ ưu tiên trống (tồn 0) và tồn thật ở kệ khác nay hiện cả
hai — đúng ý QA, nhưng ô dài hơn trước. Truy vấn `stock_balances` chạy cho mọi mặt hàng của
trang thay vì chỉ phần còn thiếu.
**Status:** accepted

### ADR-03 — Mã kho là tiền tố trong chính ô vị trí, không phải cột riêng
**Context:** Một chi nhánh có nhiều kho lưu trữ, và mã vị trí chỉ duy nhất trong phạm vi một
kho (`@Unique(['storageId','code'])`, `location.entity.ts:8`). Không có tiền tố kho thì
`A101, A101` là chuỗi hợp lệ nhưng vô nghĩa.
**Decision:** Ô "Mã vị trí" chứa `MãKho-MãVịTrí`; ô "Tên vị trí" chứa `TênKho-TênVịTrí`.
**Consequences:** Mọi hàng đều đổi hiển thị, kể cả hàng chỉ có một kệ (AC-02). Người dùng đã
xác nhận đây là điều họ muốn. Test hiện có ở `stock-summary.report.spec.ts:483-512` đang
kỳ vọng `'A10'` và `'DEFAULT'` trần — phải cập nhật, và đó là cập nhật kỳ vọng chứ không
phải nới lỏng test.
**Status:** superseded bởi ADR-05 — Akenzy, 12/09/2026

### ADR-04 — Không giới hạn số cặp; nới cột và dựa vào tooltip có sẵn
**Context:** Bảng báo cáo cắt chữ bằng CSS với `maxWidth` cố định và đã gắn `title=` để hover
xem đủ (`ReportPageTableView.tsx:520-528`).
**Decision:** Ghi đủ mọi cặp vào dữ liệu; nới `width` hai cột từ `110` lên `220` ở cả khai
báo backend lẫn registry frontend.
**Consequences:** File Excel luôn đủ dữ liệu (AC-11). Mặt hàng nằm rải trên rất nhiều kệ sẽ
bị cắt trên màn hình và phải hover — chấp nhận, vì đó là trường hợp hiếm và dữ liệu không mất.
**Status:** accepted

**Bổ sung khi mở lại G1 (2026-09-10):** quyết định này nay áp cho cả ba báo cáo doanh thu/lợi
nhuận. Nới `locationCode`, `locationName` (Doanh thu, Chi tiết doanh thu) và `location` (Lợi
nhuận) lên `220` ở bảng dùng chung `REPORT_COLUMN_WIDTHS` và ở registry frontend của "Doanh thu
theo mặt hàng" và "Lợi nhuận theo mặt hàng" (T-02-03, AC-13). Lý do: A-02 và A-04 áp cho cả bốn
báo cáo, còn kế hoạch ban đầu chỉ nới cột của một báo cáo. Hệ quả phụ: xoá luôn độ lệch sẵn có
giữa backend (160) và frontend (110) ở `locationName` và `location`. Phạm vi đã kiểm ở A-16:
không lan sang báo cáo kho tạm hay công nợ.

**Bổ sung 2026-09-12 (ADR-05), đã sửa lại sau khi đo:** mốc đo của AC-12 và AC-13 chuyển sang chuỗi
**tên** (`Kho A1-Kệ A101, Kho A2-Kệ A201`), vì sau ADR-05 ô mã đã ngắn. Bản đầu của phụ lục này viết
"`220` vẫn là con số đúng" — **sai, và phép đo đã bác bỏ**: trên `erp_dev_3008` ở 1440x900, ô tên của
SKU `DD480` chứa `HANG SUA 2026-S01.01, KHO SG-A01.01` đo được `scrollWidth` 271px trong ô 259px
(`max-width: 220px`) ⇒ bị cắt.

Akenzy chọn **nới cột tên lên `320`** (thay vì đổi mốc đo sang ô mã, là phương án Claude đề xuất).
Cụ thể: `locationName` trong `REPORT_COLUMN_WIDTHS` và `positionName` ở khai báo backend của
Tổng hợp nhập xuất tồn kho lên `320`, cùng `tableConfig.width` của hai registry tương ứng.
`location`, `locationCode`, `positionCode` **giữ `220`** — ba cột đó nay chỉ chứa mã vị trí và đo được
219px. Sau khi nới: ô tên 319/319, ô mã 219/219, không ô nào bị cắt (bằng chứng ở T-01-04).

Giới hạn vẫn còn và vẫn theo ADR-04: một mặt hàng nằm trên ba kệ trở lên sẽ lại tràn `320`; khi đó
`title=` là thứ giữ dữ liệu đọc được, đúng như quyết định gốc.

### ADR-05 — Mã kho ra khỏi ô "Mã vị trí"; ô mã khử trùng theo mã vị trí
**Context:** ADR-03 gộp `MãKho-MãVịTrí` vào ô mã để hai kho trùng mã vị trí không đọc thành
`A101, A101`. Ngày 12/09/2026 Akenzy xem báo cáo Doanh thu theo mặt hàng trên prod: mọi hàng đọc
thành "Kho 211DN-999" ở **cả hai** cột, tức tên kho lặp hai lần trên một hàng và ô mã không còn
là mã. Yêu cầu: *"update Mã Vị trí only show code location not show warehouse name"*.
**Decision:** Ô "Mã vị trí" chỉ chứa mã vị trí, khử trùng theo mã, nối `", "`. Ô "Tên vị trí"
giữ `TênKho-TênVịTrí` và là nơi duy nhất còn thông tin kho.
**Consequences:** AC-02 quay về gần hành vi trước feature (ô mã `A101`), còn phần chính của
feature — liệt kê đủ mọi kệ — vẫn giữ. Hai kho trùng mã gộp còn một mục ở ô mã (AC-14), nên ô mã
không phân biệt được kho; người đọc nhìn cột "Tên vị trí". Báo cáo "Lợi nhuận theo mặt hàng" chỉ
có một cột và nó lấy `code`, nên báo cáo đó mất thông tin kho — chấp nhận, vì đó là cột vốn có.
T-01-05 và T-02-04 cập nhật lại chính những kỳ vọng mà T-01-01, T-01-03, T-02-01, T-02-02 vừa
chốt hai ngày trước; đó là cái giá của việc đảo quyết định, và nó nằm trên trail.
**Status:** accepted — Akenzy, 12/09/2026
