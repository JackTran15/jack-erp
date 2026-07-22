# TKT-KM-09 EvaluateCartQuery + POST /v2/promotions/evaluate

## Epic

[EPIC-22072026 Khuyến mại — schema chuẩn hóa, domain engine & evaluate API](../epics/EPIC-22072026-promotion-programs-engine.md)

## Summary

Ghép domain engine (TKT-KM-05) với dữ liệu thật: nhận một giỏ hàng, nạp CTKM đang hiệu lực + catalog + khách hàng, chạy `PromotionResolver`, trả kết quả tính. **Đọc thuần, không ghi gì** — đây là lý do dùng `QueryBus` chứ không phải `CommandBus`.

Endpoint này là mặt tiếp xúc duy nhất của engine với thế giới bên ngoài trong epic này; epic POS sau sẽ gọi chính nó.

## Deliverables

- `apps/api/src/modules/promotion/application/queries/evaluate-cart.{query,handler}.ts`
- `apps/api/src/modules/promotion/application/dto/evaluate-cart.dto.ts`
- `apps/api/src/modules/promotion/application/dto/evaluate-cart.response.dto.ts`
- Route trong `interface/promotion-v2.controller.ts`; handler vào `providers`.

| Method | Route | Query | Permission |
| ------ | ----- | ----- | ---------- |
| POST | `/v2/promotions/evaluate` | `EvaluateCartQuery` | `promotion.read` |

## Hợp đồng

```jsonc
// request
{
  "customerId": "uuid",                 // optional — khách vãng lai bỏ trống
  "at": "2026-07-22T14:30:00.000Z",     // optional — mặc định thời điểm hiện tại
  "selectedProgramIds": ["uuid"],       // CTKM auto_apply=false mà thu ngân chọn tay
  "lines": [
    { "lineId": "l1", "itemId": "uuid", "quantity": 2, "unitPrice": 685000, "manualLineDiscount": 0 }
  ]
}

// response
{
  "subtotal": 1370000,
  "promotionDiscount": 411000,
  "amountAfterPromotion": 959000,
  "appliedPrograms": [
    {
      "programId": "uuid", "code": "KM00001", "name": "GIÀY NỮ ONSALE 30%",
      "type": "ITEM_DISCOUNT", "priority": 10, "discountAmount": 411000,
      "lineDiscounts": [
        { "lineId": "l1", "discountAmount": 411000, "unitPriceAfter": 479500 }
      ],
      "gifts": []
    }
  ],
  "availablePrograms": [
    { "programId": "uuid", "code": "KM00007", "name": "Tặng tất",
      "type": "GIFT_ITEM", "autoApply": false, "estimatedDiscount": 0 }
  ],
  "skippedPrograms": [
    { "programId": "uuid", "name": "GIÀY NỮ ONSALE 50%",
      "reason": "RESOURCE_TAKEN", "takenBy": "uuid" }
  ]
}
```

`gifts[]` mỗi phần tử: `{ itemId, itemCode, itemName, unit, quantity, unitPrice, mode: 'ONE_OF' | 'ALL_OF' }`. `ONE_OF` = client cho khách chọn 1 trong danh sách.

## Acceptance Criteria

- [ ] Endpoint **không ghi bất kỳ bảng nào**. Xác nhận bằng: chạy evaluate 10 lần, `SELECT count(*)` mọi bảng không đổi.
- [ ] `lineId` do client cấp được **echo nguyên vẹn** trong `lineDiscounts` — client map ngược về dòng giỏ của mình mà không cần đoán theo thứ tự.
- [ ] `at` bỏ trống → dùng thời điểm hiện tại của server. Có truyền → engine dùng đúng giá trị đó (cần cho test và cho xem trước "nếu bán lúc 20h thì sao").
- [ ] `unitPrice` **lấy từ request**, không tự tra catalog — giỏ có thể đã sửa giá tay. Nhưng `sellingPrice` trong catalog vẫn được nạp để strategy `FIXED_PRICE` và `CHEAPEST` dùng khi cần đối chiếu.
- [ ] `itemId` không tồn tại / khác org → **bỏ qua dòng đó** trong tính KM (không ném 400) và ghi vào `skippedPrograms`? **Không** — trả 400 `UNKNOWN_ITEM` kèm danh sách `itemId` sai. Giỏ hàng sai dữ liệu là lỗi client, im lặng sẽ ra số tiền sai.
- [ ] `customerId` không tồn tại → 400 `UNKNOWN_CUSTOMER`.
- [ ] `lines` rỗng → 400 (`@ArrayMinSize(1)`).
- [ ] Mọi CTKM bị loại đều xuất hiện trong `skippedPrograms` kèm `reason` thuộc union: `STOPPED` `DATE_WINDOW` `DAY_OF_WEEK` `TIME_OF_DAY` `BRANCH_SCOPE` `CUSTOMER_SCOPE` `CONDITION_NOT_MET` `RESOURCE_TAKEN` `NOT_SELECTED`. Không có CTKM nào "biến mất im lặng".
- [ ] `Σ appliedPrograms[].discountAmount === promotionDiscount`; `subtotal − promotionDiscount === amountAfterPromotion`.
- [ ] Số lần truy vấn DB trên một lần gọi là **hằng số** (không phụ thuộc số dòng giỏ hay số CTKM): 1 program + 1 con + 1 items + 1 categories + 1 customer + 1 membership card. Không N+1.
- [ ] Kết quả khớp tay cho AC-01…AC-09 khi chạy trên dữ liệu thật (e2e ở TKT-KM-16).
- [ ] Controller có `@RequirePermission('promotion.read')`, guard cấp class đầy đủ.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- promotion` và `lint` xanh.
- [ ] Spec cho handler với 3 port mock: xác nhận nó chỉ điều phối (nạp → gọi resolver → map response), không chứa logic tính tiền.
- [ ] `@ApiProperty` đủ; `/docs` render được cả request lẫn response.
- [ ] Không có tiếng Việt trong source backend.
- [ ] Không có TODO/FIXME.

## Tech Approach

Handler mỏng có chủ ý — mọi logic tiền bạc nằm ở `PromotionResolver` (đã unit-test kỹ ở TKT-KM-05). Handler chỉ làm 4 việc: nạp, dựng `CartContext`, gọi resolver, map sang response DTO.

```ts
@QueryHandler(EvaluateCartQuery)
export class EvaluateCartHandler implements IQueryHandler<EvaluateCartQuery> {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly programs: PromotionRepositoryPort,
    @Inject(CATALOG_READER)       private readonly catalog: CatalogReaderPort,
    @Inject(CUSTOMER_READER)      private readonly customers: CustomerReaderPort,
    private readonly resolver: PromotionResolver,
  ) {}

  async execute({ dto, actor }: EvaluateCartQuery) {
    const at = dto.at ? new Date(dto.at) : new Date();
    const itemIds = [...new Set(dto.lines.map(l => l.itemId))];

    const [programs, catalog, customer] = await Promise.all([
      this.programs.findActive(actor.organizationId, actor.branchId!, at),
      this.catalog.loadItems(actor.organizationId, itemIds),
      dto.customerId ? this.customers.load(actor.organizationId, dto.customerId) : undefined,
    ]);

    const missing = itemIds.filter(id => !catalog.has(id));
    if (missing.length) throw new BadRequestException({ code: 'UNKNOWN_ITEM', itemIds: missing });
    if (dto.customerId && !customer) throw new BadRequestException({ code: 'UNKNOWN_CUSTOMER' });

    return toEvaluateResponse(
      this.resolver.resolve(programs, {
        organizationId: actor.organizationId, branchId: actor.branchId!, at,
        customer, lines: dto.lines, catalog,
        selectedProgramIds: dto.selectedProgramIds ?? [],
      }),
    );
  }
}
```

`PromotionResolver` đăng ký như một provider thường (`providers: [PromotionResolver]`) — nó là class thuần TS không phụ thuộc gì, đưa vào DI chỉ để inject cho tiện, không phải vì nó cần container.

`actor.branchId` bắt buộc cho endpoint này (`@RequireBranchScope()`) — phạm vi chi nhánh là điều kiện lọc CTKM. Nếu thiếu header `X-Branch-Id` → 400 từ guard sẵn có.

**Chưa làm cache.** Mỗi lần gọi đọc thẳng DB. Với vài chục CTKM/org thì 6 truy vấn có index là đủ nhanh. Nếu epic POS đo thấy chậm, khi đó mới thêm cache Redis keyed `org:branch:date` và invalidate ở command — đừng làm trước khi có số đo.

## Testing Strategy

- Unit: handler với 3 port mock + resolver thật → xác nhận điều phối đúng, xác nhận 400 cho item/customer lạ.
- E2E (TKT-KM-16): seed 2 CTKM chồng lấn + 1 CTKM `auto_apply=false`, gọi endpoint, đối chiếu từng con số với tính tay.
- Test bất biến tổng: `Σ lineDiscounts === discountAmount` cho mọi applied program (property test nhẹ với vài giỏ ngẫu nhiên).

## Dependencies

- Depends on: TKT-KM-05, TKT-KM-06
- Blocks: TKT-KM-11
