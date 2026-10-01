---
feature: customer-points-ui-fixes
adr_count: 4
---

# Logical design — Điểm thành viên, tương phản bảng, Quản lý vai trò, dòng trống CTKM

## Approach

Bốn phần độc lập. Chỉ T1 đổi hợp đồng API theo hướng thêm (2 endpoint mới); T3 thêm một trường
vào response có sẵn. Không đổi schema bảng; một migration dữ liệu quyền.

**1. Điểm thành viên (UOW-01).**

*Quyền.* Hai khoá mới module `customer`: `customer.points.adjust`, `customer.points.history.read`.
- `permissions.seed.ts` thêm 2 dòng; `PERMISSION_LABELS_VI` thêm nhãn
  (*Điều chỉnh điểm thành viên*, *Xem lịch sử điểm thành viên*). `PermissionSyncService` tự chèn
  vào bảng `permissions` lúc khởi động.
- Seed vai trò: SYSTEM_ADMIN / GENERAL_MANAGER lấy mọi khoá; BRANCH_MANAGER lọc theo tiền tố
  `customer.` nên tự có. SALES / CASHIER / WAREHOUSE không đổi.
- Migration `CustomerPointsPermissions`: INSERT 2 khoá ON CONFLICT DO NOTHING, cấp cho mọi vai trò
  giữ `customer.merge` (A-06), cùng khuôn với `1790010000000-CashierBankReceiptPermission.ts`.

*Đặt số dư.* `PUT /customers/:id/membership-card/points`, `@RequirePermission('customer.points.adjust')`,
body `SetPointsBalanceDto { points: int ≥ 0 ≤ 1e9, note: string 1..500 }`.
`MembershipCardService.setBalance(customerId, dto, actor)` trong một transaction:
1. Đọc thẻ theo `(organizationId, customerId)` với `lock: { mode: 'pessimistic_write' }`; không có → 404.
2. `delta = dto.points − card.points`; `delta = 0` → trả thẻ, không ghi (A-16).
3. `card.points = dto.points`; INSERT `point_history { cardId, type: ADJUST, delta, note, createdBy: actor.userId, branchId: actor.branchId }`.
Trả `{ cardId, points }`. Không sửa `adjustPoints` cũ (A-07).

*Lịch sử.* `GET /customers/:id/point-history?page&limit`, `@RequirePermission('customer.points.history.read')`.
Một truy vấn: `point_history ph JOIN membership_cards mc ON mc.id = ph.card_id AND mc.customer_id = :id AND mc.organization_id = :org
LEFT JOIN invoices i ON i.id = ph.invoice_id LEFT JOIN users u ON u.id::text = ph.created_by`
`ORDER BY ph.created_at DESC, ph.id DESC`, `LIMIT/OFFSET` + COUNT. Trả
`{ data: PointHistoryItem[], total, page, limit }` (cùng dạng `getPointHistory` cũ), `PointHistoryItem { id, createdAt, type, delta, invoiceId, invoiceCode, note, createdByName }`.
Khách không thẻ → trang rỗng (không 404, để tab không báo lỗi).

*Giao diện.*
- `MembershipCardPanel` (mới, `pages/customers/components/`): đọc `GET /customers/:id/summary`
  (queryKey `["customer-summary", id]`), hiện Mã thẻ / Hạng / Điểm; nút *Điều chỉnh điểm* khi
  `usePermissionCheck('customer.points.adjust')` và có thẻ.
- `AdjustPointsDialog` (mới): ô *Điểm mới* (số nguyên, mặc định = điểm hiện tại), ô *Lý do* bắt buộc;
  `requireErpData(erpApi.PUT(...))`; thành công → invalidate `["customer-summary", id]` +
  `["customer-point-history", id]`, toast.
- `CustomerDetailPage`: thay khối *Thẻ thành viên* tự viết bằng `MembershipCardPanel`; thêm tab
  *Lịch sử điểm* (`PointHistoryTab`, mới, `BaseDataTable`) chỉ khi có quyền xem.
- `CrudEditPage`: khi `entityKey === "customers"` và đang sửa, render `MembershipCardPanel` phía
  trên form chung (A-02). Form chung không đổi; không gửi điểm qua PATCH CRUD.

**2. Tương phản bảng (UOW-02).** Token theo theme trong `apps/backoffice-web/src/index.css`, mỗi
theme `misa` / `dark` / `classic` (giá trị A-09):

```
--table-row-even, --table-row-odd, --table-row-hover, --table-row-selected, --table-row-selected-edge
```

`tailwind.config.js` (backoffice) map thành `bg-table-row-even` … . `LineItemGrid` nằm ở `@erp/ui`
nhưng class được biên dịch bởi tailwind của backoffice (content quét `packages/ui`) — T-02-01 xác
minh; nếu không thì `packages/ui/tailwind.config.js` map cùng tên với fallback.

`BaseDataTable`:
- Mỗi `<tr>` đặt biến `--row-bg` bằng class: chẵn/lẻ → token sọc; `hover` (khi có `onRowClick`) →
  `--table-row-hover`; chọn → `--table-row-selected` + `box-shadow: inset 3px 0 0 var(--table-row-selected-edge)` ở ô đầu.
  Thứ tự ưu tiên: chọn > hover > sọc (chọn + hover vẫn tím, AC-17).
- `frozenBodyBackground()` đổi từ màu tính sẵn sang `background: hsl(var(--row-bg))`, nên cột ghim
  theo đúng màu của dòng (AC-16/17). Đây là pattern `ReportPageTableView.tsx:456` đã dùng.
- Prop mới `isRowSelected?: (row: T) => boolean`. `rowClassName` vẫn giữ cho trường hợp khác;
  7 trang đang tự tô dòng chọn (`bg-info/15`, `FOCUSED_ROW_BG`/`HOVER_ROW_BG`) chuyển sang
  `isRowSelected` và bỏ class tự tô.

`LineItemGrid`: `ROW_STRIPE_EVEN/ODD` dùng token sọc + hover mới. Không thêm trạng thái chọn
(lưới nhập không có khái niệm dòng chọn).

**3. Quản lý vai trò (UOW-03).**
- `UserListItem` thêm `roleIds: string[]` (`shared-interfaces`). `UsersService.toListItems` thêm một
  `userRoleRepo.find({ where: { userId: In(ids) } })` (cùng tổ chức) rồi group theo user.
- `useAllUserDetails` bỏ vòng gọi `GET /admin/users/{id}`; trả thẳng các trang list (đã có `roleIds`).
  Kiểu trả về đổi từ `UserDetail[]` sang `UserListItem[]`; mọi chỗ dùng trong `RoleManagementPage`,
  `RoleUsersTab`, `RoleEmployeePickerModal`, `role-assignment.ts` chỉ được đọc trường có trong
  `UserListItem` (A-10). Nếu một trường thiếu thì thêm vào list item ở T-03-01, không gọi chi tiết.
- `useRoles` `staleTime: 30_000` (A-12).

**4. Dòng trống CTKM (UOW-04).** `itemDiscountToDto`: `.filter((r) => r.targetId && r.code.trim())`
trước `.map` (A-13). `sortOrder = i` sau lọc nên tự liên tục. Không đổi loader, không migration (A-14).

**2b. Mở rộng ra mọi bảng (UOW-05, reopen G3 2026-10-01).** Cùng 5 token của ADR-03, ba đường:
- `ReportPageTableView`: đã dùng `--row-bg` cho cột ghim; đổi giá trị gốc sang `--table-row-even/odd` và hover sang `--table-row-hover`.
- Trang `BaseDataTable` có cột chọn: truyền `isRowSelected` = dòng được tick **hoặc** dòng đang xem (A-19).
- Bảng tự viết: một class component trong `index.css`:

```
.erp-data-table > tbody > tr                    { --row-bg: var(--table-row-even); background-color: hsl(var(--row-bg)); }
.erp-data-table > tbody > tr:nth-child(even)    { --row-bg: var(--table-row-odd); }
.erp-data-table > tbody > tr:hover              { --row-bg: var(--table-row-hover); }
.erp-data-table > tbody > tr[data-selected="true"],
.erp-data-table > tbody > tr[aria-selected="true"] { --row-bg: var(--table-row-selected); }
.erp-data-table > tbody > tr[data-selected="true"] > td:first-child { box-shadow: inset 3px 0 0 0 hsl(var(--table-row-selected-edge)); }
```
  Mỗi file: thêm `erp-data-table` vào `<table>`, bỏ class sọc/hover/chọn tự viết (`even:bg-*`, `hover:bg-*`, `bg-primary/10`, `bg-accent`…), dòng chọn thì đặt `data-selected`. Ô ghim/ô có nền đục dùng `hsl(var(--row-bg))` (A-21).
- `table-contrast-coverage.test.ts` (vitest) quét `src/**/*.tsx` để AC-24 là điều kiện máy kiểm, không phải lời hứa.

## Alternatives rejected

| Option | Why not |
|---|---|
| T1: sửa điểm qua PATCH CRUD chung (`/admin/entities/customers/records/:id`) | Điểm nằm ở `membership_cards`, không phải `customers`; CRUD chung không ghi sổ cái → phá bất biến `point_history` |
| T1: client tự tính delta rồi gọi `POST membership-cards/:cardId/points` cũ | Đua dữ liệu: điểm đổi (POS tích điểm) giữa lúc đọc và lúc ghi → số dư sai. Server phải tính delta dưới khoá |
| T1: siết quyền endpoint cũ theo `cardId` | POS / mobile đang gọi, sẽ 403 sau deploy (A-07) |
| T1: cột số dư sau trong lịch sử | Chỉ đúng khi sổ cái đủ từ 0; dữ liệu nhập LOMAS không đảm bảo (A-17) |
| T2: thêm class vào từng trang | ~90 màn, lệch nhau ngay lần sửa sau; token + 2 component là đủ |
| T2 mở rộng: thêm class Tailwind sọc/hover vào từng `<tr>` của ~53 file | Mỗi file một biến thể, lệch nhau ngay lần sửa sau; một class component + test quét giữ được "mọi bảng" |
| T2: `!important` class cho cột ghim | Chồng `!` lên `!` của trang Đơn hàng; biến `--row-bg` giải quyết tận gốc inline style |
| T3: endpoint `GET /admin/roles/:id/users` + tải danh sách lười khi mở picker | Đúng hơn về lâu dài nhưng phải viết lại diff gán/bỏ (`role-assignment.ts` cần `roleIds` của mọi người). Với ~120 người dùng, `roleIds` trên list đưa 120 request về 1 với thay đổi nhỏ nhất (A-11) |
| T3: cache chi tiết người dùng lâu hơn | Vẫn 120 request lần đầu và sau mỗi lần Lưu |
| T4: migration đổi `PRODUCT`→`ITEM` cho dòng cũ | Đã đề xuất; Akenzy chọn chỉ lọc khi lưu (A-14) |
| T4: loader ẩn dòng không phân giải được | Người dùng không thấy dòng nhưng nó vẫn còn trong DB và vẫn được lưu lại — đúng hơn là để hiện cho tới lần lưu |

## Contracts

```
PUT  /customers/:id/membership-card/points      perm customer.points.adjust
     body  { points: number(int, 0..1e9), note: string(1..500) }
     200   { cardId: string, points: number }
     400   validation   403 no perm   404 customer/card not found in org

GET  /customers/:id/point-history?page=1&limit=20   perm customer.points.history.read
     200   { data: PointHistoryItem[], total, page, limit }   (cùng dạng endpoint cũ theo cardId)
     PointHistoryItem { id, createdAt, type: 'earn'|'redeem'|'adjust', delta: number,
                        invoiceId: string|null, invoiceCode: string|null, note: string|null,
                        createdByName: string|null }

GET  /admin/users            (thay đổi)  UserListItem += roleIds: string[]
```

Sau T-01-04 và T-03-01: `pnpm openapi:generate`, commit `openapi.snapshot.json` + `schema.ts`.

## Error taxonomy

| Case | Where | Response | UI |
|---|---|---|---|
| Thiếu quyền `ADJ` / `HIS` | PermissionGuard | 403 | Nút / tab ẩn, không gọi |
| Khách không thuộc tổ chức / không tồn tại | `setBalance` | 404 `Không tìm thấy khách hàng` | toast lỗi |
| Khách chưa có thẻ | `setBalance` | 404 `Khách hàng chưa có thẻ thành viên` | Panel hiện "Chưa có thẻ", không nút |
| Khách chưa có thẻ | `getHistoryByCustomer` | 200 trang rỗng | Bảng trống "Chưa có lịch sử điểm" |
| Điểm âm / lẻ / quá lớn, lý do rỗng | ValidationPipe | 400 | Dialog chặn trước khi gửi |
| Ghi đồng thời (POS tích điểm cùng lúc) | khoá `pessimistic_write` | tuần tự hoá; kết quả = giá trị đặt | — |
| Idempotency key trùng | `IdempotencyInterceptor` | replay | — |
| T4: mọi dòng đều trống | domain `REWARD_LINES_EMPTY` (có sẵn) | 400 | toast hiện có |

## ADRs

### ADR-01 — Đặt số dư điểm tính delta ở server, dưới khoá dòng
**Status:** accepted (Akenzy, 2026-10-01, A-01)
**Context:** Người dùng muốn "sửa điểm" như sửa một ô; sổ cái `point_history` bất biến.
**Decision:** Endpoint nhận số dư đích; server khoá thẻ, ghi một dòng `ADJUST` delta = đích − hiện tại; delta 0 không ghi.
**Consequences:** Bất biến sổ cái giữ nguyên; không đua với POS. Không dùng lại `adjustPoints` (không khoá).

### ADR-02 — Hai quyền mới, endpoint mới theo customerId; endpoint cũ giữ quyền cũ
**Status:** accepted (Akenzy, 2026-10-01, A-04)
**Context:** Client cần một quyền riêng để xem lịch sử điểm; endpoint cũ theo `cardId` đang được POS dùng.
**Decision:** `customer.points.adjust`, `customer.points.history.read` gác hai endpoint mới. Cấp cho vai trò giữ `customer.merge` qua migration.
**Consequences:** Ai có `customer.read` vẫn đọc được lịch sử qua endpoint cũ theo `cardId` (không có UI). Chấp nhận; siết sau khi rà người gọi POS.

### ADR-03 — Màu dòng bảng qua token theo theme + biến `--row-bg`
**Status:** accepted (Akenzy, 2026-10-01, A-08)
**Context:** Hai component dùng chung phủ ~90 màn; cột ghim dùng inline style chặn hover/chọn.
**Decision:** 5 token `--table-row-*` mỗi theme; `<tr>` đặt `--row-bg`; ô ghim đọc `--row-bg`; prop `isRowSelected`.
**Consequences:** Đổi màu sau này chỉ sửa token. Bảng tự viết và pos-web chưa theo (ngoài phạm vi).

### ADR-04 — Quản lý vai trò dùng `roleIds` trên danh sách người dùng thay vì gọi chi tiết từng người
**Status:** accepted (Akenzy, 2026-10-01 — "pass as akenzy"; A-10, A-11)
**Context:** 120 request chi tiết chỉ để lấy `roleIds`.
**Decision:** Thêm `roleIds` vào `UserListItem`, batch một truy vấn; frontend bỏ fan-out.
**Consequences:** Tải trang = 1 + ⌈n/200⌉ request. Với tổ chức rất lớn cần endpoint người dùng theo vai trò (đã ghi ở Alternatives).
