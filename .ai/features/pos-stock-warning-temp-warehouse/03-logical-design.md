---
feature: pos-stock-warning-temp-warehouse
adr_count: 5
---

# Logical design — Cảnh báo vượt tồn cộng kho tạm

## Approach

Không đổi schema, không đổi luật cảnh báo, không đổi đường trừ kho. Vẫn là **thay số nạp
vào** phép so sánh đã có (`lineExceedsOnHandSnapshot`: `line.qty > line.maxQty`), lần này
đổi thêm một bậc nữa.

Feature trước dời cơ sở cảnh báo từ *tổng tồn chi nhánh* về *tồn showroom*. Feature này dời
tiếp về **tồn showroom dự phóng** — tồn showroom sau khi mọi dòng kho tạm đang mở hạ cánh:

```
sellableQuantity(item, branch)
  = Σ stock_balances.quantity  ∀ vị trí thuộc storage is_main_storage của chi nhánh
  + Σ dòng kho tạm ACTIVE có đích ∈ main storages và nguồn ∉ main storages
  − Σ dòng kho tạm ACTIVE có nguồn ∈ main storages và đích ∉ main storages
  (kẹp sàn ở 0)
```

Vế thứ hai là chính xác tập dòng mà `fulfillInvoiceFromTempWarehouse` tiêu thụ sau mỗi hoá
đơn — nhịp hai của đường trừ kho POS. Vế thứ ba là quyết định của người dùng (ADR-04): hàng
đã quét để trả về kho không còn tính là bán được, dù sổ vẫn để nó ở showroom.

### Vì sao là ranh giới main storage, không phải nhãn `direction`

Một dòng kho tạm **chưa** đụng vào `stock_balances`: hàng vẫn nằm nguyên ở vị trí nguồn cho
tới khi đóng phiên hoặc bị hoá đơn tiêu thụ. Nên câu hỏi đúng không phải "dòng này chiều
nào" mà là "**dòng này có làm tồn showroom đổi khi hạ cánh không**".

`openSession` (`temp-warehouse.service.ts:283`) cho client ghim `warehouseStorageId` tuỳ ý
và chỉ chặn khi hai vị trí *trùng nhau*, nên một phiên w2s hoàn toàn có thể lấy nguồn từ
chính main storage. Khi đó 3 đơn vị đã quét vẫn đang nằm trong `showroomQuantity`; cộng thêm
là đếm hai lần. Phép thử theo ranh giới xử lý đúng cả trường hợp đó mà không cần biết nhãn
(ADR-01, AC-10).

Nguồn/đích của một dòng suy ra như `buildEventPayload` (:1081-1092) đang làm:

| direction | nguồn | đích |
|---|---|---|
| `warehouse_to_showroom` | `line.source_location_id` ?? `session.warehouse_location_id` | `session.showroom_location_id` |
| `showroom_to_warehouse` | `line.source_location_id` ?? `session.showroom_location_id` | `session.warehouse_location_id` |

### Đường chảy của con số

```
temp_warehouse_lines (ACTIVE)  ─┐
temp_warehouse_sessions (ACTIVE)├─→ TempWarehouseStagedStockService.getBranchDelta()
locations → storages            ┘         Map<itemId, delta>   (một truy vấn / request)
                                                   │
stock_balances ──→ Σ main storage ─────────────────┤
                                                   ▼
                              sellableQuantity  (kẹp sàn 0)
                                 ├─ PosCatalogLineDto        (getCatalog / search / lookup)
                                 └─ PosProductVariantDto     (dialog biến thể)
                                                   │
                                                   ▼ FE
                              readSellableOnHand → line.maxQty
                                 ├─ lineExceedsOnHandSnapshot → chấm đỏ + "Tồn: N"
                                 └─ getOversellSaleLines      → dialog bán khống
                              VariantRow → đọc thẳng variant.sellableQuantity
```

Bốn chỗ hiển thị vẫn không chỗ nào tự tính lại — ràng buộc "một nguồn số" giữ nguyên.

## Alternatives rejected

| Option | Why not |
|---|---|
| Cộng kho tạm ở FE (gọi thêm `GET /temp-warehouse/lines` rồi tự cộng vào `showroomQuantity`) | FE không biết vị trí nào thuộc main storage, nên không thực hiện được phép thử ranh giới (A-04) — đúng cái sai mà feature trước đã bác. Thêm một request nữa trên đường nóng của màn bán hàng |
| Coi kho tạm là một storage rồi nới bộ lọc `is_main_storage` | Kho tạm **không có** bản ghi `stock_balances` nào (A-R1). Không có gì để nới bộ lọc vào |
| Phân loại theo nhãn `direction` (w2s cộng, s2w trừ) không kiểm tra ranh giới | Đếm hai lần khi phiên ghim nguồn/đích nằm cùng phía main storage — `openSession` cho phép cấu hình đó (AC-10) |
| Join thẳng kho tạm vào ba câu SQL catalog sẵn có | Ba bản sao của cùng một luật ranh giới, trong ba chuỗi SQL dài. Luật này là phần dễ sai nhất của feature; nó phải sống ở đúng một chỗ kiểm thử được |
| Vật chất hoá dòng kho tạm vào `stock_balances` ngay lúc quét | Đổi hẳn nghiệp vụ kho tạm (phiếu chuyển kho, sổ kho, giá vốn). Ngoài phạm vi, và phá luôn màn Chuyển kho nhanh |
| Giữ `showroomQuantity` rồi **thêm** `sellableQuantity` bên cạnh | Sau khi FE chuyển sang trường mới thì `showroomQuantity` không còn ai đọc — để lại một trường chết trong DTO và trong api-client sinh tự động (ADR-02) |
| Không kẹp sàn 0 | Ngưỡng âm không đổi hành vi cảnh báo (SL ≥ 1 vẫn vượt) nhưng tooltip hiện "Tồn: −2" |

## Contracts

**`PosCatalogLineDto`** (`pos-catalog.service.ts:6`) — đổi tên trường, không thêm/bớt:

```ts
/** Tổng tồn tại chi nhánh (cộng mọi vị trí lưu). Không phải cơ sở cảnh báo. */
quantityOnHand: number;
/**
 * Projected main-storage (showroom) on-hand once every open temp-warehouse
 * line lands: showroom stock, plus lines staged into the showroom, minus lines
 * staged out of it. This is what a POS sale can actually take — deduction runs
 * in two beats (resolveBranchItemLocations on the showroom, then
 * fulfillInvoiceFromTempWarehouse off the staged lines), and the oversell
 * warning has to sit on the sum of both. Floored at 0.
 */
sellableQuantity: number;
```

Đổi y hệt trên `PosProductVariantDto` (`pos-catalog-product.response.dto.ts:83`).

**`TempWarehouseStagedStockService`** — provider mới trong
`modules/inventory/temp-warehouse/`, export từ `TempWarehouseModule`:

```ts
/**
 * Net effect of a branch's open temp-warehouse lines on its main-storage
 * (showroom) on-hand, per item. Positive where staged stock is heading into the
 * showroom, negative where it is heading out. Only lines that cross the
 * main-storage boundary count: anything staged inside it is already in
 * stock_balances.
 */
getBranchDelta(branchId: string, organizationId: string): Promise<Map<string, number>>;
```

Một truy vấn trả về **từng dòng kho tạm đang mở** kèm hai cờ đã phân giải
(`sourceIsMainStorage`, `destinationIsMainStorage`); dấu và phép cộng dồn chạy trên RAM.
Chi phí không phụ thuộc số mặt hàng của catalog (A-10).

**FE** — `readShowroomOnHand` → `readSellableOnHand` (`checkoutUtils.ts:110`), cùng ngữ
nghĩa fail-safe: thiếu trường ⇒ `null` ⇒ `onHandUnknown` ⇒ luôn cảnh báo.

## Error taxonomy

| Tình huống | Xử lý | Người dùng thấy |
|---|---|---|
| Chi nhánh không có phiên ACTIVE nào | `getBranchDelta` trả map rỗng | Ngưỡng = tồn showroom, y như hôm nay (AC-03) |
| Truy vấn kho tạm lỗi | Không nuốt lỗi: để lỗi nổi lên như mọi lỗi catalog khác | Catalog báo lỗi tải; FE giữ ngưỡng cũ và mọi dòng chưa xác định vẫn cảnh báo |
| Dòng kho tạm trỏ vị trí đã bị xoá/ngừng hoạt động | `JOIN locations` trượt → dòng không tính vào delta | Ngưỡng lùi về tồn showroom cho mặt hàng đó — an toàn theo hướng cảnh báo thừa |
| Chi nhánh chưa cấu hình main storage | Không có storage nào `is_main_storage` → `showroomQuantity` 0 và mọi dòng kho tạm đều "không vượt ranh giới" → delta 0 | Ngưỡng 0, mọi dòng cảnh báo. Đúng: chi nhánh chưa cấu hình thì POS không biết trừ ở đâu |
| BE cũ / payload thiếu `sellableQuantity` | FE `readSellableOnHand` trả `null` → `onHandUnknown` | Luôn hiện cảnh báo; không bao giờ im lặng |
| `sellableQuantity` âm (s2w quét nhiều hơn tồn showroom) | Kẹp sàn 0 | Tooltip "Tồn: 0"; mọi SL ≥ 1 đều cảnh báo |

## ADRs

### ADR-01 — Phân loại dòng kho tạm theo ranh giới main storage, không theo nhãn `direction`

**Status:** accepted (2026-08-23)

**Context.** Cần biết dòng kho tạm nào làm tồn showroom đổi. Nhãn `direction` (w2s/s2w) là
cách gọi tên sẵn có và trông đủ dùng. Nhưng `openSession` cho client ghim
`warehouseStorageId` / `showroomStorageId` tuỳ ý, chỉ chặn khi hai vị trí trùng nhau — nên
một phiên w2s có thể lấy nguồn từ chính main storage, và khi đó hàng đã nằm sẵn trong
`showroomQuantity`.

**Decision.** Cộng khi **đích ∈ main storages và nguồn ∉**; trừ khi **nguồn ∈ main storages
và đích ∉**; các trường hợp còn lại delta 0. Nhãn `direction` chỉ dùng để suy ra đâu là
nguồn đâu là đích, không dùng để quyết định dấu.

**Consequences.** Cần join `locations → storages` cho cả hai đầu của mỗi dòng — truy vấn
dài hơn một phép `SUM` theo `direction`. Đổi lại không thể đếm hai lần, kể cả với cấu hình
phiên lệch chuẩn. AC-10 kiểm đúng nhánh này.

### ADR-02 — Đổi tên `showroomQuantity` → `sellableQuantity` thay vì đổi âm thầm ý nghĩa

**Status:** accepted (2026-08-23)

**Context.** Trường `showroomQuantity` ra đời hôm 2026-08-22 với nghĩa "tồn ở main
storages". Sau feature này nó là "tồn showroom dự phóng gồm cả kho tạm" — cái tên không còn
đúng. Ba lựa chọn: giữ tên đổi giá trị; thêm trường mới để hai trường cùng tồn tại; đổi tên.

**Decision.** Đổi tên tại chỗ thành `sellableQuantity` trên cả `PosCatalogLineDto` và
`PosProductVariantDto`, kèm `readShowroomOnHand` → `readSellableOnHand`.

**Rationale.** Đổi giá trị mà giữ tên thì **hỏng im lặng**: quên một trong ba đường đọc BE,
FE vẫn nhận một con số hợp lệ nhưng sai, không có gì báo. Đổi tên thì đường nào quên sẽ trả
`undefined` → `readSellableOnHand` trả `null` → `onHandUnknown` → luôn cảnh báo: hỏng ồn ào
và an toàn. Thêm trường thứ hai thì `showroomQuantity` thành trường chết ngay khi FE chuyển
sang trường mới.

**Consequences.** Đụng ~10 tệp BE+FE (phần lớn là một dòng), phải chạy
`pnpm openapi:generate` và commit `packages/api-client/src/generated/schema.ts`. Các test
của feature trước phải sửa — nhưng chúng phải sửa sẵn rồi vì giá trị kỳ vọng đổi. Buộc phải
sửa lại một dòng NFR ở `02-requirements.md` (G1 reopen).

### ADR-03 — Gom kho tạm bằng một provider riêng, không join vào SQL catalog

**Status:** accepted (2026-08-23)

**Context.** Ba đường đọc catalog (`getCatalog`, `searchCatalogByTerm`, `lookupByCode`) là
ba chuỗi SQL riêng, cộng thêm `loadBranchStock` của dialog biến thể dùng TypeORM repo. Luật
ranh giới (ADR-01) phải áp cho cả bốn.

**Decision.** `TempWarehouseStagedStockService.getBranchDelta()` trả `Map<itemId, delta>`
cho cả chi nhánh bằng một truy vấn; bốn đường đọc gọi nó rồi cộng vào lúc gom.
`TempWarehouseModule` export provider này; `PosModule` import module đó (không có chu trình:
`TempWarehouseModule` không import `PosModule`).

SQL chỉ làm phần nó làm tốt: lọc dòng đang mở và **phân giải hai đầu của mỗi dòng thành hai
cờ** `sourceIsMainStorage` / `destinationIsMainStorage`. Luật ranh giới (ADR-01) — chọn dấu
rồi cộng dồn theo mặt hàng — chạy trên RAM bằng JS, không `GROUP BY`.

**Rationale.** Nếu luật ranh giới nằm trong `CASE WHEN` của SQL thì mười mục done-when của
T-01-01 chỉ kiểm được bằng e2e có DB thật; repo này chạy e2e tuần tự và tốn kém, còn spec
sẵn có của `PosCatalogService` mock thẳng `DataSource.query`. Đặt luật ở JS cho phép kiểm
từng nhánh bằng unit test rẻ, và khớp với quy ước "gom trên RAM, không GROUP BY" của repo.

**Consequences.** Thêm một round-trip DB cho mỗi request catalog, và dữ liệu trả về là từng
dòng thay vì một tổng — chấp nhận được vì một phiên là một ca làm việc của một chi nhánh
(A-10). Đổi lại luật ranh giới nằm ở đúng một chỗ, kiểm thử được độc lập, và không có bản
sao SQL nào để lệch nhau. Không N+1: một truy vấn cho toàn chi nhánh bất kể catalog bao
nhiêu dòng.

### ADR-04 — Trừ dòng s2w khỏi ngưỡng

**Status:** accepted (2026-08-23)

**Context.** Dòng s2w là hàng đã quét để trả về kho lưu trữ: vật lý đã rời quầy, nhưng
`stock_balances` vẫn đếm nó ở showroom và `resolveBranchItemLocations` vẫn trừ được từ đó.
Nhịp bù kho (`fulfillInvoiceFromTempWarehouse`) chỉ tiêu thụ dòng w2s, không đụng s2w.

**Decision.** Trừ. Ngưỡng bám hàng còn ở quầy về mặt vật lý, không bám sổ sách.

**Rationale.** Quyết định của Akenzy 2026-08-23, chọn ngược khuyến nghị ban đầu (khuyến nghị
là bỏ qua s2w cho khớp đúng đường trừ kho). Đánh đổi đã nêu trước khi chốt: ngưỡng sẽ thấp
hơn lượng POS thật sự xuất được, nên có giao dịch vẫn xuất trọn vẹn mà vẫn hiện cảnh báo.

**Consequences.** Cảnh báo có thể bật cho giao dịch hợp lệ khi phiên s2w đang mở — đúng
kiểu "cảnh báo thừa" mà `00-intent.md` đang chữa, chỉ khác nguồn. Chấp nhận vì hàng s2w đã
được nhân viên chủ động đánh dấu là rời quầy. Nếu thực địa cho thấy cảnh báo thừa quá nhiều,
đảo lại chỉ là đổi dấu ở một chỗ (`getBranchDelta`), không đụng gì khác.

### ADR-05 — Kẹp sàn `sellableQuantity` ở 0

**Status:** accepted (2026-08-23)

**Context.** Với ADR-04, s2w quét nhiều hơn tồn showroom cho ra ngưỡng âm.

**Decision.** Kẹp sàn ở 0 tại BE, trước khi trả về.

**Rationale.** Ngưỡng âm và ngưỡng 0 cho **cùng** hành vi cảnh báo (mọi SL ≥ 1 đều vượt),
nên kẹp không mất gì; đổi lại tooltip không hiện "Tồn: −2". Kẹp ở BE chứ không ở FE để giữ
"một nguồn số".

**Consequences.** BE mất khả năng phân biệt "vừa đúng 0" với "âm sâu". Không ai đang cần
phân biệt đó — nếu sau này cần, thêm trường chẩn đoán riêng chứ không bỏ kẹp.
