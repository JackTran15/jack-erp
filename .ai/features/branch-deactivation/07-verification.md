---
feature: branch-deactivation
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Ngừng hoạt động cửa hàng

Chỉ `local-backoffice` và chỉ `desktop` ở vòng này: UOW-01 mới dựng **nút bấm**, chưa dựng
phần ẩn cửa hàng khỏi các bề mặt khác. POS và tài khoản một-chi-nhánh (`local-backoffice-bm`)
chỉ có gì để chụp sau UOW-02, và cả hai app đều không có layout mobile
(`BackofficeLayout` là shell `ml-60` cố định, không có `matchMedia` ở đâu cả).

Chi nhánh dùng để demo là **Chi nhánh kiểm thử** — không phải HCM. HCM là cửa hàng chính của
tổ chức nên theo thiết kế **không** ngừng được, và chính điều đó là nội dung của S5.

## Steps

Màn Cửa hàng nay là **trang riêng** (ADR-08), không còn đi qua `CrudListPage`. Nhờ vậy bộ test
đơn giản hẳn: chọn dòng là chọn-một (không còn màn "chọn tất cả rồi bỏ tất cả" vốn là chỗ đua
render mong manh nhất ở các vòng trước), và bộ lọc trạng thái gửi thẳng lên server nên số tổng
ở chân bảng khớp với số dòng.

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Danh sách mở ra đã lọc sẵn "Đang hoạt động" | `/admin/branches` | `wait tbody tr:has-text("HCM")` | AC-06 | `count tbody tr:has-text("Đang hoạt động") = 3` |
| S2 | Form sửa có ô "Ngừng hoạt động" chưa tích | `/admin/branches` | `wait tbody tr:has-text("Chi nhánh kiểm thử"); click input[aria-label="Chọn Chi nhánh kiểm thử"]; click button:has-text("Sửa"); wait #branch-inactive` | AC-01 | `count #branch-inactive = 1` |
| S3 | Hộp thoại xác nhận nêu hậu quả và số liệu tồn đọng | `/admin/branches` | `wait tbody tr:has-text("Chi nhánh kiểm thử"); click input[aria-label="Chọn Chi nhánh kiểm thử"]; click button:has-text("Sửa"); wait #branch-inactive; click #branch-inactive; click button:has-text("Lưu"); wait text=các thiết bị bán hàng` | AC-02 | `text=nhân viên chỉ thuộc cửa hàng này` |
| S4 | Bấm Có thì cửa hàng rời khỏi danh sách đang hoạt động | `/admin/branches` | `wait tbody tr:has-text("Chi nhánh kiểm thử"); click input[aria-label="Chọn Chi nhánh kiểm thử"]; click button:has-text("Sửa"); wait #branch-inactive; click #branch-inactive; click button:has-text("Lưu"); wait text=các thiết bị bán hàng; click button:has-text("Có"); wait text=Đã cập nhật cửa hàng` | AC-01, AC-06 | `no-text=Chi nhánh kiểm thử` |
| S5 | Lọc "Ngừng hoạt động" thấy đúng cửa hàng vừa ngừng | `/admin/branches` | `select select[aria-label="Lọc Trạng thái"] = SUSPENDED; wait tbody tr:has-text("Chi nhánh kiểm thử")` | AC-06 | `count tbody tr:has-text("Ngừng hoạt động") = 1` |
| S6 | Cửa hàng chính không có ô tích, kèm lý do | `/admin/branches` | `wait tbody tr:has-text("HCM"); click input[aria-label="Chọn HCM"]; click button:has-text("Sửa"); wait text=Đây là cửa hàng chính` | AC-05 | `text=Đây là cửa hàng chính của tổ chức nên không thể ngừng hoạt động.` |
| S7 | Bỏ tích thì cửa hàng hoạt động trở lại | `/admin/branches` | `select select[aria-label="Lọc Trạng thái"] = SUSPENDED; wait tbody tr:has-text("Chi nhánh kiểm thử"); click input[aria-label="Chọn Chi nhánh kiểm thử"]; click button:has-text("Sửa"); wait #branch-inactive; click #branch-inactive; click button:has-text("Lưu"); wait text=Đã cập nhật cửa hàng` | AC-03 | `count tbody tr:has-text("Ngừng hoạt động") = 0` |

S4 và S7 đổi dữ liệu thật và S7 trả lại nguyên trạng, nên thứ tự là bắt buộc. Không còn bước
dọn riêng như S8 cũ: chu trình ngừng → mở lại nằm gọn trong S4..S7 trên cùng một chi nhánh.

## Not verified here

- **S7 phải tự chuyển chi nhánh trước khi ngừng.** `LOCAL_BACKOFFICE_BRANCH_NAME=HCM` nên
  phiên verify luôn khởi động ở HCM; ngừng "Chi nhánh 2" từ đó **không** kích hoạt auto-switch,
  vì nó chỉ chạy khi chi nhánh *đang đứng* biến mất. Bản đầu tiên tôi viết đúng lỗi đó — bước
  vẫn xanh mà chẳng kiểm gì cả.

- **AC-04** (thiếu quyền → 403) được viết ở tầng API, không có bề mặt UI: ô tích chỉ hiện với người đã vào được màn
  Cửa hàng. Đã kiểm bằng tài khoản Branch Manager thật trên API đang chạy — cả ba đường
  (`PATCH /branches/:id`, `PATCH /admin/entities/branches/records/:id`,
  `POST /branches/:id/suspend`) đều trả 403 — và có unit test trong `branch.service.spec.ts`.
- **AC-07..AC-24** thuộc UOW-02..UOW-05, chưa dựng. Sẽ có bước verify riêng khi tới.

## Notes

- Chạy bằng tài khoản `${LOCAL_BACKOFFICE_EMAIL}` (có `branch.archive`). Tài khoản thiếu quyền
  sẽ không dựng lại được S3/S4.
- S3 và S4 **thay đổi dữ liệu**: chúng ngừng `Chi nhánh kiểm thử` thật. S6 trả nó về `ACTIVE`,
  nên thứ tự các bước là bắt buộc, không chạy lẻ được.
- Số trong hộp thoại ở S3 là số thật đọc từ DB (hiện là *2 nhân viên chỉ thuộc cửa hàng này*),
  nên nó sẽ đổi nếu dữ liệu seed đổi. `Assert` cố tình chỉ khớp phần nhãn, không khớp con số.
