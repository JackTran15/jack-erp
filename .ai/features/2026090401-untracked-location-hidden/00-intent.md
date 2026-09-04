---
feature: untracked-location-hidden
slug: 2026090401-untracked-location-hidden
owner: Akenzy
created: 2026-09-04
status: done
---

# Intent — Ẩn vị trí đã ngừng theo dõi khỏi "Vị trí hàng hoá" và "Chi tiết vị trí"

Khiếu nại QA #21 (trước là #12): "Đã ngừng theo dõi rồi, nhưng chi tiết vị trí vẫn hiển thị và
trạng thái Đã xếp." Đây là feature **sửa lỗi**, và là phần đuôi còn sót của
`2026090301-inventory-qa-defects` — đợt đó đã siết `is_tracked` ở picker auto-fill (D4) nhưng
**không** siết ở hai màn hình quản trị này, vì lúc lập kế hoạch chúng nằm ngoài phạm vi.

## Problem

Cột `stock_balances.is_tracked = false` ("Ngừng theo dõi") là cờ lưu thật, đặt ở trang "Chi tiết
vị trí" qua `POST /inventory/stock/balances/tracking` (`stock-ledger.service.ts:657`). Sau khi bấm
Ngừng theo dõi, ba chỗ đọc vẫn coi như không có gì xảy ra:

**P1 — Cột "Xếp hàng hoá" vẫn là "Đã xếp".** `HAS_ITEMS_SQL`
(`search-locations-v2.handler.ts:18-22`) là `EXISTS (SELECT 1 FROM stock_balances WHERE
location_id = location.id AND organization_id = :organizationId)`. Không có `is_tracked`. Một vị
trí mà **mọi** dòng đã ngừng theo dõi vẫn trả `has_items = true`, nên trang "Vị trí hàng hoá" hiện
"Đã xếp". Cùng vế đó vừa là projection vừa là predicate của bộ lọc cột, nên lọc "Chưa xếp" cũng
bỏ sót đúng những vị trí này.

**P2 — Hộp thoại chi tiết vẫn liệt kê đủ mã hàng.** Bấm một vị trí ở trang "Vị trí hàng hoá" mở
`LocationStockItemsDialog`, gọi `GET /inventory/locations/:locationId/stock-items`.
`buildWhere` (`inventory-location-stock.service.ts:474-546`) lọc mã / tên / ĐVT / nhóm / barcode /
`isActive` / `isPosVisible` — **không** lọc `isTracked`. Dòng đã ngừng theo dõi hiện nguyên.

**P3 — Trang "Chi tiết vị trí" ở chế độ xem một vị trí cũng vậy.** Trang này có hai chế độ và chỉ
một chế độ đúng. Chế độ chung (`!isLocationDetail`) gọi `listStockBalances` và `buildQuery`
(`ItemLocationDetailsQuery.ts:47-50`) mặc định `isTracked = true` — đúng. Chế độ xem một vị trí
(`isLocationDetail`, `ItemLocationDetailsPage.tsx:150-154`) gọi `listLocationStockItems` với
`locationParams` (`:104-128`) chỉ mang `page / pageSize / sortBy / sortOrder / itemCode / itemName`
— **không** mang `isTracked`, và rơi vào đúng endpoint hỏng của P2.

P2 và P3 là **một** nguyên nhân: `getStockByLocation` không biết tới `is_tracked`. Đó là lý do gộp
một feature thay vì vá hai chỗ.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| ------- | ----------------- | ----------------- |
| Nhân viên kho tra vị trí | Ngừng theo dõi xong, vị trí vẫn "Đã xếp" và mở ra vẫn thấy đủ mã — không phân biệt được kệ còn dùng với kệ đã bỏ | Vị trí chỉ còn dòng đã ngừng hiện "Chưa xếp"; mở ra không còn mã nào |
| Quản lý kho dọn kệ | Lọc "Chưa xếp" để tìm kệ trống thì sót đúng những kệ vừa ngừng theo dõi | Bộ lọc "Chưa xếp" trả cả những kệ đó |
| Người cần xem lại / bật lại | Chỉ có trang "Chi tiết vị trí" ở bộ lọc "Tất cả" | Giữ nguyên đường đó, **và** thêm bộ lọc trạng thái ngay trong hộp thoại chi tiết |

## Success signal

Chạy lại đúng kịch bản QA #21, đối chiếu bằng số chứ không bằng cảm nhận:

- Chọn một cặp (hàng hoá × vị trí) ở "Chi tiết vị trí" → Ngừng theo dõi → quay lại "Vị trí hàng
  hoá": nếu đó là dòng cuối cùng của vị trí thì cột "Xếp hàng hoá" đổi sang **"Chưa xếp"**, và vị
  trí đó **có** trong kết quả lọc "Chưa xếp", **không** còn trong kết quả lọc "Đã xếp".
- Mở hộp thoại chi tiết của vị trí đó → **0 dòng** ở trạng thái mặc định; đổi bộ lọc sang "Ngừng
  theo dõi" hoặc "Tất cả" → thấy lại đúng các mã vừa ngừng.
- Vào `/inventory/item-location-details?locationId=…` của vị trí đó → **0 dòng**, giống hộp thoại.
- Một vị trí còn ≥1 dòng đang theo dõi với **số lượng = 0** vẫn hiện **"Đã xếp"** và vẫn liệt kê
  mã đó (theo tiền lệ A-13 của đợt trước).
- Bật lại theo dõi → cả ba màn hình quay về trạng thái cũ, không mất ngưỡng min/max, không mất dòng.
- `pnpm --filter @erp/api test` xanh.

## Out of scope

- **Xoá dữ liệu khi Ngừng theo dõi.** Akenzy chốt lại 04/09/2026: giữ nguyên A-05 của
  `2026090301-inventory-qa-defects` — chỉ lọc ở chỗ đọc, không xoá `stock_balances`, không xoá
  `item_storage_locations`, không migration dọn dữ liệu cũ. Hệ quả có chủ ý: bật lại theo dõi phải
  khôi phục được nguyên trạng, nên dữ liệu phải còn.
- **Bộ lọc "Tất cả" ở trang "Chi tiết vị trí" (chế độ chung).** Đã đúng sẵn và là đường bật lại
  theo dõi duy nhất hiện có — không đụng.
- **Chứng từ đã lưu** vẫn hiển thị vị trí đã ngừng của nó. Giao dịch đã post là bất biến.
- **Ngoại lệ `includeUntracked=true` ở Chuyển kho tạm (POS)** — cố ý, giữ nguyên (A-10 đợt trước).
- **Vị trí ảo "Chưa xếp"** (`location.isUnassigned`) — đã bị loại khỏi danh sách bằng
  `includeUnassigned` và không liên quan tới `is_tracked`.
- **Chuẩn hoá "đã xếp" theo số lượng.** Akenzy chốt 04/09/2026: chỉ xét `is_tracked`, không xét
  `quantity > 0` — lọc theo số lượng sẽ ẩn nhầm kệ đang theo dõi mà tạm hết hàng.

## Constraints

| Kind | Detail |
| ---- | ------ |
| Schema | `synchronize: false`; đợt này **không có migration** — `is_tracked` đã tồn tại (`1786300000000-AddStockBalanceIsTracked`). Mọi thay đổi là logic đọc. |
| Ngôn ngữ | Backend chỉ tiếng Anh (lỗi, comment, swagger, log); tiếng Việt chỉ ở UI. |
| Hợp đồng API | Thêm tham số truy vấn mới ⇒ phải chạy lại `pnpm openapi:generate` và commit `schema.ts` + `packages/api-client/openapi.snapshot.json`. Global `ValidationPipe` bật `forbidNonWhitelisted`, nên FE gửi tham số chưa khai trong DTO sẽ ăn **400**. |
| Verify | Hai app đều là màn hình quầy/back-office, không có layout mobile: verify desktop-only. |
| Môi trường verify | `local-backoffice` chạy vite ở :3000 nhưng API :4000 là bản `dist/` build sẵn — phải `pnpm build` + khởi động lại API trước khi verify, nếu không tham số mới sẽ ăn 400 và cho **đỏ giả** (bẫy đã dính 31/08/2026, ghi trong `.ai/aidlc.yaml`). |

## Existing surface touched

- **Tái dùng làm mẫu**: `stock-ledger.service.ts:498-499` là hình mẫu đúng của một bộ lọc
  `isTracked` tuỳ chọn (`undefined` = tất cả); `ItemLocationDetailsQuery.ts:47-50` là hình mẫu đúng
  của FE mặc định `true` và bỏ hẳn tham số khi chọn "Tất cả";
  `ItemLocationDetailsColumns.tsx:16,87-94` là cột trạng thái theo dõi đã có sẵn để nhân bản sang
  hộp thoại.
- **Tiền lệ trực tiếp**: `.ai/features/2026090301-inventory-qa-defects/` (G5) — cùng dạng "cắm một
  cột đã có sẵn vào mọi chỗ phải tôn trọng nó"; A-05, A-13 và A-07 của đợt đó là ràng buộc kế thừa
  chứ không phải gợi ý. A-07 đặc biệt: bộ lọc phải **tuỳ chọn**, không được vô điều kiện.
- **Điểm vào**: không có route mới, không có màn hình mới; 2 màn hình đã tồn tại.
- **Endpoint chạm vào**: `POST /v2/inventory/locations/search`,
  `GET /inventory/locations/:locationId/stock-items`.
- **Nợ kỹ thuật phát hiện lúc discovery** (không phải yêu cầu của QA, xử lý ở UOW-01):
  `InventoryLocationService.listLocations` (`:817-829`) tính `hasItems` sai y hệt P1 và **có**
  route sống (`inventory-location.controller.ts:439`) dù backoffice không gọi;
  `StockByLocationItemDto` thiếu `isTracked` trong khi `toItem` (`:688`) đã trả về nó, nên
  `api-client` sinh ra không có trường này.
