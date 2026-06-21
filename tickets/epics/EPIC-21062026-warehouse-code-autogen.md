# EPIC-21062026 Warehouse Code Auto-Generation + Branch Showroom Flow

## Goal

Mã kho (`storages.code`) hiện là field **người dùng tự nhập, bắt buộc** trong form CRUD generic — nhưng không có bộ sinh mã, nên dữ liệu mã kho không nhất quán và dễ trùng. Đồng thời, showroom storage do luồng tạo chi nhánh tự sinh ra **không có mã** và **không được đánh dấu `isDefaultReceiving`** (migration `AddStorageDefaultReceiving` chỉ backfill các main storage *cũ*), nên chi nhánh mới không có kho nhập hàng mặc định.

Mục tiêu:
1. Mã kho **chỉ hiển thị, không cho sửa** trên form; khi tạo storage thì **tự sinh** theo `DocumentNumberingService` (prefix `WH`, 6 chữ số, liên tục — `WH000001`).
2. Luồng tạo chi nhánh tạo showroom storage với **mã WH tự sinh** + **`isDefaultReceiving = true`**.
3. Backfill mã `WH` cho mọi storage cũ đang `code = NULL` (không còn ô trống).

## Scope

- **Entities:** `StorageEntity` (`storages`) — không thêm cột; chỉ thay đổi cách set `code` + `isDefaultReceiving`. Scope `ORGANIZATION + BRANCH`.
- **Enum/shared:** thêm `DocumentType.WAREHOUSE` vào `@erp/shared-interfaces` + `DEFAULT_DOC_NUMBER_CONFIG` (`{ prefix: 'WH', continuous: true }`). Rule được auto-tạo lần generate đầu tiên (không cần seed riêng).
- **API surface:** không thêm endpoint. Thay đổi nằm trong `InventoryStorageCrudService.beforeCreate` (generic CRUD platform), `InventoryLocationService.createStorage` (endpoint chuyên dụng), và `BranchService.create`.
- **Events:** không phát/tiêu thụ event mới.
- **FE surface:** `backoffice-web` — form "Kho lưu trữ" (generic `CrudRecordDialog`, route `/admin/inventory-storages`). Mã kho thành read-only.
- **Migration:** 1 migration tay — backfill `code` cho storage `NULL` + seed `DocumentNumberRule`/counter `WAREHOUSE` ở high-water mark mỗi org để runtime generate tiếp tục không trùng.

## Success Metrics

- Tạo storage qua form: server tự sinh `code = WHxxxxxx`, FE không cho nhập mã, không gửi `code` trong payload.
- Tạo chi nhánh mới: showroom storage có `code` WH hợp lệ và `isDefaultReceiving = true` (đúng 1 default receiving/branch — không vi phạm partial unique index `UQ_storages_default_receiving_per_branch`).
- Sau migration: **không** còn storage nào `code IS NULL`; mã tiếp theo do runtime sinh ra **không trùng** mã đã backfill.
- Không có storage nào được sinh ra mà thiếu `code` ở bất kỳ creation path nào (CRUD form, endpoint chuyên dụng, branch flow).

## Flows

### A. Tạo Kho lưu trữ qua form (mã tự sinh)

```mermaid
sequenceDiagram
  actor U as User
  participant FE as backoffice-web
  participant API as CrudController (/admin/entities)
  participant SVC as InventoryStorageCrudService
  participant DN as DocumentNumberingService
  participant DB as Postgres
  U->>FE: Mở "Thêm Kho lưu trữ", nhập Tên kho (Mã kho read-only)
  FE->>API: POST /admin/entities/inventory-storages/records {name, description} (X-Branch-Id, X-Idempotency-Key)
  API->>SVC: create(payload, actor)
  SVC->>SVC: beforeCreate — payload.code rỗng
  SVC->>DN: generate(WAREHOUSE, actor.branchId, actor)
  DN->>DB: atomicIncrement counter (rule WH, org-scoped)
  DN-->>SVC: "WH000007"
  SVC->>DB: INSERT storages (code=WH000007, org+branch scoped, tx)
  API-->>FE: 201 {id, code: "WH000007", ...}
```

### B. Tạo chi nhánh → showroom storage có mã + default receiving

```mermaid
sequenceDiagram
  actor U as User
  participant FE as backoffice-web
  participant API as BranchController
  participant BSVC as BranchService
  participant DN as DocumentNumberingService
  participant DB as Postgres
  U->>FE: Tạo chi nhánh mới
  FE->>API: POST /branches {name, ...} (X-Idempotency-Key)
  API->>BSVC: create(dto, actor)
  BSVC->>DN: generate(WAREHOUSE, branchId, actor)
  DN-->>BSVC: "WH000008"
  BSVC->>DB: tx — INSERT branch, storage(code=WH000008, isMainStorage=true, isDefaultReceiving=true), showroom, default location
  API-->>FE: 201 branch
```

## Tickets

- [TKT-WHC-01 DocumentType.WAREHOUSE + numbering config](../tickets/TKT-WHC-01-warehouse-document-type.md)
- [TKT-WHC-02 Auto-gen mã kho + Mã kho display-only (BE)](../tickets/TKT-WHC-02-storage-code-autogen.md)
- [TKT-WHC-03 Branch flow: showroom WH-code + default receiving](../tickets/TKT-WHC-03-branch-showroom-flow.md)
- [TKT-WHC-04 Migration backfill mã kho + seed counter](../tickets/TKT-WHC-04-backfill-migration.md)
- [TKT-WHC-05 openapi:generate + api-client snapshot](../tickets/TKT-WHC-05-openapi-regen.md)
- [TKT-WHC-06 FE: Mã kho read-only trong form Kho lưu trữ](../tickets/TKT-WHC-06-fe-readonly-code.md)

## Dependencies

- Depends on: `document-numbering` module (`DocumentNumberingService.generate`), generic CRUD platform (`InventoryStorageCrudService`), `AddStorageDefaultReceiving` migration (đã có `isDefaultReceiving` + partial unique index).
- Reuses: bộ sinh mã `DocumentNumberingService` (đúng pattern `provider-crud.service.ts` cho NCC), `readOnly` field flag của `CrudEntityConfig`/`CrudRecordDialog` (giống cách xử lý mã NCC của nhà cung cấp), partial unique index `UQ_storages_default_receiving_per_branch`.

### Ticket dependency graph

```mermaid
flowchart LR
  T1["WHC-01 DocumentType.WAREHOUSE"] --> T2["WHC-02 Auto-gen code (BE)"]
  T1 --> T3["WHC-03 Branch showroom flow"]
  T1 --> T4["WHC-04 Backfill migration"]
  T1 --> T5["WHC-05 openapi regen"]
  T2 --> T5
  T2 --> T6["WHC-06 FE read-only code"]
  T5 --> T6
```
