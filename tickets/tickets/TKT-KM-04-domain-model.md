# TKT-KM-04 Domain model + ports

## Epic

[EPIC-22072026 Khuyến mại — schema chuẩn hóa, domain engine & evaluate API](../epics/EPIC-22072026-promotion-programs-engine.md)

## Summary

Tầng `domain/model` + `domain/ports` của module promotion: aggregate `PromotionProgram` với toàn bộ invariant của BR-004, các value object, kiểu dữ liệu đầu vào/ra của engine, và interface port để tầng ngoài cắm vào. **Thuần TypeScript** — không import `@nestjs/*`, không import `typeorm`. Đây là ranh giới cho phép unit-test engine mà không cần DB hay Nest container.

## Deliverables

```
apps/api/src/modules/promotion/domain/
├── model/
│   ├── promotion-program.ts          # aggregate root
│   ├── promotion-group.ts
│   ├── promotion-line.ts
│   ├── promotion-tier.ts
│   ├── promotion-condition.ts
│   ├── cart.ts                       # CartContext, CartLine — input engine
│   ├── evaluation.ts                 # PromotionEvaluation, AppliedProgram, GiftOffer, SkippedProgram
│   ├── domain-error.ts               # DomainValidationError { issues: {field, code, message}[] }
│   └── value-objects/
│       ├── money.ts                  # roundVnd()
│       ├── time-window.ts            # TimeWindow.contains(at) — hỗ trợ ca qua đêm
│       ├── date-window.ts            # DateWindow.contains(date) — null = vô hạn 2 đầu
│       └── customer-scope.ts         # CustomerScope.matches(customer, at)
└── ports/
    ├── promotion-repository.port.ts  # PROMOTION_REPOSITORY (Symbol) + interface
    ├── catalog-reader.port.ts        # CATALOG_READER
    └── customer-reader.port.ts       # CUSTOMER_READER
```

Kèm spec: `promotion-program.spec.ts`, `time-window.spec.ts`, `customer-scope.spec.ts`, `money.spec.ts`.

## Acceptance Criteria

- [ ] **Không file nào dưới `domain/` import `@nestjs/*` hoặc `typeorm`.** Kiểm bằng: `grep -rE "from '(@nestjs|typeorm)" apps/api/src/modules/promotion/domain/` → 0 kết quả.
- [ ] `PromotionProgram.create(props)` ném `DomainValidationError` với **danh sách** issue (không phải ném ở lỗi đầu tiên) cho mọi vi phạm BR-004:
  - thiếu `name`
  - `end_date < start_date`
  - `discount_value <= 0` khi hình thức có mức giảm
  - `PERCENT` mà giá trị > 100
  - lưới `REWARD` rỗng — trừ `INVOICE_DISCOUNT` và `TIERED_DISCOUNT` + `tier_basis = INVOICE_VALUE`
  - bậc thang chồng lấn, hoặc `from >= to` (khi `to` không null)
  - `apply_to = CUSTOMER_GROUP` mà danh sách nhóm rỗng; `apply_to = CARD_TIER` mà `card_tier_id` null
  - `TIERED_DISCOUNT` mà không có bậc nào
  - `BUY_M_GET_N` + `CHEAPEST` mà `buy_quantity` hoặc `gift_quantity` null / ≤ 0
- [ ] `TimeWindow.contains()` đúng cho ca qua đêm: window `22:00–02:00` chứa `23:30` và `01:00`, **không** chứa `12:00` (FR-022).
- [ ] `DateWindow.contains()`: `start` null = không giới hạn đầu, `end` null = không giới hạn cuối, cả hai null = luôn đúng (BR-003).
- [ ] `CustomerScope.matches()` phủ 4 giá trị `apply_to`; nhánh `BIRTHDAY` phủ cả 3 `birthday_match` (`EXACT_DAY` / `SAME_WEEK` / `SAME_MONTH`); khách vãng lai (`customer = undefined`) chỉ khớp `ALL_CUSTOMERS`.
- [ ] `roundVnd(479_500.4) === 479_500`; `roundVnd(685_000 * 0.3) === 205_500`.
- [ ] `PromotionProgram` bất biến sau khi tạo (mọi field `readonly`); thao tác sửa trả về instance mới.
- [ ] Port khai báo bằng `Symbol()` + `interface`, không phải `abstract class`.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- promotion/domain` xanh, phủ mọi nhánh invariant liệt kê ở trên.
- [ ] `pnpm --filter @erp/api lint` xanh.
- [ ] Không có tiếng Việt trong source (error message, comment, tên biến đều tiếng Anh).
- [ ] Không có TODO/FIXME.

## Tech Approach

```ts
// domain/ports/promotion-repository.port.ts
export const PROMOTION_REPOSITORY = Symbol('PROMOTION_REPOSITORY');

export interface PromotionRepositoryPort {
  /** Programs that pass the coarse SQL filter: TRACKING + date window + branch scope. */
  findActive(orgId: string, branchId: string, at: Date): Promise<PromotionProgram[]>;
  findById(orgId: string, id: string): Promise<PromotionProgram | null>;
  save(program: PromotionProgram): Promise<PromotionProgram>;
  softDelete(orgId: string, id: string): Promise<void>;
}
```

```ts
// domain/ports/catalog-reader.port.ts
export const CATALOG_READER = Symbol('CATALOG_READER');

export interface CatalogItemView {
  itemId: string;
  code: string;            // ItemEntity.code IS the SKU
  name: string;
  unit: string;
  sellingPrice: number;
  productId?: string;
  categoryId?: string;
  /** categoryId plus every ancestor, so a promotion on a parent group matches children. */
  categoryPathIds: string[];
}
export interface CatalogReaderPort {
  loadItems(orgId: string, itemIds: string[]): Promise<Map<string, CatalogItemView>>;
}
```

```ts
// domain/model/cart.ts
export interface CartLine {
  lineId: string;          // client-supplied, echoed back so client can map results
  itemId: string;
  quantity: number;
  unitPrice: number;
  manualLineDiscount?: number;   // per-line discount the cashier already entered
}
export interface CartContext {
  organizationId: string;
  branchId: string;
  at: Date;
  customer?: { id: string; groupId?: string; birthDate?: Date; cardTierId?: string };
  lines: CartLine[];
  catalog: Map<string, CatalogItemView>;
  selectedProgramIds: string[];   // manual (autoApply=false) programs the cashier picked
}
```

`PromotionProgram.create()` chạy validate rồi trả aggregate; **không** có setter công khai. Aggregate mang sẵn `groups[]` (mỗi group có `lines[]` + `tiers[]`), `condition`, `branchIds[]`, `customerGroupIds[]` — repository nạp/ghi trọn gói, engine không bao giờ lazy-load.

`DomainValidationError` gom nhiều issue để tầng application map thẳng sang `BadRequestException` với body chỉ ra từng trường lỗi — form 5 hình thức có rất nhiều trường, báo từng lỗi một sẽ khiến người dùng lưu đi lưu lại.

Ca qua đêm:
```ts
contains(at: TimeOfDay): boolean {
  if (!this.start || !this.end) return true;
  return this.start <= this.end
    ? at >= this.start && at <= this.end
    : at >= this.start || at <= this.end;   // spans midnight
}
```

## Testing Strategy

Unit thuần, không mock Nest, không DB. Mỗi invariant BR-004 một `it()`. `TimeWindow` và `CustomerScope` là nơi dễ sai nhất — viết bảng case (input → kỳ vọng) thay vì test rời rạc.

## Dependencies

- Depends on: TKT-KM-03
- Blocks: TKT-KM-05, TKT-KM-06
