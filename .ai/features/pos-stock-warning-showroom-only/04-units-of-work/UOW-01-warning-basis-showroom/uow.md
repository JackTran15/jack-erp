---
id: UOW-01
slug: warning-basis-showroom
title: Cảnh báo trên dòng hoá đơn và dialog bán khống đọc tồn showroom
demoable: true
duration: 2d
depends_on: []
requirements: [US-01, US-02, US-04]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-11, AC-12, AC-13]
risk: medium
status: todo
rollback: gỡ `showroomQuantity` khỏi DTO và trả ba chỗ đọc ở FE về `quantityOnHand`. Không schema, không migration, không dữ liệu phải dọn — hai endpoint đụng tới đều trả type thuần nên `openapi.snapshot.json` cũng không đổi
---

# UOW-01 — Cảnh báo trên dòng hoá đơn và dialog bán khống đọc tồn showroom

Lát cắt chữa đúng thứ được báo: `BX140` có 4 ở quầy, 8 trong kho, POS ghi `Tồn: 12` và im
tới khi bán quá 12. Sau lát cắt này, bán quá **4** là đỏ, và bảng xác nhận lúc thu tiền nói
cùng con số.

Phủ hai trong ba lối một mặt hàng vào giỏ — gõ tìm/lưới (`getCatalog`) và quét mã vạch
(`lookupByCode`) — vì cả hai dồn về cùng một hàm gom, `aggregateStockRows`. Lối thứ ba
(dialog chọn biến thể) đi qua endpoint khác và là UOW-02.

Rủi ro thật của lát cắt không nằm ở phép cộng. Nó nằm ở chỗ **hỏng thì hỏng im**: nếu FE lên
trước BE, `qty > undefined` cho `false` và cảnh báo tắt sạch mà không có lỗi nào. ADR-04 xử
lý bằng hai lớp, và cả hai đều phải có mặt trong lát cắt này chứ không để dành.

## Demo script

1. Backoffice → Kho hàng → Vị trí hàng hóa → lọc SKU `BX140` tại MT46: xác nhận
   `Kho MT46 / 999 = 8` và `Showroom MT46 / Mặc định = 4`.
2. Chạy truy vấn đối chiếu định nghĩa showroom (A-06, ADR-01) và dán kết quả vào
   `07-verification.md`:
   ```sql
   SELECT b.name,
          array_agg(DISTINCT s.id) FILTER (WHERE s.is_main_storage)      AS main_storages,
          array_agg(DISTINCT sr.storage_id)                              AS showroom_storages
   FROM branches b
   LEFT JOIN storages  s  ON s.branch_id = b.id
   LEFT JOIN showrooms sr ON sr.branch_id = b.id
   GROUP BY b.id, b.name;
   ```
   Hai cột lệch nhau ở chi nhánh nào thì **báo cáo**, không đi tiếp lặng lẽ.
3. POS → Bán hàng tại MT46 → gõ tìm `BX140` → thêm vào giỏ, SL = **4**: không có chấm đỏ.
4. Tăng SL lên **5**: chấm đỏ hiện, hover tooltip ghi `Hàng hóa quá số lượng tồn` /
   `Tồn: 4`. Trước lát cắt này là `Tồn: 12` và không có chấm đỏ.
5. Bấm **Thu tiền (F9)**: dialog "Cảnh báo xuất quá số lượng tồn" liệt kê `BX140` với
   `Số lượng tồn = 4`, `Tồn khả dụng = 4`.
6. Bấm "Vẫn bán" → hoá đơn thanh toán bình thường (bán khống không bị chặn).
7. Sau khi chốt đơn, catalog refetch: dòng còn lại trong giỏ (nếu có) vẫn giữ cơ sở showroom,
   không nhảy về 12.
8. Xoá giỏ, lần này **quét/gõ đúng mã vạch** `BX140` để auto-add: `maxQty` vẫn là 4 — cùng
   ngưỡng với lối gõ tìm.
9. Chọn một mặt hàng POS-visible chỉ có tồn ở kho lưu trữ: nó **vẫn** tìm được, vẫn thêm
   được vào giỏ, và cảnh báo bật ngay từ SL = 1 với `Tồn: 0`.

## In scope

- `PosCatalogLineDto.showroomQuantity` — trường mới, đứng cạnh `quantityOnHand` (ADR-03).
- Phân loại theo `storages.is_main_storage` trong phạm vi chi nhánh (ADR-01), thêm vào cả ba
  query: `getCatalog`, `searchCatalogByTerm`, `lookupByCode` (A-10).
- Gom ở `aggregateStockRows`: `quantityOnHand` giữ nguyên công thức, `showroomQuantity` cộng
  riêng.
- FE: `PosCatalogLine.showroomQuantity`; `addProduct` và `syncPurchaseCartOnHand` đổi nguồn
  `maxQty`; thiếu trường ⇒ `onHandUnknown = true`, **không** fallback (ADR-04).
- Viết lại hai chú thích khẳng định ngược lại (`use-checkout-session-cart.ts:168-171`,
  `checkout-session.store.ts:352-354`) (A-08).
- Truy vấn đối chiếu A-06 và ghi kết quả.

## Not in scope

- Dialog chọn biến thể (`/catalog/products/:id`, `VariantRow`) — UOW-02.
- `PosCatalogQueryDto.direction` và Chuyển kho nhanh (ADR-02).
- `defaultLocationId` (A-12), chặn bán khống, `Khách đặt` / `Chờ lấy hàng`.

## Risks

| Risk | Mitigation |
|---|---|
| FE lên trước BE ⇒ `qty > undefined` = false ⇒ cảnh báo tắt sạch, im lặng | T-01-03 phụ thuộc T-01-02; và FE coi trường thiếu là `onHandUnknown` chứ không fallback (ADR-04). T-01-04 có test khoá đúng nhánh này |
| Trong khoảng giữa UOW-01 và UOW-02, dòng thêm từ dialog biến thể sẽ `onHandUnknown` | Chấp nhận có ý thức: cảnh báo bật kèm "Chưa xác định được tồn kho" — xấu nhưng ồn, không im. UOW-02 dọn nốt |
| Vô tình lọc mất mặt hàng chỉ có tồn kho lưu trữ (A-04) | T-01-01 có case khẳng định **tập itemId trả về không đổi** trước và sau, chạy đỏ trước khi sửa service |
| Đổi nhầm ý nghĩa `quantityOnHand` làm Chuyển kho nhanh lệch âm thầm (A-07) | T-01-01 khẳng định `quantityOnHand` vẫn = tổng chi nhánh (12) trong cùng fixture |
| `showrooms` lệch `is_main_storage` trên dữ liệu thật (A-06) | Bước 2 của Demo script là truy vấn đối chiếu, bắt buộc, có output ghi lại |

## Definition of done

- [ ] 10 AC thuộc UoW này chạy được và xanh
- [x] `pnpm --filter @erp/api test -- pos-catalog.service.spec.ts` xanh (13/13; cả bộ API 2823 test)
- [x] `npx vitest run` trong `apps/pos-web` xanh (103/103) (A-13)
- [x] Truy vấn đối chiếu A-06 đã chạy, kết quả nằm trong `07-verification.md` — hai tập trùng khít trên cả 3 chi nhánh
- [x] Không còn chú thích nào trong repo khẳng định `quantityOnHand` là cơ sở cảnh báo
- [ ] Demo script chạy hết 9 bước trên môi trường thật, có ảnh chụp bước 4 và bước 5
