---
feature: inventory-qa-defects
adr_count: 4
---

# Logical design — inventory-qa-defects

## Approach

Bốn lỗi độc lập, bốn lát dọc, không lát nào chặn lát nào. Điểm chung duy nhất về mặt kỹ thuật là
cả bốn đều **sửa ở tầng đọc**: không migration, không đổi schema, không đụng dữ liệu đã ghi.

- **D1** sửa trong `StockSummaryService`: khối "pending-only" đang là một truy vấn thứ hai chạy
  song song rồi ghép vào mảng kết quả **sau** khi đã lọc và cắt trang. Cách sửa là cho nó chịu
  cùng bộ điều kiện, rồi gộp **trước** khi cắt trang (ADR-01).
- **D2** sửa một dòng trong `counterpartyNameSql` — ép `u.organization_id::text` — cộng một chỗ
  độc lập trong `TRANSPORTER_NAME_SUBQUERY`. Ba màn hình được sửa bằng cùng một thay đổi vì chúng
  dùng chung hàm (ADR-04).
- **D3** tổng quát hoá `sortRowsBySku` thành một comparator theo khoá. `packages/ui` không đổi:
  cơ chế sắp xếp controlled đã có sẵn từ `1e333745`.
- **D4** thêm bộ lọc **tuỳ chọn** vào `getBalances` và siết guard trong nhánh (a) của bộ giải vị
  trí, rồi để từng picker tự khai báo (ADR-02, ADR-03). Cố ý không sửa gốc dữ liệu (A-05).

## Alternatives rejected

| Option | Why not |
| ------ | ------- |
| Bỏ hẳn khối "sắp nhận về" khi có bất kỳ bộ lọc nào (D1) | Gõ đúng mã một SKU đang trên đường về sẽ không thấy dòng nào — dễ bị đọc thành "hết hàng". Akenzy loại 03/09 (A-03). |
| Chỉ sửa khoá chống trùng, giữ nguyên phần lọc (D1) | Chỉ sửa được một nửa lỗi: `TXV6079` vẫn còn vì nó chưa bao giờ đi qua bộ lọc. |
| Thêm `loc.is_active = true` vô điều kiện vào `getBalances` (D4) | Cùng endpoint phục vụ trang "Chi tiết vị trí", nơi bộ lọc "Tất cả" **phải** đọc được dòng đã ngừng. Sẽ vi phạm AC-22 (A-07). |
| Lọc phía client trong `toLocationOptions` (D4) | DTO của `getBalances` (`stock-ledger.service.ts:624-630`) không trả `location.isActive`, nên client không có dữ liệu để lọc. |
| `AND sb.is_tracked = true` dạng inner join ở nhánh (a) (D4) | Cắt mất ca "đã gán kệ nhưng chưa từng nhận hàng" mà `isBalanceTracked` cố ý cho phép — đẻ ra lỗi mới nặng hơn (A-06, AC-19). |
| Xoá liên kết `item_storage_locations` khi Ngừng theo dõi + migration dọn (D4) | Sửa tận gốc nhưng đụng dữ liệu. Akenzy chọn "chỉ chặn ở chỗ đọc" 03/09 (A-05). |
| Migration chuẩn hoá `organization_id` về `uuid` toàn schema (D2) | Đúng gốc, nhưng đụng mọi bảng ERP kế thừa `BaseEntity`. Vượt xa một đợt vá lỗi. |
| Ép kiểu tại từng call-site thay vì trong hàm dùng chung (D2) | Bốn chỗ hôm nay, chỗ thứ năm viết sau này sẽ lại quên — đúng cách mà lỗi này đã sinh ra. |
| Sắp xếp nhiều cột ở In tem mã (D3) | `LineGridSort` là một khoá đơn. Muốn "SKU trong Vị trí" thì làm tiebreaker trong comparator, không phải hai state sort. Ngoài phạm vi. |

## Domain model

Không entity mới. Ba cột đã tồn tại mang toàn bộ ngữ nghĩa, và việc phân biệt chúng là mấu chốt
của D4:

| Khái niệm | Bảng.cột | Nhãn UI | Hạt |
| --------- | -------- | ------- | --- |
| Vị trí bị vô hiệu hoá | `locations.is_active = false` | "Ngưng hoạt động" | cả kệ, cho mọi mặt hàng |
| Mặt hàng dừng ở một kệ | `stock_balances.is_tracked = false` | "Ngưng theo dõi" | một cặp (mặt hàng × kệ) |
| Kệ ưu tiên | `item_storage_locations` | — | một (mặt hàng × kho) → một kệ; **không có cột trạng thái** |

`item_storage_locations` là con trỏ trần, và `setBalanceTracking` không bao giờ dọn nó — đó là
nguồn của auto-fill sai. Đợt này chặn ở chỗ đọc chứ không dọn con trỏ (A-05).

## Contracts

### POST /v2/inventory/stock/summary/search
Không đổi hợp đồng. Đổi hành vi: dòng "sắp nhận về" nay chịu cùng `search` / bộ lọc cột /
`isActive` như dòng thường, và `total` phản ánh đúng tập đã lọc.

### GET /inventory/stock/balances
Thêm **một tham số tuỳ chọn**, mặc định giữ nguyên hành vi cũ:

```
locationIsActive?: boolean   // không truyền = như hiện tại, trả cả vị trí đã ngưng hoạt động
```

Và bổ sung một trường vào mỗi dòng trả về:

```jsonc
{ "location": { "id": "...", "code": "E03.01", "name": "E03.01", "isActive": false } }
```

Caller cũ không truyền gì thì không thấy khác biệt (yêu cầu Tương thích ở `02-requirements.md`).

### POST /v2/inventory/items/resolve-locations
Không đổi hợp đồng. Đổi hành vi ở nhánh (a): bỏ qua kệ mà cặp (mặt hàng, kệ) đã `is_tracked = false`,
và sắp thứ tự tất định thay cho `.getOne()` không `orderBy`.

## State ownership

| State | Owner | Lifetime |
| ----- | ----- | -------- |
| Sắp xếp bảng In tem mã (`LineGridSort`) | `InventoryItemBarcodesPage` state | Màn hình; không sống qua điều hướng |
| Bộ lọc đã áp ở Tổng hợp tồn kho | `InventoryManagementPage` `applied` state | Màn hình, reset `page: 1` khi áp |
| Danh sách vị trí của một mặt hàng | TanStack Query `["item-stock-balances", itemId, branchId]`, `staleTime: 60s` | Cache trang |

## Error taxonomy

| Condition | Failure | UI |
| --------- | ------- | -- |
| Lệch kiểu `uuid = varchar` trong biểu thức lọc | Postgres `42883` → 500 `INTERNAL_ERROR` | Hiện tại: toast "Máy chủ gặp sự cố" + lưới trắng (`user-facing-api-error.ts:120`). Sau khi sửa: không còn phát sinh. |
| Không có vị trí nào hợp lệ để tự điền | `source: 'none'`, `locationId: null` — không phải lỗi | Ô "Vị trí" để trống, người dùng tự chọn; **không** được rơi về kệ đã ngừng |
| Mặt hàng chưa chọn kho | — | Ô "Vị trí" `disabled` như hiện tại (`BarcodeLabelGrid.tsx:248`) |
| Khối pending không trả dòng nào sau khi lọc | Tập rỗng, không phải lỗi | Lưới chỉ hiện dòng tồn thật |

## Cache & offline

Không có offline. Một điểm cần nhớ: cache `["item-stock-balances", itemId, branchId]` sống 60s và
**không** chứa `storageId` trong khoá — `toLocationOptions` lọc theo kho ở phía client. Thêm bộ lọc
vị trí ở phía server nghĩa là khoá cache phải mang theo tham số mới, nếu không hai màn dùng chung
cache sẽ đọc nhầm của nhau.

## Observability

Không thêm event Kafka, không thêm metric. Bằng chứng của đợt này là test và ảnh chụp màn hình
(`07-verification.md`). D2 đặc biệt cần log truy vấn thật: lỗi hiện tại chỉ hiện ra ở tầng Postgres,
không ở tầng NestJS.

## ADRs

### ADR-01 — Gộp dòng "sắp nhận về" trước khi cắt trang, không ghép sau
**Context:** Khối pending hiện chạy như truy vấn thứ hai rồi `data.push(...)` vào mảng đã
`LIMIT/OFFSET` (`stock-summary.service.ts:575-618`), kèm `total += appended`. Kiến trúc này không
thể đúng: trang 1 phồng quá `pageSize`, trang ≥2 mất hẳn khối đó (`page === 1` ở `:314`), và
`total` không bao giờ khớp với số dòng duyệt được.
**Decision:** Cho truy vấn pending chịu cùng bộ điều kiện với `buildBaseQuery` (`search`,
`categoryId`, `item.is_active`, `brand`, `unit`, bộ lọc cột), rồi gộp vào tập kết quả **trước** khi
cắt trang — dùng lại đúng đường phân trang trong bộ nhớ mà file này đã có sẵn cho
`needsDerivedFilter` (`:621-666`, `data.slice((page-1)*pageSize, page*pageSize)`).
**Consequences:** Khi có hàng đang về, endpoint materialise toàn bộ tập đã lọc thay vì chỉ một
trang — cùng chi phí mà nhánh `needsDerivedFilter` đã chấp nhận từ trước. Đổi lại `total`, số dòng
mỗi trang và tổng footer nhất quán trên mọi trang. Phải đo lại thời gian phản hồi (T-01-02).
**Status:** accepted

### ADR-02 — Bộ lọc vị trí ở `getBalances` là tuỳ chọn, do caller khai báo
**Context:** `GET /inventory/stock/balances` phục vụ hai loại người dùng đối nghịch: picker (chỉ
muốn thấy vị trí dùng được) và trang "Chi tiết vị trí" (bộ lọc "Tất cả" **phải** thấy dòng đã ngừng
— `ItemLocationDetailsQuery.ts:46-51`).
**Decision:** Thêm tham số tuỳ chọn `locationIsActive`, giữ mặc định như cũ, và trả thêm
`location.isActive` trong DTO. Picker In tem mã truyền `isTracked=true` + `locationIsActive=true`;
trang quản trị không truyền gì.
**Consequences:** Mỗi picker mới phải nhớ khai báo — đúng loại nợ mà A-05 đã chấp nhận khi chọn
"chỉ chặn ở chỗ đọc". Bù lại không caller cũ nào đổi hành vi. Khoá cache TanStack Query phải mang
theo tham số mới.
**Status:** accepted

### ADR-03 — Guard nhánh (a) là "chưa có balance HOẶC đang theo dõi"
**Context:** Nhánh (a) của `resolve-item-locations.handler.ts:102-115` lấy kệ ưu tiên và chỉ kiểm
`loc.is_active`, nên con trỏ cũ trỏ vào E03.01 thắng trước khi nhánh (b) kịp chọn A07.02 theo tồn
cao nhất.
**Decision:** Loại kệ bằng `NOT EXISTS (balance của cặp đó với is_tracked = false)`, **không** phải
inner join `is_tracked = true`. Thêm `ORDER BY` tất định thay cho `.getOne()` trần, và bổ sung
`isActive: true` cho nhánh dự phòng `isUnassigned` ở `:90-92` (nhánh `isDefault` ở `:86` đã có).
**Consequences:** Giữ đúng ca "đã gán kệ nhưng chưa từng nhận hàng" mà `isBalanceTracked`
(`inventory-location-stock.service.ts:1109-1119`) cố ý cho phép — nếu dùng inner join sẽ mất ca này
(A-06, AC-19). Ngữ nghĩa khớp với `findTrackedCandidates` đã có, nhưng không gộp chung được vì hàm
đó đọc từ `stock_balances` chứ không từ `item_storage_locations`.
**Status:** accepted

### ADR-04 — Ép kiểu trong hàm dùng chung, không ở từng call-site
**Context:** `counterpartyNameSql` được dùng ở 3 handler; `TRANSPORTER_NAME_SUBQUERY` lặp lại đúng
lỗi một cách độc lập. `BaseEntity` để `organization_id` là varchar cho mọi bảng ERP, còn
`UserEntity:17` ghi đè thành uuid — lệch này sẽ còn ở đó sau đợt sửa.
**Decision:** Sửa `u.organization_id::text = ${alias}.organization_id` ngay trong
`counterparty-name.util.ts`, và sửa riêng `TRANSPORTER_NAME_SUBQUERY`. Kèm comment nêu lý do, theo
đúng tiền lệ `search-deposit-recon-v2.handler.ts:148-155`.
**Consequences:** Ba màn hình được sửa bằng một thay đổi. `::text` làm mất khả năng dùng index trên
`users.organization_id`, chấp nhận được vì đây là truy vấn con tương quan theo `u.id` (khoá chính).
Không giải quyết gốc là lệch kiểu toàn schema — ghi nhận trong Out of scope.
**Status:** accepted
