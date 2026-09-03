# Logical design — stock-by-store-branch-scope

## Approach

Hai thay đổi độc lập, không chia sẻ file nào, nên chạy song song được.

> **Sửa đổi 03/09/2026 — ADR-04 thay thế ADR-02.** Đo trên dữ liệu thật cho thấy đường legacy
> trả **toàn bộ tổ chức** (263.340) chứ không phải `actor.branchIds` (35.150), và chủ dự án chốt
> phạm vi org-wide đó là **đúng ý** cho riêng báo cáo này. Mục (1) bên dưới mô tả hướng đi cũ —
> siết xuống chi nhánh đang đứng — và **đã bị đảo chiều**; giữ lại để đọc lịch sử. Hướng đi hiện
> hành nằm ở ADR-04.

**(1) ~~Kẹp phạm vi ở server cho `StockByStorePivotReport`~~ (đã đảo chiều).**
Báo cáo này khác 7 báo cáo kho còn lại ở một điểm quyết định: **tập chi nhánh chính là nội dung
báo cáo** (mỗi chi nhánh một cột `branch.qty.<id>`), và tập đó sinh từ `orgBranches(actor)` —
hàm chỉ đọc `actor`, không đọc `filters.store`. Vì vậy cách 6 báo cáo kia dùng (FE ghim
`filters.store` về chi nhánh header) không áp dụng được: nó chỉ đổi dữ liệu, không đổi cột.

Giải pháp: thu hẹp **chính `actor`** trước khi mọi thứ khác chạy.

```
buildColumns / buildData / countRows
        │
        ├─ scopedActor(actor) ──► rbac.hasPermission(consolidated)?
        │                            ├─ có  → actor nguyên vẹn
        │                            └─ không → narrowToActiveBranch(actor)
        │                                        { ...actor, branchIds: actor.branchId ? [actor.branchId] : [] }
        ▼
   orgBranches(scoped) ─────────────► cột động
   resolveInventoryBranchIds(scoped) ► branchIds cho engine
   assertKnownColumns(scoped set) ───► 400 cho cột ngoài phạm vi
```

`permittedBranchIds` và `resolveInventoryBranchIds` **không đổi**. Chúng đã đúng — chúng chỉ
đang được đưa cho một actor rộng hơn thực tế. Thu hẹp đầu vào giữ nguyên toàn bộ hành vi biên
đã có: `[]` ⇒ `NO_ACCESS_BRANCH_IDS` (không bao giờ org-wide), `storeIds` ngoài phạm vi ⇒ 403,
ngoài org ⇒ 400.

**(2) Xoá đường legacy.** `InventoryReportsController` + `InventoryReportsService` là bản v1 của
đúng 8 báo cáo mà v2 đã phục vụ. Nav trỏ tới chúng đã bị comment out từ trước, nhưng route và
endpoint vẫn sống, và endpoint truyền `dto.branchIds` thẳng vào engine. Vá thì phải nhân đôi
logic phạm vi ở hai nơi mãi mãi; xoá thì lỗ hổng biến mất cùng mã nguồn.

## Alternatives rejected

| Option | Why not |
|---|---|
| Thêm `inventory-stock-by-store-pivot` vào `SINGLE_MODE_HEADER_STORE_REPORTS` ở FE | Không sửa được lỗi: `buildColumns` không đọc `filters.store`, nên cột của chi nhánh khác vẫn hiện. Và FE không phải ranh giới bảo mật — gọi thẳng API vẫn lộ |
| Đặt `@RequireBranchScope()` lên controller v2 | Guard yêu cầu một `branchId` tường minh và 403 nếu thiếu; báo cáo pivot theo thiết kế là tổng hợp nhiều chi nhánh cho Quản lý tổng. Sẽ chặn cả người được phép |
| Sửa `resolveInventoryBranchIds` để tự kiểm quyền chuỗi | Hàm này dùng chung cho 4 report definition khác; đổi ngữ nghĩa ở đó là đổi hành vi 7 báo cáo đang đúng — trái với "còn lại giữ như cũ" |
| Đọc quyền từ `actor.permissions` thay vì gọi `RbacService` | `ActorContext.permissions` được khai báo nhưng **không bao giờ được điền** (actor-context.decorator.ts:29-36). Dùng nó là luôn coi như không có quyền |
| Vá `InventoryReportsService.stockByBranch` thay vì xoá | Giữ lại hai đường phải đồng bộ vĩnh viễn cho cùng 8 báo cáo. Người dùng đã chọn xoá hẳn |
| Chỉ bỏ 8 route ở `App.tsx`, giữ lại trang và endpoint | Endpoint vẫn gọi được bằng HTTP; mã chết vẫn phải bảo trì |

## Contracts

- **Không đổi hợp đồng v2.** `POST /reports/inventory/search` và `/columns` giữ nguyên hình
  dạng request/response. Thứ thay đổi là *tập cột trả về* — vốn đã động theo tổ chức từ đầu
  (ADR-03 của feature `report-column-config-per-branch`), nên FE không cần biết.
- **`report_templates` lưu danh sách cột theo tên.** Template cũ của một Quản lý chi nhánh có
  thể chứa `branch.qty.<chi-nhánh-khác>`. `assertKnownColumns` sẽ trả 400 cho template đó. Đây
  là hành vi đúng (không được hiển thị cột ngoài phạm vi) nhưng là thay đổi nhìn thấy được →
  ghi vào done-when của T-01-03 và kiểm ở bước verify.
- **Xoá 8 endpoint `GET /reports/inventory/*`** ⇒ `openapi.snapshot.json` và
  `packages/api-client/src/generated/schema.ts` phải regenerate.

## Error taxonomy

| Tình huống | Mã | Nơi phát |
|---|---|---|
| Không có quyền chuỗi, không có chi nhánh đang làm việc | 200 với 0 dòng, 0 cột chi nhánh | `NO_ACCESS_BRANCH_IDS`, report-scope.util.ts:12 |
| Khai cột `branch.qty.<id>` ngoài phạm vi | 400 `Unknown report columns` | `assertKnownColumns`, stock-by-store-pivot.report.ts:211 |
| `filters.store.storeIds` chứa chi nhánh ngoài phạm vi | 403 `Access denied for stores` | `resolveInventoryBranchIds`, report-scope.util.ts:41 |
| `storeIds` chứa id ngoài tổ chức | 400 `Unknown store ids` | report-scope.util.ts:53 |
| Thiếu `inventory.reports.read` | 403 | `PermissionGuard` |
| Gọi endpoint legacy sau khi xoá | 404 | NestJS router |

## ADRs

### ADR-01 — Kẹp phạm vi bằng cách thu hẹp `ActorContext`, không sửa helper dùng chung
**Status:** superseded by ADR-04
**Context:** Cần giới hạn cả cột động lẫn dữ liệu lẫn đường xuất khẩu. Ba đường vào
(`buildColumns`, `buildData`, `countRows`) chạy qua ba helper khác nhau, nhưng cả ba đều nhận
`actor`.
**Decision:** Thêm `narrowToActiveBranch(actor)` trả về bản sao `ActorContext` với `branchIds`
rút về `[actor.branchId]`, và gọi nó ở đầu cả ba đường vào của riêng report này. Không sửa
`permittedBranchIds` / `resolveInventoryBranchIds`.
**Consequences:** Một điểm quyết định duy nhất; các report khác không bị ảnh hưởng. Đổi lại,
phải nhớ gọi ở cả ba chỗ — thiếu một chỗ thì cột và dữ liệu lệch nhau, nên T-01-04 test riêng
từng đường vào.

### ADR-02 — "Chi nhánh phụ trách" = chi nhánh đang chọn, không phải mọi chi nhánh được gán
**Status:** superseded by ADR-04
**Context:** A-01. Quản lý chi nhánh có thể được gán nhiều chi nhánh. Hai cách hiểu đều hợp lý.
**Decision:** Chi nhánh đang chọn trên thanh trên cùng (`actor.branchId`, do
`POST /auth/switch-branch` phát lại token).
**Consequences:** Khớp hành vi 6 báo cáo kho đang ghim theo chi nhánh header, nên toàn bộ nhóm
báo cáo kho nhất quán. Người quản nhiều cửa hàng phải đổi chi nhánh để xem cửa hàng khác — đúng
thao tác họ đang làm ở các báo cáo còn lại. Đảo chiều rẻ: `narrowToActiveBranch` thành no-op.

### ADR-03 — Xoá đường báo cáo kho legacy thay vì vá phạm vi cho nó
**Status:** accepted
**Context:** `GET /reports/inventory/*` phục vụ đúng 8 báo cáo mà v2 đã phục vụ, không có chốt
chặn chi nhánh, và nav trỏ tới nó đã bị comment out từ trước.
**Decision:** Xoá controller, service, DTO riêng và 8 trang FE + registry đi kèm.
**Consequences:** Lỗ hổng biến mất cùng mã nguồn thay vì phải giữ đồng bộ hai đường. Rủi ro:
diff lớn (~15 file), và `PERIOD_PRESETS` nằm nhờ trong DTO sắp xoá nên phải tách ra trước
(AC-08). Bất kỳ bookmark nào tới `/reports/storage/*` sẽ hỏng — chấp nhận được vì các trang này
chưa từng có trong menu.

### ADR-04 — Báo cáo pivot theo cửa hàng là org-wide cho mọi vai trò mở được nó
**Status:** accepted
**Context:** Đo A/B trên dữ liệu thật (org MT, tài khoản gán 2/15 chi nhánh): đường legacy trả
tổng **263.340** (toàn tổ chức), đường v2 trả **35.150** (`actor.branchIds`). Chủ dự án chốt
03/09/2026: *"Riêng báo cáo này, được xem toàn bộ chi nhánh."* Báo cáo này tồn tại để so sánh tồn
kho giữa các cửa hàng — cắt phạm vi thì mất đúng công năng đó.
**Decision:** Với `inventory-stock-by-store-pivot`:
- cột động sinh từ **mọi chi nhánh của `actor.organizationId`**, không lọc theo `actor.branchIds`;
- `filters.store` vắng mặt hoặc `scope: "all"` ⇒ engine nhận `branchIds: undefined` (không có điều
  kiện chi nhánh), thay vì `[...permitted]`;
- `filters.store.storeIds` tường minh ⇒ chỉ kiểm **thuộc tổ chức** (400 nếu không), **bỏ** kiểm
  thuộc `actor.branchIds` (403 cũ);
- `organizationId` vẫn luôn được truyền — ranh giới nhiều tenant không đổi.
Không sửa `permittedBranchIds` / `resolveInventoryBranchIds`: 4 report definition khác vẫn dùng.
Báo cáo này có hàm phân giải riêng.
**Consequences:** Nhân viên kho đứng ở một chi nhánh thấy tồn kho cả 15 chi nhánh. Đây là **nới**
quyền đọc và **ngược với câu chữ PQ-02** khách viết — đã ghi thành điểm cần khách xác nhận trong
`docs/client/phu-luc-01-checklist.csv` và `00-intent.md`. Đảo chiều rẻ: đưa `orgBranches` và hàm
phân giải riêng quay lại dùng `permittedBranchIds`. Việc xoá endpoint legacy (ADR-03) **không** bị
ảnh hưởng: phạm vi dữ liệu của nó đúng, nhưng nó bỏ qua mọi lớp kiểm tra và trùng lặp với v2.
