---
id: UOW-02
slug: variant-dialog-showroom
title: Dialog chọn biến thể đọc tồn showroom
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-08, AC-09, AC-10]
risk: low
status: todo
rollback: gỡ `showroomQuantity` khỏi `PosProductVariantDto`, trả `VariantRow` và `variantToCatalogLine` về `quantityOnHand`, regen lại `openapi.snapshot.json`
---

# UOW-02 — Dialog chọn biến thể đọc tồn showroom

Lối thứ ba để một mặt hàng vào giỏ: bấm card ở lưới, chọn biến thể trong dialog. Dialog này
tự hiện `Tồn:` và tự chấm đỏ theo `variant.quantityOnHand`, tức nó **không** đi qua `maxQty`
— sửa UOW-01 xong nó vẫn nói 12 trong khi dòng giỏ nói 4.

Phụ thuộc UOW-01 vì `variantToCatalogLine` dựng một `PosCatalogLine`: trường mới phải có
trong type trước, nếu không TypeScript không compile. Trong khoảng giữa hai UoW, dòng thêm
từ dialog rơi vào `onHandUnknown` — cảnh báo bật kèm "Chưa xác định được tồn kho", ồn nhưng
an toàn (ADR-04). Lát cắt này dọn nốt.

Endpoint khác, service khác, và là endpoint **duy nhất** trong feature có khai báo Swagger
(`@ApiOkResponse({ type: PosProductDetailDto })`) — nên đây cũng là chỗ duy nhất phải regen
`openapi.snapshot.json`.

## Demo script

1. POS → Bán hàng tại MT46 → lưới sản phẩm → bấm card của product chứa `BX140`.
2. Dialog chọn biến thể mở: dòng `BX140` ghi `Tồn: 4` ở cả cột tồn lẫn tooltip. Trước lát
   cắt này là `12`.
3. Tick chọn biến thể, nhập SL = **5**: chấm đỏ hiện ngay trong dialog, tooltip `Tồn: 4`,
   ô SL viền đỏ.
4. Bấm Đồng ý: dòng vào giỏ, hover chấm đỏ trên dòng giỏ cũng ghi `Tồn: 4` — hai chỗ, một số.
5. Đổi SL về 4 ở cả hai nơi: không nơi nào còn cảnh báo.
6. Mặt hàng chỉ có tồn kho lưu trữ: dialog ghi `Tồn: 0` và cảnh báo ngay từ SL = 1, nhưng
   **vẫn chọn được** và vẫn thêm được vào giỏ.
7. `git diff --stat` cho thấy `openapi.snapshot.json` và
   `packages/api-client/src/generated/schema.ts` đã được regen, không sửa tay.

## In scope

- `PosProductVariantDto.showroomQuantity` + `@ApiProperty`.
- `loadBranchStock` tính thêm tổng theo main storage (ADR-01) — thêm `StorageEntity` vào
  `TypeOrmModule.forFeature` của `pos.module` và inject repo.
- `toVariantDto` trả trường mới.
- FE: `PosProductVariant.showroomQuantity`; `VariantRow` ba chỗ (chấm đỏ :40, `Tồn:` :59,
  cột :102); `variantToCatalogLine` :39 truyền trường mới sang `addProduct`.
- Regen `openapi.snapshot.json` + `packages/api-client`.

## Not in scope

- `PosProductCardDto.quantityOnHand` ở mức product và sắp xếp theo tồn — lưới không hiển thị
  con số tồn nào (`00-intent.md`, Out of scope).
- `loadBranchStock(direction)` cho Chuyển kho nhanh — vẫn theo bảng `showrooms` (ADR-02).

## Risks

| Risk | Mitigation |
|---|---|
| Dialog và dòng giỏ lệch nhau nếu chỉ sửa một trong hai chỗ | AC-10 kiểm đúng chuỗi dialog → giỏ; Demo bước 4 bắt buộc hover cả hai |
| `loadBranchStock` có hai đường gọi (`listProducts` có `direction`, `buildItemDetail` không) | T-02-01 phủ cả hai: thêm `showroomTotal` không được đụng hành vi lọc `direction` đang có |
| Quên regen openapi ⇒ `api-client` lệch schema | T-02-03 tách riêng, và Demo bước 7 kiểm bằng `git diff --stat` |

## Definition of done

- [ ] AC-08, AC-09, AC-10 xanh
- [x] `pnpm --filter @erp/api test -- pos-catalog-product.service.spec.ts` xanh (12/12)
- [x] `pnpm --filter @erp/pos-web build` xanh
- [x] `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` regen bằng
      `pnpm openapi:generate`, không sửa tay (kèm 297 dòng drift có sẵn — xem T-02-03)
- [ ] Demo script chạy hết 7 bước, có ảnh chụp bước 2 và bước 4
