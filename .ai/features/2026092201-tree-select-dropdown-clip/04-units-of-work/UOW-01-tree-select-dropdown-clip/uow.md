---
id: UOW-01
slug: tree-select-dropdown-clip
title: Kế toán thấy đủ, cuộn được và chọn được Mục cha trong dialog Danh mục thu chi; form cuộn lại bình thường
demoable: true
duration: 0.6d
depends_on: []
requirements: [US-01, US-02]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08]
risk: low
status: todo
rollback: revert hai commit FE ⇒ dropdown về `absolute` trong ô nhập và body modal entity cây về `overflow-visible` như #282; không có dữ liệu hay schema để hoàn tác
---

# UOW-01 — Dropdown Mục cha không bị modal cắt

`TreeSelectInput` render danh sách qua portal + `position: fixed` đo theo ô nhập (chép cơ chế `LookupField`), và
`CrudFormDialog` bỏ vá `overflow-visible` để body modal cuộn lại. Một UoW vì hai thay đổi chỉ demo được cùng nhau:
bỏ vá mà chưa portal thì dropdown càng bị cắt; portal mà giữ vá thì form vẫn không cuộn.

## Demo script

Môi trường `local-backoffice` (Chrome của Akenzy, org MT), API `:4000` bind `erp_dev_3008` (9 mục thu / 34 mục chi).
Backoffice `:3000` phục vụ mã nhánh `fix/tree-select-dropdown-clip`.

1. Danh mục › THU, CHI › Danh mục thu chi → bấm dòng "Thu khác" (`THU_KHAC`) → dialog Sửa. Bấm ô **Mục cha**: danh
   sách bung, thấy đủ 8 mục thu (không có `THU_KHAC`), khung không bị cắt ở mép modal, dòng cuối `THU_NO_KH` nhìn
   thấy được. Chụp ảnh. (AC-01)
2. Bấm `THU_BAN_HANG · Thu từ bán hàng`: ô hiện đúng chuỗi đó, danh sách đóng, dialog vẫn mở. Mở lại danh sách, bấm
   vào nhãn "Mô tả" (ngoài danh sách, trong dialog): danh sách đóng, dialog vẫn mở, ô vẫn giữ giá trị. Bấm × xoá
   lựa chọn. Hủy bỏ, không lưu. (AC-04)
3. Bấm dòng "Chi khác" (`CHI_KHAC`) → Mục cha: danh sách mục chi (không có mục thu). Lăn chuột trong khung tới đáy
   nhiều lần: khung cuộn nội bộ, "Đang tải thêm…" xuất hiện rồi biến mất, dừng ở đúng số mục chi khác của org đang
   đăng nhập (MT: 33, My Company: 35 — đếm `li[role="option"]` bằng DevTools, đối chiếu SQL), không thiếu `CHI_CCDC`;
   nội dung form phía sau đứng yên. Chụp ảnh. Hủy bỏ. (AC-02)
4. Đặt cửa sổ 1440×720 (DevTools › Device toolbar › Responsive). Mở lại Sửa "Thu khác": danh sách Mục cha đóng, lăn
   chuột trong vùng nội dung dialog → tới được ô "Thứ tự hiển thị". Chụp ảnh. (AC-05)
5. Vẫn 1440×720: cuộn body sao cho ô Mục cha nằm sát mép dưới vùng nội dung, bấm ô: khung mở phía **trên** ô nhập,
   nằm trọn trong viewport. Chụp ảnh. Hủy bỏ. (AC-03)
6. Hồi quy: Danh mục › Nhóm hàng hoá (`/admin/inventory-item-categories`) → bấm một nhóm → Mục cha: danh sách bung không
   bị cắt, có thụt lề, không chứa chính nhóm đó; chọn một nhóm, dialog vẫn mở. Hủy bỏ. (AC-06)
7. Kho › Quản lý kho (`/inventory-management`) → nút **Bộ lọc** → ô Nhóm hàng hoá → bấm một nhóm: danh sách nổi trên
   panel, nhóm ghi vào ô, panel vẫn mở. Đóng panel không áp dụng. (AC-07)
8. `/admin/inventory-items/new` → ô Nhóm hàng hoá (`#create-category`) → danh sách ngay dưới ô, đúng chiều rộng ô;
   chọn một nhóm. Rời trang không lưu. (AC-08)
9. Chạy `07-verification.md` (ai-dlc-verify, viewport desktop + laptop) → ảnh trong `evidence/`.

## In scope

- `TreeSelectInput`: portal, đo vị trí, lật, đo lại khi cuộn/resize, click-ngoài xét popover, tự tải khi khung chưa tràn (T-01-01).
- `CrudFormDialog`: bỏ `bodyClassName="overflow-visible"`, sửa comment (T-01-02).
- `BaseCrudService.applySorting`: tiebreaker `id` + spec (T-01-03) — thêm 22/09/2026 sau khi bằng chứng AC-02 lộ lỗi phân trang (A-09).

## Not in scope

- `SearchListingInput` (cùng bệnh, không được báo — A-08).
- Trích hook chung với `LookupField` (A-02).
- Phím Esc / điều hướng bàn phím trong dropdown — `TreeSelectInput` chưa có, không thêm.

## Risks

| Risk | Mitigation |
| --- | --- |
| Handler `mousedown` của document đóng dropdown và xoá `inputText` khi bấm vào popover (portal nằm ngoài `wrapRef`) | Xét cả `popoverRef` trong handler; demo bước 2 |
| Host Radix Popover: click trong popover portal bị `DismissableLayer` coi là ngoài ⇒ panel đóng | Portal vào chính `PopoverContent` (`role="dialog"`) nên click là "trong"; demo bước 7 |
| Auto-fill lặp vô hạn khi `total` sai | Guard `hasMore && !loading`; mỗi trang tăng `loaded`; demo bước 3 dừng ở 33 |
| Popover không đi theo khi cuộn body modal | Listener `scroll` capture đo lại; demo bước 5 |
| Tiebreaker `id` đổi thứ tự một list nào đó đang được kỳ vọng | Chỉ tác động các dòng trùng cột sắp chính — thứ tự đó vốn không xác định; `pnpm --filter @erp/api test` toàn bộ xanh |

## Definition of done

- [ ] AC-01 … AC-08 pass
- [ ] `pnpm --filter @erp/backoffice-web exec tsc --noEmit` sạch
- [ ] `pnpm --filter @erp/api test -- base-crud.service.spec.ts` xanh và `tsc --noEmit` của `apps/api` sạch
- [ ] `07-verification.md` chạy xanh ở `local-backoffice`, viewport desktop và laptop; ảnh trong `evidence/`
- [ ] Demo script chạy đầu-cuối và được nghiệm thu ở G4
