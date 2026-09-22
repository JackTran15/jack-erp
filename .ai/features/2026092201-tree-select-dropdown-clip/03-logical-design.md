---
feature: tree-select-dropdown-clip
adr_count: 3
---

# Logical design — tree-select-dropdown-clip

## Approach

Hai thay đổi, hai ticket, một UoW:

1. **`TreeSelectInput` render dropdown qua portal, `position: fixed`, đo theo ô nhập** (T-01-01, ADR-01). Chép nguyên
   cơ chế của `LookupField` trong cùng thư mục:
   - Khi `open`: tìm `wrapRef.closest('[role="dialog"]')`; có thì portal vào đó (AppModal `contain: layout paint` và
     Radix `PopoverContent` wrapper có `transform` đều là containing block của `fixed` ⇒ toạ độ trừ đi
     `getBoundingClientRect()` của host), không có thì portal vào `document.body` với toạ độ viewport.
   - Đo: `availableBelow = innerHeight − rect.bottom − 8`, `availableAbove = rect.top − 8`; đặt dưới nếu
     `availableBelow ≥ 140` hoặc `≥ availableAbove`, ngược lại lật lên; `maxHeight = min(320, max(140, chỗ trống))`.
     Đo lại trên `scroll` (capture, để bắt cuộn body modal) và `resize`; gỡ listener khi đóng.
   - Popover: `data-lookup-popover=""`, `zIndex: 70`, `pointerEvents: "auto"`, `minWidth = rect.width`; khung cuộn
     `style={{ maxHeight }}`, `overflow-y-auto overscroll-contain`, giữ `onScroll` tải trang tiếp.
   - Click-ngoài: bỏ qua nếu target nằm trong `wrapRef` **hoặc** `popoverRef` (danh sách không còn là con DOM của
     wrapper). Chọn mục vẫn qua `onMouseDown` + `preventDefault` để ô nhập giữ focus.
   - Tự lấp khung: sau mỗi lần `allItems`/`loading` đổi, nếu `scrollHeight ≤ clientHeight + 1` và `hasMore` và không
     đang tải thì `loadPage(page + 1)` — không thì với khung 320px trang đầu 8 dòng không bao giờ sinh thanh cuộn và
     `onScroll` không bao giờ bắn (A-05).
2. **`CrudFormDialog` bỏ `bodyClassName="overflow-visible"`** (T-01-02, ADR-02). Body modal về `overflow-auto` mặc
   định ⇒ form entity cây cuộn lại được. Giữ `defaultWidth/Height` 720×560 và comment sửa lại cho đúng lý do.
3. **`BaseCrudService.applySorting` thêm tiebreaker `id`** (T-01-03, ADR-03). `qb.addOrderBy(alias.id, order)` sau cột
   sắp chính (bỏ qua khi cột chính đã là `id`). LIMIT/OFFSET của mọi list CRUD generic — và của picker — trở nên ổn
   định khi nhiều dòng trùng `created_at` (seed chèn một lần). Phát hiện khi chạy bằng chứng AC-02 (A-09).

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Trích `useAnchoredPopover` từ `LookupField` rồi dùng cho cả hai | Đụng `LookupField` (10 host: dialog phiếu nhập/xuất, chọn kho, tạo hàng hoá…) chỉ để sửa một defect; hồi quy rộng hơn defect. Có thể làm sau khi cả hai đã ổn (A-02) |
| Thay dropdown bằng Radix `Popover`/`Command` của `@erp/ui` | Radix Popover đổi mô hình focus: `PopoverContent` lấy focus khỏi ô nhập, gõ tìm kiếm bị ngắt; cần `onOpenAutoFocus` + `modal={false}` và xử lý lại IME — không phải sửa nhỏ |
| Tăng chiều cao modal / `overflow-visible` sâu hơn (bỏ `overflow-hidden` ở AppModal) | `AppModal` dùng chung toàn backoffice; `contain: paint` vẫn cắt ở mép dialog; và cách này đã thất bại ở #282 |
| `position: fixed` không portal | Vẫn nằm trong `contain: layout paint` của dialog và trong `overflow-hidden` của lớp bọc body ⇒ vẫn bị cắt |
| Tăng `PAGE_SIZE` lên 20 để trang đầu luôn tràn khung | Vẫn hỏng nếu bộ lọc trả < 20 mục mà tổng > 20 (không xảy ra với 34 mục chi nhưng `excludeId` và cây cha đã làm số dòng hiển thị lệch số dòng tải); auto-fill đúng trong mọi trường hợp |
| Chỉ vá riêng dialog Danh mục thu chi | Cùng picker bị cắt ở mọi dialog CRUD có field `relation` (A-01) |
| Picker gửi `sortBy=id` thay vì sửa API | Chỉ picker ổn định; bảng CRUD generic và mọi client khác của `/records` vẫn lặp/bỏ dòng khi trùng `created_at` |
| Sort theo `(createdAt, code)` | `code` không có hoặc không unique ở mọi entity đăng ký; `id` là PK uuid của tất cả |

## Domain model

Không đổi. Không có schema, không có API.

## Contracts

Không đổi. `TreeSelectInputProps` giữ nguyên chữ ký; không thêm prop. Request dropdown vẫn là
`GET /admin/entities/{entityKey}/records?page&pageSize=8&search&filters`.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| `open`, `inputText`, `allItems`, `paging` | `TreeSelectInput` (không đổi) | Đời sống component |
| `rect` (top/left/width/maxHeight), `portalTarget` | `TreeSelectInput`, thêm mới | Chỉ khi `open`; reset `null` khi đóng |
| Danh sách gợi ý | Fetch trực tiếp qua `erpApi`, không TanStack Query (không đổi) | Mỗi lần mở |

## Error taxonomy

| Condition | Where | Behaviour |
| --- | --- | --- |
| Không tìm thấy `[role="dialog"]` tổ tiên | đo/portal | Portal vào `document.body`, toạ độ viewport (trang tạo hàng hoá, AC-08) |
| Chỗ trống dưới và trên đều < 140px | đo | Ưu tiên phía rộng hơn, `maxHeight` kẹp ở 140px — vẫn cuộn được |
| Ô nhập cuộn ra khỏi vùng nhìn body modal khi danh sách đang mở | scroll (capture) | Đo lại, popover đi theo ô nhập; `contain: paint` của dialog cắt phần tràn ngoài dialog — chấp nhận, như LookupField |
| Click vào popover (portal, ngoài `wrapRef`) | handler `mousedown` | Nhận diện qua `popoverRef` ⇒ không đóng; AppModal nhận diện qua `data-lookup-popover` / `[role="dialog"]` ⇒ không đóng dialog |
| Radix Popover host (`StockSummaryFilterPopover`) | portal vào `PopoverContent` (`role="dialog"`) | Click nằm trong `DismissableLayer` ⇒ panel không đóng (AC-07) |
| Fetch lỗi | `loadPage` | Như cũ: nuốt lỗi, danh sách trống |
| Auto-fill lặp vô hạn | effect tự lấp | Guard: chỉ khi `hasMore && !loading`; mỗi trang mới đổi `loaded` ⇒ dừng khi `loaded ≥ total` hoặc khung đã tràn |
| Nhiều dòng trùng `createdAt` khi phân trang | `applySorting` | Tiebreaker `id` ⇒ thứ tự toàn phần, hai trang liên tiếp rời nhau (T-01-03) |

## Observability

Không thêm log. Bằng chứng là ảnh chụp ai-dlc-verify ở hai viewport và demo tay.

## ADRs

### ADR-01 — Dropdown của `TreeSelectInput` render qua portal + `position: fixed`, chép cơ chế `LookupField`, không trích hook chung
**Context:** Danh sách `absolute` bị mọi tổ tiên `overflow`/`contain: paint` cắt; `AppModal` và Radix Popover đều là
tổ tiên như vậy. `LookupField` cùng thư mục đã có cách đo/portal/guard hoạt động ổn với chính `AppModal`.
**Decision:** Thêm vào `TreeSelectInput` khối đo `rect` + `portalTarget` (`useLayoutEffect` khi `open`), render popover
bằng `createPortal` với `data-lookup-popover`, `zIndex: 70`, `pointerEvents: "auto"`; click-ngoài xét cả
`popoverRef`; thêm effect tự tải trang tiếp khi khung chưa tràn. Không sửa `LookupField`, không tạo hook chung.
**Consequences:** ~60 dòng lặp lại giữa hai component; đổi hằng số (gap, margin, min/max height) phải đổi hai chỗ. Đổi
lại, diff chỉ nằm trong file bị lỗi và mọi host của `TreeSelectInput` được sửa cùng lúc. Trích hook chung là việc
riêng, làm khi cả hai đã ổn định.
**Status:** accepted — Akenzy chọn "Chép LookupField vào TreeSelectInput", 22/09/2026

### ADR-02 — Bỏ `overflow-visible` ở `CrudFormDialog`, giữ 720×560
**Context:** `bodyClassName="overflow-visible"` (#282) không thoát được `overflow-hidden` của lớp bọc body và
`contain: paint` của dialog, nhưng bỏ mất `overflow-auto` ⇒ form không cuộn.
**Decision:** Xoá prop đó; body về mặc định `overflow-auto`. Giữ `defaultWidth/Height` 720×560 cho entity cây.
**Consequences:** Form entity cây cuộn lại được ở màn hình thấp. Dropdown không còn phụ thuộc body vì đã portal (ADR-01).
**Status:** accepted — Akenzy duyệt cùng plan, 22/09/2026

### ADR-03 — `applySorting` luôn thêm `id` làm tiebreaker
**Context:** `ORDER BY createdAt` không phải thứ tự toàn phần: seed chèn cả bộ mục trong một câu nên 19 dòng cùng
timestamp; Postgres trả các dòng trùng theo thứ tự tuỳ ý cho mỗi LIMIT/OFFSET ⇒ trang lặp và bỏ dòng. Picker
`mergeItems` khử trùng theo id nên triệu chứng là "thiếu một mục" (CHI_CCDC), không phải "lặp".
**Decision:** `qb.addOrderBy(\`${alias}.id\`, order)` ngay sau `orderBy`, trừ khi `sortBy` đã là `id`. Không đổi
DTO, không đổi contract, không regenerate api-client.
**Consequences:** Mọi list `/admin/entities/*/records` phân trang ổn định. Thứ tự giữa các dòng trùng cột chính giờ
theo uuid (ngẫu nhiên nhưng cố định) thay vì tuỳ ý — không ai đang dựa vào thứ tự đó vì nó vốn không xác định.
Subclass override `applySorting` (nếu có) không được sửa ở đây.
**Status:** accepted — Akenzy chọn "Thêm T-01-03 vào plan này", 22/09/2026
