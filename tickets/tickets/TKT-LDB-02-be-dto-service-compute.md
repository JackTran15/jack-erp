# TKT-LDB-02 BE: DTO fields + computeLineDiscount in create/update

## Epic

[EPIC-03062026 POS per-line discount breakdown + line note in read APIs](../epics/EPIC-03062026-pos-line-discount-breakdown.md)

## Summary

Cho `CreateInvoiceItemDto` (và DTO item của `UpdateInvoiceDto` nếu tách riêng) nhận 3 field breakdown mới, rồi tập trung tính chiết khấu vào một helper `computeLineDiscount()` dùng chung cho **cả hai** đường ghi line item: `InvoiceService.create()` (dòng 122) và `InvoiceService.update()` (dòng 274). Server là nguồn sự thật cho số tiền `lineDiscount` và `lineTotal`. `note` đã được map sẵn — chỉ đảm bảo không bị bỏ.

## Deliverables

- `apps/api/src/modules/pos/dto/create-invoice.dto.ts` — thêm `lineDiscountType?`, `lineDiscountValue?`, `lineDiscountReason?` vào `CreateInvoiceItemDto` (đã có `lineDiscount?`, `note?`).
- `apps/api/src/modules/pos/dto/update-invoice.dto.ts` — nếu định nghĩa item DTO riêng, thêm 3 field tương ứng; nếu `extends`/tái dùng `CreateInvoiceItemDto` thì không cần đổi (xác nhận khi implement).
- `apps/api/src/modules/pos/services/invoice.service.ts` — thêm `private computeLineDiscount(item)` (hoặc free function trong file); thay block map item + tính `subtotal` ở `create()` (dòng 106–142 / 69–73) và `update()` (dòng 269–301) để dùng helper.

## Acceptance Criteria

- [ ] DTO validate: `lineDiscountType` `@IsOptional() @IsEnum(LineDiscountType)`; `lineDiscountValue` `@IsOptional() @IsNumber() @Min(0)`; `lineDiscountReason` `@IsOptional() @IsString() @MaxLength(255)`. Khai báo `@ApiProperty` đầy đủ (global `whitelist: true`).
- [ ] Khi `lineDiscountType` có mặt: server tính `amount`:
  - `percent` → `round2(quantity × unitPrice × lineDiscountValue / 100)`.
  - `amount` → `round2(lineDiscountValue)`.
  - clamp `amount = min(amount, quantity × unitPrice)` (không cho âm `lineTotal`).
  - persist `lineDiscount = amount`, `lineDiscountType`, `lineDiscountValue`, `lineDiscountReason`, `lineTotal = round2(gross − amount)`.
- [ ] Khi `lineDiscountType` **vắng mặt** (tương thích ngược): dùng `lineDiscount` thô như cũ (`item.lineDiscount ?? 0`), `lineDiscountType/value = null`; `lineDiscountReason` vẫn lưu nếu gửi.
- [ ] Validate nghiệp vụ (ném `BadRequestException`, English message): nếu `lineDiscountType` có mặt mà `lineDiscountValue` vắng/`< 0`; nếu `type=percent` và `value > 100`.
- [ ] `subtotal` của hóa đơn = tổng `lineTotal` đã tính từ helper (không dùng `dto.lineDiscount` thô khi có breakdown) ở **cả** `create()` và `update()`; `amountDue` suy ra như hiện tại.
- [ ] `note` tiếp tục được map vào entity (không regression).
- [ ] Mọi truy vấn/ghi vẫn scope theo `actor.organizationId` (+ `branchId`); mutation thừa hưởng `IdempotencyInterceptor` toàn cục — không tái hiện.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] `invoice.service.spec.ts` thêm case: percent, amount, clamp ≤ gross, thiếu value → 400, percent > 100 → 400, không có type (legacy) → giữ nguyên hành vi, `note` round-trip. (Chi tiết E2E ở TKT-LDB-04.)
- [ ] Không đổi schema (đã ở TKT-LDB-01); `synchronize` false.
- [ ] Không Vietnamese trong source backend (error/comment/Swagger/log).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

DTO bổ sung (dùng `LineDiscountType` từ entity TKT-LDB-01):

```ts
import { LineDiscountType } from '../entities/invoice-item.entity';

export class CreateInvoiceItemDto {
  // ... itemId, locationId, itemCode, itemName, unit, quantity, unitPrice ...

  @ApiPropertyOptional({ description: 'Computed legacy discount amount; ignored when lineDiscountType is set' })
  @IsNumber() @Min(0) @IsOptional()
  lineDiscount?: number;

  @ApiPropertyOptional({ enum: LineDiscountType, description: 'Manual per-line discount type' })
  @IsOptional() @IsEnum(LineDiscountType)
  lineDiscountType?: LineDiscountType;

  @ApiPropertyOptional({ description: 'Raw discount value (10 = 10% when type=percent; currency amount when type=amount)' })
  @IsOptional() @IsNumber() @Min(0)
  lineDiscountValue?: number;

  @ApiPropertyOptional({ description: 'Free-text reason/label for the discount, e.g. "cc"' })
  @IsOptional() @IsString() @MaxLength(255)
  lineDiscountReason?: string;

  @ApiPropertyOptional({ description: 'Free-text per-line note' })
  @IsOptional() @IsString()
  note?: string;

  @IsOptional() sortOrder?: number;
}
```

Helper (một nguồn tính, dùng chung create/update):

```ts
private computeLineDiscount(item: CreateInvoiceItemDto): {
  amount: number; type: LineDiscountType | null; value: number | null; reason: string | null;
} {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const gross = item.quantity * item.unitPrice;
  const reason = item.lineDiscountReason ?? null;

  if (item.lineDiscountType) {
    const value = item.lineDiscountValue;
    if (value === undefined || value < 0) {
      throw new BadRequestException('lineDiscountValue is required and must be >= 0 when lineDiscountType is set');
    }
    if (item.lineDiscountType === LineDiscountType.PERCENT && value > 100) {
      throw new BadRequestException('lineDiscountValue must be <= 100 for percent discounts');
    }
    const raw = item.lineDiscountType === LineDiscountType.PERCENT
      ? round2((gross * value) / 100)
      : round2(value);
    return { amount: Math.min(raw, gross), type: item.lineDiscountType, value, reason };
  }
  return { amount: round2(item.lineDiscount ?? 0), type: null, value: null, reason };
}
```

Áp trong cả `create()` và `update()` khi `manager.create(InvoiceItemEntity, {...})`:

```ts
const d = this.computeLineDiscount(item);
// ...
lineDiscount: d.amount,
lineDiscountType: d.type ?? undefined,
lineDiscountValue: d.value ?? undefined,
lineDiscountReason: d.reason ?? undefined,
lineTotal: Math.round((item.quantity * item.unitPrice - d.amount) * 100) / 100,
note: item.note,
```

Và `subtotal` (cả hai path) phải cộng `lineTotal` đã tính từ `computeLineDiscount`, không phải `i.quantity * i.unitPrice - (i.lineDiscount ?? 0)` thô.

## Testing Strategy

- Unit `invoice.service.spec.ts`: percent 10% trên 590.000 ⇒ `lineDiscount=59000`, `lineTotal=531000`; amount; clamp khi amount > gross; thiếu value → 400; percent 120 → 400; legacy (chỉ `lineDiscount`) giữ nguyên; subtotal = tổng lineTotal; `note` lưu. Áp cho cả `create` và `update`.

## Dependencies

- Depends on: TKT-LDB-01 (entity columns + `LineDiscountType`).
- Blocks: TKT-LDB-04 (tests/E2E). Song song được với TKT-LDB-03 (read).
