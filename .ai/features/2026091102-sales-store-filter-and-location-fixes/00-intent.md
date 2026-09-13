---
feature: sales-store-filter-and-location-fixes
slug: 2026091102-sales-store-filter-and-location-fixes
owner: Akenzy
created: 2026-09-11
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Báo cáo Bán hàng theo chi nhánh header, xếp lại kệ đã ngừng theo dõi

Nguồn: QA các mục **8, 9, 10**, ngày 2026-09-11. Ảnh mục 8 chụp trên staging
(`jack-erp-backoffice.ducanhzed.com`), ảnh mục 9–10 chụp trên prod (`erp.giaymt.com.vn`).

> **8. Báo cáo > Bán hàng:** *"Bỏ Filter theo Cửa hàng, ở MT46 Đà Nẵng, thì lấy data của Đà Nẵng
> thôi. Chỉ ở Chuỗi cửa hàng mới có filter theo Cửa hàng. Select Chọn cửa hàng không scroll được."*
> Ảnh còn khoanh đỏ cột **"Tên vị trí"** trống trên mọi dòng của "Doanh thu theo mặt hàng".
>
> **9. Chuyển kho tạm:** *"Hiện thị sai vị trí của mã hàng, Đang hiển thị A01.01 ?"*
>
> **10. Xếp vị trí hàng hoá:** *"Đã Ngưng theo dõi Chi tiết vị trí rồi, sắp xếp lại không được."* —
> CANIN905 ở KHO BMT: mọi dòng G11.05 và H70.03 đều "Ngừng theo dõi", xếp sang G11.05 vẫn báo
> "Hàng hoá đã ở vị trí H70.03. Mỗi hàng hoá chỉ được ở 1 vị trí — hãy ngừng theo dõi vị trí cũ
> trước khi xếp sang vị trí mới."

> **Sửa đổi 11/09/2026 — tách mục 9 ra plan riêng.** A-05 (id kệ của dòng Kho tạm trên prod còn đúng
> hay không) chỉ trả lời được bằng SQL trên prod, mà máy lập plan không truy cập được. Akenzy chọn tách P3
> sang `2026091103-temp-warehouse-line-shelf` để mục 8 và 10 đi tiếp. Vấn đề, assumption, tiêu chí, thiết
> kế và ticket của P3 nằm ở plan đó.

Mục 8 và 10 độc lập, không chung file nào; mỗi vấn đề một Unit of Work.

## Problem

### P1 — Báo cáo Bán hàng không ghim dữ liệu về chi nhánh header (mục 8)

**Dòng "Cửa hàng" hiện ở cả hai chế độ.** Cả 4 báo cáo nhóm Bán hàng khai báo
`REPORT_FILTERS_LINE.STORE` trong mảng `single_` lẫn `chain_`
(thư mục `apps/backoffice-web/src/constants/reports/report-registry/`):

| Report key | File | `single_` | `chain_` |
| --- | --- | --- | --- |
| `daily_sales_summary` | `report-daily-sale-summary.registry.ts` | `:405-406` | `:412-413` |
| `invoice_and_order_list` | `report-invoice-and-order-list.registry.ts` | `:263-264` | `:274-275` |
| `revenue_detail_by_invoice_and_product` | `report-revenue-detail-by-invoice-and-product.registry.ts` | `:210-211` | `:222-223` |
| `revenue_by_product` | `report-revenue-by-product.registry.ts` | `:145-146` | `:157-158` |

**Payload không mang chi nhánh header.** `invoiceDataFetcher`
(`apps/backoffice-web/src/pages/chain-store/reports/_api/report-data-source.ts:56-65`) và nhánh invoice
của `buildExportBody` (`report-export.api.ts:112-116`; In dùng chung body này) gọi
`buildSearchFilters(args.filters)`, bỏ qua `branch`/`activeBranchId` dù cả hai đều nhận được.
`buildSearchFilters` (`invoice-report.api.ts:150-152`) chỉ gửi `store` khi radio đã có giá trị.

**BE mở rộng phạm vi khi không có `store`.** `resolveReportBranchIds`
(`apps/api/src/modules/reporting/report-core/report-query.util.ts:97-99`, `:124`): `store` vắng hoặc
`scope: 'all'` ⇒ `null` (không có điều kiện chi nhánh = cả tổ chức) với người có
`reporting.invoice.consolidated.read`, còn lại là mọi `actor.branchIds`. Chi nhánh header
(`actor.branchId`) không được dùng. Cả 4 báo cáo gọi cùng hàm này. ⇒ Ở MT46 Đà Nẵng, người có quyền
tổng hợp hoặc được gán nhiều chi nhánh đang thấy doanh thu của chi nhánh khác.

**BE không tự sửa được.** "Chuỗi cửa hàng" chỉ là cờ `isChain` phía FE
(`apps/backoffice-web/src/store/common/branch/branch.store.ts:9-28`); ở chuỗi, `X-Branch-Id` vẫn trỏ chi
nhánh cũ. Cùng lý do báo cáo kho đã phải ghim ở FE (`inventory-report-v2.api.ts:19-22`).

**Cột "Tên vị trí" trống là cùng một gốc.** `resolveLocationBranchId`
(`apps/api/src/modules/reporting/invoice-report/reports/revenue-by-item.report.ts:99-107`) chỉ tra vị trí
khi phạm vi đúng **một** chi nhánh; có `filters.store` mà phạm vi là `null` ⇒ trống mọi dòng. Ghim về một
chi nhánh thì cột có giá trị. Snapshot `erp_dev_3008` (30/08): MT46 có "Kho MT46", 814 kệ đang hoạt động.

**Mẫu đã có.** Báo cáo kho làm đúng việc này: bỏ `STORE` khỏi mảng `single_` và ghim
`store = { scope: "group", storeIds: [activeBranchId] }` cho các báo cáo trong
`SINGLE_MODE_HEADER_STORE_REPORTS` (`inventory-report-v2.api.ts:26-33`, `:105-113`), có test trong
`apps/backoffice-web/src/store/page-stores/report/report.store.test.ts`.

### P2 — "Chọn cửa hàng" không cuộn được bằng chuột (mục 8)

`MultiSelectChips` (`packages/ui/src/components/multi-select-chips.tsx:186`) bọc danh sách trong
`<ScrollArea className="max-h-60">`. `ScrollArea` đặt class lên Root (`relative overflow-hidden`) còn
Viewport là `h-full w-full` (`packages/ui/src/components/scroll-area.tsx:9-16`): `max-height` ở cha không
chặn được chiều cao `100%` của Viewport ⇒ Viewport cao bằng nội dung, Root cắt ở 15rem, không còn gì để
cuộn. Mẫu chạy đúng: `packages/ui/src/components/single-select.tsx:54` (`max-h-60 overflow-y-auto`).

Hai nơi dùng: `StoreScopeField.tsx:45` (báo cáo) và `StoreScopePromotionSection.tsx:45` (form Chương trình
khuyến mãi — cùng lỗi).

### P3 — Kho tạm hiện kệ của phiên (mục 9) — đã tách plan

Chuyển sang `2026091103-temp-warehouse-line-shelf` ngày 11/09/2026 (xem ghi chú sửa đổi ở trên).

### P4 — Xếp vị trí bị chặn dù kệ cũ đã "Ngừng theo dõi" (mục 10)

**Chặn ở FE, và đọc sai cờ.** Toast đến từ bước kiểm tra trước khi lưu
(`apps/backoffice-web/src/pages/item-location-details/ArrangeLocationDialog.tsx:438-450`) →
`resolveAssignedStorageLocation` (`apps/backoffice-web/src/api/stock-balances.ts:190-199`) →
`GET /products/storage-location` (`apps/api/src/modules/inventory/product/product.controller.ts:40-51`) →
`ItemStorageLocationService.resolveAssignedLocation`
(`apps/api/src/modules/inventory/product/item-storage-location.service.ts:291-305`). Hàm đọc liên kết duy
nhất `item_storage_locations(item, storage)` và lọc `locations.isActive = true` — cờ bật/tắt **của kệ** —
chứ không đọc `stock_balances.is_tracked`. Chú thích `:300` lẫn hai khái niệm; spec
`item-storage-location.service.spec.ts:348` tên là "ngừng theo dõi" nhưng chỉ assert `isActive`.

**Đây là một chỗ đọc bị sót của quyết định đã chốt.** "Ngừng theo dõi" chỉ đặt
`stock_balances.is_tracked = false` (`apps/api/src/modules/inventory/ledger/stock-ledger.service.ts:724-731`),
không đụng liên kết — đúng A-05 của `2026090301-inventory-qa-defects` (Akenzy chốt 03/09/2026: không xoá
liên kết, chặn ở mọi chỗ đọc). Quy tắc chặn đã có sẵn ở `InventoryLocationStockService.isBalanceTracked`
(`apps/api/src/modules/inventory/location/inventory-location-stock.service.ts:1115-1125`, private): không có
dòng tồn, hoặc dòng tồn đang theo dõi.

**Backend xếp vị trí đã đúng.** `arrange` bật lại dòng tồn đã ngừng ở kệ đích (`:216-221`) rồi dời liên
kết (`:225-232`). Chỉ có bước kiểm tra FE chặn.

**Quy mô (snapshot 30/08).** MT có 1.243 liên kết trỏ vào cặp (mặt hàng, kệ) đã ngừng theo dõi; My Company
có 110. Mỗi liên kết là một mặt hàng không xếp sang kệ khác trong cùng kho được.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Quản lý chi nhánh / kế toán xem Báo cáo > Bán hàng ở MT46 Đà Nẵng | Có dòng "Cửa hàng"; để "Tất cả" thì thấy doanh thu chi nhánh khác; cột Tên vị trí trống | Không có dòng "Cửa hàng"; chỉ số liệu MT46; Tên vị trí có giá trị |
| Người xem ở Chuỗi cửa hàng | Danh sách "Chọn cửa hàng" dài không cuộn được bằng chuột | Cuộn và chọn được mọi cửa hàng |
| Nhân viên kho xếp vị trí | Đã ngừng theo dõi kệ cũ mà vẫn bị chặn | Xếp được; kệ mới "Đang theo dõi", kệ cũ giữ "Ngừng theo dõi" |

## Success signal

1. Header "Chi nhánh MT46 Đà Nẵng": 4 báo cáo Bán hàng không có dòng "Cửa hàng"; tổng "Doanh thu theo mặt
   hàng" bằng đúng tổng khi ở Chuỗi cửa hàng chọn "Theo nhóm cửa hàng" = [MT46]; Xuất khẩu và In ra cùng
   tập dòng; cột Tên vị trí có giá trị cho mặt hàng có kệ ở Kho MT46.
2. Ở Chuỗi cửa hàng, lăn chuột trong "Chọn cửa hàng" tới được cửa hàng cuối danh sách.
3. KHO BMT: CANIN905-D-38 có kệ H70.03 đã ngừng theo dõi, xếp sang G11.05 lưu thành công; "Chi tiết vị
   trí hàng hóa" hiện G11.05 "Đang theo dõi", H70.03 vẫn "Ngừng theo dõi".

## Out of scope

- **Mục 9 (Kho tạm).** Tách sang `2026091103-temp-warehouse-line-shelf`.
- **Báo cáo lợi nhuận, công nợ.** Dùng `STORE_IN_CHAIN_OPTIONAL`, chỉ hiện ở chuỗi — không có lỗi này.
- **Lệch quyền giữa FE và BE.** FE mở Chuỗi cửa hàng theo `reporting.dashboard.consolidated.read`
  (`apps/backoffice-web/src/lib/permissions.ts:33-35`), BE mở phạm vi toàn tổ chức theo
  `reporting.invoice.consolidated.read`. Ghi nhận, không sửa.
- **Checkbox "Thống kê theo chi nhánh" thật ra gửi `statisticByBrand`** (`StatisticByBranchCheckbox.tsx:15`).
  Ghi nhận, không sửa.
- **Danh sách "Chọn cửa hàng" liệt kê cả chi nhánh người dùng không được gán**
  (`get-report-filter-options.handler.ts:130-147`).
- **Mặt hàng chỉ nằm ở showroom** vẫn trống Tên vị trí trên báo cáo doanh thu — quy tắc của
  `resolveItemWarehouseLocations`, thuộc `2026091002-report-multi-location-column` (A-12).
- **`multi-select.tsx:79` và `SearchListingInput.tsx:190`** — cùng mẫu `ScrollArea max-h-*` nhưng chưa có
  báo lỗi.
- **Xoá liên kết `item_storage_locations` khi ngừng theo dõi** — A-05 của `2026090301-inventory-qa-defects`
  đã chốt không làm.

## Constraints

| Kind | Detail |
| --- | --- |
| Phạm vi dữ liệu | Chuỗi cửa hàng chỉ là chế độ FE ⇒ ghim chi nhánh phải nằm ở payload FE. Đây không phải ranh giới bảo mật: người có quyền tổng hợp vẫn được xem toàn tổ chức ở Chuỗi cửa hàng |
| Làm song song | `2026091002-report-multi-location-column` T-02-03 (in_progress) sửa `report-revenue-by-product.registry.ts`; Akenzy chốt không chờ (A-11) |
| DI | `ProductModule` chưa đăng ký `StockBalanceEntity` (`apps/api/src/modules/inventory/product/product.module.ts:21-30`) |
| Kiểm thử FE | `apps/backoffice-web` ghi `"test": "echo test"` và không cài vitest; chạy được bằng `rtk proxy npx --yes vitest run <file>` trong thư mục app (vitest 5.0.0, A-13). Mốc: `report.store.test.ts` 12/12 |
| Kiểm thử API | `item-storage-location.service.spec.ts` 23/23 |
| `@erp/ui` | Dùng thẳng từ source (`packages/ui/package.json` có `main: ./src/index.ts`) — không cần build |
| Schema | Không migration |
| Dữ liệu local | API chạy `erp_dev_3008`. My Company: chi nhánh Hồ Chí Minh (88 hóa đơn, "Kho lưu trữ HCM") cho P1; ABA2777-D-38 (Long Xuyên, liên kết A01.02 đã ngừng theo dõi, còn 6 kệ khác) và ABA2799-D-38 (kệ A01.03 đang theo dõi) cho P4 |
| Ngôn ngữ | Chuỗi hiển thị tiếng Việt |

## Existing surface touched

- **P1:** 4 file registry ở bảng trên; `apps/backoffice-web/src/pages/chain-store/reports/_api/invoice-report.api.ts`,
  `report-data-source.ts`, `report-export.api.ts`; test `apps/backoffice-web/src/store/page-stores/report/report.store.test.ts`.
- **P2:** `packages/ui/src/components/multi-select-chips.tsx`.
- **P4:** `apps/api/src/modules/inventory/product/item-storage-location.service.ts` (+ spec), `product.module.ts`;
  test hồi quy `apps/api/src/modules/inventory/location/inventory-location-stock.service.spec.ts`.
- **Mẫu noi theo:** `inventory-report-v2.api.ts:26-33, 105-113` (P1); `single-select.tsx:54` (P2);
  `isBalanceTracked` ở `inventory-location-stock.service.ts:1115-1125` (P4).
