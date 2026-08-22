---
feature: pos-stock-warning-showroom-only
slug: pos-stock-warning-showroom-only
owner: Akenzy
created: 2026-08-22
status: draft
---

# Intent — Cảnh báo vượt tồn ở POS tính trên tồn showroom

## Problem

POS **trừ kho ở showroom**, nhưng **cảnh báo vượt tồn thì đếm cả kho lưu trữ**. Hai con số
đứng trên hai cơ sở khác nhau, nên cảnh báo bật muộn hơn thực tế đúng bằng lượng hàng đang
nằm trong kho — thứ mà quầy không lấy ra bán được ngay.

Đường trừ kho không có gì mơ hồ. Mọi nhánh xuất hàng của POS (bán, trả, cả hai chân đổi
hàng, và hàng tặng của khuyến mại) đều gọi `resolveBranchItemLocations(..., { showroomOnly: true })`:

- `invoice.service.ts:470` — `// POS sales always deduct from the showroom, never a warehouse storage.`
- `persist-invoice.step.ts:192`, `create-return-invoice.service.ts:125`,
  `create-exchange-invoice.service.ts:136,213`, `stock-return.consumer.ts:127`

Hàm đó bỏ hẳn các dòng kệ thuộc kho không phải main storage, và mặt hàng không có kệ
showroom thì rơi về vị trí `Mặc định` của showroom. Nói cách khác: **tồn kho lưu trữ không
bao giờ là nguồn xuất của một hoá đơn POS.**

Đường cảnh báo thì ngược lại. `PosCatalogService.aggregateStockRows` cộng **mọi** vị trí
trong chi nhánh vào `quantityOnHand` khi request không truyền `direction`, và màn bán hàng
đúng là không truyền (`useCatalogQuery` → `catalogService.fetch(branchId)`). Con số đó chảy
thẳng vào `maxQty` của dòng giỏ hàng (`use-checkout-session-cart.ts:172`) và là ngưỡng duy
nhất của `lineExceedsOnHandSnapshot`. Hai chỗ trong code còn ghi hẳn lựa chọn này thành chú
thích — `use-checkout-session-cart.ts:168-171` và `checkout-session.store.ts:352-354`:

> Dùng `quantityOnHand` (SUM toàn chi nhánh) — KHÔNG dùng tồn per-location: BE trừ kho ở
> vị trí showroom mặc định nên breakdown `locations[]` có thể chứa cặp +/− bù trừ, chỉ SUM
> là chuẩn.

Nhận định đó đúng ở vế sau (không được nhặt một phần tử của `locations[]`) và sai ở vế
trước (SUM toàn chi nhánh không phải cơ sở đúng của cảnh báo). Phải phân loại showroom /
kho ở BE rồi cộng, chứ không phải chọn bừa một dòng breakdown ở FE.

Hiện trường (chi nhánh MT46, SKU `BX140`): kho `Kho MT46` giữ 8, `Showroom MT46` giữ 4.
POS hiện ghi `Tồn: 12` và im lặng tới khi SL vượt 12 — bán 13 mới đỏ. Đúng ra phải cảnh báo
ngay từ SL vượt 4, vì bán quá 4 là showroom âm kho.

FE là lớp bảo vệ **duy nhất** ở đây: `stock-ledger.service.ts` không chặn tồn âm, và POS cho
phép bán khống có chủ đích. Cảnh báo bật muộn nghĩa là không có ai cảnh báo.

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
|---|---|---|
| Thu ngân | Bán 12 đôi trong khi quầy chỉ có 4, không thấy cảnh báo gì; phát hiện thiếu hàng lúc đi lấy | Vượt 4 là hiện ngay cảnh báo đỏ + tooltip `Tồn: 4`; muốn bán tiếp thì vẫn bán được nhưng phải xác nhận |
| Quản lý kho | Tồn showroom âm sau ca bán mà không ai chủ động xác nhận bán khống | Mọi lần đẩy showroom xuống âm đều đi qua một lần xác nhận có ý thức |
| Kế toán | Bút toán xuất kho showroom âm không giải thích được bằng thao tác nào của quầy | Tồn âm showroom luôn truy được về một lần bấm "vẫn bán" |

## Success signal

Với `BX140` tại MT46 (showroom 4, kho 8, tổng 12):

> Nhập SL = 5 trên màn bán hàng → dòng hiện chấm đỏ, tooltip ghi `Tồn: 4`.
> Bấm Thu tiền → dialog "Cảnh báo xuất quá số lượng tồn" liệt kê đúng dòng đó với
> `Số lượng tồn = 4`, `Tồn khả dụng = 4`.
> Nhập SL = 4 → không cảnh báo.

Ngưỡng cảnh báo và con số hiển thị cùng đọc từ một nguồn, nên không thể lệch nhau.

## Out of scope

- **Chặn bán vượt tồn.** Bán khống vẫn được phép; feature này chỉ dời *ngưỡng cảnh báo*, giữ
  nguyên nút "Vẫn bán".
- **Đổi đường trừ kho.** `resolveBranchItemLocations` đã đúng và đang là chuẩn để cảnh báo
  chạy theo — không đụng.
- **Màn Chuyển kho nhanh (`FastStockTransferPage`).** Đã có `direction` riêng
  (`PosCatalogDirection.WAREHOUSE` / `SHOWROOM`) và đang lấy đúng đầu tồn nó cần.
- **Backoffice** (`OverstockConfirmDialog` của phiếu xuất kho) — phiếu xuất kho chọn kho
  nguồn tường minh, không có khái niệm "showroom mặc định".
- **Tồn hiển thị ở lưới sản phẩm / card `PosProductCard.quantityOnHand`** — hiện không render
  con số tồn nào trên card, không có gì để đổi.
- **`Khách đặt` / `Chờ lấy hàng`** trên dialog bán khống — đang cứng `0`, là món nợ có sẵn,
  không thuộc feature này.
- **Sửa lại tồn âm đã phát sinh** — dữ liệu ledger là bất biến.

## Constraints

| Kind | Detail |
|---|---|
| Không thu hẹp catalog | Mặt hàng chỉ có tồn ở kho lưu trữ **vẫn phải xuất hiện** trong catalog và bán được (bán khống). Lọc `direction=showroom` ở endpoint hiện tại sẽ loại hẳn dòng khỏi kết quả — không dùng được cách đó |
| Một nguồn số | Ngưỡng cảnh báo, tooltip `Tồn:`, cột `Số lượng tồn` và `Tồn khả dụng` của dialog bán khống phải đọc chung một trường |
| Nhất quán phân loại | Showroom = storage có bản ghi `showrooms` (BE đã phân loại như vậy ở cả `PosCatalogService` lẫn `PosCatalogProductService`); không tự định nghĩa lại ở FE |
| Không nhặt breakdown ở FE | `locations[]` có thể chứa cặp +/− bù trừ — FE không được tự cộng/lọc mảng này |
| Tương thích | `quantityOnHand` (tổng chi nhánh) vẫn phải giữ nguyên ý nghĩa cho các consumer khác (Chuyển kho nhanh, lookup) |
| Ngôn ngữ | Source backend tiếng Anh; chuỗi UI tiếng Việt |
| Idempotency | Chỉ đụng đường đọc — không có mutation mới |

## Existing surface touched

**Backend — đọc tồn:**
- `apps/api/src/modules/pos/services/pos-catalog.service.ts`
  - `aggregateStockRows` (:154) — nơi cộng dồn, đã có cờ `isShowroom` trên từng dòng ở
    `getCatalog` (:70) và `searchCatalogByTerm` (:121)
  - `lookupByCode` (:261) — **chưa** select `isShowroom`, phải bổ sung
  - `PosCatalogLineDto` (:6) — nơi thêm trường tồn showroom
- `apps/api/src/modules/pos/services/pos-catalog-product.service.ts`
  - `loadBranchStock` (:444) — đã biết phân loại showroom qua `showroomRepo`
  - `toVariantDto` (:415) — `quantityOnHand` của từng biến thể
- `apps/api/src/modules/pos/dto/pos-catalog-product.response.dto.ts` — DTO biến thể

**Frontend — dùng tồn để cảnh báo:**
- `apps/pos-web/src/hooks/page-hooks/checkout/use-checkout-session-cart.ts:168-172` — gán `maxQty` lúc thêm dòng
- `apps/pos-web/src/stores/common/checkout-session.store.ts:335-364` — `syncPurchaseCartOnHand` làm mới `maxQty`
- `apps/pos-web/src/hooks/page-hooks/checkout/use-checkout-variant-selection.ts:39` — biến thể → dòng giỏ
- `apps/pos-web/src/components/.../VariantTable/VariantRow/VariantRow.tsx:40,59,102` — cảnh báo + `Tồn:` trong dialog chọn biến thể
- `apps/pos-web/src/interfaces/catalog.interface.ts` — `PosCatalogLine`, `PosProductVariant`

**Đọc, không sửa:**
- `resolve-branch-item-locations.ts` — định nghĩa "showroom" phía trừ kho, là chuẩn để đối chiếu
- `checkoutUtils.ts:105` `lineExceedsOnHandSnapshot` — logic so sánh giữ nguyên, chỉ đổi số nạp vào
- `OversellCheckoutConfirmDialog.tsx` — đọc `line.maxQty`, tự đúng theo

**Test:**
- `pos-catalog.service.spec.ts`, `pos-catalog-product.service.spec.ts` — bộ test hiện có khoá hành vi SUM toàn chi nhánh
- `apps/pos-web` chạy được `npx vitest run` (dù `package.json` ghi `"test": "echo test"`)
