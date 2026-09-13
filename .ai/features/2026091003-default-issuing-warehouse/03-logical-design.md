---
feature: default-issuing-warehouse
adr_count: 5
---

# Logical design — Kho xuất hàng mặc định và dropdown POS Kho tạm

## Approach

Hai lát cắt tách bạch, nối với nhau bằng đúng một cột dữ liệu.

**Lát 1 — cờ `is_default_issuing`.** Nhân bản nguyên khuôn `isDefaultReceiving` đang chạy
trong repo, không phát minh gì mới:

| Thành phần | Bản có sẵn để nhân bản | Bản mới |
| --- | --- | --- |
| Migration | `1784500000000-AddStorageDefaultReceiving.ts` | `<epoch>-AddStorageDefaultIssuing.ts` — thêm cột, backfill, partial unique index `UQ_storages_default_issuing_per_branch` |
| Entity | `storage.entity.ts:21-22` | `isDefaultIssuing` (`is_default_issuing`, default false) |
| Command | `commands/set-default-receiving-warehouse.{command,handler}.ts` | `set-default-issuing-warehouse.{command,handler}.ts` — xoá-rồi-đặt trong một transaction |
| Controller | `controllers/storage-default-receiving.controller.ts` | `controllers/storage-default-issuing.controller.ts` — `POST /v2/inventory/storages/:id/set-default-issuing` |
| Chốt PATCH | `storage-crud.service.ts:154-156` | thêm `delete payload.isDefaultIssuing` |
| Chốt ngừng hoạt động | `storage-crud.service.ts:170-176` | thêm nhánh cho kho xuất mặc định |
| CRUD config | `storage-crud.service.ts:22-52` | thêm field `isDefaultIssuing` (readOnly) + filter Có/Không |
| Checkbox | `CrudRecordDialog.tsx:212 / :233 / :293-302 / :548-566` | cặp state/hydrate/POST/label song song, và `cannotDeactivate` cộng thêm điều kiện mới |

**Lát 2 — POS Kho tạm.** Hai thay đổi nhỏ, mỗi cái giải đúng một nửa yêu cầu:

1. *Thứ tự.* `InventoryStorageOption` được nới thêm `isDefaultIssuing`; danh sách kho được
   sắp ngay sau bước lọc `isMainStorage` đã có (`use-fast-stock-transfer-data.ts:143-146`).
   Sắp ở client, **không** đổi `ORDER BY` của endpoint (ADR-02).
2. *Showroom ngừng hoạt động.* `listShowrooms` nhận thêm tham số tuỳ chọn `activeOnly`,
   join sang `storages.is_active` của kho backing; POS gửi `activeOnly=true`.

Phía kho lưu trữ **không cần làm gì**: POS đã gửi `activeOnly=true` và backend đã tôn trọng
(A-12).

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Sắp "mặc định lên đầu" bằng `ORDER BY` mặc định của `GET /inventory/storages` | 18+ màn backoffice gọi chung endpoint này (`GoodsReceiptFormDialog`, `StockTransferPage`, `StockTakesPage`, `TransferOrdersPage`, …). Đổi thứ tự mặc định là đổi thứ tự dropdown của tất cả, vượt xa phạm vi đã chốt |
| POS gửi `sortBy=isDefaultIssuing&sortOrder=desc` | `listStorages` đưa thẳng `query.sortBy` vào `order: { [sortBy]: ... }` (`:590-598`), nên chỉ sắp được **một** khoá — mất thứ tự phụ theo tên, và biến tên cột thành tham số do client quyết định |
| Thêm enum `purpose` (kho xuất / kho nhập / kho trung chuyển) cho `storages` | Yêu cầu chỉ cần một cờ mặc định. Enum là đổi mô hình dữ liệu, kéo theo migration dữ liệu và mọi màn chọn kho |
| Thêm cột `is_active` cho `showrooms` | Trạng thái hoạt động của showroom đã có nguồn duy nhất là kho backing (`showroom.entity.ts:14`). Thêm cột thứ hai là tạo hai nguồn sự thật phải đồng bộ tay |
| Cho `isDefaultIssuing` đi qua PATCH chung như một boolean bình thường | PATCH không có transaction xoá-rồi-đặt, nên hai request song song sẽ vi phạm partial unique index và trả 500 thay vì lỗi nghiệp vụ |
| Rút dropdown POS xuống còn kho xuất + kho nhập mặc định | Đã loại ở A-01; chặn hẳn nghiệp vụ chuyển tới kho lưu trữ thứ ba |

## Domain model

| Entity | Fields | Notes |
| --- | --- | --- |
| `StorageEntity` | `+ isDefaultIssuing: boolean` (`is_default_issuing`, default false) | Bất biến: tối đa một dòng `true` cho mỗi `branch_id`, cưỡng chế bằng partial unique index |
| `InventoryStorageOption` (pos-web) | `+ isDefaultIssuing: boolean` | Chỉ nới kiểu TypeScript — payload đã có sẵn trường này vì `findAndCount` trả nguyên thực thể (A-07) |

`isDefaultIssuing` và `isDefaultReceiving` độc lập hoàn toàn: hai cột, hai index, không có
ràng buộc chéo (A-02).

## Contracts

### POST /v2/inventory/storages/:id/set-default-issuing

Quyền: `inventory.write`, guards `PermissionGuard, BranchScopeGuard`, `@RequireBranchScope()`.

Request: không có body. Kho được xác định bằng `:id`, chi nhánh bằng `X-Branch-Id`.

Response 200: `{ "storageId": "<uuid>" }`

Failure modes:
- `400` — request không có chi nhánh đang hoạt động (`actor.branchId` rỗng)
- `404` — kho không tồn tại trong chi nhánh đang hoạt động
- `403` — thiếu quyền `inventory.write`, hoặc chi nhánh ngoài phạm vi token

### GET /inventory/showrooms — thêm tham số

`?activeOnly=true` (tuỳ chọn, **mặc định tắt**). Khi bật, chỉ trả showroom có kho backing
đang `is_active = true`. Ép kiểu `'true' | true | '1'` giống hệt cách controller đang làm cho
`listStorages` (`inventory-location.controller.ts:370-374`).

Mọi nơi gọi hiện tại không truyền tham số này nên hành vi giữ nguyên (AC-11).

### PATCH admin/entities/inventory-storages/records/:id

Không đổi hợp đồng. `isDefaultIssuing` bị **loại khỏi payload** trong `beforeUpdate` —
request thành công, cờ không đổi (AC-04).

Cả hai thay đổi đều chạm bề mặt OpenAPI, nên phải chạy lại `pnpm openapi:generate` và commit
`openapi.snapshot.json` cùng `packages/api-client/src/generated/schema.ts`.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| `is_default_issuing` | Cột trong `storages`; chỉ đổi qua `SetDefaultIssuingWarehouseCommand` | Bền vững |
| Checkbox trong dialog kho | `useState` cục bộ của `CrudRecordDialog` | Vòng đời dialog |
| Danh sách kho ở POS | TanStack Query, key `["inventory-storages", branchId]`, `staleTime: 30_000` | Phiên POS |
| Kho đang chọn ở màn Kho tạm | Store của màn Kho tạm, seed bởi `use-fast-stock-transfer-mount.ts:60-113` | Vòng đời màn hình |

## Error taxonomy

| Condition | Failure subtype | UI |
| --- | --- | --- |
| Đặt cờ khi request không có chi nhánh | `BadRequestException` | Toast lỗi |
| Đặt cờ cho kho thuộc chi nhánh khác | `NotFoundException` | Toast lỗi |
| Ngừng hoạt động kho đang là kho xuất mặc định | `BadRequestException`, thông báo tiếng Việt yêu cầu đặt kho khác trước | Toast lỗi; checkbox "Ngừng hoạt động" bị ẩn sẵn qua `cannotDeactivate` nên đây là chốt tầng hai |
| PATCH mang `isDefaultIssuing` | không phải lỗi — trường bị bỏ im lặng | Request 200, cờ không đổi |
| Chi nhánh chưa có kho xuất mặc định (không có kho lưu trữ thật đang hoạt động nào lúc migration chạy) | không phải lỗi | POS giữ thứ tự cũ; dropdown vẫn đủ kho |
| Kho xuất mặc định bị ngừng hoạt động qua đường khác | không phải lỗi — POS lọc `activeOnly` nên nó biến mất | Dropdown quay về thứ tự theo tên |

## Cache & offline

Không có offline. Điểm cần lưu ý duy nhất là `staleTime: 30_000` của
`useBranchStorages` (`use-query-inventory.ts:12-21`): sau khi quản lý đổi kho xuất mặc định,
POS có thể mất tới 30 giây mới thấy thứ tự mới, hoặc tới khi tải lại màn hình. Chấp nhận —
đây là dữ liệu danh mục, không phải dữ liệu giao dịch.

## Observability

Không thêm log hay metric mới. Việc đổi kho xuất mặc định đã tự để lại dấu vết qua
`updated_at` của hai dòng `storages` liên quan.

## ADRs

### ADR-01 — Cờ riêng cho chiều xuất, không tái dùng `is_main_storage`
**Context:** Trước khi có `is_default_receiving`, `is_main_storage` bị dùng kiêm vai trò
"kho mặc định" — chú thích của migration `1784500000000` nói rõ điều đó.
**Decision:** Chiều xuất có cột riêng `is_default_issuing`, không kiêm nhiệm cột nào.
**Consequences:** Thêm một cột và một index. Đổi lại, "kho backing showroom" và "kho xuất
mặc định" là hai khái niệm tách bạch — đúng bản chất, vì POS Kho tạm cố tình loại bỏ kho
backing showroom khỏi danh sách chọn.
**Status:** accepted

### ADR-02 — Sắp "mặc định lên đầu" ở client POS, không ở server
**Context:** `GET /inventory/storages` là endpoint dùng chung của POS và 18+ màn backoffice.
**Decision:** POS tự sắp sau khi nhận danh sách; endpoint giữ nguyên `ORDER BY` mặc định.
**Consequences:** Phạm vi ảnh hưởng gói gọn trong màn Kho tạm — `useBranchStorages` chỉ có
một nơi gọi. Đổi lại, màn backoffice nào sau này muốn cùng thứ tự phải tự sắp; mẫu để chép
đã có sẵn ở `StockTransferPage.tsx:937-948`.
**Status:** accepted

### ADR-03 — `activeOnly` của showroom là tham số tuỳ chọn, mặc định tắt
**Context:** `listShowrooms` hiện không lọc gì và có nhiều nơi gọi.
**Decision:** Thêm `activeOnly` tuỳ chọn, mặc định tắt, join `storages.is_active`. Chỉ POS
truyền `true`.
**Consequences:** Không nơi gọi cũ nào đổi hành vi (AC-11). Đổi lại, mặc định của endpoint
vẫn là "trả cả showroom đã ngừng" — ai gọi mới phải nhớ truyền tham số.
**Status:** accepted

### ADR-04 — Backfill chọn kho lưu trữ thật, không chọn kho backing showroom
**Context:** Migration kho **nhập** mặc định backfill bằng `WHERE is_main_storage = true`,
vì lịch sử `is_main_storage` từng kiêm vai trò kho nhập mặc định. Người dùng đã chốt
"backfill giống hệt kho nhập mặc định" (A-03).
**Decision:** Giữ nguyên **kỹ thuật** (`DISTINCT ON (branch_id) … ORDER BY branch_id,
created_at ASC, id ASC`, kèm `branch_id IS NOT NULL`) nhưng **đảo điều kiện** thành
`is_main_storage = false`.
**Consequences:** Chép y hệt sẽ hỏng: POS Kho tạm lọc bỏ mọi `isMainStorage`
(`use-fast-stock-transfer-data.ts:143-146`), nên cờ gán cho kho backing showroom là cờ POS
không bao giờ nhìn thấy — cả feature thành no-op mà không có lỗi nào để lần. Hệ quả thứ hai:
chi nhánh nào không có kho lưu trữ thật sẽ **không** được backfill, và đó là kết quả đúng —
không có kho nào để xuất thì không có kho xuất mặc định.
**Status:** accepted

**Bổ sung khi mở lại G1 (2026-09-10):** backfill lọc thêm `is_active = true`. Không có điều kiện này, kho lưu trữ cũ nhất đã ngừng hoạt động vẫn được gán cờ — tạo đúng trạng thái mà chốt ngừng hoạt động (T-01-03, AC-05) cấm, và POS lọc bỏ nên chi nhánh coi như chưa có kho mặc định. Điều kiện đầy đủ: `is_main_storage = false AND is_active = true AND branch_id IS NOT NULL`. Diễn tập chỉ-đọc trên `erp_dev_3008` không thấy chi nhánh nào bị ảnh hưởng (0/23); dữ liệu production chưa kiểm được.

### ADR-05 — Không thêm logic tự chọn kho; dựa vào danh sách đã sắp
**Context:** `pickDefaultStorageId` (`fast-stock-transfer-warehouse-defaults.ts:20-24`) ưu
tiên `isMainStorage`, nhưng nhánh đó không bao giờ chạy trong đường POS vì danh sách đã bị
lọc sạch từ trước; thực tế nó luôn trả `storages[0]`.
**Decision:** Không sửa `pickDefaultStorageId`. Sắp danh sách là đủ để `storages[0]` trở
thành kho xuất mặc định.
**Consequences:** Diff nhỏ nhất, không đụng hàm đang được màn khác dùng. Đổi lại, tính đúng
đắn phụ thuộc vào một nhánh chết không kích hoạt — nên ticket bắt buộc kèm unit test ghim
`pickDefaultStorageId` trả về kho xuất mặc định. File đó hiện **chưa có test nào**.
**Status:** accepted

**Bổ sung khi mở lại G2 (2026-09-10):** bỏ unit test ghim `pickDefaultStorageId`. pos-web không có
trình chạy test nào — 22 file `*.test.ts` import `vitest` nhưng vitest chưa từng được cài (không có
trong `apps/pos-web/package.json`, không có trong pnpm store, script `test` là `echo test`). akenzy
chốt "Bỏ test đơn vị cho phần POS": AC-07, AC-08, AC-09 chỉ được nghiệm thu bằng demo trên POS thật.
**Hệ quả:** lựa chọn mặc định vẫn đúng nhờ nhánh `isMainStorage` không bao giờ chạy, và **không còn gì
tự động bắt** nếu bước lọc ở `use-fast-stock-transfer-data.ts:143-146` bị bỏ về sau. T-02-02 bị huỷ;
AC-08 chuyển sang T-02-01.
