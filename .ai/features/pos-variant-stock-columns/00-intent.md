---
feature: pos-variant-stock-columns
slug: pos-variant-stock-columns
owner: Akenzy
created: 2026-08-24
status: draft
---

# Intent — Hai cột tồn trong dialog chọn biến thể POS

## Problem

Dialog chọn biến thể ở POS (`ProductVariantSelectionModal`) có hai cột tồn, và cả hai
đều không trả lời được câu hỏi thu ngân đang hỏi.

- **`Tồn cửa hàng khác`** đang là số `0` cứng trong code — `VariantRow.tsx:90` render
  literal `0` cho mọi dòng, mọi biến thể, mọi chi nhánh. Cột này chưa bao giờ được nối
  dữ liệu. Khi khách hỏi "size 40 chi nhánh khác còn không?", thu ngân phải gọi điện
  từng chi nhánh, hoặc mở backoffice ở tab khác.
- **`Tồn kho`** đang hiện `sellableQuantity` — tồn showroom **dự phóng** (đã cộng hàng
  kho tạm, kẹp sàn 0). Đó là *ngưỡng cảnh báo*, không phải *lượng hàng đang nằm ở đâu*.
  Một con số duy nhất, không phân rã, nên thu ngân không biết hàng đang ở quầy hay còn
  nằm trong kho lưu trữ — hai tình huống dẫn tới hai hành động khác nhau (bán ngay, hay
  gọi kho lấy hàng).

Hệ quả: dialog trông đủ cột nhưng vô dụng cho quyết định bán hàng. Một cột nói dối
(luôn `0`), một cột nói thật nhưng không đủ chi tiết.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Thu ngân POS | Thấy `Tồn cửa hàng khác = 0` cho mọi dòng → bỏ qua cột, gọi điện hỏi chi nhánh khác | Nhìn cột là biết chi nhánh khác còn tổng bao nhiêu, không rời màn bán hàng |
| Thu ngân POS | Thấy `Tồn kho = 2`, không biết 2 cái đó ở quầy hay trong kho | `Tồn kho` = số dư thô kho showroom; hover ra danh sách từng kho của chi nhánh |
| Quản lý cửa hàng | Không có căn cứ tại chỗ để quyết định điều chuyển | Thấy ngay chênh lệch tồn giữa chi nhánh mình và các chi nhánh khác |

## Success signal

Mở dialog cho một biến thể bất kỳ có tồn ở ≥ 2 chi nhánh ACTIVE: cột
`Tồn cửa hàng khác` hiện đúng tổng tồn của các chi nhánh ACTIVE **khác** (đối chiếu tay
với báo cáo tồn kho backoffice, sai lệch 0), và hover vào `Tồn kho` liệt kê đủ mọi kho
đang hoạt động của chi nhánh hiện tại kèm số dư — kể cả kho có tồn 0 và kho có tồn âm.

## Out of scope

- **Thẻ sản phẩm ngoài lưới catalog** — user chốt phạm vi chỉ trong dialog; thêm quét
  tồn org-wide cho mỗi trang lưới là một bài toán hiệu năng riêng.
- **Dòng giỏ hàng** — không thêm tooltip phân rã kho ở giỏ; giỏ giữ nguyên
  `sellableQuantity`.
- **Đổi ngưỡng cảnh báo vượt tồn** — cảnh báo vẫn so với `sellableQuantity`
  (quyết định của user, xem A-04/ADR-02). Feature này chỉ đổi *thứ được hiển thị*.
- **Điều chuyển hàng từ trong dialog** — chỉ đọc, không có nút "yêu cầu chuyển".
- **Phân rã theo vị trí (kệ/ô)** — tooltip phân rã ở mức **kho (storage)**, không xuống
  mức `locations` như payload hiện có.

## Constraints

| Kind | Detail |
|---|---|
| Platform | POS web (`apps/pos-web`), React 19 + TanStack Query; UI tiếng Việt |
| Backend | NestJS, endpoint hiện có `GET /pos/branches/:branchId/catalog/products/:id` |
| Data | `stock_balances` là bảng denormalized (org, item, location); chi nhánh nằm trên `branch_id` của balance, kho nằm trên `locations.storage_id` |
| Scoping | Truy vấn cross-branch phải giữ nguyên `organizationId` scope — không được rò dữ liệu sang org khác |
| Perf | Dialog mở là chặn thao tác bán; thêm 1 lượt quét balance org-wide cho ~10–500 biến thể phải nằm trong ngân sách phản hồi hiện tại |
| Existing decision | `sellableQuantity` (showroom + kho tạm, sàn 0) là ngưỡng cảnh báo đã chốt ở `pos-stock-warning-showroom-only` và `pos-stock-warning-temp-warehouse` — không đảo |

## Existing surface touched

- **Backend**: `apps/api/src/modules/pos/services/pos-catalog-product.service.ts`
  (`loadBranchStock`, `toVariantDto`, `buildProductDetail`, `buildItemDetail`),
  `apps/api/src/modules/pos/dto/pos-catalog-product.response.dto.ts`
  (`PosProductVariantDto`, `PosVariantLocationDto`).
- **Entities đọc thêm**: `BranchEntity` (lọc `status = ACTIVE`), `ShowroomEntity`
  (`is_main_showroom` → `storage_id`), `StorageEntity` (tên kho, `is_active`).
- **Frontend**: `apps/pos-web/src/interfaces/catalog.interface.ts`
  (`PosProductVariant`), `.../ProductVariantSelectionModal/VariantTable/VariantTable.tsx`,
  `.../VariantTable/VariantRow/VariantRow.tsx`.
- **Tái dùng**: `Tooltip`/`TooltipContent`/`TooltipTrigger` từ `@erp/ui` (đã có
  `TooltipProvider` bọc sẵn ở `VariantTable`), `qtyFormatter` từ `checkoutUtils`.
- **Adjacent features**: `pos-stock-warning-showroom-only`,
  `pos-stock-warning-temp-warehouse` (sở hữu định nghĩa `sellableQuantity`),
  `temp-warehouse-scan-add-line`.
- **Entry points**: không có route mới; chỉ mở rộng payload của endpoint sẵn có và
  render thêm trong dialog đã tồn tại.
