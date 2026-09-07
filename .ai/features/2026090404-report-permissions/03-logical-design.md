---
feature: report-permissions
adr_count: 5
---

# Logical design — Phân quyền báo cáo

## Approach

Một catalogue duy nhất ánh xạ *khóa báo cáo backend → permission key*, đặt ở
`packages/shared-interfaces` để guard backend, dropdown frontend, seed vai trò và
spec hợp đồng cùng đọc một bảng và không thể trôi khỏi nhau. Việc gác thực thi
bằng một guard resolve khóa theo request (`reportType` trong body/query), chạy
song song với `PermissionGuard` chứ không thay thế nó: decorator route vẫn giữ
"quyền mở nhóm", guard mới thu hẹp về đúng một báo cáo.

Phạm vi cửa hàng tách làm **hai trục độc lập**, và đây là điểm cốt lõi của thiết
kế: một trục không diễn đạt được cả hai yêu cầu.

- **Trục tiền** — `resolveReportBranchIds` kẹp về `actor.branchIds`, nới ra toàn
  tổ chức chỉ khi giữ key consolidated của chính domain đó.
- **Trục số lượng** — `resolveOrgWideBranchIds` không đặt điều kiện chi nhánh
  nào; ranh giới duy nhất là `organizationId`. Phần tiền của các báo cáo này bị
  cắt riêng bằng `INVENTORY_VALUE_PERMISSION`.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| `@RequirePermission` liệt kê mọi khóa trên route | Route dùng chung cho mọi báo cáo trong domain; decorator tĩnh không đọc được `reportType` |
| Interceptor đọc response rồi lọc | Đã tốn công truy vấn mới lọc; và không chặn được `countRows` trên đường export |
| Một trục phạm vi duy nhất cho mọi báo cáo | Kẹp hết thì cửa hàng không tra được tồn của nhau; mở hết thì lộ doanh số. Yêu cầu nghiệp vụ vốn có hai chiều ngược nhau |
| Bỏ 4 key thô, thay hẳn bằng per-report | Mọi role mất sạch báo cáo tại thời điểm deploy |
| Suy ra cột tiền bằng tên (`endsWith('Value')`) | Đổi tên cột là thủng gate mà không ai biết; `unitPrice`, `outAvgPrice` cũng không khớp mẫu |
| Lọc cột giá trị ở 11 file report | 11 chỗ để quên; ba handler đã là chốt chặn đủ và biết `actor` |

## Domain model

| Khái niệm | Nội dung | Ghi chú |
| --- | --- | --- |
| `REPORT_PERMISSION_KEYS` | `Record<backendReportKey, permissionKey>` | 22 mục; đoạn cuối lấy nguyên khóa backend để ánh xạ là cơ học |
| `REPORT_DOMAIN_PERMISSIONS` | `{sales,profit,debts}: {floor, consolidated}`, `inventory: {floor}` | Kiểu hẹp: chỉ inventory không có consolidated, ép ở mức type |
| `INVENTORY_VALUE_PERMISSION` | `reporting.inventory.value.read` | Tách khỏi tập per-report có chủ đích |
| `InventoryReportDefinition.valueColumns` | `readonly string[]` khai báo tường minh | Vắng/rỗng = báo cáo thuần số lượng |

## Contracts

Không có endpoint mới. Thay đổi hành vi trên các endpoint sẵn có:

### POST /reports/{invoices,profit,debts,inventory}/search
Thêm tầng gác: `reportType` không được cấp → `403 Missing required permission: <key>`.
`reportType` lạ → guard bỏ qua, controller trả `400 Unknown report type`.

### GET /reports/inventory/columns?reportType=
Thiếu `reporting.inventory.value.read` → catalogue trả về đã lược mọi cột trong
`valueColumns` của báo cáo đó.

Failure modes: thiếu quyền báo cáo → 403; cửa hàng ngoài phạm vi (tiền) → 403;
cửa hàng ngoài tổ chức → 400; không được gán chi nhánh nào và không có
consolidated → 403 `No branch access assigned`.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Tập quyền của user | `RbacService` + cache Redis `rbac:perms:{userId}:{orgId}` | 300s |
| Quyền phía client | `localStorage["user_permissions"]`, ghi bởi `auth-storage.ts` | Phiên đăng nhập; không reactive |
| Danh sách báo cáo hiển thị | `ReportPage` lọc `configs.listReport` qua `visibleReportTypes` | Mỗi lần render trang |

## Error taxonomy

| Condition | HTTP | Thông điệp |
| --- | --- | --- |
| Thiếu quyền báo cáo | 403 | `Missing required permission: <key>` |
| Cửa hàng ngoài phạm vi được gán | 403 | `Access denied for stores: <ids>` |
| branchId legacy ngoài phạm vi | 403 | `Access denied for branch: <id>` |
| Không được gán chi nhánh nào | 403 | `No branch access assigned` |
| Cửa hàng ngoài tổ chức | 400 | `Unknown store ids: <ids>` |
| reportType không tồn tại | 400 | `Unknown report type: <key>` |

## Cache & offline

Cache quyền Redis TTL 300s. Migration ghi thẳng `role_permissions` nên cache cũ
sống thêm tối đa 5 phút sau deploy — chấp nhận, ghi vào tài liệu bàn giao.
Cache kết quả báo cáo kho (`inventory-reports`, 45s) lấy khóa từ `dto` **sau khi**
đã lược cột giá trị, nên hai nhóm người dùng không bao giờ dùng chung một entry.

## Observability

`ReportPermissionGuard` ghi `logger.warn` mỗi lần từ chối, kèm userId, reportType
và khóa còn thiếu — đủ để dựng lại "ai bị chặn ở báo cáo nào" mà không phải bật
debug.

## ADRs

### ADR-01 — Gác per-report bằng guard resolve theo request, không bằng decorator
**Context:** Mọi báo cáo trong một domain dùng chung route; `reportType` nằm
trong body hoặc query. `CrudPermissionGuard` đã giải đúng hình dạng này cho
`/admin/entities/:entityKey/**`.
**Decision:** Thêm `ReportPermissionGuard` chạy cùng `PermissionGuard`. Decorator
giữ quyền nhóm, guard thu hẹp về từng báo cáo. `reportType` lạ hoặc vắng thì cho
đi tiếp để controller trả 400/404.
**Consequences:** Endpoint không mang `reportType` (`filter-options`, list/patch/
delete template) vẫn chỉ được gác ở mức nhóm — chấp nhận, vì template là view cá
nhân của báo cáo mà user vốn đã chạy được.
**Status:** accepted

### ADR-02 — Hai trục phạm vi, không phải một
**Context:** Quy tắc nghiệp vụ có hai chiều ngược nhau: cửa hàng *được* xem tồn
của nhau, nhưng *không được* xem tiền của nhau.
**Decision:** Báo cáo tiền kẹp theo `actor.branchIds` + key consolidated theo
domain. Báo cáo tồn kho/điều chuyển org-wide, ranh giới là `organizationId`.
Phần tiền của nhóm sau cắt riêng bằng `INVENTORY_VALUE_PERMISSION`.
**Consequences:** Hai hàm resolve gần giống nhau nằm ở hai file — rủi ro gọi nhầm.
Bù lại bằng doc-block trỏ chéo nhau ở cả hai đầu và bằng spec khoá hành vi.
**Status:** accepted

### ADR-03 — Sàn phạm vi là `actor.branchIds`, không phải `actor.branchId`
**Context:** Code cũ lấy sàn là chi nhánh đang active (`X-Branch-Id`), nên user
quản nhiều cửa hàng phải đổi chi nhánh mới xem được từng nơi.
**Decision:** Sàn là tập chi nhánh được gán trong `user_branch_assignments`.
**Consequences:** Nới rộng cho user nhiều chi nhánh, no-op cho user một chi
nhánh. Hàm ném 403 ngay khi tập gán rỗng và không có consolidated — nhờ đó mọi
nhánh `return assigned` phía dưới không bao giờ rỗng, tránh việc mảng rỗng bị
`applyBranchScope` hiểu thành "không lọc gì".
**Status:** accepted

### ADR-04 — Mở rộng org-wide từ một báo cáo ra cả họ tồn kho
**Context:** ADR-04 của feature trước chỉ cho `stock-by-store-pivot` org-wide.
**Decision:** Áp cho cả 11 báo cáo kho/điều chuyển. Bỏ luôn kiểm tra anchor
branch trong `resolveTransferPair` và `transfer-by-store`, chỉ giữ kiểm tra
thuộc-org.
**Consequences:** `resolveInventoryBranchIds`, `permittedBranchIds`,
`NO_ACCESS_BRANCH_IDS` hết caller và bị xóa. Ô chọn cửa hàng/kho cũng phải bỏ
kẹp, nếu không user thấy báo cáo nhưng không chọn được cửa hàng để xem.
**Status:** accepted

### ADR-05 — Không ai mất quyền lúc deploy; siết là bước riêng
**Context:** Bỏ 4 key thô là mọi role mất sạch báo cáo.
**Decision:** Giữ 4 key cũ làm "quyền mở nhóm". Migration tự chứa: chèn 25 khóa
mới (không chờ `PermissionSyncService` vì nó chạy sau migration), rồi cấp bù
per-report cho mọi role đang giữ key nhóm, cấp bù hai key consolidated mới cho
role đang giữ key consolidated của hóa đơn, và cấp khóa xem giá trị cho mọi role
đang giữ `inventory.reports.read`.
**Consequences:** Ngay sau migration, seed và DB cố tình lệch nhau — ví dụ
Nhân viên kho vẫn còn khóa xem giá trị. Việc siết xảy ra khi chạy
`seed:sync-admin-permissions`, là một hành động có chủ đích của người vận hành.
**Status:** accepted
