# TKT-KM-05 Domain engine — 5 strategy + PromotionResolver

## Epic

[EPIC-22072026 Khuyến mại — schema chuẩn hóa, domain engine & evaluate API](../epics/EPIC-22072026-promotion-programs-engine.md)

## Summary

Trái tim của epic: thuật toán tính khuyến mại. Nhận `PromotionProgram[]` + `CartContext`, trả `PromotionEvaluation` thuần data. **Không I/O, không async, không DB** — hàm thuần, cùng input luôn cho cùng output. Đây là lý do tồn tại của tầng domain: toàn bộ AC-01…AC-09 của REQ kiểm chứng được bằng unit test chạy trong mili-giây.

## Deliverables

```
apps/api/src/modules/promotion/domain/engine/
├── promotion-resolver.ts
├── cart-state.ts                     # theo dõi tài nguyên đã bị chiếm
└── strategies/
    ├── promotion-strategy.ts         # interface chung
    ├── invoice-discount.strategy.ts
    ├── item-discount.strategy.ts
    ├── tiered-discount.strategy.ts
    ├── gift-item.strategy.ts
    └── buy-m-get-n.strategy.ts
```

Kèm spec cho từng strategy + `promotion-resolver.spec.ts`.

## Acceptance Criteria

Nghiệm thu bám thẳng mục 10 của `docs/promotions/25-promotion-req.md`:

- [ ] **AC-01** `ITEM_DISCOUNT` `PERCENT` 30% trên SKU giá `685.000` → giảm `205.500`, giá sau KM `479.500`.
- [ ] **AC-03** CTKM `status = STOPPED` → không áp dụng, xuất hiện trong `skippedPrograms` với `reason = 'STOPPED'`.
- [ ] **AC-04** `days_of_week = [1..5]`, `at` rơi vào Chủ nhật → không áp dụng, `reason = 'DAY_OF_WEEK'`.
- [ ] **AC-05** `start_time = 18:00`, `end_time = 21:00`, `at = 15:00` → không áp dụng, `reason = 'TIME_OF_DAY'`. Thêm case ca qua đêm `22:00–02:00` với `at = 01:00` → **áp dụng**.
- [ ] **AC-06** `TIERED_DISCOUNT` `tier_basis = QUANTITY`, bậc `[5,9] → 10%`, `[10,null] → 20%`; mua 7 → giảm 10%.
- [ ] **AC-07** `GIFT_ITEM` + điều kiện `MIN_INVOICE_AMOUNT` `200.000` + `multiply_gift = true`; hóa đơn `650.000` → 3 phần quà (`floor(650000/200000) = 3`).
- [ ] **AC-08** `condition.calc_basis = ITEM_CATEGORIES`, `group_match_mode = ALL`, 2 nhóm; giỏ chỉ có hàng nhóm 1 → không áp dụng, `reason = 'CONDITION_NOT_MET'`.
- [ ] **AC-09** `BUY_M_GET_N` + `CHEAPEST`, `buy_quantity = 3`, `gift_quantity = 1`; giỏ 3 SP giá `100k / 200k / 300k` → miễn phí đúng SP `100k`, tổng giảm `100.000`.
- [ ] **BR-001** 2 CTKM cùng SKU: `priority 10` (30%) và `priority 20` (50%) → **CTKM 30% thắng**; CTKM 50% nằm trong `skippedPrograms` với `reason = 'RESOURCE_TAKEN'` kèm `takenBy` = id CTKM thắng.
- [ ] **BR-002** `ITEM_DISCOUNT` (priority 10) + `INVOICE_DISCOUNT` `invoice_scope = NON_PROMO_ONLY` (priority 20): giảm hóa đơn chỉ tính trên các dòng **chưa** bị `ITEM_DISCOUNT` chiếm.
- [ ] `auto_apply = false` → **không** tự áp dụng; chương trình nằm trong `availablePrograms[]` kèm `estimatedDiscount`. Chỉ áp dụng khi `id` có trong `cart.selectedProgramIds`.
- [ ] `max_discount_amount` chặn trần đúng cho `TIERED_DISCOUNT` + `tier_basis = INVOICE_VALUE`.
- [ ] Tổng giảm của một dòng **không bao giờ vượt** `quantity × unitPrice − manualLineDiscount` của dòng đó (clamp).
- [ ] Engine là hàm thuần: gọi 2 lần cùng input cho kết quả `deepEqual`; không đọc `Date.now()` bên trong (thời điểm luôn lấy từ `cart.at`).
- [ ] Target không resolve được trong `cart.catalog` bị **bỏ qua im lặng**, không ném lỗi (dữ liệu có thể trỏ tới item đã xóa).

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- promotion/domain/engine` xanh.
- [ ] Vẫn không import `@nestjs/*` / `typeorm` dưới `domain/`.
- [ ] `pnpm --filter @erp/api lint` xanh; không tiếng Việt trong source.
- [ ] Mọi `reason` trong `skippedPrograms` là hằng có kiểu (union type), không phải chuỗi tự do.

## Tech Approach

```ts
export interface PromotionStrategy {
  readonly type: PromotionProgramType;
  /** Cheap pre-check independent of cart contents (status/date/day/time/customer). */
  isEligible(program: PromotionProgram, cart: CartContext): EligibilityResult;
  /** Compute the outcome against the *remaining* (unclaimed) cart state. */
  compute(program: PromotionProgram, cart: CartContext, state: CartState): StrategyOutcome | null;
}
```

`CartState` giữ ba nhóm tài nguyên (BR-001):

```ts
class CartState {
  private claimedLineIds = new Set<string>();
  private invoiceDiscountTaken = false;
  private giftSlotTaken = false;
  // claim*/isClaimed*/unclaimedLines(cart)
}
```

`PromotionResolver.resolve()`:

```
1. eligible, skipped = partition(programs) theo isEligible()
     — status, DateWindow, days_of_week, TimeWindow, branch, CustomerScope
     — mỗi loại trượt ghi một `reason` khác nhau (STOPPED / DATE_WINDOW / DAY_OF_WEEK /
       TIME_OF_DAY / BRANCH_SCOPE / CUSTOMER_SCOPE)
2. runnable = eligible.filter(p => p.autoApply || cart.selectedProgramIds.includes(p.id))
   available = eligible.filter(p => !p.autoApply)  → kèm estimatedDiscount (tính thử trên state rỗng)
3. sort runnable theo (priority ASC, createdAt ASC)
4. Pha 1 — cấp dòng: duyệt ITEM_DISCOUNT, TIERED_DISCOUNT theo thứ tự
     outcome = strategy.compute(p, cart, state)
     nếu null → skipped(reason: CONDITION_NOT_MET)
     nếu mọi dòng nó nhắm đã bị chiếm → skipped(reason: RESOURCE_TAKEN, takenBy)
     ngược lại → state.claimLines(...), applied.push(outcome)
5. Pha 2 — quà tặng: GIFT_ITEM, BUY_M_GET_N (giành giftSlot, chỉ 1 thắng)
6. Pha 3 — cấp hóa đơn: INVOICE_DISCOUNT
     base = invoice_scope === NON_PROMO_ONLY ? state.unclaimedLines(cart) : cart.lines
     chỉ 1 CTKM thắng (invoiceDiscountTaken)
7. roundVnd mọi số tiền, clamp theo dòng, tổng hợp totals
```

Hai pha 1→3 là hiện thực trực tiếp của BR-002: giảm cấp dòng chạy trước, giảm hóa đơn ăn phần còn lại.

Ghi chú từng strategy:

- **`ItemDiscountStrategy`** — target `CATEGORY` khớp khi `line.categoryPathIds.includes(target_id)` (nhờ vậy CTKM đặt ở nhóm cha ăn cả nhóm con). `FIXED_PRICE` = đặt giá bán mới, giảm = `(unitPrice − fixedPrice) × quantity`, clamp ≥ 0.
- **`TieredDiscountStrategy`** — với mỗi group: gom các dòng khớp `lines[role=REWARD]`, tính `basisValue` theo `tier_basis` (`QUANTITY` = tổng SL, `ITEM_VALUE` = tổng tiền nhóm, `INVOICE_VALUE` = tổng tiền hóa đơn), chọn bậc có `from <= basis` và (`to` null hoặc `basis <= to`). `tier_scope = PER_ITEM` áp mức giảm lên từng dòng; `ALL_ITEMS_IN_GROUP` áp lên tổng rồi phân bổ theo tỉ trọng dòng. `INVOICE_VALUE` bỏ qua group/lines hoàn toàn, chỉ dùng bảng bậc + `max_discount_amount`.
- **`GiftItemStrategy`** — chỉ chạy khi `condition` thỏa. `ONE_OF` trả tất cả ứng viên với `mode: ONE_OF` để client cho khách chọn 1; `ALL_OF` trả toàn bộ. `multiply_gift` nhân `quantity` lên `floor(conditionBasis / condition.min_amount)`, tối thiểu 1.
- **`BuyMGetNStrategy`** — `SPECIFIC`: đếm SL các dòng khớp `role=CONDITION`, số lần thỏa = `floor(count / buy_quantity)`, nhân SL quà `role=REWARD` lên bấy nhiêu. `CHEAPEST`: lấy các dòng khớp, bung theo đơn vị (`quantity` lần), sắp tăng dần theo `unitPrice`, miễn phí `floor(total / buy_quantity) × gift_quantity` đơn vị rẻ nhất. **"Rẻ nhất" tính theo `unitPrice` của dòng trong giỏ** (đã trừ giảm giá tay), không phải giá niêm yết — chốt mục `[Q]` của FR-034.
- **`InvoiceDiscountStrategy`** — `PERCENT` trên tổng base; `AMOUNT` trừ thẳng, clamp ≤ base. Phân bổ ngược về từng dòng theo tỉ trọng để client hiển thị được (`lineDiscounts[]`), phần lẻ do làm tròn dồn vào dòng cuối để `Σ lineDiscounts === discountAmount`.

Điều kiện (`PromotionCondition`) tách thành helper dùng chung cho 3 hình thức có tab điều kiện:
`evaluateCondition(condition, lines, state) → { met: boolean, basisAmount: number }`. `calc_basis = NON_PROMO_ITEMS` dùng `state.unclaimedLines()`; `ITEM_CATEGORIES` + `group_match_mode` `ANY`/`ALL` so trên `categoryPathIds`.

## Testing Strategy

- Một spec cho mỗi strategy + một spec cho resolver.
- Dựng fixture builder (`aProgram().ofType(...).withPriority(10).withLines(...)`) để test đọc được, tránh object literal 40 dòng lặp lại.
- **Bắt buộc** có test cho từng AC liệt kê ở phần Acceptance Criteria, đặt tên `it('AC-06: ...')` để truy vết ngược về REQ.
- Test tính thuần: chạy `resolve()` 2 lần, `expect(a).toEqual(b)`.

## Dependencies

- Depends on: TKT-KM-04
- Blocks: TKT-KM-09
