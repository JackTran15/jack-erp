---
feature: report-multi-location-column
slug: 2026091002-report-multi-location-column
owner: Akenzy
created: 2026-09-10
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Cột "Vị trí" phải liệt kê đủ mọi kho–vị trí của mặt hàng, không chỉ cái đầu tiên

Nguồn: QA mục **3. Báo cáo > Tổng hợp nhập xuất tồn kho**, ngày 2026-09-10.

> Nguyên văn: *"Hiển thị thiếu vị trí. Nếu ở cả 2 vị trí, hiển thị cách nhau bởi dấu ,
> \*Chi tiết vị trí hàng hoá nhập về kho HANG SUA, nhưng vị trí lấy ở kho lưu trữ KHO SG,
> Phải lấy cả 2 vị trí, support hỗ trợ search vị trí vẫn phải pass. Hiện tại Kho SG có 2 kho
> lưu trữ, VD Sản phẩm A ở Kho A1 vị trí A101, và kho A2 vị trí A201 thì nên hiện thị
> Kho A1-A101, A2-A201. Tổng số lượng đã hoạt động đúng rồi nhưng mà hiện tại chỉ display
> vị trí đầu tiên"*

Đây là feature **sửa lỗi hiển thị**. Người báo đã tự khoanh vùng đúng: phần cộng số lượng
không sai, chỉ cột vị trí sai — và khảo sát mã nguồn xác nhận hai phần đó không dùng chung
đường dữ liệu nào.

## Problem

Cột "Mã vị trí" / "Tên vị trí" của báo cáo **không** do SQL của báo cáo sinh ra. Engine
`StockPeriodService.aggregate()` với `groupBy: 'item'` trả thẳng
`NULL::text AS location_code, NULL::text AS location_name`
(`stock-period.service.ts:222-224`, hằng `NULL_SPATIAL_COLS`). Giá trị thật được gắn vào
**sau khi query xong**, bằng TypeScript, ở `stock-summary.report.ts:239-248` → `:378-379`:

```ts
positionCode: location?.code ?? null,
positionName: location?.name ?? null,
```

`location` lấy từ `resolveItemWarehouseLocations`
(`apps/api/src/modules/reporting/report-core/item-warehouse-location.util.ts:47`), và hàm
này khai báo kiểu trả về là **`Promise<Map<string, ItemWarehouseLocation>>`** với
`ItemWarehouseLocation = { code: string | null; name: string | null }` (`:7-10`) — **một
vị trí cho mỗi mặt hàng, không phải một danh sách**. Bên trong nó giữ đúng một
`Map<itemId, locationId>` (`:110`) và có hai chốt "cái đầu tiên thắng":

- `:115-119` — vòng quét kệ ưu tiên (`item_storage_locations`):
  `if (!locationIdByItemId.has(p.itemId) && ...)` → dòng đầu tiên chiếm chỗ, mọi dòng sau
  bị bỏ. Bảng `item_storage_locations` **không có unique trên `item_id`**
  (`item-storage-location.entity.ts:10`), nên một mặt hàng có nhiều kệ ưu tiên ở nhiều kho
  lưu trữ là hợp lệ — và đó chính là dữ liệu QA đang nhìn.
- `:163-167` — vòng dự phòng theo tồn (`stock_balances`, `ORDER BY sb.quantity DESC`):
  cũng `if (!locationIdByItemId.has(b.itemId))` → chỉ giữ kệ nhiều tồn nhất.
- `:170-174` — ghi ra đúng một `{ code, name }` cho mỗi mặt hàng.

Đó là toàn bộ nguyên nhân của "chỉ display vị trí đầu tiên". Ví dụ QA đưa khớp chính xác:
hàng nhập về **HANG SUA** nhưng ô vị trí hiện kệ ở **KHO SG**, vì HANG SUA và KHO SG là hai
`storages` khác nhau của cùng chi nhánh và dòng `item_storage_locations` của KHO SG được
`find()` trả về trước.

**Vì sao tổng số lượng vẫn đúng.** Ba CTE `opening` / `in_period` / `out_period` đều kết
bằng `GROUP BY le.item_id` (`stock-period.service.ts:866`, `:885`, `:903` — `groupByTail`
rỗng khi `groupBy: 'item'`, `:524`). Số lượng gộp ở tầng sổ kho, hoàn toàn không đi qua
`resolveItemWarehouseLocations`. Hai đường độc lập, nên sửa cột vị trí không đụng vào số.

**Phạm vi thật rộng hơn một báo cáo.** `resolveItemWarehouseLocations` là mã dùng chung của
**bốn** báo cáo, cả bốn đều đang hiển thị một vị trí duy nhất:

| Báo cáo | Gọi tại | Ghi chú |
| --- | --- | --- |
| Tổng hợp nhập xuất tồn kho | `inventory-reports/report/reports/stock-summary.report.ts:282` | báo cáo QA phản ánh; là nơi duy nhất truyền `showroomFallback: true` (`:287`) |
| Chi tiết doanh thu theo mặt hàng | `reporting/invoice-report/reports/invoice-item-revenue-detail.report.ts:532` | gọi một lần cho mỗi chi nhánh, khoá `${branchId}:${itemId}` |
| Doanh thu theo mặt hàng | `reporting/invoice-report/reports/revenue-by-item.report.ts:288` | dùng cả `locationCode` lẫn `locationName` |
| Lợi nhuận theo mặt hàng | `reporting/profit-report/reports/profit-by-item.report.ts:222-229` | `.map(([itemId, loc]) => [itemId, loc.code])` — vứt hẳn `name` |

Ngày 2026-09-10 người dùng chốt sửa **cả bốn**, để cùng một cột "Vị trí" không hiển thị hai
kiểu khác nhau tuỳ báo cáo.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Nhân viên kho tra báo cáo tồn | Thấy một vị trí, đi tới kệ đó, không có hàng vì hàng nằm ở kho lưu trữ khác | Thấy đủ `A1-A101, A2-A201` và biết hàng nằm rải ở hai kho |
| Support xử lý khiếu nại tồn | Phải mở thêm màn "Chi tiết vị trí hàng hoá" để biết hàng thật sự ở đâu | Đọc thẳng trên báo cáo |
| Kế toán đối chiếu doanh thu/lợi nhuận theo mặt hàng | Cột vị trí ở 3 báo cáo doanh thu/lợi nhuận cũng chỉ một vị trí | Cùng một chuỗi vị trí như báo cáo tồn |

## Success signal

Trên chi nhánh tái hiện được lỗi, một SKU đang nằm ở kệ của hai kho lưu trữ khác nhau hiển
thị:

- **Mã vị trí** = `A1-A101, A2-A201`
- **Tên vị trí** = `Kho A1-Kệ A101, Kho A2-Kệ A201`

ở cả bốn báo cáo có cột vị trí; và bộ lọc dropdown **"Kho"** của báo cáo Tổng hợp nhập xuất
tồn kho trả về đúng tập dòng như trước khi sửa.

## Out of scope

- **Thêm ô tìm kiếm / bộ lọc theo vị trí trên báo cáo.** Chốt ngày 2026-09-10: chỉ cần giữ
  dropdown "Kho" hiện có chạy đúng. Hai cột vị trí giữ nguyên `filterKind: 'none'`
  (`stock-summary.report.ts:64-65`), nên không phải đẩy việc tính vị trí xuống SQL.
- ~~**Thêm cột "Kho" riêng.** Người dùng chọn gộp mã kho vào chính ô vị trí.~~
  **Đảo 2026-09-12 (mở lại G1 lần ba).** ADR-06 đã bỏ tên kho khỏi nốt ô "Tên vị trí", nên không
  cột nào của 4 báo cáo còn cho biết hàng nằm ở kho nào — chính hệ quả nêu ra với Akenzy khi chốt
  ADR-06. Akenzy chọn đưa kho trở lại bằng **một cột "Kho" riêng** (tên kho, khử trùng), đúng cách
  ADR-06 đã chỉ ra, chứ không nhét lại vào ô vị trí. Xem US-04 và ADR-07.
- **`stock-quantity-detail.report.ts` và `stock-summary-by-store.report.ts`.** Đã kiểm: hai
  báo cáo này không có cột vị trí nào trong `COLUMNS` (`:44-77` và `:42-63`), không gọi hàm
  dùng chung, nên không có gì để sửa.
- **Cách tính số lượng nhập/xuất/tồn.** Không đụng tới ba CTE ở `stock-period.service.ts`.
- **Sổ kho / vị trí ghi trên chứng từ.** Báo cáo cố tình hiển thị kệ *hiện tại* của mặt
  hàng chứ không phải vị trí ghi trên phiếu — lý do nêu ở `item-warehouse-location.util.ts:22-27`.
  Feature này giữ nguyên nguyên tắc đó, chỉ bỏ giới hạn "một kệ".

## Constraints

| Kind | Detail |
| --- | --- |
| Blast radius | Hàm dùng chung của 4 báo cáo; đổi kiểu trả về là đổi hợp đồng nội bộ của cả 4 |
| Dữ liệu | `storages.code` là **nullable** (`storage.entity.ts:9-10`) — phải quyết định hiển thị gì khi kho chưa có mã |
| Hiệu năng | Bỏ chốt "cái đầu tiên thắng" làm số dòng phải giữ trong bộ nhớ tăng theo số kệ mỗi mặt hàng; vòng dự phòng hiện lọc `sb.quantity > 0` và `sb.isTracked = true` (`:155-158`) |
| Hiển thị | Bảng báo cáo cắt chữ bằng CSS `truncate` với `maxWidth` cố định (`ReportPageTableView.tsx:520`), độ rộng cột vị trí hiện là `110` (`stock-summary.report.ts:64-65`) — chuỗi dài sẽ bị che nếu không nới |
| Nghiệp vụ | Quy tắc "Ngừng theo dõi" (`stock_balances.is_tracked = false`) phải tiếp tục loại đúng cặp (mặt hàng, vị trí), không được loại cả mặt hàng |

## Existing surface touched

- **Hàm dùng chung sẽ đổi:** `apps/api/src/modules/reporting/report-core/item-warehouse-location.util.ts`
  (`ItemWarehouseLocation` `:7-10`, hai chốt `:116` và `:164`, ghi kết quả `:170-174`).
  Hiện **không có** file spec nào cho hàm này.
- **Bốn nơi gọi:** `stock-summary.report.ts:282`, `invoice-item-revenue-detail.report.ts:532`,
  `revenue-by-item.report.ts:288`, `profit-by-item.report.ts:222`.
- **Mẫu có sẵn để noi theo:** `string_agg(DISTINCT b.code, ', ' ORDER BY b.code)` ở
  `search-inventory-items-v2.handler.ts:89-94`; và `.join(', ')` phía JS ở
  `search-product-groups.handler.ts:135`.
- **Test đang chốt hành vi một-vị-trí:** `stock-summary.report.spec.ts:482-541`
  (`describe('reference location')`), fixture `build()` `:60-126`.
- **Frontend:** `report-inventory-in-out-stock-summary.registry.ts:124-139` khai báo hai cột
  (`dataType: "text"`, không có formatter) — chỉ cần chỉnh độ rộng nếu quyết định nới.
- **Entities liên quan:** `storage.entity.ts`, `location.entity.ts`,
  `item-storage-location.entity.ts`, `stock-balance.entity.ts`.
