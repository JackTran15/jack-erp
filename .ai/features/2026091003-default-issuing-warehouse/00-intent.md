---
feature: default-issuing-warehouse
slug: 2026091003-default-issuing-warehouse
owner: Akenzy
created: 2026-09-10
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — "Kho xuất hàng mặc định" và dropdown chọn kho ở POS Kho tạm

Nguồn: QA mục **6. Danh mục > Kho hàng**, ngày 2026-09-10.

> Nguyên văn: *"Thêm một checkbox Kho Xuất hàng mặc định. Update Phía POS, Kho tạm, chỉ nên
> lấy thông tin kho xuất kho nhận, order by lên đầu cho Kho xuất mặc định kèm, Apply cả 2 tab.
> Lưu ý không load data những kho đã ngừng hoạt động"*

Chốt ngày 2026-09-10: dropdown ở POS vẫn liệt kê **đủ** kho lưu trữ đang hoạt động của chi
nhánh, chỉ **đổi thứ tự** để kho xuất mặc định đứng đầu — không rút gọn danh sách xuống còn
hai kho.

## Problem

### P1 — Không có cách khai báo "kho xuất hàng mặc định"

Bảng `storages` đã có **`is_default_receiving`** ("Kho nhập hàng mặc định",
`storage.entity.ts:21-22`) với đủ bộ đồ nghề: migration + partial unique index
(`1784500000000-AddStorageDefaultReceiving.ts:38-40`), command riêng
`SetDefaultReceivingWarehouseCommand` xoá-rồi-đặt trong một transaction
(`set-default-receiving-warehouse.handler.ts:42-55`), endpoint riêng
`POST /v2/inventory/storages/:id/set-default-receiving`
(`storage-default-receiving.controller.ts:28-45`), chốt chặn PATCH chung
(`storage-crud.service.ts:154-156`), chốt chặn ngừng hoạt động
(`storage-crud.service.ts:170-176`) và checkbox riêng trong dialog
(`CrudRecordDialog.tsx:548-566`).

**Không có gì tương ứng cho chiều xuất.** Tìm toàn bộ `apps/`, `packages/`, `tickets/`,
`docs/` không có `isDefaultIssuing` / `is_default_issuing` / "Kho xuất hàng mặc định". Và
`storages` **không có** cột phân loại kho theo mục đích (chỉ có `is_main_storage` để phân
biệt kho backing showroom với kho lưu trữ thật) — nên hôm nay không có cách nào nói "kho này
là kho xuất hàng".

### P2 — POS Kho tạm chọn kho theo thứ tự tuỳ tiện

Màn "Kho tạm" là `FastStockTransferPage` (`/fast-stock-transfer`), hai tab
**"Xuất đi"** (`WAREHOUSE_TO_SHOWROOM`) và **"Trả lại"** (`SHOWROOM_TO_WAREHOUSE`)
(`fast-stock-transfer.constant.ts:3-15`). Hai tab dùng **chung** một danh sách kho, chỉ hoán
vai nguồn/đích (`use-fast-stock-transfer-data.ts:227-241`).

Danh sách đó lấy từ `GET /inventory/storages?branchId=…&page=1&pageSize=100&activeOnly=true`
(`apps/pos-web/src/services/inventory.service.ts:35-43`). POS **không** gửi `sortBy`, nên
backend rơi vào nhánh mặc định `order: { createdAt: 'DESC' }`
(`inventory-location.service.ts:590-598`) — tức **kho tạo sau cùng đứng đầu**. Phía FE,
`pickDefaultStorageId` (`fast-stock-transfer-warehouse-defaults.ts:20-24`) lấy
`isMainStorage` trước, nhưng `use-fast-stock-transfer-data.ts:143-146` đã lọc sạch
`isMainStorage` từ trước, nên nó luôn rơi xuống `storages[0]` — nghĩa là **kho mới tạo gần
nhất được chọn sẵn**. Thu ngân phải sửa lại tay mỗi lần.

### P3 — Showroom đã ngừng hoạt động vẫn được nạp

Yêu cầu "không load data những kho đã ngừng hoạt động" hiện **đúng một nửa**:

- Phía kho lưu trữ: POS đã gửi `activeOnly=true` (`inventory.service.ts:40`) và backend có
  tôn trọng (`inventory-location.service.ts:586-588`). **Không cần làm lại.**
- Phía showroom: `GET /inventory/showrooms` được gọi **không kèm bộ lọc nào**
  (`inventory.service.ts:45-52`), và `listShowrooms` (`inventory-location.service.ts:658-681`)
  chỉ lọc `organizationId` / `branchId` / `storageId` — **không có bất kỳ điều kiện
  active nào**. Nguyên nhân sâu hơn: `ShowroomEntity` (`showroom.entity.ts:9-25`) **không có
  cột `isActive`**; trạng thái hoạt động của một showroom nằm ở kho backing nó
  (`storage_id` → `storages.is_active`). Muốn loại showroom đã ngừng thì phải join sang
  `storages`.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Quản lý chi nhánh (Danh mục > Kho hàng) | Chỉ khai báo được kho nhập mặc định | Tick thêm được "Kho xuất hàng mặc định", một kho duy nhất mỗi chi nhánh |
| Thu ngân POS, màn Kho tạm | Ô "Kho xuất"/"Kho nhập" mở ra là kho tạo gần nhất; phải chọn lại tay | Kho xuất mặc định nằm đầu danh sách và được chọn sẵn, ở cả hai tab |
| Thu ngân POS, sau khi kho bị ngừng hoạt động | Showroom đã ngừng vẫn hiện trong dropdown | Chỉ thấy kho và showroom đang hoạt động |

## Success signal

1. Ở **Danh mục > Kho hàng**, tick "Kho xuất hàng mặc định" trên kho A rồi tick trên kho B
   thì kho A tự bỏ tick — chi nhánh luôn có tối đa một kho xuất mặc định, và một `PATCH`
   thẳng vào `admin/entities/inventory-storages/records/:id` **không** đổi được cờ này.
2. Mở **POS > Kho tạm**, cả tab "Xuất đi" lẫn tab "Trả lại": kho xuất mặc định là mục đầu
   tiên trong dropdown chọn kho và là giá trị được chọn sẵn khi vào màn hình.
3. Ngừng hoạt động một kho lưu trữ và showroom của nó → cả hai biến mất khỏi mọi dropdown
   của màn Kho tạm.

## Out of scope

- **Rút gọn dropdown còn 2 kho (kho xuất mặc định + kho nhập mặc định).** Đã cân nhắc và bỏ
  ngày 2026-09-10: chặn hẳn việc chuyển tới kho lưu trữ thứ ba.
- **Thêm enum phân loại kho (kho xuất / kho nhập / kho trung chuyển).** Yêu cầu chỉ cần một
  cờ mặc định, không cần phân loại; thêm enum là đổi mô hình dữ liệu vượt xa yêu cầu.
- **Đổi logic chuyển kho tạm.** Feature này chỉ đụng danh sách chọn và thứ tự, không đụng
  việc ghi sổ của phiếu chuyển.
- **Thêm `is_active` cho `showrooms`.** Trạng thái hoạt động của showroom đã có nguồn duy
  nhất là kho backing nó; thêm cột thứ hai là tạo ra hai nguồn sự thật.
- **Các màn backoffice khác cũng chọn kho** (`StockTransferPage`, `ChooseWarehouseDialog`,
  `GoodsIssueFormDialog`, …). Yêu cầu chỉ nói POS Kho tạm.

## Constraints

| Kind | Detail |
| --- | --- |
| Bất biến | Một chi nhánh tối đa một kho xuất mặc định — phải cưỡng chế bằng partial unique index, không chỉ bằng mã ứng dụng |
| Bảo mật | Cờ phải bị strip khỏi PATCH chung (`storage-crud.service.ts:150`) như `isDefaultReceiving`, nếu không PATCH sẽ làm vỡ unique index |
| Dữ liệu | `ShowroomEntity` không có `isActive`; phải join sang `storages.is_active` |
| Migration | Quy ước `<epochMillis>-<PascalCase>.ts`, mốc gần nhất là `1789910000000-AddCatalogPaginationIndexes.ts` |
| Hợp đồng POS | `InventoryStorageOption` (`apps/pos-web/src/interfaces/inventory-location.interface.ts:1-6`) hiện chỉ có `id, name, branchId, isMainStorage` — không sắp xếp theo cờ mặc định ở client được nếu không nới kiểu này, hoặc phải sắp ở server |
| Giao diện | Chiều cao dialog kho đang hardcode theo chế độ (`CrudRecordDialog.tsx:428-441`) — thêm một checkbox là phải chỉnh |
| Kiểm thử | `storage-crud.service.spec.ts` hiện chỉ có 2 case về sinh mã kho; `InventoryLocationService.listStorages` và `listShowrooms` **chưa có spec nào** |

## Existing surface touched

- **Mẫu để nhân bản (làm gương cho toàn bộ P1):** `1784500000000-AddStorageDefaultReceiving.ts`,
  `commands/set-default-receiving-warehouse.{command,handler}.ts`,
  `controllers/storage-default-receiving.controller.ts`,
  `storage-crud.service.ts:17-61` (config) và `:149-191` (hooks),
  `CrudRecordDialog.tsx:212-219` / `:233-235` / `:293-302` / `:548-566`.
- **Entity:** `apps/api/src/modules/inventory/location/storage.entity.ts`.
- **Endpoint POS dùng:** `inventory-location.controller.ts:365-377` →
  `inventory-location.service.ts:575-599` (`listStorages`); và
  `inventory-location.controller.ts:410-417` → `:658-681` (`listShowrooms`).
- **POS:** `services/inventory.service.ts:35-52`,
  `hooks/react-query/use-query-inventory.ts:12-32`,
  `hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-data.ts:129-146` và `:227-241`,
  `lib/page-libs/fast-stock-transfer/fast-stock-transfer-warehouse-defaults.ts:20-59`,
  `hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-mount.ts:60-113`,
  `interfaces/inventory-location.interface.ts:1-14`.
  `useBranchStorages` chỉ có đúng một nơi gọi ngoài định nghĩa của nó, nên thay đổi hook này
  không lan sang màn khác.
- **Mẫu "mặc định lên đầu" đã có:** `StockTransferPage.tsx:937-948` (backoffice, sort theo
  `isDefaultReceiving`), `resolve-item-locations.handler.ts:42`, `transfer-order.service.ts:1525`.
- **Mẫu một-mặc-định-mỗi-phạm-vi khác:** `ItemProviderEntity.isPrimary`
  (`item-provider.service.ts:102-128`), `DepositAccountEntity.isDefault`.
