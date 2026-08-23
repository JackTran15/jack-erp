---
feature: pos-stock-warning-temp-warehouse
slug: pos-stock-warning-temp-warehouse
owner: Akenzy
created: 2026-08-23
status: draft
supersedes_basis_of: pos-stock-warning-showroom-only
---

# Intent — Cảnh báo vượt tồn ở POS cộng thêm hàng đang nằm ở kho tạm

## Problem

Feature trước (`pos-stock-warning-showroom-only`, đã lên `main`) dời ngưỡng cảnh báo bán
khống từ **tổng tồn chi nhánh** về **tồn showroom**, vì POS chỉ trừ kho ở showroom
(`resolveBranchItemLocations(..., { showroomOnly: true })`). Đúng ở chiều đó, nhưng nó bỏ
sót một nguồn hàng thứ hai mà quầy **cũng bán được ngay**: hàng đã quét vào **kho tạm**.

Kho tạm không phải một storage. Nó là một *phiên* (`temp_warehouse_sessions`) và các dòng
đã quét (`temp_warehouse_lines`). Khi nhân viên quét một mặt hàng từ kho lưu trữ vào kho
tạm chiều `warehouse_to_showroom` (w2s), hàng **đã được mang ra quầy về mặt vật lý** nhưng
`stock_balances` chưa hề đổi — dòng chỉ được vật chất hoá thành phiếu chuyển kho khi đóng
phiên, hoặc khi một hoá đơn tiêu thụ nó.

Chính đường tiêu thụ đó chứng minh hàng ở kho tạm là hàng bán được:
`TempWarehouseService.fulfillInvoiceFromTempWarehouse` (`temp-warehouse.service.ts:1260`)
chạy sau mỗi hoá đơn POS, khớp FIFO các dòng `ACTIVE` chiều w2s của phiên đang mở, rồi sinh
đúng một phiếu chuyển kho lưu trữ → showroom gắn với hoá đơn. Nghĩa là nhịp trừ kho thật
của POS là **hai nhịp**: trừ showroom trước, rồi bù từ kho tạm sau.

Cảnh báo hiện chỉ nhìn nhịp một. Với showroom 4, kho tạm đang giữ 3 (đã quét, chưa đóng
phiên), quầy bán 6 được trọn vẹn và đúng nghiệp vụ — showroom xuống −2 rồi được bù +3 →
còn 1 — nhưng POS vẫn bật cảnh báo đỏ "vượt tồn" từ SL 5. Cảnh báo bật **sớm** hơn thực tế
đúng bằng lượng hàng đang nằm ở kho tạm, và mỗi lần như vậy thu ngân phải bấm qua dialog
"Vẫn bán" cho một giao dịch hoàn toàn bình thường.

Cảnh báo sai kiểu này đắt hơn cảnh báo thiếu: nó dạy thu ngân bấm "Vẫn bán" theo phản xạ,
làm hỏng luôn tác dụng của những lần cảnh báo đúng — thứ mà feature trước vừa dựng lên.

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
|---|---|---|
| Thu ngân | Quét 3 cái vào kho tạm rồi bán 6 (showroom 4) → chấm đỏ + dialog bán khống, dù hàng đang cầm trên tay | Bán tới 7 không cảnh báo; chỉ vượt 7 mới đỏ |
| Nhân viên kho | Chuyển hàng ra quầy xong mà POS vẫn coi như chưa có | Hàng vừa quét vào kho tạm được tính ngay vào tồn khả dụng của quầy |
| Quản lý | Không phân biệt được cảnh báo thật với cảnh báo do kho tạm | Mọi cảnh báo đỏ còn lại đều là bán khống thật |

## Success signal

Chi nhánh có phiên kho tạm w2s đang mở, một SKU với showroom = 4, kho tạm đã quét 3:

> Nhập SL = 6 trên màn bán hàng → **không** có chấm đỏ; tooltip ghi `Tồn: 7`.
> Bấm Thu tiền → **không** hiện dialog "Cảnh báo xuất quá số lượng tồn".
> Nhập SL = 8 → chấm đỏ, dialog liệt kê dòng đó với `Số lượng tồn = 7`.
> Xoá hết dòng kho tạm (hoặc đóng phiên) → ngưỡng quay về 4 ngay ở lần refetch kế tiếp.

Và chiều ngược lại — cùng SKU, showroom = 4, phiên s2w đang giữ 1 (hàng đã quét để trả về
kho lưu trữ, `stock_balances` vẫn đếm ở showroom):

> Ngưỡng là 3, không phải 4. Nhập SL = 4 → chấm đỏ.

Ngưỡng cảnh báo, tooltip `Tồn:` và hai cột của dialog bán khống vẫn đọc chung một trường —
ràng buộc "một nguồn số" của feature trước không được nới ra.

## Out of scope

- **Đổi đường trừ kho.** Nhịp 1 (`resolveBranchItemLocations`) và nhịp 2
  (`fulfillInvoiceFromTempWarehouse`) đều đang đúng; feature này chỉ dời *ngưỡng cảnh báo*
  cho khớp với tổng hai nhịp.
- **Chặn bán vượt tồn.** Nút "Vẫn bán" giữ nguyên.
- **Màn Chuyển kho nhanh (`FastStockTransferPage`)** — đã có `direction` riêng và đọc đúng
  đầu tồn nó cần; con số kho tạm ở đó là danh sách dòng, không phải trường tồn.
- **Backoffice** (`OverstockConfirmDialog` của phiếu xuất kho) — phiếu xuất chọn kho nguồn
  tường minh, không có khái niệm kho tạm.
- **`quantityOnHand`** giữ nguyên nghĩa tổng chi nhánh cho mọi consumer khác.
- **Đóng/mở phiên kho tạm, nghiệp vụ NET_OFFSET / CREATE_TRANSFERS** — không đụng.
- **Tách số hiển thị thành "tồn quầy + kho tạm".** Chốt hiển thị **một số gộp**
  (Akenzy 2026-08-23) để giữ ràng buộc "một nguồn số"; không thêm cột, không đổi nhãn.
- **Sửa tồn âm đã phát sinh** — ledger bất biến.

## Constraints

| Kind | Detail |
|---|---|
| Một nguồn số | Ngưỡng cảnh báo, tooltip `Tồn:`, cột `Số lượng tồn` và `Tồn khả dụng` phải đọc chung một trường do BE tính. FE không được tự cộng |
| Không thu hẹp catalog | Mặt hàng không có tồn ở đâu cả vẫn phải xuất hiện và bán khống được |
| Hai chiều | Dòng w2s **cộng** vào ngưỡng, dòng s2w **trừ** khỏi ngưỡng (quyết định của Akenzy 2026-08-23). Ngưỡng là *tồn showroom dự phóng sau khi mọi dòng kho tạm đang mở hạ cánh*, không phải tồn showroom hôm nay |
| Không double-count | Dòng kho tạm chưa vật chất hoá nên hàng vẫn nằm ở `stock_balances` của **vị trí nguồn**. Cộng/trừ chỉ được áp khi dòng đó thật sự vượt ranh giới main storage — nếu không, `showroomQuantity` đã đếm đúng rồi và điều chỉnh thêm là đếm hai lần |
| Ba đường đọc | Lưới catalog, quét mã (`lookupByCode`), dialog chọn biến thể đều nạp `maxQty` — cả ba phải cùng số |
| Chỉ phiên đang mở | Phiên `CLOSED` đã sinh phiếu chuyển kho thật, tồn đã vào `stock_balances`; cộng thêm dòng của phiên đóng là đếm hai lần |
| Ngôn ngữ | Source backend tiếng Anh; chuỗi UI tiếng Việt |
| Idempotency | Chỉ đụng đường đọc — không có mutation mới |

## Existing surface touched

**Backend — nơi tính tồn:**
- `apps/api/src/modules/pos/services/pos-catalog.service.ts`
  - `PosCatalogLineDto` (:6) — `showroomQuantity` (:26) là trường cảnh báo hôm nay
  - `aggregateStockRows` (:198) — điểm gom của `getCatalog` + `searchCatalogByTerm` + `lookupByCode`
- `apps/api/src/modules/pos/services/pos-catalog-product.service.ts`
  - `loadBranchStock` (:453) — điểm gom của dialog biến thể; `toVariantDto` (:427)
- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse.service.ts`
  - `getActiveSession` (:155), `fulfillInvoiceFromTempWarehouse` (:1260) — định nghĩa "hàng ở kho tạm bán được"

**Frontend — nơi dùng số:**
- `apps/pos-web/src/lib/page-libs/checkout/checkoutUtils.ts:110` — `readShowroomOnHand`
- `apps/pos-web/src/hooks/page-hooks/checkout/use-checkout-session-cart.ts:172`
- `apps/pos-web/src/stores/common/checkout-session.store.ts:353` — `syncPurchaseCartOnHand`
- `apps/pos-web/src/hooks/page-hooks/checkout/use-checkout-variant-selection.ts:42`
- `.../ProductVariantSelectionModal/VariantTable/VariantRow/VariantRow.tsx`
- `apps/pos-web/src/interfaces/catalog.interface.ts:19,78`

**Đọc, không sửa:**
- `resolve-branch-item-locations.ts` — nhịp 1
- `temp-warehouse-fulfill.consumer.ts` — nhịp 2
