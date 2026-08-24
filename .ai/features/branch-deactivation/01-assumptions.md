---
feature: branch-deactivation
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | "Ngừng hoạt động" là một công tắc hai chiều ghi `SUSPENDED ↔ ACTIVE`; `ARCHIVED` không lên UI đợt này | high | yes | Toàn bộ UOW-01 đổi hình (2 nút thay vì 1 ô tích), thêm luật chuyển trạng thái | confirmed | Người dùng chọn "Một nút bật/tắt, dùng SUSPENDED", 2026-08-24 |
| A-02 | Cửa hàng đã ngừng biến mất khỏi báo cáo **kể cả kỳ quá khứ** — số tổng toàn chuỗi của kỳ cũ sẽ nhỏ đi | high | yes | UOW-03 đảo chiều: nếu chỉ ẩn khỏi ô chọn mà giữ số liệu thì `permittedBranchIds` không được lọc, ADR-01 sụp | confirmed | Người dùng chọn "Biến mất hoàn toàn khỏi báo cáo", 2026-08-24 |
| A-03 | Nhân viên chỉ thuộc cửa hàng đã ngừng vẫn đăng nhập được, thấy trạng thái rỗng | high | yes | Nếu phải chặn thì UOW-01 cần thêm kiểm tra nhân sự chặn trước khi ngừng | confirmed | Người dùng chọn "Vẫn đăng nhập được, màn hình báo chưa được gán cửa hàng", 2026-08-24 |
| A-04 | Còn tồn kho / chứng từ dở dang chỉ **cảnh báo**, không chặn | high | yes | Endpoint impact đổi từ "đếm để hiển thị" thành "đếm để chặn", đổi cả mã lỗi và luồng UI | confirmed | Người dùng chọn "Thêm một thông báo trước khi lưu, không chặn gì", 2026-08-24 |
| A-05 | UI là checkbox "Ngừng hoạt động" trong form *Sửa cửa hàng* + hộp thoại xác nhận, theo mẫu MISA eShop | high | no | Chuyển sang row action trên bảng; phần backend không đổi | confirmed | Người dùng gửi ảnh màn MISA eShop làm mẫu, 2026-08-24 |
| A-06 | Đường tra tên (`GET /branches/:id`, `branchRepo.find({id: In([...])})`) **không** lọc status, để chứng từ cũ vẫn in đúng tên cửa hàng đối tác | high | no | Nếu phải lọc luôn thì phiếu chuyển kho cũ mất tên cửa hàng đối tác — sửa ở tầng hiển thị, không phải tầng truy vấn | pending | — |
| A-07 | Dùng lại quyền `branch.archive` cho suspend/activate, không thêm permission key mới | medium | no | Thêm một key vào `permissions.seed.ts` + `org-role-permissions.ts` và một migration seed | pending | — |
| A-08 | Cần hiệu lực **tức thì**, không chấp nhận độ trễ tối đa 15 phút của access token | medium | no | Bỏ ADR-02 (set Redis + kiểm trong `AuthGuard`) — là cắt bớt việc, không phải làm lại | pending | — |
| A-09 | Không cho ngừng cửa hàng chính (`isMainBranch`), giống luật đã có ở đường xoá | medium | no | Bỏ một nhánh kiểm tra và một AC | pending | — |
| A-10 | Màn **Cửa hàng** phải vẫn liệt kê cửa hàng đã ngừng (cờ `includeInactive`), nếu không thì không có đường bật lại | high | no | Không có đường bật lại — buộc phải thêm ngay, nên rủi ro là "quên", không phải "sai" | pending | — |
| A-11 | Dữ liệu thật (production) hiện không có bản ghi `branches.status` nào khác `ACTIVE`. Dev DB đã kiểm: `ACTIVE\|6`, không có SUSPENDED/ARCHIVED | medium | no | Bật bộ lọc sẽ làm một số chi nhánh biến mất qua đêm mà không ai bấm nút nào. Giảm thiểu: chạy đúng câu `select status, count(*) from branches group by status` trên production trước khi triển khai | pending | — |
| A-15 | Mỗi tổ chức chỉ có **một** cửa hàng `isMainBranch` | low | no | Guard "không ngừng được cửa hàng chính" sẽ khoá **nhiều** cửa hàng chứ không phải một. Đo trên DB dev 2026-08-24: org `f1000000` có **2/3** cửa hàng `is_main_branch = true` (`Chi nhánh kiểm thử` và `HCM`), org còn lại có 1. Không có unique index nào ép buộc điều này, và `findMainBranch()` dùng `findOne` nên trả về một cái tuỳ ý. Hệ quả thực tế: ở org đó, **HCM không thể ngừng hoạt động** — mà HCM lại đúng là chi nhánh có dữ liệu thật và là chi nhánh POS đang ghim | confirmed | Chủ dự án chốt 2026-08-24: **HCM là cửa hàng chính thật**, `Chi nhánh kiểm thử` bị gắn cờ nhầm và được phép ngừng hoạt động. Đã gỡ `is_main_branch` của `Chi nhánh kiểm thử` trên DB dev; hai tổ chức nay đều đúng 1 cửa hàng chính. Kiểm lại trên API: HCM vẫn 400 khi ngừng, `Chi nhánh kiểm thử` ngừng được rồi khôi phục được |
| A-12 | Ca POS đang mở / phiên đăng nhập đang chạy ở cửa hàng bị ngừng không cần "đóng mềm" — người dùng bị đá về màn chọn chi nhánh là đủ | medium | no | Cần thêm luồng đóng ca tự động hoặc thông báo trong app | pending | — |

| A-16 | Không có ràng buộc nào ở schema ép "một tổ chức một cửa hàng chính" | high | no | Cờ `is_main_branch` lệch lại lần nữa là guard "không ngừng cửa hàng chính" lại khoá nhầm nhiều cửa hàng, và `findMainBranch()` (dùng `findOne`) trả về một cái tuỳ ý. Lần này sửa được bằng tay vì mới có 3 cửa hàng; trên dữ liệu thật thì không. Đề xuất tách việc riêng: partial unique index trên `(organization_id) where is_main_branch` | pending | — |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
| --- | --- | --- | --- |
| A-13 | Phải thêm cột lifecycle mới cho `branches` (kiểu `isActive` như `StorageEntity`) | `branches.status` đã tồn tại từ `InitSchema`, kèm `suspend()`/`archive()` và hai endpoint | Không có migration nào trong feature này. UOW-01 co lại còn "một endpoint activate + một endpoint impact + UI" |
| A-14 | Phải vá bộ lọc chi nhánh ở từng màn báo cáo | Inventory-report đã kẹp theo `permittedBranchIds(actor)` lấy từ JWT `branchIds` | Lọc ở `resolveUserBranches` phủ luôn cả nhóm này; UOW-03 chỉ còn ba resolver `stores()` chưa kẹp + `stock-by-branch` |
