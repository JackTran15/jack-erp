---
feature: promotion-item-discount-import-export
slug: 2026092701-promotion-item-discount-import-export
owner: Akenzy
created: 2026-09-27
status: draft
---

# Intent — CTKM Giảm giá hàng hóa: Nhập khẩu / Xuất khẩu + Copy xuống

## Problem

Yêu cầu gốc (mục 7 danh sách phản hồi, kèm hai ảnh chụp MISA eShop):

> *CTKM Giảm giá hàng hoá: Thêm Nhập khẩu & Xuất khẩu cho phần giảm giá theo %,
> giảm giá theo số tiền; thêm copy xuống.*

Lưới hàng hóa của form *Giảm giá hàng hóa* (`GoodsDiscountGrid.tsx`) chỉ nhận
dòng bằng cách gõ tìm từng mã hoặc chọn hàng loạt qua `PromotionTargetPicker`.
Mỗi dòng phải gõ tay `% giảm giá` / `Số tiền giảm`. Một CTKM thật (ảnh 2:
*GIÀY NỮ ONSALE 50%*) có hàng chục đến hàng trăm SKU, và người vận hành đang
quản lý danh sách đó bằng Excel. Hiện chưa có cách nào đưa danh sách vào hoặc
lấy ra, và cũng không có cách nào điền một giá trị cho nhiều dòng cùng lúc.

**Phát hiện khi khảo sát, đưa vào phạm vi (A-05).** Nếu chọn hàng ở chế độ
*Hàng hóa* bằng ô tra cứu của lưới (`/inventory/items`) thì dòng giữ **id của
hàng hóa (item)**. Nhưng `itemDiscountToDto` (`promotion.mapper.ts:555`) lưu
mọi dòng thành `targetType: PRODUCT`. Engine khớp `PRODUCT` với
`catalogItem.productId` (`line-matching.ts:24-25`), nên dòng đó không bao giờ
khớp ở POS. Chọn qua picker cũng mất `targetType` vì `addFromPicker` bỏ trường
này đi. E2E hiện có (`promotion-item-discount.e2e-spec.ts`) gửi thẳng
`targetType: 'ITEM'` và bỏ qua mapper, nên không bắt được lỗi này. Nhập khẩu
sẽ ghi item id qua đúng đường lưu này, nên phải sửa đường lưu trước.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Nhân viên tạo CTKM (backoffice) | Gõ tay từng SKU và từng giá trị giảm | Bấm **Nhập khẩu** để đưa file Excel vào lưới, gộp theo mã SKU. Bấm **Xuất khẩu** để tải danh sách đang có (hoặc file mẫu) |
| Nhân viên tạo CTKM (backoffice) | Muốn 30% cho cả danh sách thì phải gõ 30 ở từng dòng | Bấm icon **copy xuống** ở một dòng thì giá trị của dòng đó được chép sang mọi dòng bên dưới |
| Thu ngân (POS) | Hàng chọn từ ô tra cứu của lưới không được giảm | Hàng có trong CTKM được giảm đúng giá trị đã đặt |

## Success signal

1. File xuất ra rồi nhập lại **không sửa gì** thì lưới giữ đúng tập SKU và giá trị như trước: không nhân đôi dòng, không lệch số. Kiểm bằng e2e (xuất → nhập) và trên trình duyệt.
2. File có dòng lỗi (SKU không có, trùng SKU, giá trị sai) thì từng dòng lỗi được báo **đúng số dòng Excel và đúng lý do**. Các dòng hợp lệ vẫn được đưa vào.
3. CTKM chọn hàng qua ô tra cứu của lưới, sau khi lưu, được ghi xuống DB với `promotion_lines.target_type = 'ITEM'`, và `POST /v2/promotions/evaluate` trả phần giảm khác 0 cho SKU đó.
4. Mọi AC trong `02-requirements.md` đều có test hoặc ảnh chụp chứng minh.

## Out of scope

- Nhập/Xuất khẩu cho phạm vi **Nhóm hàng hóa** và cho **Đồng giá** (A-02). Hai nút bị ẩn trong hai trường hợp này.
- Thêm cột **Đơn vị tính / Giá bán / Giá khuyến mại** vào lưới trên màn hình (A-03). Chỉ file xuất có các cột này, để dễ đọc.
- Nhập khẩu cho các hình thức CTKM khác (giảm theo mức, tặng hàng, mua m tặng n).
- Nhập khẩu chạy nền theo job (bảng `inventory_import_jobs`). Xem ADR-01.
- Sửa dữ liệu các CTKM đã lưu sai `PRODUCT` trước đây (A-06). Không có migration: CTKM cũ giữ nguyên hành vi, người dùng tạo lại nếu cần.

## Constraints

| Kind | Detail |
| --- | --- |
| Đa tổ chức | Tra SKU theo `actor.organizationId`. Không có SKU của tổ chức khác lọt vào |
| Không lưu gì | Nhập/Xuất khẩu không ghi DB. Dòng chỉ vào state của form; bấm **Lưu** thì mới lưu (idempotency, audit giữ nguyên) |
| Thư viện | `backoffice-web` không có thư viện xlsx. `exceljs` chỉ có ở `apps/api`, nên việc đọc/ghi file làm ở server |
| Domain thuần | Không thêm `@nestjs/*` / `typeorm` vào `modules/promotion/domain/**` |
| Ngôn ngữ | Nhãn, tên cột, thông báo lỗi bằng tiếng Việt. Enum giữ tiếng Anh |
| Kiểm chứng web | `backoffice-web` không có test runner (`"test": "echo test"`), nên AC phía giao diện chứng minh bằng ảnh chụp trình duyệt (A-08) |

## Existing surface touched

**Tái sử dụng:**
- `GoodsDiscountGrid` + `LineItemGrid` (`@erp/ui`): thêm một cột thao tác, không viết lưới mới.
- Mẫu copy xuống của `BarcodeLabelGrid.tsx:318-337` / `InventoryItemBarcodesPage.tsx:479-487` (icon `ArrowDownToLine`, chỉ chép sang các dòng đã chọn hàng, bỏ qua dòng trống cuối).
- `components/shared/import-wizard/` (`ImportFilePicker`, `IMPORT_FILE_ACCEPT`) cho bước chọn file.
- `exceljs` + `common/utils/excel-workbook-font.util.ts` để dựng workbook.
- `mergeTargetsIntoGrid` (`promotion-target.ts`) để gộp dòng nhập vào lưới.

**Lối vào:** không thêm route. Hai nút **Nhập khẩu / Xuất khẩu** nằm ở hàng *Thiết lập* của lưới (giống ảnh 1). Icon copy xuống nằm ở mỗi dòng, cạnh icon xoá (giống ảnh 2).
