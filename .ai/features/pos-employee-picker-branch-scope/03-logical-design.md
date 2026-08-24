---
feature: pos-employee-picker-branch-scope
adr_count: 4
---

# Logical design — Branch-scope hai picker nhân viên trong POS

## Approach

Hai màn, hai đường sửa khác nhau, cùng một luật: danh sách người để **chọn** bám
`user_branch_assignments` của active branch.

**Picker "Người vận chuyển"** không cần endpoint mới. `GET /inventory/temp-warehouse/carriers`
đã tồn tại, đã có guard thật, đã resolve qua `user_branch_assignments` và đã có phân trang —
FE chỉ đơn giản là không còn gọi nó nữa (wrapper `tempWarehouseService.listCarriers()` vẫn nằm
đó dưới dạng dead code). Việc cần làm là trỏ FE về lại endpoint đó, bổ sung tìm theo mã nhân
viên bằng một `LEFT JOIN employee_profiles`, và nối phân trang vào popover.

**Bộ lọc "Thu ngân" / "NVBH"** đã có sẵn cơ chế scope đúng; vấn đề duy nhất là bypass
`iam.user.read.all`. Thay vì bỏ bypass (ảnh hưởng ba picker dùng chung), endpoint nhận thêm
tham số `branchId` **tường minh**: có thì ép `mode: 'branch'`, không có thì giữ nguyên đường
cũ. POS gửi active branch; backoffice không gửi gì và không đổi một dòng nào.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Sửa `listSalesmen` (`GET /branches/:id/salesmen`) cho lọc theo branch | Endpoint còn phục vụ picker NVBH ở màn Checkout; đổi ngữ nghĩa là đổi hai màn cùng lúc. Nó cũng đọc `employee_profiles` chứ không đọc `user_branch_assignments`, nên vẫn không giải quyết được gốc rỗng |
| Bỏ bypass `iam.user.read.all` trong `EmployeeBranchScopeService` | Đồng bộ hơn, nhưng làm hỏng báo cáo chuỗi hợp nhất ở backoffice: chọn "tất cả cửa hàng" mà dropdown thu ngân chỉ còn một chi nhánh là vô nghĩa |
| Lọc "Người vận chuyển" theo `employee_profiles` cho sát nghĩa "nhân viên" | Hồ sơ HR là optional khi tạo user; lọc theo nó tái hiện đúng lỗi rỗng đang phải sửa (A-02) |
| Viết một popover riêng cho picker người vận chuyển để có phân trang | Nhân bản ~250 dòng debounce + keyboard nav + ARIA + click-outside của `PosSearchPopover`, và tách đôi hành vi của hai picker trông giống hệt nhau |
| Lọc lại phía client sau khi server trả về | Đang làm vậy (`filterCarriers`) và chính nó là lỗi: nó lọc theo tên/email nên loại luôn dòng khớp bằng mã nhân viên, và nó lọc trên cache gộp mọi query nên phá phân trang |

## Domain model

Không có entity mới. Chỉ mở rộng một DTO đọc:

| Shape | Fields | Notes |
| --- | --- | --- |
| `TempWarehousePublicUser` | id, firstName, lastName, email, **employeeCode?** | `@erp/shared-interfaces`. `employeeCode` optional vì các đường hydrate carrier trên line đã lưu không có nó (A-04) |

Liên kết nhân viên-chi nhánh dùng lại `user_branch_assignments(user_id, branch_id)` — không
có cột branch nào trên `employee_profiles` dùng được (`base.entity.ts` có `branch_id` nhưng
chỉ ghi lúc tạo và không query nào đọc).

## Contracts

### GET /inventory/temp-warehouse/carriers
Request: `?branchId=<uuid>&search=<string>&page=<int>&pageSize=<int≤200>`
Response 200:
```json
{ "data": [{ "id": "...", "firstName": "...", "lastName": "...", "email": "...", "employeeCode": "NV000123" }],
  "total": 42, "page": 1, "pageSize": 20 }
```
`search` khớp ILIKE trên `users.first_name`, `users.last_name`, `users.email`,
`employee_profiles.code`. Thứ tự `first_name, last_name, id`.
Failure modes: 403 → thiếu `inventory.temp-warehouse.read` hoặc branch ngoài scope (BranchScopeGuard);
400 → `branchId` không phải uuid.

### GET /reports/invoices/filter-options
Request: `?type=cashier|salesperson&search=<string>&page=<int>&pageSize=<int≤100>&branchId=<uuid?>`
`branchId` là **mới** và optional. Có → scope ép về đúng chi nhánh đó, bất kể `iam.user.read.all`.
Không có → giữ nguyên `EmployeeBranchScopeService.resolve(actor)`.
Failure modes: 403 → `branchId` không nằm trong `actor.branchIds`.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Active branch (POS) | `usePosBranchStore` (zustand + persist `pos-branch`) | App; nguồn của `X-Branch-Id` và của `branchId` gửi lên |
| Trang carrier đang hiển thị | `PosSearchPopover` (state nội bộ `suggestions` / `exhausted`) | Mỗi lần mở dropdown; reset theo từng query |
| Cache carrier theo id | `usePosFastStockTransferPickerStore.carriersById` | Màn Chuyển kho tạm; chỉ dùng để resolve `carrierUserId` đã lưu thành tên, **không** còn dùng làm nguồn dropdown |
| Option Thu ngân / NVBH | TanStack Query, key có `branchId` | 5 phút staleTime |

## Error taxonomy

| Condition | Failure subtype | UI |
| --- | --- | --- |
| `branchId` gửi lên ngoài `actor.branchIds` | `ForbiddenException` (403) | Không xảy ra trên đường POS bình thường — POS chỉ gửi branch của chính token; nếu xảy ra là cấu hình sai |
| Chưa chọn chi nhánh (`branchId` null trên store) | Không phát request | Dropdown báo cáo để trống thay vì gọi org-wide (`enabled: Boolean(branchId)`). Với picker người vận chuyển, trang 1 rỗng làm popover chốt `exhausted` và không tự thử lại khi chi nhánh về muộn — chỉ tự khỏi khi blur/focus lại hoặc gõ tiếp. Cửa sổ này không tới được trên đường thật: cả hai màn nằm dưới `PosRequireBranch` (`App.tsx`), component này redirect sang `/chon-chi-nhanh` khi `branchId` falsy, và store persist bằng adapter localStorage đồng bộ nên đã rehydrate trước lần render đầu |
| Chi nhánh không có user active nào | 200 với `data: []` | "Không có kết quả." — đúng nghĩa, không phải lỗi |
| Request carrier lỗi mạng / 4xx | `PosSearchPopover` catch, `setSuggestions([])` | Vẫn hiện "Không có kết quả.". **Đây là hành vi hiện hữu và không sửa trong feature này** — ghi lại vì nó chính là thứ đã che lỗi gốc; xem "Ghi nhận" |
| Trang nạp thêm về trễ sau khi query đã đổi | Bị loại bằng `searchSeqRef` | Không có gì hiển thị sai |

## Cache & offline

Không có yêu cầu offline. Carrier cache theo id trong zustand chỉ phục vụ hiển thị tên trên
dòng đã lưu; nó được upsert từ mọi trang tải về nhưng không bao giờ được dùng làm nguồn của
dropdown nữa — đó là điều kiện để phân trang đúng.

Phân trang theo **số trang**, nên nếu tập nhân sự thay đổi giữa hai lần xin trang (ai đó
deactivate một user) thì các trang sau có thể lệch một dòng — nhược điểm cố hữu của offset
pagination, không phải thứ feature này tạo ra và không có yêu cầu nào cần mạnh hơn thế. Con trỏ
tự sửa vì `total` được đọc lại từ mỗi phản hồi.

## Observability

Không thêm event. Dấu hiệu quan sát được khi verify là request thật trong Network tab:
`GET /inventory/temp-warehouse/carriers?branchId=…` (và **vắng mặt** `GET /branches/:id/salesmen`
trên màn Chuyển kho tạm), `GET /reports/invoices/filter-options?...&branchId=…`.
`EmployeeBranchScopeService` đã log `mode=` ở mức debug — đủ để phân biệt "lọc đúng mà rỗng"
với "chưa lọc".

## ADRs

### ADR-01 — Dùng lại `GET /inventory/temp-warehouse/carriers`, không sửa `/branches/:id/salesmen`
**Context:** Picker đang gọi endpoint salesmen (org-wide, đọc `employee_profiles`). Endpoint
carriers đã tồn tại với đúng ngữ nghĩa cần (`user_branch_assignments` + `isActive` + phân trang
+ guard thật), và wrapper FE của nó vẫn còn dưới dạng dead code.
**Decision:** Trỏ FE về endpoint carriers. Không đụng `listSalesmen`.
**Consequences:** Diff nhỏ, không ảnh hưởng picker NVBH ở Checkout. Đổi lại, lỗ hổng scope của
`/branches/:id/salesmen` vẫn còn và phải xử lý ở một feature khác.
**Status:** accepted

### ADR-02 — Bộ lọc báo cáo nhận `branchId` tường minh, không bỏ bypass `iam.user.read.all`
**Context:** `EmployeeBranchScopeService.resolve` trả `mode: 'all'` cho người có
`iam.user.read.all`, dùng chung cho ba picker: Đối tượng ở phiếu kho, Nhân viên thu/chi ở phiếu
thu chi, và bộ lọc báo cáo. Chỉ màn POS cần thu hẹp.
**Decision:** Thêm query param optional `branchId`. Có → ép `{ mode: 'branch', branchId }` sau
khi đối chiếu `actor.branchIds`. Không có → đường cũ nguyên vẹn.
**Consequences:** Backoffice không đổi dòng nào và báo cáo hợp nhất còn nguyên. Đổi lại, cùng
một endpoint giờ có hai chế độ scope — phải viết rõ trong `employee-branch-scope.md`, nếu không
lần sau người đọc sẽ tưởng nó luôn org-wide. Bước đối chiếu `actor.branchIds` là bắt buộc: thiếu
nó thì tham số này thành đường để user thường đọc nhân sự chi nhánh khác.

Một hệ quả nữa, phát hiện lúc review, không phải "thu hẹp" thuần: cận trên của tham số là
**danh sách chi nhánh được gán**, không phải chi nhánh đang hoạt động. Trước thay đổi này, một
actor không có `iam.user.read.all` bị ghim vào `actor.branchId`, mà `actor.branchId` lấy
`fromJwt ?? fromHeader ?? branchIds[0]` — JWT thắng, nên đổi `X-Branch-Id` không đổi được scope,
phải đi qua `/auth/switch-branch`. Giờ actor được gán [A, B] đang đứng ở A có thể đọc nhân sự B
bằng cách gửi thẳng `branchId=B`. Không phải leo thang quyền — `branchIds` sinh từ
`user_branch_assignments`, và `/admin/users` cùng `/v2/employees/search` vốn đã trải khắp mọi chi
nhánh được gán (xem ADR-01 trong `employee-branch-scope.md`) — nhưng nó là dịch ngang, nên viết
ra thay vì để người đọc sau suy từ chữ "narrow".
**Status:** accepted

### ADR-03 — Mở rộng `PosSearchPopover` bằng prop `loadMore` optional
**Context:** Popover hiện không có khái niệm trang: `search(query) => Promise<...[]>`, cắt cứng
ở `maxSuggestions = 8`. Nó dùng chung cho nhiều picker và cho cả `PosSelect`.
**Decision:** Thêm `loadMore?: (query, loadedCount) => Promise<...[]>`. Khi có prop này thì bỏ
cắt `maxSuggestions` và bật xử lý cuộn; không có thì mọi thứ y như cũ.
**Consequences:** Một component dùng chung có thêm nhánh hành vi — chấp nhận, đổi lại không nhân
bản debounce/keyboard nav/ARIA. Nhánh append phải kiểm `searchSeqRef` giống `runSearch`, nếu
không trang của query cũ về trễ sẽ nối vào danh sách của query mới.
**Status:** accepted

### ADR-04 — `employeeCode` là field optional và được hiển thị
**Context:** Yêu cầu là tìm được theo mã nhân viên. Nếu chỉ tìm mà không hiển thị mã, dòng khớp
bằng mã sẽ trông như kết quả sai.
**Decision:** `employeeCode?: string | null` trên `TempWarehousePublicUser`; picker render nó ở
dòng meta (`renderMeta`), fallback về email khi user chưa có hồ sơ HR.
**Consequences:** Shared package đổi shape nên phải `pnpm build:shared` trước khi build app.
Optional nên các đường dựng `TempWarehousePublicUser` khác không phải sửa.
**Status:** accepted

## Ghi nhận, không xử lý trong feature này

1. **`PosSearchPopover` nuốt lỗi.** `catch { setSuggestions([]) }` khiến 400/401/404 hiện y hệt
   "không có kết quả" — chính nó đã che lỗi gốc suốt thời gian qua. Sửa nó là đổi hành vi mọi
   picker POS, nằm ngoài phạm vi.
2. **`GET /branches/:id/salesmen` không có guard hiệu lực.** `SalesHierarchyController` không khai
   báo `@UseGuards(PermissionGuard, BranchScopeGuard)`, nên `@RequirePermission('sales-hierarchy.read')`
   và `@RequireBranchScope()` ở đó chỉ là metadata không ai đọc; kết quả cũng là org-wide.
   `employee-branch-scope.md:20` đang mô tả sai cả hai điều này. Là lỗ hổng scope thật sự, cần
   một feature riêng.
