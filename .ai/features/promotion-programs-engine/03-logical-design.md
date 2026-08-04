---
feature: promotion-programs-engine
adr_count: 5
---

# Logical design — Khuyến mại

Thiết kế chi tiết (ERD đầy đủ 7 bảng, sequence diagram, pseudo-code từng strategy, bảng truy
vết FR/BR, ma trận tính năng theo hình thức) nằm ở **`docs/26-promotion-design.md`** — 11 mục,
đã duyệt ở TKT-KM-01. File này **không chép lại**; nó ghi phần AI-DLC cần: hình dạng đã chọn,
cái đã loại, taxonomy lỗi, và các quyết định khó đảo.

## Approach

Bốn tầng, phụ thuộc luôn hướng vào trong. `modules/promotion/` là module **đầu tiên** trong
repo phân lớp clean architecture (ADR-01):

```
domain/          thuần TS — cấm import @nestjs/* và typeorm
  model/         aggregate PromotionProgram + value object + kiểu dữ liệu engine
  ports/         3 Symbol token + interface (repository, catalog reader, customer reader)
  engine/        PromotionResolver + CartState + 5 strategy + condition evaluator
application/     CQRS handler (5 command, 4 query), DTO, mapper entity↔domain
infrastructure/  7 TypeORM entity, repository + 2 reader — nơi duy nhất biết TypeORM tồn tại
interface/       2 controller v2
```

Ba quyết định định hình toàn bộ phần còn lại:

1. **Schema chuẩn hóa thay cho `jsonb`.** 7 bảng mới (`promotion_programs` + `groups` +
   `lines` + `tiers` + `conditions` + 2 bảng nối), 15 pg enum. Đổi lại: mọi câu hỏi kiểu
   "SKU nào đang được khuyến mại" trả lời được bằng index
   `(organization_id, target_type, target_id)`, và mọi trường sai kiểu lộ ở migration chứ
   không lộ lúc runtime.
2. **Engine là hàm thuần.** `PromotionResolver.resolve(programs, cart)` không I/O, không
   async, không đọc `Date.now()` — thời điểm luôn đến từ `cart.at`. Nhờ vậy AC-01…AC-09
   kiểm chứng được bằng unit test chạy trong mili-giây, và cùng input luôn cho cùng output.
3. **Ba pha, ba loại tài nguyên.** Resolver duyệt CTKM theo `priority ASC, createdAt ASC` qua
   ba pha: cấp dòng (`ITEM_DISCOUNT`, `TIERED_DISCOUNT`) → quà (`GIFT_ITEM`, `BUY_M_GET_N`,
   giành chung một slot) → cấp hóa đơn (`INVOICE_DISCOUNT`, một slot). `CartState` giữ ba
   nhóm tài nguyên đó. Đây là hiện thực trực tiếp của BR-001 + BR-002.

Ghi cùng aggregate là một transaction: upsert program → xóa sạch bảng con → insert lại
(delete-then-insert), vì form luôn gửi trọn gói.

Đọc để tính khuyến mại là `1 + 6 + 2` truy vấn cố định: danh sách CTKM active (lọc thô ở SQL:
status, khoảng ngày, branch scope) + 6 bảng con hydrate song song + catalog (items,
categories). Thứ/giờ/phạm vi khách **không** lọc ở SQL — đó là việc của domain.

## Alternatives rejected

| Option | Why not |
|---|---|
| Giữ `jsonb` và mở rộng `PromotionApplyService` | Không có kiểu, không index được theo SKU, không validate được theo hình thức; 5 hình thức trộn trong một cột là nơi mọi lỗi im lặng sinh ra |
| Dùng generic CRUD platform (`BaseCrudService`) cho CTKM | Aggregate 7 bảng, validate phân nhánh theo `type`, và một engine tính tiền — vượt xa những gì `BaseCrudService` mô tả được. Voucher thì ngược lại: một bảng phẳng, giữ ở tầng service |
| Cộng dồn nhiều CTKM trên cùng một dòng | Số tiền cuối phụ thuộc thứ tự cộng, khách và thu ngân không giải thích được; MISA cũng không làm vậy |
| Tự chọn tổ hợp "có lợi nhất cho khách" | Bài toán tối ưu tổ hợp, chạy chậm và không tái lập được; marketing mất quyền điều khiển bằng `priority` |
| Một service `PromotionService` phình to thay cho `CommandBus` | Một lần ghi đụng 7 bảng với nhánh validate khác nhau theo `type`; 5 handler tách rời test dễ hơn hẳn |
| Discriminated union DTO (`@ApiExtraModels`) theo `type` | OpenAPI generator sinh type khó dùng ở FE, trong khi form FE vốn là một `ProgramFormState` phẳng. Chọn một DTO phẳng + `@ValidateIf` |
| `LEFT JOIN` + `GROUP BY` cho branch scope | Nhân dòng. Dùng `NOT EXISTS (…) OR EXISTS (…)` |
| Recursive CTE để dựng đường dẫn nhóm cha | Nạp cây nhóm một lần cho org rồi dựng path trong RAM rẻ hơn và test được; chặn chu trình bằng bound độ sâu 50 |
| Cache Redis cho `evaluate` ngay từ đầu | Chưa có số đo. Vài chục CTKM/org với index là đủ; thêm cache sau là thay đổi cục bộ (A-21) |
| Đặt FK trên `promotion_lines.target_id` | Polymorphic trên 3 bảng — không có FK nào đúng cho cả ba |
| Xóa hoặc migrate bảng `promotions` cũ trong epic này | POS checkout vẫn đọc nó; drop là migration riêng sau khi xác nhận hết dữ liệu |

## Domain model

| Entity | Vai trò | Ghi chú |
|---|---|---|
| `PromotionProgram` | Aggregate root | Bất biến (`readonly`); `create()` chạy toàn bộ invariant BR-004 rồi trả instance; không có setter công khai |
| `PromotionGroup` | Nhóm lưới | Hình thức khác `TIERED_DISCOUNT` có đúng 1 group ngầm `ordinal = 0` |
| `PromotionLine` | Dòng lưới | `role = CONDITION \| REWARD`; `targetType` polymorphic `PRODUCT \| ITEM \| CATEGORY` |
| `PromotionTier` | Bậc thang | Chỉ `TIERED_DISCOUNT`; `to` null = ∞ |
| `PromotionCondition` | Tab điều kiện | 0..1 mỗi program; dùng chung bởi 3 hình thức có tab điều kiện |
| `TimeWindow` / `DateWindow` / `CustomerScope` | Value object | Ca qua đêm, biên null, 4 chế độ sinh nhật kể cả quấn vòng năm |
| `roundVnd` | Value object | Một nơi duy nhất làm tròn về đồng |
| `CartContext` / `CartLine` | Input engine | `unitPrice` lấy từ request (giỏ có thể sửa giá tay), `catalog` là `Map` nạp sẵn |
| `PromotionEvaluation` | Output engine | Thuần data: `appliedPrograms`, `availablePrograms`, `skippedPrograms` + 3 số tổng |

## Contracts

8 route `/v2/promotions/*` + 5 route `/v2/vouchers/*`, hợp đồng đầy đủ trong
`packages/api-client/src/generated/schema.ts` (sinh tự động) và `docs/26-promotion-design.md`
§2/§4. Điểm cần nhớ:

- `POST /v2/promotions/evaluate` — **đọc thuần, không ghi bảng nào**. Nhận `{ lines[],
  customerId?, at?, selectedProgramIds[] }`, trả `{ subtotal, promotionDiscount,
  amountAfterPromotion, appliedPrograms[], availablePrograms[], skippedPrograms[] }`.
  `lineId` do client cấp được echo nguyên vẹn trong `lineDiscounts` để client map ngược.
- `client không gửi code` — `create` tự sinh qua `DocumentNumberingService.generate(
  DocumentType.PROMOTION, …)`, prefix `KM`.
- Guard: `PermissionGuard` cấp class + `@RequirePermission` từng method
  (`promotion.read` / `promotion.write` / `promotion.delete`); `AuthGuard` đã đăng ký toàn cục
  qua `APP_GUARD`. `evaluate` thêm `BranchScopeGuard` — thiếu `X-Branch-Id` là **403**.

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| Aggregate CTKM | `promotion_programs` + 6 bảng con, ghi trọn gói qua `TypeormPromotionRepository` | Bền vững |
| Tài nguyên đã bị chiếm khi tính (dòng / slot quà / slot hóa đơn) | `CartState`, dựng mới mỗi lần `resolve()` | Trong một lần gọi |
| Danh sách + form ở backoffice | TanStack Query, key bắt đầu bằng tên tài nguyên và chứa mọi filter | Màn hình |
| Bộ lọc, phân trang, biến thể form đang chọn | State cục bộ của page | Màn hình |
| Kết quả evaluate | Không lưu ở đâu cả — tính lại mỗi lần gọi | Một request |

**Không** đặt dữ liệu server vào Zustand.

## Error taxonomy

Hai họ lỗi tách bạch: *chương trình không chạy* (không phải lỗi, phải giải thích được) và
*yêu cầu sai* (lỗi thật, trả 4xx).

### Chương trình không chạy — `skippedPrograms[].reason`, union có kiểu

| Reason | Điều kiện | Hiển thị |
|---|---|---|
| `STOPPED` | `status = STOPPED` | "Đã ngừng theo dõi" |
| `DATE_WINDOW` | `at` ngoài `[startDate, endDate]` | "Ngoài thời gian áp dụng" |
| `DAY_OF_WEEK` | `at` không thuộc `daysOfWeek` | "Không áp dụng cho hôm nay" |
| `TIME_OF_DAY` | `at` ngoài `[startTime, endTime]`, có xử lý ca qua đêm | "Ngoài khung giờ áp dụng" |
| `BRANCH_SCOPE` | Chi nhánh hiện tại không thuộc `promotion_branches` | "Không áp dụng cho chi nhánh này" |
| `CUSTOMER_SCOPE` | Khách không khớp `applyTo` | "Không áp dụng cho khách hàng này" |
| `CONDITION_NOT_MET` | Điều kiện áp dụng chưa thỏa, hoặc strategy không tính ra kết quả | "Chưa đủ điều kiện" |
| `RESOURCE_TAKEN` | Tài nguyên đã bị CTKM ưu tiên cao hơn chiếm; kèm `takenBy` | "Đã áp dụng chương trình khác" |
| `NOT_SELECTED` | `autoApply = false` và id không có trong `selectedProgramIds` | "Chưa được chọn áp dụng" |

Bất biến: **không CTKM nào biến mất im lặng** — mọi chương trình được nạp mà không nằm trong
`appliedPrograms` phải có đúng một dòng ở đây.

### Yêu cầu sai — HTTP

| Điều kiện | Mã | Body |
|---|---|---|
| Vi phạm invariant BR-004 khi tạo/sửa | 400 | `{ message, issues: [{ field, code, message }] }` — **toàn bộ** lỗi một lần, không dừng ở lỗi đầu |
| Đổi `type` khi sửa | 400 | `PROMOTION_TYPE_IMMUTABLE` |
| `itemId` không tồn tại trong giỏ evaluate | 400 | `{ code: 'UNKNOWN_ITEM', itemIds: [...] }` |
| `customerId` không tồn tại | 400 | `{ code: 'UNKNOWN_CUSTOMER' }` |
| `lines` rỗng | 400 | `@ArrayMinSize(1)` |
| Trùng mã voucher trong tổ chức | 409 | `ConflictException`, gắn vào trường `Voucher` ở FE |
| Cùng `X-Idempotency-Key`, body khác | 409 | Từ `IdempotencyInterceptor` toàn cục |
| Thiếu `X-Branch-Id` ở `evaluate` | 403 | Từ `BranchScopeGuard` |
| CTKM của tổ chức khác, hoặc đã xóa mềm | 404 | Không phải 403 — không tiết lộ sự tồn tại |

`code` của `issues[]` là hằng, không phải chuỗi tự do: `NAME_REQUIRED`,
`END_DATE_BEFORE_START_DATE`, `DISCOUNT_VALUE_NOT_POSITIVE`, `PERCENT_OVER_100`,
`TIER_RANGE_INVALID`, `TIER_RANGE_OVERLAP`, `TIERS_EMPTY`, `REWARD_LINES_EMPTY`,
`CUSTOMER_GROUP_IDS_EMPTY`, `CARD_TIER_ID_REQUIRED`, `BUY_QUANTITY_INVALID`,
`GIFT_QUANTITY_INVALID`. FE gắn từng `field` vào đúng ô nhập.

**Dữ liệu hỏng thì im lặng, dữ liệu client sai thì kêu:** target không resolve được trong
`cart.catalog` (item đã xóa) bị bỏ qua không ném lỗi; nhưng `itemId` client gửi lên mà không
tồn tại thì trả 400 — im lặng ở đây sẽ ra số tiền sai.

## Cache & offline

Không có cache và không có chế độ offline. `evaluate` đọc thẳng DB mỗi lần gọi (A-21).
Backoffice là SPA online-only; TanStack Query giữ cache trong phiên và invalidate theo prefix
`["promotions"]` / `["vouchers"]` sau mỗi mutation.

## Observability

- Không phát và không tiêu thụ event Kafka nào — chưa có consumer nào cần (quyết định của epic).
- `skippedPrograms` chính là công cụ chẩn đoán chính: một lần gọi `evaluate` tự nói ra vì sao
  từng CTKM không chạy, không cần bật log.
- Idempotency quan sát qua header `X-Idempotency-Status: REPLAYED`.
- Lỗi 400 mang `issues[]` có `field` + `code`, đủ để dựng thống kê "trường nào người dùng hay
  nhập sai" mà không cần thêm telemetry.

## ADRs

### ADR-01 — `modules/promotion/` phân lớp clean architecture, phần còn lại của repo thì không
**Context:** Chưa module nào trong repo phân lớp. Logic khuyến mại là logic tính tiền thuần,
cần test được mà không cần DB hay Nest container; đồng thời repo không có nhu cầu (và không có
ngân sách) refactor toàn bộ sang clean architecture.
**Decision:** `modules/promotion/` dùng `domain/ · application/ · infrastructure/ · interface/`,
domain cấm import `@nestjs/*` và `typeorm`, phụ thuộc ra ngoài qua port + Symbol token. Các
module khác **giữ nguyên** layout phẳng hiện có.
**Consequences:** Nhiều file hơn và một lớp mapper entity↔domain phải bảo trì. Đổi lại engine
unit-test được trọn vẹn. Hai kiểu tổ chức code cùng tồn tại trong repo — đã ghi vào
`.ai/architecture.md` để người mới không tưởng đây là chuẩn chung, cũng không "chuẩn hóa"
promotion về phẳng.
**Status:** accepted

### ADR-02 — Dùng `CommandBus` cho đường ghi, lệch với skill `cqrs-search-endpoint`
**Context:** `.claude/skills/cqrs-search-endpoint/SKILL.md` ghi *"CQRS commands are not used in
this repo; keep writes in services"*. Nhưng một lần ghi CTKM đụng 7 bảng trong cùng transaction
với nhánh validate khác nhau theo `type`.
**Decision:** Dùng `CommandBus` cho 5 mutation. Query vẫn theo khuôn `QueryBus` sẵn có.
**Consequences:** Lệch một quy ước đã ghi thành văn — phải nêu rõ ở epic và ở đây để lần review
sau không coi là nhầm lẫn. Idempotency **không** đổi: `IdempotencyInterceptor` toàn cục chặn ở
tầng HTTP, độc lập CQRS. Nếu module sau cũng cần, cân nhắc sửa skill thay vì lặp lại ngoại lệ.
**Status:** accepted

### ADR-03 — BR-001: first-match-wins theo từng tài nguyên
**Context:** Nhiều CTKM có thể cùng khớp một giỏ hàng. Ba lựa chọn: cộng dồn, tối ưu "có lợi
nhất cho khách", hoặc chọn một cái theo thứ tự.
**Decision:** Sắp theo `priority ASC, createdAt ASC`; mỗi *dòng hàng*, *slot giảm giá hóa đơn*
và *slot quà* là một tài nguyên; CTKM đầu tiên khớp chiếm tài nguyên đó, CTKM sau bỏ qua kèm
`reason = RESOURCE_TAKEN` và `takenBy`.
**Consequences:** Kết quả tái lập được và giải thích được tại quầy; marketing điều khiển bằng
`priority`. Khách **không** luôn được mức giảm tốt nhất — đây là đánh đổi có chủ ý, đổi lấy
tính giải thích được. Đảo quyết định này nghĩa là viết lại resolver và mọi AC tính tiền.
**Status:** accepted

### ADR-04 — Không đụng bảng `promotions` cũ và `PromotionApplyService`
**Context:** Lớp khuyến mại cũ (`promotions` jsonb, `discount_codes`, `invoice_promotions`,
`PromotionApplyService`) đang được POS checkout dùng. Schema mới không tương thích ngược.
**Decision:** Dựng schema mới song song, không migrate dữ liệu, không sửa lớp cũ. POS vẫn chạy
đường cũ cho tới epic tích hợp.
**Consequences:** Hai lớp khuyến mại cùng tồn tại một thời gian — phải nói rõ trong
`.ai/architecture.md` lớp nào đang frozen, nếu không sẽ có người sửa nhầm. Drop bảng cũ là một
migration riêng sau khi xác nhận hết dữ liệu. Đổi lại: epic này không có rủi ro làm vỡ POS.
**Status:** accepted

### ADR-05 — `promotion_lines.target_id` polymorphic, không FK
**Context:** Một dòng lưới có thể trỏ tới `items`, `products` hoặc `inventory_item_categories`
tùy `target_type`.
**Decision:** Không đặt FK trên `target_id`. Thêm index `(organization_id, target_type,
target_id)`. Engine bỏ qua im lặng target không resolve được.
**Consequences:** Mất kiểm tra toàn vẹn tham chiếu ở tầng DB — xóa một item không dọn dòng
khuyến mại trỏ tới nó, và CTKM sẽ lặng lẽ không áp cho item đó. Bù lại: `GET` trả
`targetName: null` chứ không loại dòng, để người dùng thấy và tự sửa; và không có FK nào chặn
việc xóa item. Index nói trên là index trả lời câu "SKU nào đang được khuyến mại".
**Status:** accepted
