---
feature: report-filters-and-column-config
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Bộ lọc tồn kho theo cây nhóm hàng và lưu cấu hình cột báo cáo

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Tổng hợp tồn kho chưa lọc — 15 dòng, có cả nhóm ngoài "GIÀY DÉP" | `/inventory-management` | `wait text=trên 15 kết quả` | AC-02 | `text=trên 15 kết quả; text=Phiếu quà tặng` |
| S2 | Lọc theo nhóm CHA "GIÀY DÉP" trả về 12 dòng của các nhóm con | `/inventory-management` | `wait text=trên 15 kết quả; click button:has-text("Bộ lọc"); click #ssfd-category; click text=GIÀY DÉP; click button:has-text("Đồng ý"); wait text=trên 12 kết quả` | AC-01 | `text=trên 12 kết quả; text=Giày nữ; no-text=Phiếu quà tặng` |
| S3 | Bỏ tick "Tỷ lệ KM (%)" rồi Lưu — cột biến mất khỏi lưới | `/reports/sales` | `wait [aria-label="Thiết lập cột hiển thị"]; click [aria-label="Thiết lập cột hiển thị"]; click tr:has-text("Tỷ lệ KM (%)") [aria-label="Hiển thị cột"]; click button:has-text("Lưu"); click text=Xem theo chi nhánh` | AC-03 | `count [aria-label="Hiển thị cột"] = 0; no-text=Tỷ lệ KM (%)` |
| S4 | Tải lại trang — cột vẫn ẩn, cấu hình đã lưu phía máy chủ | `/reports/sales` | `wait [aria-label="Thiết lập cột hiển thị"]` | AC-04 | `text=Tổng hợp bán hàng theo ngày; no-text=Tỷ lệ KM (%)` |
| S5 | Tick lại rồi Lưu — cột trở lại (trả nguyên trạng, để chạy lại được) | `/reports/sales` | `wait [aria-label="Thiết lập cột hiển thị"]; click [aria-label="Thiết lập cột hiển thị"]; click tr:has-text("Tỷ lệ KM (%)") [aria-label="Hiển thị cột"]; click button:has-text("Lưu"); click text=Xem theo chi nhánh; wait text=Tỷ lệ KM (%)` | AC-03, AC-04 | `count [aria-label="Hiển thị cột"] = 0; text=Tỷ lệ KM (%)` |
| S6 | Báo cáo Bán hàng mở sẵn ở kỳ "Hôm nay" | `/reports/sales` | `wait [role="combobox"]` | AC-05 | `text=Hôm nay; count [role="combobox"]:has-text("Hôm nay") = 1; no-text=Tháng này` |
| S7 | Báo cáo Kho mở sẵn ở kỳ "Hôm nay" | `/reports/inventory` | `wait [role="combobox"]` | AC-06 | `text=Hôm nay; count [role="combobox"]:has-text("Hôm nay") = 1; no-text=Tháng này` |

## Not verified here

- Đường xuất khẩu Excel của "Tổng hợp tồn kho" (`/inventory/stock/summary/export`) dùng chung
  `StockSummaryService.getSummary` nên hưởng cùng bản sửa AC-01, nhưng bằng chứng là một tệp
  `.xlsx` chứ không phải ảnh chụp — đã kiểm bằng unit test
  `stock-summary.service.spec.ts` ("filters the category subtree, not just the selected
  category") và bằng gọi API trực tiếp, không qua bảng Steps này.
- Việc **cố ý chưa bật** lưu cấu hình cột cho nhóm Công nợ / Lợi nhuận: đó là một quyết định
  phạm vi, không phải hành vi quan sát được trên màn hình.

## Notes

Chạy trên `erp_dev` thật, chi nhánh **Hồ Chí Minh** (`c3bf1922-3a2e-42d9-b00d-a7129efe592c`) —
`post_login` của `local-backoffice` tự chuyển sang chi nhánh này. Các con số 15 và 12 trong
`Assert` là số dòng SKU × kho có thật của chi nhánh đó tại thời điểm chạy; chúng **phụ thuộc
dữ liệu**. Nếu ai đó nhập/xuất kho ở HCM thì hai số này lệch và S1/S2 đỏ — khi đó sửa số
trong bảng này chứ đừng bỏ `Assert`, vì chính cặp `12` ↔ `no-text=Phiếu quà tặng` là thứ phân
biệt "lọc theo cây" với "lọc rồi trả rỗng" (hành vi cũ: `GIÀY DÉP` ⇒ 0 dòng).

S3 → S5 sửa **dữ liệu thật**: chúng ghi rồi xoá một `report_templates` cho
`reportType = daily-sales-summary` của tổ chức. S5 tồn tại để bảng chạy được nhiều lần —
tick Hiển thị là một công tắc bật/tắt, nên nếu S5 không trả cột về trạng thái hiện thì lần
chạy sau S3 sẽ bật cột lên và `no-text` đỏ. S5 đỏ ⇒ phải khôi phục tay trước khi chạy lại.

`count [aria-label="Hiển thị cột"] = 0` ở S3/S5 là cách khẳng định hộp thoại "Sửa mẫu" đã
**đóng** sau khi bấm Lưu: mọi checkbox Hiển thị nằm trong hộp thoại đó. Lưu hỏng thì hộp
thoại ở nguyên và số này khác 0, đồng thời `failure_signals` bắt được toast lỗi.

`click text=Xem theo chi nhánh` ngay sau "Lưu" **không phải thao tác thừa** — nó là cái chờ.
`settle()` của bộ chạy chỉ đợi `networkidle`, mà `saveMutation.mutate` đẩy request đi ở tick
sau nên mạng đang "im" đúng lúc settle hỏi ⇒ trả về ngay, rồi `check_asserts` đọc `count`
tức thời và thấy hộp thoại còn mở. Lần chạy đầu S3/S5 đỏ đúng vì lý do đó (ảnh chụp cho
thấy nút "Lưu" đã được bấm, checkbox đã bỏ tick, và S4 vẫn xanh — tức là lưu **có** chạy).
`AppModal` treo một lớp phủ `fixed inset-0` khi mở, nên click vào chữ nằm dưới lớp phủ bị
chặn và Playwright thử lại cho tới khi hộp thoại đóng — một cái chờ tường minh dựng bằng
đúng 4 động từ có sẵn, không phải `sleep`.
