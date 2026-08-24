---
feature: branch-deactivation
adr_count: 7
---

# Logical design — Ngừng hoạt động cửa hàng

## Approach

Cột `branches.status` đã tồn tại và đã có `suspend()`. Feature này **không thêm cột, không
thêm migration**. Việc phải làm là dựng một *định nghĩa duy nhất* của "cửa hàng đang hoạt
động" rồi cắm nó vào bốn cửa mà mọi bề mặt đều xuôi qua:

| Cửa | Ở đâu | Nó phủ những gì |
|---|---|---|
| 1. Danh sách chi nhánh nạp vào JWT | `AuthService.resolveUserBranches` | `ActorContext.branchId`, `BranchScopeGuard`, `permittedBranchIds()`, toàn bộ inventory-report, `resolveInventoryBranchIds()`, màn chọn chi nhánh của POS (dựng từ `payload.branchIds`) |
| 2. Hai endpoint danh sách | `BranchService.list`, `listMyBranches` | Mọi dropdown cửa hàng ở cả hai app: header selector, ô kho đích chuyển kho, phiếu thu/chi, khuyến mại, gán nhân viên, in tem |
| 3. Ba resolver `stores()` + dashboard cũ | invoice-report, profit-report, inventory-reports, `ReportingService` | Bộ lọc "Cửa hàng" trên mọi báo cáo chuỗi |
| 4. Đường ghi liên chi nhánh | transfer-order, cash-transfer, deposit-transfer | Không tạo được chứng từ trỏ tới cửa hàng đã ngừng |

Cửa 1 là đòn bẩy lớn nhất: nó phủ nhóm bề mặt đông nhất mà không đụng vào một dòng nào của
inventory-report. Cửa 2–4 là những chỗ *chưa* xuôi qua JWT.

Trên UI, ngừng hoạt động là **một ô tích trong form Sửa cửa hàng** (theo mẫu MISA eShop), kèm
hộp thoại xác nhận nêu số liệu còn tồn đọng. Cảnh báo, không chặn.

## Alternatives rejected

| Option | Why not |
|---|---|
| Thêm cột `isActive` cho `branches` như `StorageEntity` | `status` đã có, đã có luật chuyển trạng thái, đã có endpoint. Thêm cột thứ hai là hai nguồn sự thật cho cùng một khái niệm |
| Lọc `status` ở từng truy vấn có `branchId` | 48 entity mang `branchId`. Không kiểm chứng được độ phủ, và mỗi endpoint mới sau này sẽ lặp lại đúng lỗi hôm nay |
| Xoá mềm bằng `@DeleteDateColumn` | `BaseEntity` của repo này không có soft-delete, và xoá mềm sẽ làm hỏng mọi FK trỏ tới `branches` từ 48 bảng |
| Chỉ ẩn ở frontend | Gọi thẳng API vẫn tạo được lệnh chuyển kho tới cửa hàng đã đóng — đúng lỗ hổng đang có |
| Thu hồi toàn bộ phiên đăng nhập khi ngừng | `SessionStore` đánh khoá theo `jti`, không có chỉ mục user→session; muốn thu hồi phải `SCAN` toàn bộ namespace |

## Domain model

Không có entity mới. Một khái niệm mới, đặt tên một lần:

| Khái niệm | Định nghĩa | Nơi ở |
|---|---|---|
| *Cửa hàng đang hoạt động* | `branches.status = 'ACTIVE'` | `BranchStatusService.activeBranchIds(orgId)` — mới, trong `modules/branch/` |
| *Tập cửa hàng đã ngừng* | `status <> 'ACTIVE'`, cache Redis theo tổ chức, TTL ngắn | `BranchStatusService.suspendedBranchIds(orgId)`, dùng `CacheService.getOrSet` |
| *Ảnh hưởng khi ngừng* | Số bản ghi còn tồn đọng theo từng nhóm nghiệp vụ | `BranchDeactivationImpact`, đếm bằng khuôn `BRANCH_DELETE_OPERATIONAL_DEPENDENCIES` sẵn có |

`BranchStatusService` là nơi duy nhất biết "hoạt động" nghĩa là gì. Mọi cửa ở trên gọi vào nó.

## Contracts

### POST /branches/:id/activate  *(mới)*
Quyền: `branch.archive`. Body: rỗng.
- `200` → `BranchEntity` với `status: ACTIVE`
- `400` → cửa hàng đang `ARCHIVED` (phải mở qua đường khác), hoặc đã `ACTIVE`
- `403` → thiếu `branch.archive`

### POST /branches/:id/suspend  *(đã có, siết lại)*
Thêm `@RequirePermission('branch.archive')`; thêm chặn `isMainBranch`; xoá cache trạng thái sau khi lưu.
- `400` → cửa hàng chính, hoặc không ở trạng thái `ACTIVE`

### GET /branches/:id/deactivation-impact  *(mới)*
Quyền: `branch.archive`.
```json
{
  "branchId": "...",
  "branchName": "Chi nhánh Hà Nội",
  "isMainBranch": false,
  "blockers": [{ "code": "MAIN_BRANCH", "message": "..." }],
  "warnings": [
    { "code": "stock_balances", "label": "tồn kho", "count": 412 },
    { "code": "transfer_orders_open", "label": "lệnh điều chuyển chưa nhận", "count": 2 },
    { "code": "users_only_here", "label": "nhân viên chỉ thuộc cửa hàng này", "count": 3 }
  ]
}
```
`warnings` chỉ để hiển thị. `blockers` hiện chỉ có đúng một mã: `MAIN_BRANCH`.

### GET /branches, GET /branches/me  *(đổi hành vi)*
Mặc định chỉ trả `status = 'ACTIVE'`. Thêm query `includeInactive=true` — dành riêng cho màn
Cửa hàng, để còn đường bật lại (A-10). Generic CRUD `GET /admin/entities/branches/records`
cũng phải đi theo `includeInactive` vì màn Cửa hàng dùng chính nó.

### GET /branches/:id  *(không đổi)*
Vẫn trả về cửa hàng đã ngừng (AC-24). Đường tra cứu, không phải đường chọn.

### Đường ghi liên chi nhánh  *(đổi hành vi)*
`POST/PATCH /transfer-orders`, `createAndConfirmExport`, chuyển quỹ, chuyển tiền gửi: chi nhánh
đích phải **tồn tại + cùng tổ chức + ACTIVE**, nếu không `400`. Hôm nay cả ba chỉ kiểm
`đích !== nguồn` nên nhận cả UUID của tổ chức khác (AC-19).

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| `branches.status` | Postgres | Vĩnh viễn |
| Tập chi nhánh đã ngừng theo tổ chức | Redis qua `CacheService` (`branch-status:<orgId>`) | TTL ngắn; xoá ngay khi suspend/activate |
| `branchIds` của phiên | JWT + `SessionStore` | 15 phút (access) / theo refresh |
| Chi nhánh đang chọn — backoffice | `localStorage: active_branch_id`, `bo-active-branch` + `useBranchStore` | Đến khi đổi hoặc bị hoà giải |
| Chi nhánh đang chọn — POS | `localStorage: pos-branch` + `usePosBranchStore` | Đến khi đổi hoặc bị hoà giải |
| Trạng thái ô tích trong form | `CrudRecordDialog` | Vòng đời hộp thoại |

## Error taxonomy

| Điều kiện | HTTP | Thông báo (tiếng Việt) |
|---|---|---|
| Ngừng cửa hàng chính | 400 | "Không thể ngừng hoạt động cửa hàng chính của tổ chức." |
| Ngừng cửa hàng không ở trạng thái hoạt động | 400 | "Cửa hàng không ở trạng thái đang hoạt động." |
| Mở lại cửa hàng đã đóng vĩnh viễn | 400 | "Cửa hàng đã đóng vĩnh viễn, không thể mở lại." |
| Thiếu `branch.archive` | 403 | thông báo mặc định của `PermissionGuard` |
| Chuyển sang chi nhánh đã ngừng | 403 | "Cửa hàng đã ngừng hoạt động." |
| Token cũ trỏ vào chi nhánh đã ngừng | 401 `SESSION_REVOKED` | tái dùng `AuthException` sẵn có; FE đã biết cách làm mới phiên |
| Chi nhánh đích đã ngừng / không tồn tại / khác tổ chức | 400 | "Cửa hàng đích không hợp lệ hoặc đã ngừng hoạt động." |

## Cache & offline

Không có offline. `branch-status:<orgId>` là cache duy nhất được thêm; xoá đồng bộ ngay trong
cùng thao tác suspend/activate, nên không có cửa sổ đọc dữ liệu cũ. Phía frontend, sau khi lưu
phải invalidate `["branches","all"]`, `["branches","me"]`, `["filter-options","branches"]`,
`["report-filter-options", …]`, `BRANCH_KEYS.MY_BRANCHES`, cùng bốn chỗ gọi
`apiClient.get("/branches?…")` thẳng không qua react-query (`TransferOrdersPage` ×2,
`GoodsIssueFormDialog`, `GoodsReceiptFormDialog`).

## Observability

- `BranchService.suspend/activate` log ở mức `log`: `branchId`, `organizationId`, `actorId`,
  trạng thái trước → sau, và tổng số `warnings` tại thời điểm bấm.
- `AuthGuard` log ở mức `debug` khi từ chối vì chi nhánh đã ngừng — đủ để phân biệt với
  phiên hết hạn khi đọc log sự cố.
- Không phát Kafka event đợt này: chưa có consumer nào cần biết, và `TopicInitializer` sẽ phải
  thêm topic cho một sự kiện không ai nghe.

## ADRs

### ADR-01 — Lọc tại `resolveUserBranches`, không vá từng truy vấn
**Context:** 48 entity mang `branchId`; inventory-report đã kẹp theo `permittedBranchIds(actor)`
lấy từ JWT.
**Decision:** loại chi nhánh không `ACTIVE` ngay khi tính `branchIds` cho phiên.
**Consequences:** phủ được nhóm bề mặt đông nhất bằng một thay đổi; đổi lại `branchIds` chỉ
được tính lại lúc login / refresh / switch, nên cần ADR-02 để có hiệu lực tức thì.
**Status:** accepted

### ADR-02 — Hiệu lực tức thì bằng một lần đọc Redis trong `AuthGuard`
<!-- TTL chốt ở 30s, không phải mặc định 300s của CacheService: getOrSet là read-through
     không khoá, nên một reader lỡ nhịp có thể ghi đè tập cũ sau khi invalidate chạy. TTL là
     trần cho khoảng thời gian tập cũ đó sống — 300s nghĩa là cửa hàng đã đóng bán tiếp 5 phút,
     đúng thứ ADR này sinh ra để chặn. -->
**Context:** access token sống 15 phút; máy POS đang bán ở cửa hàng vừa bị ngừng sẽ bán tiếp
được trong ngần ấy thời gian.
**Decision:** `BranchStatusService` giữ tập chi nhánh đã ngừng trong Redis qua `CacheService`;
`AuthGuard` từ chối request có `payload.branchId` nằm trong tập đó.
**Consequences:** `AuthGuard` vốn đã đi Redis một lần mỗi request cho `isSessionActive`, nên
thêm một lần `get` là cùng bậc chi phí, không phải bậc mới. Đổi lại `AuthGuard` — thứ toàn cục
nhất trong hệ thống — nay phụ thuộc vào một service của module `branch`; phải nạp qua
`forwardRef` hoặc tách `BranchStatusService` sang `common/`.
**Status:** accepted

### ADR-03 — Dùng lại quyền `branch.archive`
**Context:** `branch.archive` đã tồn tại, đã được cố ý giữ riêng cho Root/General Manager với
chú thích *"A branch manager runs a branch, they do not retire one."*
**Decision:** suspend và activate cùng dùng `branch.archive`. Không thêm permission key.
**Consequences:** không có seed mới, không có migration quyền. Đổi lại tên quyền hơi lệch nghĩa
với hành động "ngừng tạm thời" — chấp nhận, vì đúng đối tượng được phép.
**Status:** accepted

### ADR-04 — Đổi `status` phải đi qua `suspend()` / `activate()`
**Context:** `BranchService.update` hiện `Object.assign(branch, dto)` rồi save, mà
`UpdateBranchDto` lại nhận cả `status` — nghĩa là hôm nay đã có thể đặt `ARCHIVED` bằng một
`PATCH`, bỏ qua toàn bộ luật chuyển trạng thái.
**Decision:** `update()` tách `status` ra khỏi phần `Object.assign` và định tuyến qua
`suspend()` / `activate()`; các endpoint lifecycle là đường chính thức.
**Consequences:** một chỗ duy nhất kiểm luật, xoá cache và ghi log. Sửa luôn một lỗ hổng có sẵn
không nằm trong yêu cầu ban đầu — nêu rõ trong PR.
**Status:** accepted

**Bổ sung 2026-08-24, sau review T-01-01** — bản cài đặt đầu tiên định tuyến bằng cách gọi
`suspend()`/`activate()` *sau* khi đã `save` phần còn lại của DTO, nên một transition bị từ
chối vẫn để lại phần đổi tên đã ghi. Ba điều chỉnh:

1. Luật tách thành `assertTransitionAllowed(branch, target)`, chạy **trước** mọi lệnh ghi;
   `update` chỉ `save` một lần.
2. `update` **từ chối** `ARCHIVED` (400) thay vì định tuyến sang `archive()`. Lưu trữ có luật
   cửa hàng con riêng và có endpoint riêng, và endpoint đó **sẽ** được `branch.archive` canh ở
   T-01-02 — hiện `BranchController` chưa gắn `PermissionGuard` nên chưa canh gì cả. Cho PATCH
   chạm tới `ARCHIVED` là mở sẵn đường vòng qua cái cổng AC-04 sắp dựng. Nhất quán với A-01.
   Trên đường generic CRUD thì việc từ chối đã có tác dụng ngay: `CrudPermissionGuard` bắt
   `branch.write`, mà Branch Manager có `branch.write` nhưng không có `branch.archive`.
3. `BranchCrudService.update` override và uỷ quyền cho `BranchService.update`. Không có bước
   này thì ADR-04 chỉ đúng trên giấy: generic CRUD nhận `@Body() Record<string, any>` không
   DTO, và `readOnly: true` trong `CrudEntityConfig` không được phía server thực thi ở bất kỳ
   đâu — `PATCH /admin/entities/branches/records/:id` ghi thẳng `status`, bỏ qua cả luật lẫn
   việc xoá cache. Đây chính là đường mà màn Cửa hàng đi.

4. **Uỷ quyền thôi chưa đủ — phải lọc trắng payload trước.** Vì không có ValidationPipe trên
   đường đó, body thô đi thẳng vào `Object.assign` và ghi được *mọi* cột của `BranchEntity`,
   kể cả cột không hề khai trong `BRANCH_ENTITY_CONFIG.fields`. Lỗ này **có sẵn từ trước**
   (`BaseCrudService.update` cũng `repository.merge` đúng body đó), nhưng ADR-04 vừa biến
   `isMainBranch` thành cột canh cửa, nên giờ nó thành lỗ hổng leo thang: `{"isMainBranch":
   false}` rồi `{"status": "SUSPENDED"}` là ngừng được cửa hàng chính, còn
   `{"organizationId": "..."}` là đẩy bản ghi sang tổ chức khác. Override chạy
   `plainToInstance` + `validate({ whitelist: true })`, vừa cắt cột không được phép vừa trả
   lại phần kiểm tra DTO mà đường này vốn bỏ qua.

5. `assertTransitionAllowed` chuyển sang `switch` **default-deny**: một `target` ngoài enum chỉ
   tới được từ body chưa kiểm, và một giá trị enum thứ tư thêm sau này phải được cho phép
   tường minh chứ không mặc nhiên hợp lệ từ mọi trạng thái.

6. Mọi lời gọi `invalidate()` chạy sau khi đã commit, nên được bọc try/catch: Redis chết không
   phải lý do báo lỗi cho một thay đổi đã xảy ra thật. TTL 30s là lưới đỡ. Có **hai** wrapper
   vì có hai service cùng ghi `status`: `BranchService.invalidateStatusCache` và
   `BranchCrudService.invalidateStatusCache` (cho đường xoá cứng).

7. `create` trên generic CRUD cũng phải lọc trắng, không chỉ `update`. Lọc một bên tạo ra cái
   bẫy: create sinh được bản ghi vi phạm chính giới hạn mà update vừa siết, và form thì post
   lại toàn bộ trường mỗi lần lưu — nên mọi lần sửa sau đó đều 400. Lọc `create` đồng thời
   đóng luôn đường `{"id": "<uuid chi nhánh tổ chức khác>"}`, vì `repo.save` với khoá chính đã
   có giá trị là một lệnh update chứ không phải insert.

8. Thông báo lỗi validate viết tiếng Việt ngay trên decorator của DTO, và gộp thành **một
   chuỗi** thay vì mảng: backoffice đọc `String(data.message)`, mảng sẽ hiện ra dạng dính
   dấu phẩy, và mảng cũng làm `err.message` trong log chỉ còn "Bad Request Exception".

### ADR-05 — Đường tra tên không lọc theo status
**Context:** phiếu chuyển kho cũ phải in đúng tên chi nhánh đối tác, kể cả khi chi nhánh đó đã
đóng.
**Decision:** `GET /branches/:id` và mọi `branchRepo.find({ id: In([...]) })` phục vụ tra tên
giữ nguyên. Chỉ đường *chọn* và đường *tổng hợp* bị lọc.
**Consequences:** "biến mất hoàn toàn" có đúng một ngoại lệ, và ngoại lệ đó là cố ý. Cùng
nguyên tắc đã áp ở `voucher-party-branch-scope`.
**Status:** accepted

### ADR-06 — Dashboard cũ: thêm một mệnh đề SQL dùng chung, không đổi chữ ký tham số
**Context:** `ReportingService` có 11 truy vấn raw SQL dùng chung biến `branchFilter`, và khi
người dùng có quyền xem hợp nhất thì `resolveBranchScope` trả `null` = không lọc chi nhánh gì
cả — nghĩa là cộng luôn cửa hàng đã ngừng, trái AC-15.
**Decision:** nối thêm một mệnh đề hằng
`AND branch_id IN (SELECT id::text FROM branches WHERE organization_id = $1 AND status = 'ACTIVE')`
vào từng truy vấn, dùng lại `$1` sẵn có.
**Consequences:** không phải đánh số lại tham số ở 11 chỗ — thay đổi cơ học, dễ soát. Đổi lại
mỗi truy vấn gánh thêm một subquery trên bảng `branches` (vài chục dòng, có index theo
`organization_id`), chi phí không đáng kể.
**Status:** accepted

### ADR-07 — Ô tích ánh xạ sang enum ở tầng cấu hình CRUD, không thêm cột boolean
**Context:** generic CRUD đã render checkbox cho `type: "boolean"`
(`CrudFieldInput.tsx:92`), nhưng `status` là enum ba giá trị. `branches` nằm trong
`DIALOG_MODE_ENTITIES` nên form là `CrudRecordDialog`.
**Decision:** giữ nguyên `status` trong DB; `BranchCrudService` phơi thêm một trường ảo
`inactive: boolean` trong `BRANCH_ENTITY_CONFIG`, dịch hai chiều `inactive ⇄ status` ở tầng
service. Hộp thoại xác nhận cài vào đường submit của `CrudRecordDialog`, special-case theo
`entityKey === "branches"` — đúng lối repo đã dùng ở `CrudFieldInput.tsx:40` và
`CrudListPage.tsx:523`.
**Consequences:** không đụng schema, không đổi hành vi của entity khác. Đổi lại `CrudRecordDialog`
— component dùng chung — có thêm một nhánh special-case; phải có test cho một entity khác để
chứng minh không ảnh hưởng.
**Status:** accepted

**Bổ sung 2026-08-24, sau review T-01-04** — bản cài đặt **không** dùng trường ảo `inactive`
như ADR này mô tả. `status` giữ nguyên `readOnly` trong `BRANCH_ENTITY_CONFIG`, và
`CrudRecordDialog` gắn thẳng `payload.status` khi ô tích đổi. Lý do: ô tích nằm **ngoài**
`editableFields`, nên bộ lọc trắng trong `toValidatedDto` không phải nới ra để nhận thêm một
khoá ảo — hợp đồng gửi lên vẫn đúng bằng `UpdateBranchDto`. Đổi lại `status` phải khai
`type: "enum"` (không phải `"string"`), vì `CrudListPage:1043` chỉ đưa trường enum qua
`formatCrudFieldValue`, tức là qua `enumLabels`.

Kèm hai ràng buộc phát sinh, cả hai đều đã bị review bắt:
1. Chỉ gửi `status` **khi ô tích thật sự đổi** — gửi vô điều kiện thì cửa hàng `ARCHIVED` nhận
   `ACTIVE` mỗi lần lưu và 400 ngay cả khi chỉ đổi tên.
2. Ô tích phải canh theo `branch.archive`, vì endpoint impact và đường ghi trạng thái đều đòi
   quyền đó; hiện nó cho ai có `branch.write` cũng thấy thì chỉ dẫn tới 403.

