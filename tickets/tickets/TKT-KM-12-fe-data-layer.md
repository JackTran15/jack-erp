# TKT-KM-12 FE data layer — TanStack Query hooks + mapper form ↔ DTO

## Epic

[EPIC-22072026 Khuyến mại — schema chuẩn hóa, domain engine & evaluate API](../epics/EPIC-22072026-promotion-programs-engine.md)

## Summary

Tầng dữ liệu cho backoffice: hook TanStack Query trên `erpApi`, và — phần khó thật sự — mapper hai chiều giữa `ProgramFormState` (view-model phẳng của form, 5 hình thức trộn chung một object) và `PromotionProgramDetail` (aggregate lồng nhau của API). Chưa đụng UI.

## Deliverables

```
apps/backoffice-web/src/pages/promotions/
├── api/
│   ├── use-promotions.ts        # usePromotionsQuery, usePromotionQuery,
│   │                            # useCreatePromotion, useUpdatePromotion,
│   │                            # useDuplicatePromotion, useChangePromotionStatus,
│   │                            # useDeletePromotion
│   ├── use-vouchers.ts          # useVouchersQuery + 4 mutation
│   └── promotion.mapper.ts      # toFormState(detail) / toCreateDto(form, type)
```

## Acceptance Criteria

- [ ] Mọi hook dùng `erpApi` + `requireErpData` / `requireErpSuccess` từ `../lib/erp-api` — **không** gọi `fetch`/`axios` trực tiếp.
- [ ] `queryKey` bắt đầu bằng tên tài nguyên và chứa **mọi** filter: `["promotions", page, limit, filters]`, `["promotion", id]`, `["vouchers", page, limit, filters]`.
- [ ] Mutation invalidate theo prefix `["promotions"]` / `["vouchers"]` để danh sách tự làm mới.
- [ ] `toFormState(detail)` dựng lại **đầy đủ** `ProgramFormState` cho cả 5 hình thức, đặc biệt:
  - `tierGroups[]` — nhiều nhóm, mỗi nhóm có `products[]` + `tiers[]` riêng
  - `buyGetPurchaseRows[]` / `buyGetGiftRows[]` — hai lưới tách theo `role = CONDITION` / `REWARD`
  - `applicableGoods[]` — từ `lines[role=CONDITION]` khi `conditionType = SPECIFIC_QUANTITY`
  - `goodsDiscountRows[]` — từ `lines[role=REWARD]` với `discountValue` từng dòng
- [ ] `toCreateDto(form, type)` là **nghịch đảo**: `toCreateDto(toFormState(d)) ` cho ra DTO khôi phục được `d`. Có unit test round-trip cho cả 5 hình thức.
- [ ] Mapper chỉ gửi các trường thuộc hình thức đang chọn — gửi thừa sẽ bị `forbidNonWhitelisted: true` từ chối 400.
- [ ] Lỗi 400 kèm `issues[]` từ domain được surface ra dạng dùng được: hook trả `issues` để form gắn lỗi vào đúng trường, không chỉ toast một dòng chung chung.
- [ ] Không đặt dữ liệu server vào Zustand — toàn bộ ở TanStack Query.
- [ ] Ba lệch tên đã biết giữa type FE cũ và API mới được xử lý trong mapper hoặc sửa tại nguồn:
  - `PromotionForm.PRODUCT_DISCOUNT` → `PromotionProgramType.ITEM_DISCOUNT`
  - `PromotionForm.GIFT` → `PromotionProgramType.GIFT_ITEM`
  - `PromotionApplyTo.SPECIFIC_CUSTOMER` **không tồn tại** trong REQ → thay bằng `BIRTHDAY` + `CARD_TIER`

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Unit test round-trip mapper cho 5 hình thức (đặt cạnh mapper, `promotion.mapper.spec.ts`).
- [ ] Không còn import nào từ `_mock/` trong thư mục `api/`.
- [ ] Chuỗi hiển thị cho người dùng bằng tiếng Việt; định danh/enum giữ tiếng Anh.

## Tech Approach

Mapper là nơi tập trung toàn bộ độ phức tạp "5 hình thức, một form". Tách hàm theo hình thức thay vì một `switch` khổng lồ:

```ts
const TO_DTO: Record<PromotionProgramType, (f: ProgramFormState) => Partial<CreatePromotionDto>> = {
  [PromotionProgramType.INVOICE_DISCOUNT]: invoiceDiscountToDto,
  [PromotionProgramType.ITEM_DISCOUNT]:    itemDiscountToDto,
  [PromotionProgramType.TIERED_DISCOUNT]:  tieredDiscountToDto,
  [PromotionProgramType.GIFT_ITEM]:        giftItemToDto,
  [PromotionProgramType.BUY_M_GET_N]:      buyMGetNToDto,
};

export function toCreateDto(form: ProgramFormState, type: PromotionProgramType): CreatePromotionDto {
  return { ...commonToDto(form), type, ...TO_DTO[type](form) };
}
```

`commonToDto` xử lý phần dùng chung cả 5 hình thức (tên, mô tả, applyTo, khoảng ngày, thứ trong tuần, khung giờ, autoApply, priority, branchIds) — đúng danh sách ở Phụ lục A của REQ.

Lưu ý kiểu: `ProgramFormState` dùng `number | ""` cho ô số rỗng. Mapper phải chuyển `"" → undefined`, **không** `"" → 0` — `0` là giá trị hợp lệ khác hẳn "để trống".

## Testing Strategy

Round-trip là test chính: dựng 5 fixture `PromotionProgramDetail` (một cho mỗi hình thức, có đủ dữ liệu con), `toFormState` rồi `toCreateDto`, so với DTO kỳ vọng. Đây là lưới an toàn duy nhất cho lớp map — bỏ qua sẽ mất dữ liệu âm thầm khi mở form sửa.

## Dependencies

- Depends on: TKT-KM-11
- Blocks: TKT-KM-13, TKT-KM-14, TKT-KM-15
