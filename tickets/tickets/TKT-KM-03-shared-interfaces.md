# TKT-KM-03 @erp/shared-interfaces — promotion types & enums

## Epic

[EPIC-22072026 Khuyến mại — schema chuẩn hóa, domain engine & evaluate API](../epics/EPIC-22072026-promotion-programs-engine.md)

## Summary

Đặt enum + type của promotion vào `@erp/shared-interfaces` để backoffice dùng chung với API, thay cho các union type cục bộ hiện có trong `apps/backoffice-web/src/pages/promotions/programs/{programs,program-form}.types.ts`. Không có logic, chỉ khai báo kiểu.

## Deliverables

- `packages/shared-interfaces/src/promotion/index.ts` (mới)
- `packages/shared-interfaces/src/index.ts` — thêm `export * from './promotion';`

Nội dung:

```ts
export enum PromotionProgramType {
  INVOICE_DISCOUNT = 'INVOICE_DISCOUNT',
  ITEM_DISCOUNT    = 'ITEM_DISCOUNT',
  TIERED_DISCOUNT  = 'TIERED_DISCOUNT',
  GIFT_ITEM        = 'GIFT_ITEM',
  BUY_M_GET_N      = 'BUY_M_GET_N',
}
export enum PromotionStatus        { TRACKING = 'TRACKING', STOPPED = 'STOPPED' }
export enum PromotionApplyTo       { ALL_CUSTOMERS = 'ALL_CUSTOMERS', CUSTOMER_GROUP = 'CUSTOMER_GROUP', BIRTHDAY = 'BIRTHDAY', CARD_TIER = 'CARD_TIER' }
export enum PromotionBirthdayMatch { EXACT_DAY = 'EXACT_DAY', SAME_WEEK = 'SAME_WEEK', SAME_MONTH = 'SAME_MONTH', RANGE = 'RANGE' }  // amdt KM-01: before/afterDays
export enum PromotionDiscountMode  { PERCENT = 'PERCENT', AMOUNT = 'AMOUNT', FIXED_PRICE = 'FIXED_PRICE' }
export enum PromotionInvoiceScope  { NON_PROMO_ONLY = 'NON_PROMO_ONLY', ALL_ITEMS = 'ALL_ITEMS' }
export enum PromotionTierBasis     { QUANTITY = 'QUANTITY', ITEM_VALUE = 'ITEM_VALUE', INVOICE_VALUE = 'INVOICE_VALUE' }
export enum PromotionTierScope     { PER_ITEM = 'PER_ITEM', ALL_ITEMS_IN_GROUP = 'ALL_ITEMS_IN_GROUP' }
export enum PromotionTargetType    { PRODUCT = 'PRODUCT', ITEM = 'ITEM', CATEGORY = 'CATEGORY' }
export enum PromotionGiftMode      { ONE_OF = 'ONE_OF', ALL_OF = 'ALL_OF' }
export enum PromotionBuyGetPolicy  { SPECIFIC = 'SPECIFIC', CHEAPEST = 'CHEAPEST' }
export enum PromotionLineRole      { CONDITION = 'CONDITION', REWARD = 'REWARD' }
export enum PromotionConditionType { NONE = 'NONE', MIN_INVOICE_AMOUNT = 'MIN_INVOICE_AMOUNT', SPECIFIC_QUANTITY = 'SPECIFIC_QUANTITY' }
export enum PromotionCalcBasis     { ALL_ITEMS = 'ALL_ITEMS', NON_PROMO_ITEMS = 'NON_PROMO_ITEMS', ITEM_CATEGORIES = 'ITEM_CATEGORIES' }
export enum PromotionGroupMatchMode{ ANY = 'ANY', ALL = 'ALL' }
```

Kèm các interface đọc-ghi mà FE tiêu thụ: `PromotionProgramSummary` (dòng danh sách), `PromotionProgramDetail` (aggregate đầy đủ cho form), `PromotionGroupDto`, `PromotionLineDto`, `PromotionTierDto`, `PromotionConditionDto`, và bộ type của evaluate: `EvaluateCartRequest`, `EvaluateCartResponse`, `AppliedProgram`, `GiftOffer`, `SkippedProgram`.

## Acceptance Criteria

- [ ] Giá trị enum **khớp từng ký tự** với pg enum ở TKT-KM-02. Lệch một giá trị = 500 lúc runtime.
- [ ] Mọi enum là **string enum** (`X = 'X'`), không phải numeric — TypeORM `type: 'enum'` cần string.
- [ ] `pnpm --filter @erp/shared-interfaces build` xanh; `packages/shared-interfaces/dist/` xuất được symbol mới.
- [ ] Không import ngược từ `apps/*` vào package (package là leaf).
- [ ] Không có type nào trùng lặp khái niệm đã tồn tại trong `@erp/shared-interfaces` (kiểm tra `inventory`, `customer`, `pos` trước khi thêm).

## Definition of Done

- [ ] `pnpm build:shared` xanh.
- [ ] `pnpm --filter @erp/api test` và `pnpm --filter @erp/backoffice-web build` xanh sau khi thêm export.
- [ ] Không có tiếng Việt trong file (đây là package dùng chung backend — chỉ FE mới có chuỗi tiếng Việt).

## Tech Approach

`programs.types.ts` của FE hiện có `PromotionForm` với đúng 5 giá trị `INVOICE_DISCOUNT | PRODUCT_DISCOUNT | TIERED_DISCOUNT | GIFT | BUY_M_GET_N` — **hai giá trị lệch tên** so với thiết kế (`PRODUCT_DISCOUNT` vs `ITEM_DISCOUNT`, `GIFT` vs `GIFT_ITEM`). Lấy tên theo pg enum (`ITEM_DISCOUNT`, `GIFT_ITEM`); FE sẽ đổi ở TKT-KM-13.

Tương tự `PromotionApplyTo` của FE (`programs.constants.ts`) đã là 4 giá trị `ALL_CUSTOMERS | CUSTOMER_GROUP | HAS_BIRTHDAY | HAS_CARD_TIER`, khớp REQ FR-021 về số lượng nhưng lệch tên 2 giá trị cuối (`HAS_BIRTHDAY`/`HAS_CARD_TIER` so với `BIRTHDAY`/`CARD_TIER` của pg enum) — TKT-KM-12 map ở mapper, không đổi FE.

Type cục bộ của FE (`ProgramFormState`, `TierGroup`, `GiftProduct`…) **giữ nguyên** — chúng là view-model của form, khác với DTO truyền qua dây. TKT-KM-12 sẽ viết mapper giữa hai lớp.

## Testing Strategy

Không có unit test riêng (khai báo kiểu thuần). Bảo chứng bằng compile: TKT-KM-06 dùng chính các enum này trong `@Column({ type: 'enum', enum: ... })`, nên lệch giá trị sẽ lộ ở migration-vs-entity sync check hoặc lúc insert đầu tiên trong e2e.

## Dependencies

- Depends on: TKT-KM-02
- Blocks: TKT-KM-04, TKT-KM-12
