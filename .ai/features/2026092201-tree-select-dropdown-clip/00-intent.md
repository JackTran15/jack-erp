---
feature: tree-select-dropdown-clip
slug: 2026092201-tree-select-dropdown-clip
owner: Akenzy
created: 2026-09-22
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Dropdown Mục cha trong dialog Danh mục thu chi bị modal cắt, không cuộn được

Nguồn: Akenzy, mục 11 danh sách lỗi ngày 22/09/2026, kèm ảnh dialog "Sửa Mục thu / Mục chi" của `THU_KHAC`:
"Không scroll được Mục cha, dropdown bị modal chặn height, thấy được ít options quá".

## Problem

Trên `/admin/cash-voucher-categories`, mở dialog Sửa một mục rồi bấm vào ô **Mục cha**: danh sách gợi ý chỉ lộ 3 dòng
rồi bị cắt ngang ở mép dưới vùng nội dung của modal (ngay trên footer Lưu / Hủy bỏ). Không cuộn được để thấy các mục
còn lại.

Hai lớp nguyên nhân, đều ở frontend:

1. `TreeSelectInput` (`apps/backoffice-web/src/components/forms/TreeSelectInput.tsx:426`) render danh sách bằng
   `position: absolute` ngay trong ô nhập. Mọi tổ tiên có `overflow` khác `visible` hoặc `contain: paint` đều cắt nó.
   `AppModal` (`packages/ui/src/components/app-modal.tsx`) có cả hai: `DialogContent` mang `[contain:layout_paint]`
   (:508) và lớp bọc body mang `overflow-hidden` (:607).
2. #282 (`2026091801-cash-voucher-category-tree`, T-01-04) đã thấy vấn đề và vá bằng
   `bodyClassName="overflow-visible"` cho entity dạng cây (`CrudFormDialog.tsx:443`). Lớp bọc ngoài vẫn
   `overflow-hidden` (đã có từ trước #282) nên vá không thoát được vết cắt, nhưng lại **bỏ `overflow-auto` của body**
   ⇒ form không cuộn được nữa: ở màn hình thấp, các ô cuối form (Đang hoạt động, Thứ tự hiển thị) rơi ra ngoài vùng
   nhìn và không có cách chạm tới. Đây là vế "không scroll được".

Cùng `TreeSelectInput` là picker của **mọi** field `relation` trong `CrudFormDialog` (Nhóm hàng hoá, Nhóm NCC, Tài
khoản kế toán cha, Tài khoản tiền gửi, Ngân hàng…), của `CrudRecordDialog`, `ItemCategoryCreateDialog`,
`ProductSelectDialog`, `CategorySelectDialog`, của bộ lọc "Nhóm hàng hoá" trong `StockSummaryFilterPopover` — chỗ này
đã phải ghi chú "không giới hạn chiều cao / không `overflow`" để né cùng lỗi (:90-91) — và của `ReportFilterLine`
trong popover chọn báo cáo. `LookupField` (`components/forms/LookupField.tsx:346-404, 524-540`) trong cùng thư mục đã
giải quyết đúng bài này: portal vào `[role="dialog"]` gần nhất (fallback `body`), `position: fixed` đo theo ô nhập,
lật lên trên khi thiếu chỗ, đo lại khi cuộn/resize; `AppModal` đã có sẵn guard bỏ qua click-ngoài trên
`[data-lookup-popover]` (:529-551).

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Kế toán cấu hình Danh mục thu chi | Ô Mục cha lộ 3 dòng, không cuộn; ở màn hình thấp không tới được các ô cuối form | Thấy đủ danh sách (≈10 dòng), cuộn được, chọn được; form cuộn bình thường |
| Người cấu hình Nhóm hàng hoá / Nhóm NCC / Tài khoản kế toán / Tài khoản tiền gửi qua CRUD generic | Cùng picker, cùng bị cắt trong dialog | Cùng được sửa, không phải đụng từng màn |
| Người dùng bộ lọc "Nhóm hàng hoá" ở Quản lý kho | Panel phải bung không giới hạn để dropdown khỏi bị cắt | Dropdown tự nổi lên trên panel, chọn xong panel vẫn mở |

## Success signal

Trên backoffice local `:3000` (API `:4000`, DB `erp_dev_3008`, org MT — 9 mục thu, 34 mục chi), Chrome:

1. Sửa `THU_KHAC` → bấm Mục cha: thấy đủ 8 mục thu còn lại (9 mục IN trừ chính nó) trong một khung, không bị cắt ở
   mép modal; bấm chọn một mục thì ô nhận "MÃ · Tên", dialog **không** đóng.
2. Sửa một mục chi → bấm Mục cha: lăn chuột trong khung cuộn được, các trang sau tự tải tới đủ 33 mục; nội dung modal
   phía sau không trôi.
3. Khung nhìn 1440×720: danh sách vẫn nằm trọn trong viewport (lật lên trên khi thiếu chỗ bên dưới); đóng danh sách,
   cuộn body modal tới ô "Thứ tự hiển thị" được.
4. Hồi quy: dialog Sửa Nhóm hàng hoá, bộ lọc Nhóm hàng hoá ở Quản lý kho (Radix Popover) và ô Nhóm hàng hoá trên trang
   tạo hàng hoá (không dialog) vẫn bung đúng chỗ và chọn được.

## Out of scope

- `SearchListingInput` (`components/forms/SearchListingInput.tsx:251`) cũng render `absolute` trong dialog — cùng bệnh,
  không được báo; plan riêng nếu cần.
- `LookupField`: không sửa, không trích hook dùng chung (A-02).
- Kích thước mặc định 720×560 của modal entity cây — giữ nguyên.
- Phím Esc đóng dropdown trước khi đóng modal (`data-dropdown-open`, `app-modal.tsx:525`) — `TreeSelectInput` chưa
  có xử lý phím, không thêm.
- Backend, API, api-client — không đổi.

## Constraints

| Kind | Detail |
| --- | --- |
| Kiểm thử | `apps/backoffice-web` không có test runner (`"test": "echo test"`) ⇒ bằng chứng là `tsc --noEmit`, kịch bản ai-dlc-verify và demo tay |
| Hành vi AppModal | Radix Dialog đặt `pointer-events: none` lên `body` khi mở; popover portal phải tự đặt `pointer-events: auto` và mang `data-lookup-popover` để guard click-ngoài của modal bỏ qua |
| Host Radix Popover | `PopoverContent` có `role="dialog"`, wrapper có `transform` ⇒ là containing block của `position: fixed`; toạ độ phải tính tương đối theo host, như LookupField đã làm |
| Host `contain: paint` | Portal vào dialog thì popover không thể tràn ra ngoài khung dialog; chấp nhận như LookupField — dialog entity cây cao 560px, đủ chỗ |
| Dev server | `make dev-api` đang chạy trên `:4000` — không chạy `nest build`; backoffice `:3000` |

## Existing surface touched

- `apps/backoffice-web/src/components/forms/TreeSelectInput.tsx` — phần render dropdown (:425-495) và handler
  click-ngoài (:335-348).
- `apps/backoffice-web/src/components/crud/CrudFormDialog.tsx:423-443` — bỏ `bodyClassName="overflow-visible"`.
- Không đổi: `LookupField.tsx` (khuôn mẫu), `app-modal.tsx`, `StockSummaryFilterPopover.tsx`.
