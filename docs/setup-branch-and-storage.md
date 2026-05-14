# Hướng dẫn setup Chi nhánh & Kho

Tài liệu mô tả thứ tự gọi API để khởi tạo hạ tầng kho cho một tổ chức: **Chi nhánh → Kho chính → Kho phụ → Vị trí**.

> Mọi endpoint yêu cầu `Authorization: Bearer <access-token>`. Các endpoint thuộc nhóm Kho/Vị trí còn yêu cầu thêm header `X-Branch-Id: <branchId>` (`BranchScopeGuard`).

---

## 1. Mô hình phân cấp

```
Organization
  └── Branch (chi nhánh)                     ← /branches
        ├── Storage "Kho chính"              ← /inventory/storages  (isMainStorage = true)
        │     └── Location (vị trí cụ thể)   ← /inventory/locations
        └── Storage "Kho phụ"                ← /inventory/storages  (isMainStorage = false)
              └── Location (vị trí cụ thể)   ← /inventory/locations
```

| Cấp | Bảng | Đơn vị tracking tồn kho? |
|-----|------|--------------------------|
| Branch | `branches` | ❌ Chỉ là cấu trúc tổ chức |
| Storage | `storages` | ❌ Chỉ là tầng nhóm |
| **Location** | `locations` | ✅ **Tồn kho `stock_balances` unique theo `(itemId, locationId)`** |

> **Quan trọng**: mọi phiếu nhập/xuất/chuyển kho đều thao tác trên `locationId`, không phải `storageId`.

---

## 2. Bước 1 — Tạo Chi nhánh

### Endpoint
```
POST /branches
```

### Body (`CreateBranchDto`)
| Trường | Kiểu | Bắt buộc | Ràng buộc |
|--------|------|----------|-----------|
| `name` | string | ✅ | 2–200 ký tự |
| `address` | string | ❌ | tối đa 500 ký tự |
| `phone` | string | ❌ | tối đa 30 ký tự |
| `email` | string | ❌ | định dạng email |
| `parentBranchId` | UUID | ❌ | dùng khi tạo branch con |

### Ví dụ
```bash
curl -X POST http://localhost:4000/branches \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Chi nhánh Hà Nội",
    "address": "12 Nguyễn Trãi, Quận Thanh Xuân",
    "phone": "0901234567",
    "email": "hn@company.vn"
  }'
```

### Response
```json
{
  "id": "b-uuid-...",
  "name": "Chi nhánh Hà Nội",
  "isMainBranch": false,
  "...": "..."
}
```

> Branch đầu tiên của tổ chức thường được tạo qua seed (`pnpm seed:inventory`) hoặc registration flow và sẽ có `isMainBranch = true`. Các branch tạo sau qua API này mặc định là branch con.

### Gán quyền truy cập branch cho user
Nếu user khác chưa có quyền thao tác trên branch vừa tạo:

```bash
POST /branches/:id/assign-user/:userId
```
Sau khi assign, user mới có thể gọi các API cần header `X-Branch-Id` trỏ tới branch đó.

---

## 3. Bước 2 — Tạo Kho chính

### Endpoint
```
POST /inventory/storages
```

### Yêu cầu
- Permission: `inventory.write`
- Header: `X-Branch-Id: <branchId>` (decorator `@RequireBranchScope`)

### Body (`CreateStorageDto`)
| Trường | Kiểu | Bắt buộc | Ràng buộc |
|--------|------|----------|-----------|
| `name` | string | ✅ | 1–200 ký tự, unique trong `(branchId, name)` |
| `branchId` | UUID | ✅ | Phải khớp `X-Branch-Id` |
| `isMainStorage` | boolean | ❌ | Mặc định `false` |

### Ràng buộc nghiệp vụ với `isMainStorage = true`
1. Chỉ tạo được dưới branch có `isMainBranch = true`. Sai → `400 "Main storage can only be created under the main branch"`.
2. Mỗi branch tối đa **1** kho chính. Trùng → `409 "A main storage already exists for this branch"`.
3. Tên trùng trong cùng branch → `409`.

### Ví dụ
```bash
curl -X POST http://localhost:4000/inventory/storages \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Branch-Id: b-uuid-..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kho chính",
    "branchId": "b-uuid-...",
    "isMainStorage": true
  }'
```

### Response
```json
{
  "id": "s-main-uuid-...",
  "name": "Kho chính",
  "branchId": "b-uuid-...",
  "isMainStorage": true,
  "...": "..."
}
```

---

## 4. Bước 3 — Tạo Kho phụ

Kho phụ là `Storage` với `isMainStorage = false`. Một branch có thể có nhiều kho phụ (kho trưng bày, kho dự trữ, kho hàng lỗi, …) — gọi cùng endpoint, đổi `name` và set `isMainStorage = false`.

### Endpoint
```
POST /inventory/storages
```

### Ví dụ — tạo kho trưng bày
```bash
curl -X POST http://localhost:4000/inventory/storages \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Branch-Id: b-uuid-..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kho trưng bày",
    "branchId": "b-uuid-...",
    "isMainStorage": false
  }'
```

### Ví dụ — tạo kho dự trữ
```bash
curl -X POST http://localhost:4000/inventory/storages \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Branch-Id: b-uuid-..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kho dự trữ",
    "branchId": "b-uuid-...",
    "isMainStorage": false
  }'
```

### Tuỳ chọn — gắn nhãn Showroom cho kho phụ
Nếu kho phụ phục vụ trưng bày và muốn hiển thị dưới dạng "showroom" trong UI:

```bash
POST /inventory/showrooms
```

Body (`CreateShowroomDto`):
```json
{
  "name": "Showroom tầng 1",
  "branchId": "b-uuid-...",
  "storageId": "s-secondary-uuid-...",
  "isMainShowroom": false
}
```

Ràng buộc:
- `storage.branchId` phải khớp `dto.branchId`.
- `isMainShowroom = true` chỉ áp dụng dưới main branch và mỗi branch tối đa 1.

> **Lưu ý**: `Showroom` hiện chỉ là **nhãn UX**, không phải đơn vị tracking tồn kho. Hàng vẫn được tính theo `locationId` thuộc storage backing.

---

## 5. Bước 4 — Tạo Vị trí (Location) trong kho

Mỗi kho cần ít nhất một `Location` thì mới có thể nhập/xuất/chuyển hàng.

### Endpoint
```
POST /inventory/locations
```

### Yêu cầu
- Permission: `inventory.write`
- Header: `X-Branch-Id: <branchId>` (decorator `@RequireBranchScope`)

### Body (`CreateLocationDto`)
| Trường | Kiểu | Bắt buộc | Ràng buộc |
|--------|------|----------|-----------|
| `code` | string | ❌ | 1–50 ký tự, unique trong `(storageId, code)` |
| `name` | string | ✅ | 1–200 ký tự |
| `storageId` | UUID | ✅ | Kho cha |
| `branchId` | UUID | ✅ | Phải khớp `storage.branchId` và `X-Branch-Id` |
| `type` | enum | ❌ | `SHELF` \| `RACK` \| `BIN` \| `ZONE` |

### Ràng buộc nghiệp vụ
- `storage.branchId !== dto.branchId` → `400 "Location must belong to the same branch as its parent storage"`.
- Trùng `code` trong cùng storage → `409`.
- Mặc định `isActive = true`. Khi `isActive = false`, location không thể nhận hàng mới.

### Ví dụ
```bash
# Location trong kho chính
curl -X POST http://localhost:4000/inventory/locations \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Branch-Id: b-uuid-..." \
  -H "Content-Type: application/json" \
  -d '{
    "code": "A-01-01",
    "name": "Kệ A - Tầng 1 - Ô 1",
    "storageId": "s-main-uuid-...",
    "branchId": "b-uuid-...",
    "type": "SHELF"
  }'

# Location trong kho phụ (kho trưng bày)
curl -X POST http://localhost:4000/inventory/locations \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Branch-Id: b-uuid-..." \
  -H "Content-Type: application/json" \
  -d '{
    "code": "SR-01",
    "name": "Bục trưng bày số 1",
    "storageId": "s-secondary-uuid-...",
    "branchId": "b-uuid-...",
    "type": "ZONE"
  }'
```

---

## 6. (Tuỳ chọn) Gán Thủ kho

Phân công user làm thủ kho cho một storage cụ thể trong branch.

```
POST   /inventory/branches/:branchId/storage-managers/assign
POST   /inventory/branches/:branchId/storage-managers/unassign
GET    /inventory/branches/:branchId/storage-managers
```

Body (`AssignStorageManagerDto`):
```json
{
  "userId": "u-uuid-...",
  "storageId": "s-main-uuid-..."
}
```

Ràng buộc: `storage.branchId === :branchId`. Mỗi cặp `(userId, storageId)` chỉ tồn tại một bản ghi.

---

## 7. Sequence diagram tổng thể

```
USER                       API
 │                          │
 │  POST /branches          │
 │ ───────────────────────▶ │ → branchId
 │                          │
 │  POST /branches/:id/assign-user/:userId   (tuỳ chọn)
 │ ───────────────────────▶ │
 │                          │
 │  POST /inventory/storages   (kho chính, isMainStorage=true)
 │  X-Branch-Id: branchId   │
 │ ───────────────────────▶ │ → storageMainId
 │                          │
 │  POST /inventory/storages   (kho phụ, isMainStorage=false)
 │  X-Branch-Id: branchId   │
 │ ───────────────────────▶ │ → storageSecondaryId
 │                          │
 │  POST /inventory/showrooms   (tuỳ chọn — gắn nhãn UI)
 │ ───────────────────────▶ │
 │                          │
 │  POST /inventory/locations  × N   (cho từng storage)
 │  X-Branch-Id: branchId   │
 │ ───────────────────────▶ │ → locationId[]
 │                          │
 │  POST /inventory/branches/:id/storage-managers/assign   (tuỳ chọn)
 │ ───────────────────────▶ │
 │                          │
 │     ✅ Sẵn sàng cho:
 │       - POST /inventory/purchase-orders          (nhập kho từ NCC)
 │       - POST /inventory/stock/transfers          (chuyển kho)
 │       - POST /inventory/goods-issues             (xuất kho phi-bán)
 │       - POST /pos/sales/checkout                 (bán hàng)
```

---

## 8. Bảng lỗi thường gặp

| HTTP | Nguyên nhân | Khắc phục |
|------|-------------|-----------|
| `400 Main storage can only be created under the main branch` | Cố tạo `isMainStorage=true` ở branch không phải main | Tạo dưới main branch, hoặc set `isMainStorage=false` |
| `409 A main storage already exists for this branch` | Branch đã có kho chính | Dùng `PATCH /inventory/storages/:id` để cập nhật, hoặc tạo kho phụ |
| `409 Storage "X" already exists in this branch` | Trùng tên trong cùng branch | Đổi tên |
| `400 Location must belong to the same branch as its parent storage` | `branchId` trong body Location ≠ `storage.branchId` | Truyền đúng `branchId` của storage cha |
| `409 Location with code "..." already exists in this storage` | Trùng `code` trong cùng storage | Đổi `code` |
| `403 Forbidden` | Thiếu `X-Branch-Id` hoặc user chưa được gán vào branch | Set header + assign user vào branch |
| `401 Unauthorized` | Token hết hạn / sai | Refresh token |

---

## 9. Tham chiếu code

| Thành phần | Đường dẫn |
|------------|-----------|
| `BranchController` | `apps/api/src/modules/branch/branch.controller.ts` |
| `BranchService` | `apps/api/src/modules/branch/branch.service.ts` |
| `BranchEntity` | `apps/api/src/modules/branch/branch.entity.ts` |
| `InventoryLocationController` | `apps/api/src/modules/inventory/location/inventory-location.controller.ts` |
| `InventoryLocationService` | `apps/api/src/modules/inventory/location/inventory-location.service.ts` |
| `StorageEntity` | `apps/api/src/modules/inventory/location/storage.entity.ts` |
| `LocationEntity` | `apps/api/src/modules/inventory/location/location.entity.ts` |
| `ShowroomEntity` | `apps/api/src/modules/inventory/location/showroom.entity.ts` |
| DTO Storage | `apps/api/src/modules/inventory/location/dto/create-storage.dto.ts` |
| DTO Location | `apps/api/src/modules/inventory/location/dto/create-location.dto.ts` |
| DTO Showroom | `apps/api/src/modules/inventory/location/dto/create-showroom.dto.ts` |
| DTO Branch | `apps/api/src/modules/branch/dto/create-branch.dto.ts` |
