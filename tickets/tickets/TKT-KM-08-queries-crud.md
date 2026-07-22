# TKT-KM-08 Application queries — search v2 + get by id

## Epic

[EPIC-22072026 Khuyến mại — schema chuẩn hóa, domain engine & evaluate API](../epics/EPIC-22072026-promotion-programs-engine.md)

## Summary

Tầng đọc cho màn danh sách và màn form: `POST /v2/promotions/search` (FR-001…FR-005) và `GET /v2/promotions/:id` (nạp aggregate đầy đủ cho form sửa / nhân bản). Bám đúng khuôn CQRS query đã có trong repo — `search-invoices-v2.{query,handler}.ts`.

## Deliverables

```
apps/api/src/modules/promotion/application/
├── queries/
│   ├── search-promotions-v2.{query,handler}.ts
│   └── get-promotion.{query,handler}.ts
└── dto/
    ├── promotion-search-v2.dto.ts
    └── promotion-program.response.dto.ts
```

- Bổ sung route vào `interface/promotion-v2.controller.ts`; đăng ký handler vào `providers`.

| Method | Route | Query | Permission |
| ------ | ----- | ----- | ---------- |
| POST | `/v2/promotions/search` | `SearchPromotionsV2Query` | `promotion.read` |
| GET | `/v2/promotions/:id` | `GetPromotionQuery` | `promotion.read` |

## Acceptance Criteria

- [ ] `PromotionSearchV2Dto` dùng **filter sub-DTO có sẵn** (`common/filters/filter.dto.ts`), không tự chế toán tử:
  - `name`, `description` → `StringFilterDto` (5 toán tử của FR-003 map thẳng vào `StringOperator`: `CONTAINS='*'`, `EQUALS='='`, `STARTS_WITH='+'`, `ENDS_WITH='-'`, `NOT_CONTAINS='!'`)
  - `startDate`, `endDate` → `DateRangeFilterDto`
  - `type`, `status`, `applyTo` → `EnumFilterDto` (đọc bằng `dto.type?.value`)
  - `page` mặc định 1, `limit` mặc định **50** (FR-005 nói mặc định 50 dòng/trang), `@Max(200)`
- [ ] Handler lọc `organizationId` bắt buộc; branch scope theo `promotion_branches` (toàn chuỗi hoặc khớp `actor.branchId`) — **không** lọc theo `promotion_programs.branch_id` (cột đó là chi nhánh người tạo, không phải phạm vi áp dụng).
- [ ] Trả envelope `{ data, total, page, limit }` — giống mọi search v2 khác trong repo.
- [ ] Mặc định **không** lọc `status`: bộ lọc `Đang theo dõi` là mặc định của **FE** (FR-004) và hiển thị bằng chip xóa được. API không được âm thầm ẩn dữ liệu.
- [ ] Dòng danh sách trả đủ cột FR-001: `name`, `startDate`, `endDate`, `applyTo`, `type`, `description`, `status`, cộng `code` và `priority`.
- [ ] Search **không** nạp `groups/lines/tiers` (danh sách không cần) — tránh kéo hàng nghìn dòng con.
- [ ] `GET /v2/promotions/:id` nạp **trọn aggregate** trong tối đa 2 truy vấn, đủ để FE dựng lại `ProgramFormState` mà không gọi thêm.
- [ ] `GET` inline thông tin tham chiếu vào từng dòng con: mỗi `line` có `{ targetId, targetType, targetCode, targetName, unit, sellingPrice }` resolve sẵn — **không** trả map gốc dạng `{ [id]: X }`. Đây là quy ước đã chốt của repo.
- [ ] `GET` của org khác → 404. Bản ghi đã soft-delete → 404.
- [ ] `soft-deleted` không xuất hiện trong search.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- promotion` và `lint` xanh.
- [ ] Spec: mỗi filter một case; phân trang; branch scope 3 trường hợp; `GET` round-trip đủ con; cross-tenant 404.
- [ ] `@ApiProperty` đủ trên DTO; `/docs` render được.
- [ ] Không có tiếng Việt trong source backend.

## Tech Approach

Handler bám khuôn `search-invoices-v2.handler.ts` (`:21-79`) — cùng cấu trúc `QueryBuilder` → `FilterBuilder` → `orderBy/skip/take` → `getManyAndCount` → gắn thêm dữ liệu phụ bằng truy vấn thứ hai theo `IN (ids)`.

```ts
const qb = this.repo.createQueryBuilder('p')
  .where('p.organizationId = :orgId', { orgId: actor.organizationId })
  .andWhere('p.deletedAt IS NULL');

if (actor.branchId) {
  qb.andWhere(`(
      NOT EXISTS (SELECT 1 FROM promotion_branches pb WHERE pb.program_id = p.id)
      OR EXISTS (SELECT 1 FROM promotion_branches pb
                 WHERE pb.program_id = p.id AND pb.branch_id = :branchId)
    )`, { branchId: actor.branchId });
}

new FilterBuilder(qb)
  .applyString('p.name',        dto.name)
  .applyString('p.description', dto.description)
  .applyEnum('p.type',          dto.type?.value)
  .applyEnum('p.status',        dto.status?.value)
  .applyEnum('p.applyTo',       dto.applyTo?.value)
  .applyDateRange('p.startDate', dto.startDate)
  .applyDateRange('p.endDate',   dto.endDate);

qb.orderBy('p.priority', 'ASC').addOrderBy('p.createdAt', 'DESC')
  .skip((page - 1) * limit).take(limit);
```

Sắp mặc định theo `priority ASC` (không phải `createdAt DESC` như các search khác) — vì `priority` là thứ tự áp dụng thật (BR-001), người dùng cần thấy đúng thứ tự đó.

Lưu ý đã biết về `FilterBuilder.applyDateRange`: cận `to` là **bao gồm cả ngày**. Không cần xử lý thêm.

Resolve tên/mã cho `promotion_lines` trong `GET`: gom `targetId` theo `targetType` rồi 3 truy vấn `IN` (items / products / inventory_item_categories), sau đó **gắn inline vào từng dòng trong RAM**. Target không còn tồn tại → trả `targetName: null` chứ không loại dòng (người dùng cần thấy để sửa).

## Testing Strategy

- Unit với repository thật qua `DataSource` in-memory không khả thi (Postgres-specific SQL) → test filter ở mức unit bằng mock `QueryBuilder`, test hành vi thật ở e2e (TKT-KM-16).
- Bắt buộc có e2e: tạo 3 CTKM khác `priority`, gọi search, xác nhận thứ tự trả về đúng `priority ASC`.

## Dependencies

- Depends on: TKT-KM-06
- Blocks: TKT-KM-11
