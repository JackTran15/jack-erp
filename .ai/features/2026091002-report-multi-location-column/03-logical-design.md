---
feature: report-multi-location-column
adr_count: 4
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
7. **Sắp xếp** tất định theo `(storageCode, locationCode)` rồi **nối chuỗi**.

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
| Thêm cột "Kho" riêng thay vì gộp mã kho vào ô vị trí | Người dùng đã chọn phương án gộp (A-03) |
| Cắt danh sách sau N cặp kèm "+N" | Đã loại ở A-02; kéo theo phải tách riêng đường xuất Excel để file không bị cắt |

## Domain model

| Entity | Fields | Notes |
| --- | --- | --- |
| `ItemShelf` (mới, nội bộ file) | `storageCode: string \| null`, `storageName: string`, `locationCode: string`, `locationName: string` | Value object, chỉ sống trong `item-warehouse-location.util.ts`; không export |
| `ItemWarehouseLocation` (giữ nguyên tên, đổi ngữ nghĩa) | `code: string \| null`, `name: string \| null` | Nay là chuỗi **đã nối**: `"A1-A101, A2-A201"` / `"Kho A1-Kệ A101, Kho A2-Kệ A201"`. `null` khi không có kệ nào |

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
code = pairs.map(p => p.storageCode ? `${p.storageCode}-${p.locationCode}` : p.locationCode).join(', ')
name = pairs.map(p => `${p.storageName}-${p.locationName}`).join(', ')
```

Nhánh `storageCode` rỗng là nhánh phòng thủ của A-06 — không bao giờ sinh ra `-A101`.

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
| `storages.code` rỗng (A-06, không kỳ vọng xảy ra) | không phải lỗi — bỏ tiền tố | Ô hiện `A101` thay vì `-A101` |
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
**Status:** accepted

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
