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

- [x] Mọi hook dùng `erpApi` + `requireErpData` / `requireErpSuccess` từ `../lib/erp-api` — **không** gọi `fetch`/`axios` trực tiếp.
- [x] `queryKey` bắt đầu bằng tên tài nguyên và chứa **mọi** filter: `["promotions", page, limit, filters]`, `["promotion", id]`, `["vouchers", page, limit, filters]`.
- [x] Mutation invalidate theo prefix `["promotions"]` / `["vouchers"]` để danh sách tự làm mới.
- [x] `toFormState(detail)` dựng lại **đầy đủ** `ProgramFormState` cho cả 5 hình thức, đặc biệt:
  - `tierGroups[]` — nhiều nhóm, mỗi nhóm có `products[]` + `tiers[]` riêng
  - `buyGetPurchaseRows[]` / `buyGetGiftRows[]` — hai lưới tách theo `role = CONDITION` / `REWARD`
  - `applicableGoods[]` — từ `lines[role=CONDITION]` khi `conditionType = SPECIFIC_QUANTITY`
  - `goodsDiscountRows[]` — từ `lines[role=REWARD]` với `discountValue` từng dòng
- [x] `toCreateDto(form, type)` là **nghịch đảo**: `toCreateDto(toFormState(d)) ` cho ra DTO khôi phục được `d`. Có unit test round-trip cho cả 5 hình thức.
- [x] Mapper chỉ gửi các trường thuộc hình thức đang chọn — gửi thừa sẽ bị `forbidNonWhitelisted: true` từ chối 400.
- [x] Lỗi 400 kèm `issues[]` từ domain được surface ra dạng dùng được: hook trả `issues` để form gắn lỗi vào đúng trường, không chỉ toast một dòng chung chung. (`getPromotionIssues(error)` trong `use-promotions.ts`)
- [x] Không đặt dữ liệu server vào Zustand — toàn bộ ở TanStack Query.
- [x] Năm lệch tên đã biết giữa type FE cũ và API mới được xử lý trong mapper hoặc sửa tại nguồn (2 mục cuối bổ sung sau khi viết `docs/26-promotion-design.md`, xem mục 10.3 ở đó):
  - `PromotionForm.PRODUCT_DISCOUNT` → `PromotionProgramType.ITEM_DISCOUNT`
  - `PromotionForm.GIFT` → `PromotionProgramType.GIFT_ITEM`
  - `PromotionApplyTo` FE (`programs.constants.ts`) đã bỏ `SPECIFIC_CUSTOMER`, hiện là `ALL_CUSTOMERS | CUSTOMER_GROUP | HAS_BIRTHDAY | HAS_CARD_TIER` — mapper chỉ còn map `HAS_BIRTHDAY` / `HAS_CARD_TIER` ↔ tên enum phía API
  - *(amdt KM-01)* `TierTarget.VARIANT` (FE) ↔ `PromotionTargetType.ITEM` (API) — cùng khái niệm, tên khác
  - *(amdt KM-01)* `GiftMode.ONE` / `GiftMode.ALL` (FE) ↔ `PromotionGiftMode.ONE_OF` / `ALL_OF` (API)

*(amdt KM-12)* Trong lúc viết mapper phát hiện thêm 2 lỗ hổng cấu trúc, đã xử lý trực tiếp (xác nhận với người yêu cầu trước khi mở rộng phạm vi):
- `TierProduct`/`GiftProduct`/`BuyGetRow`/`GoodsDiscountRow` chưa có trường id thật (chỉ có `code`/`sku` text tự do) — không có gì để gửi làm `targetId` UUID. Đã thêm `targetId`/`itemId` (rỗng mặc định) vào 4 type này trong `program-form.types.ts`; KM-15 chỉ còn việc wire `onSelect` của `ProductSelectDialog` để set field đã có sẵn, không phải thêm field từ đầu.
- `ProgramFormState` thiếu hẳn `priority` (BR-001) và `buyQuantity`/`giftQuantity` (global "m"/"n" của BUY_M_GET_N — UI hiện hard-code "Mua 1 trong những hàng hóa sau", không có input nào cho "m"). Đã thêm 3 field số vào `ProgramFormState` (default `priority=100`, `buyQuantity=1`, `giftQuantity=1`); KM-13 sẽ thêm input `priority`, KM-15/BuyGetPromotionSection sẽ thêm 2 input cho "m"/"n" thay vì text tĩnh.

*(amdt KM-12, sau code-review)* PASS, không có blocker. Đã sửa 4 warning không tốn gì thêm:
- 4 chỗ ép kiểu `as unknown as X` (ApplyScope↔PromotionInvoiceScope, GoodsDiscountMethod↔PromotionDiscountMode, TierDiscountUnit↔PromotionDiscountMode, ProductGroupLogic↔PromotionGroupMatchMode) đổi thành hàm chuyển đổi tường minh (switch), đồng nhất với các converter khác trong file.
- `useDeleteVoucher` đổi tên thành `useDeactivateVoucher` + comment — `DELETE /v2/vouchers/:id` là soft `VoucherService.deactivate` (200 + entity), không phải xóa cứng.
- Thêm assertion `dto.condition`/`invoiceScope`/`discountMode` đều `undefined` cho `BUY_M_GET_N` trong test "forbidNonWhitelisted safety" (trước đó chỉ test `INVOICE_DISCOUNT`).
- Ghi nhận giới hạn `tierDiscountUnit` form-wide (per-tier ở API) vào `docs/26-promotion-design.md` §10.6, cùng loại với giới hạn `tierBasis` đã ghi ở §10.4.

Còn 1 warning cố ý không sửa ở ticket này (đã có trong review): `tieredDiscountToDto` fallback `discountValue` rỗng → `0` thay vì báo lỗi (vì `PromotionTierInputDto.discountValue` bắt buộc phía API) — KM-13 phải validate bắt buộc nhập ở form trước khi cho Lưu, không dựa vào fallback này.

## Definition of Done

- [x] `pnpm --filter @erp/backoffice-web build` xanh.
- [x] Unit test round-trip mapper cho 5 hình thức (đặt cạnh mapper, `promotion.mapper.spec.ts`). **Lưu ý:** `apps/backoffice-web` chưa có test runner thật (`"test": "echo test"`, giống `apps/pos-web`) — verify bằng `pnpm dlx vitest run <file>` (6/6 pass), không phải `pnpm test`. Đã thêm `exclude` cho `*.spec.ts`/`*.test.ts` vào `tsconfig.json` (mirror `apps/pos-web/tsconfig.json`) để `pnpm build`'s `tsc` không vỡ vì thiếu type `vitest`.
- [x] Không còn import nào từ `_mock/` trong thư mục `api/`.
- [x] Chuỗi hiển thị cho người dùng bằng tiếng Việt; định danh/enum giữ tiếng Anh.

## Tech Approach

FE đã có một payload builder cục bộ cho `INVOICE_DISCOUNT`: `ProgramFormPage/PromotionVariant/PromotionInvoiceDiscount/buildInvoiceDiscountPayload.ts` (kèm helper `buildConditionPayload` phân nhánh theo `conditionType`, lọc row trống). Dùng nó làm điểm xuất phát cho `toCreateDto` — tổng quát hóa lên 5 hình thức rồi **hợp nhất về một mapper duy nhất** trong `api/promotion.mapper.ts`, không để hai nguồn build payload song song.

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
