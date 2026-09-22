---
feature: tree-select-dropdown-clip
environments: [local-backoffice]
viewports: [desktop, laptop]
---

# Verification — Dropdown Mục cha không bị modal cắt

Dữ liệu có sẵn trên `erp_dev_3008`, org MT: 9 mục thu (`THU_BAN_HANG` … `THU_NO_KH`), 34 mục chi (gồm hai fixture
của #282: `CP_VAN_HANH` là cha của `TIEN_DIEN_VH`). Dropdown tải 8 mục/trang; với `THU_KHAC` bị loại, trang 2 chỉ
còn `THU_NO_KH` — bước S1 chờ mã đó để chứng minh tự tải trang tiếp khi khung chưa tràn (A-05).

Viewport `laptop` (1440×720) có mặt vì vết cắt và việc body không cuộn chỉ lộ rõ khi dialog 560px chiếm gần hết
chiều cao; ở `desktop` cùng bước phải xanh để chứng minh không hồi quy.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Sửa Thu khác: Mục cha hiện đủ 8 mục thu, trang 2 tự tải, khung không bị cắt ở mép modal | `/admin/cash-voucher-categories` | `wait table tbody tr; click text="Thu khác"; wait #field-parentGroupId; click #field-parentGroupId; wait [data-lookup-popover] li:has-text("THU_NO_KH")` | AC-01 | count [data-lookup-popover] li[role="option"] = 8; count [data-lookup-popover] li:has-text("THU_KHAC") = 0; text=THU_TIEN_GUI_NH |
| S2 | Chọn một mục: ô nhận "MÃ · Tên", danh sách đóng, dialog vẫn mở | `/admin/cash-voucher-categories` | `wait table tbody tr; click text="Thu khác"; wait #field-parentGroupId; click #field-parentGroupId; wait [data-lookup-popover] li:has-text("THU_BAN_HANG"); click [data-lookup-popover] li:has-text("THU_BAN_HANG")` | AC-04 | count [data-lookup-popover] = 0; count [role="dialog"] #field-parentGroupId = 1; text=Sửa Mục thu / Mục chi |
| S3 | Sửa Chi khác: danh sách mục chi, không lẫn mục thu, có nhóm cha và mục con thụt lề | `/admin/cash-voucher-categories` | `wait table tbody tr; click text="Chi khác"; wait #field-parentGroupId; click #field-parentGroupId; wait [data-lookup-popover] li[role="option"]` | AC-02 | count [data-lookup-popover] li:has-text("THU_") = 0; count [data-lookup-popover] li:has-text("CHI_KHAC") = 0; text=CHI_TIEN_DIEN |
| S4 | Body dialog cuộn tới ô Thứ tự hiển thị (ảnh laptop là bằng chứng: ô nằm trong vùng nhìn) | `/admin/cash-voucher-categories` | `wait table tbody tr; click text="Thu khác"; wait #field-displayOrder; scroll #field-displayOrder` | AC-05 | count [role="dialog"] #field-displayOrder = 1; text=Thứ tự hiển thị |
| S5 | Hồi quy Sửa Nhóm hàng hoá: Mục cha bung, không chứa chính nó | `/admin/inventory-item-categories` | `wait table tbody tr; click table tbody tr >> nth=0; wait #field-parentGroupId; click #field-parentGroupId; wait [data-lookup-popover] li[role="option"]` | AC-06 | count [data-lookup-popover] = 1; text=Sửa |
| S6 | Hồi quy bộ lọc Quản lý kho (Radix Popover): chọn nhóm xong panel vẫn mở | `/inventory-management` | `click button:has-text("Bộ lọc"); wait #ssfd-category; click #ssfd-category; wait [data-lookup-popover] li[role="option"]; click [data-lookup-popover] li[role="option"] >> nth=0` | AC-07 | text=Bộ lọc bổ sung; count [data-lookup-popover] = 0 |
| S7 | Hồi quy trang tạo hàng hoá (không dialog): danh sách dưới ô Nhóm hàng hoá | `/admin/inventory-items/new` | `wait #create-category; click #create-category; wait [data-lookup-popover] li[role="option"]` | AC-08 | count [data-lookup-popover] = 1 |

## Not verified here

- **AC-02 vế cuộn tới đủ 33 mục**: runner không lặp `scroll` tới khi hết trang; đếm bằng DevTools trong demo tay
  (UOW-01 bước 3).
- **AC-03 lật lên trên**: cần đặt ô nhập sát mép dưới viewport bằng cách cuộn body một lượng cụ thể — demo tay
  (UOW-01 bước 5); ảnh S1/S4 ở viewport laptop cho thấy khung nằm trọn trong viewport ở vị trí mặc định.
- **S4 chỉ chứng minh bằng ảnh**: `scroll` là `scrollIntoViewIfNeeded`, vẫn "thành công" trên vùng `overflow-hidden`;
  assert không phân biệt được — người đọc so ảnh laptop: ô "Thứ tự hiển thị" phải nằm trong vùng nội dung, không bị
  footer che.
