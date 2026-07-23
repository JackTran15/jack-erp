# TKT-KM-06 Infrastructure — entities, repository, readers

## Epic

[EPIC-22072026 Khuyến mại — schema chuẩn hóa, domain engine & evaluate API](../epics/EPIC-22072026-promotion-programs-engine.md)

## Summary

Tầng ngoài cùng: 7 TypeORM entity ánh xạ schema của TKT-KM-02, adapter hiện thực 3 port của TKT-KM-04, và mapper entity ↔ domain model. Đây là nơi duy nhất trong module được phép biết TypeORM tồn tại.

## Deliverables

```
apps/api/src/modules/promotion/infrastructure/
├── entities/
│   ├── promotion-program.entity.ts        # @Entity('promotion_programs')
│   ├── promotion-group.entity.ts
│   ├── promotion-line.entity.ts
│   ├── promotion-tier.entity.ts
│   ├── promotion-condition.entity.ts
│   ├── promotion-branch.entity.ts
│   ├── promotion-customer-group.entity.ts
│   └── index.ts
└── repositories/
    ├── typeorm-promotion.repository.ts    # implements PromotionRepositoryPort
    ├── typeorm-catalog-reader.ts          # implements CatalogReaderPort
    └── typeorm-customer-reader.ts         # implements CustomerReaderPort
```

- `apps/api/src/modules/promotion/application/mappers/promotion.mapper.ts` — `toDomain(entities)` / `toPersistence(aggregate)`.
- `apps/api/src/modules/promotion/promotion.module.ts` — **file mới cho lớp v2** hoặc mở rộng module hiện có; đăng ký `TypeOrmModule.forFeature([...7 entity])`, `CqrsModule`, và bind port:
  ```ts
  { provide: PROMOTION_REPOSITORY, useClass: TypeormPromotionRepository },
  { provide: CATALOG_READER,       useClass: TypeormCatalogReader },
  { provide: CUSTOMER_READER,      useClass: TypeormCustomerReader },
  ```

## Acceptance Criteria

- [ ] 7 entity khớp **chính xác** migration TKT-KM-02: tên bảng, tên cột (`name:` snake_case), kiểu, nullable, default. Lệch một cột = insert nổ lúc e2e.
- [ ] `PromotionProgramEntity` extends `BaseEntity` + có `@DeleteDateColumn()`; 2 bảng nối **không** extends `BaseEntity` (chỉ PK ghép + `organizationId`) — TypeORM 0.3.28 không cho child ghi đè cột kế thừa, khai báo cột tường minh thay vì `extends`.
- [ ] Tiền dùng `@Column({ type: 'numeric', precision: 18, scale: 2 })`; đọc ra là `string`, mapper **phải** `Number()` trước khi đưa vào domain.
- [ ] `TypeormPromotionRepository.save()` ghi trọn aggregate trong **một** `dataSource.transaction`: upsert program → xóa sạch groups/lines/tiers/condition/branches/customerGroups cũ → insert lại. Không có trạng thái nửa vời khi lỗi giữa chừng.
- [ ] `findActive(orgId, branchId, at)` lọc thô ở SQL: `status = 'TRACKING'`, `deleted_at IS NULL`, `(start_date IS NULL OR start_date <= :at)`, `(end_date IS NULL OR end_date >= :at)`, và branch scope — chương trình không có dòng `promotion_branches` nào (toàn chuỗi) **hoặc** có dòng khớp `branchId`. Lọc thứ/giờ/khách hàng **không** làm ở SQL (để cho domain).
- [ ] `findActive` nạp đủ quan hệ con trong tối đa 2 truy vấn (1 lấy program + 1 lấy con theo `IN (programIds)`), không N+1.
- [ ] `TypeormCatalogReader.loadItems()` trả `categoryPathIds` gồm `categoryId` **và toàn bộ tổ tiên**. Cây `inventory_item_categories` nạp một lần cho org rồi dựng path **trong RAM** — không recursive CTE, không truy vấn mỗi item.
- [ ] `TypeormCatalogReader` chịu được cây lỗi: `parentGroupId` tạo vòng lặp thì dừng ở độ sâu 50, không treo (`ensureParentValid` hiện **không** phát hiện chu trình).
- [ ] `TypeormCustomerReader.load()` trả `{ groupId, birthDate, cardTierId }`; `cardTierId` lấy từ `membership_cards` của khách; khách không có thẻ → `undefined`, không ném lỗi.
- [ ] Mọi truy vấn lọc theo `actor.organizationId`; không rò rỉ cross-tenant.
- [ ] Domain vẫn sạch: `grep -rE "from '(@nestjs|typeorm)" .../promotion/domain/` → 0 kết quả.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- promotion` và `lint` xanh.
- [ ] Spec cho `TypeormCatalogReader` (dựng path tổ tiên, chống chu trình) và cho mapper (round-trip domain → entity → domain bằng nhau).
- [ ] Không đổi schema ngoài migration; `synchronize` vẫn `false`.
- [ ] Không có tiếng Việt trong source backend.

## Tech Approach

Mapper là chỗ dễ sai nhất — viết theo hướng round-trip và test bằng property: `toDomain(toPersistence(p))` phải `toEqual(p)`.

```ts
// typeorm-catalog-reader.ts — dựng path tổ tiên trong RAM
private buildPath(categoryId: string, byId: Map<string, ItemCategoryEntity>): string[] {
  const path: string[] = [];
  let cursor: string | undefined = categoryId;
  let guard = 0;
  while (cursor && guard++ < MAX_CATEGORY_DEPTH) {
    path.push(cursor);
    cursor = byId.get(cursor)?.parentGroupId;
  }
  return path;
}
```

`MAX_CATEGORY_DEPTH = 50` khớp với bound đã dùng ở `category-import.service.ts:779`.

`findActive` branch scope bằng `NOT EXISTS` + `EXISTS` thay vì `LEFT JOIN` + `GROUP BY` — tránh nhân dòng:

```sql
AND (
  NOT EXISTS (SELECT 1 FROM promotion_branches pb WHERE pb.program_id = p.id)
  OR EXISTS (SELECT 1 FROM promotion_branches pb
             WHERE pb.program_id = p.id AND pb.branch_id = :branchId)
)
```

Lưu ý kiểu cột: `invoices.branch_id` trong repo là `varchar`, còn `branches.id` là `uuid` — với bảng mới ta dùng `uuid` cho `promotion_branches.branch_id`, nhưng `BaseEntity.branchId` (cột `branch_id` của `promotion_programs`) là `varchar` theo base. Đừng nhầm hai cột này: cột trên `promotion_programs` chỉ là chi nhánh của người tạo, **không** phải phạm vi áp dụng.

`save()` dùng chiến lược delete-then-insert cho bảng con (giống `InvoiceService.update` với `invoice_items`) — đơn giản và đúng, vì aggregate luôn được gửi trọn gói từ form.

## Testing Strategy

- Unit: mapper round-trip; `buildPath` với cây 3 cấp và với cây có chu trình.
- Integration (e2e ở TKT-KM-16): `save()` rồi `findById()` trả về aggregate bằng nhau; `findActive` lọc đúng branch scope cho 3 trường hợp (toàn chuỗi / đúng chi nhánh / khác chi nhánh).

## Dependencies

- Depends on: TKT-KM-02, TKT-KM-04
- Blocks: TKT-KM-07, TKT-KM-08, TKT-KM-09
