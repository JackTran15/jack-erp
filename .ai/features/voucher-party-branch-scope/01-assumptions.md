---
feature: voucher-party-branch-scope
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | "Chi nhánh đó" = chi nhánh **đang làm việc** (`ActorContext.branchId`), không phải tập chi nhánh actor thuộc về | high | yes | Toàn bộ vị ngữ lọc; nếu sai thì cả 4 UoW viết lại và AC-01/05/08/09 đổi số liệu | confirmed | Akenzy chọn "Chi nhánh đang làm việc (active branch)" ở vòng hỏi G0, 2026-08-22 |
| A-02 | Nhân viên không có dòng nào trong `user_branch_assignments` bị **ẩn** khỏi mọi picker, không phải hiện ở mọi chi nhánh | high | yes | Đảo chiều vị ngữ; AC-04 lật ngược | confirmed | Akenzy chọn "Ẩn khỏi mọi picker" ở vòng hỏi G0, 2026-08-22 |
| A-03 | Tài khoản có `iam.user.read.all` **không** bị lọc, thấy toàn bộ nhân viên như hiện nay | high | yes | Bỏ nhánh bypass ở cả 4 điểm; AC-10 biến mất; đường "lập phiếu hộ chi nhánh khác" bị chặn | confirmed | Akenzy chọn "Không lọc — thấy toàn bộ" ở vòng hỏi G0, 2026-08-22 |
| A-04 | Phạm vi = **mọi select liệt kê nhân viên** (4 nguồn đã khảo sát), không mở rộng sang select danh mục khác | high | yes | Số UoW; nếu rộng hơn thì thêm ≥3 UoW cho kho/quỹ/tài khoản tiền gửi | confirmed | Akenzy chọn "Mọi select liệt kê nhân viên" ở vòng hỏi G0, 2026-08-22 |
| A-05 | Đường **tra cứu theo id** (`GET /admin/users/:id`, resolver id → tên trong `counterparty-name.util.ts`, `voucher-staff.resolver.ts`) không lọc theo chi nhánh, nên phiếu cũ vẫn hiện đúng tên | high | no | Phiếu lịch sử trỏ tới nhân viên nay ngoài chi nhánh sẽ hiện trống; phải thêm ticket sửa đường đọc | pending | — |
| A-06 | Trong cùng ô Đối tượng, **Nhà cung cấp và Khách hàng** vẫn org-wide (không có cột chi nhánh trong `inventory_providers` / `customers`) | high | no | Nếu cũng muốn lọc hai loại này thì cần bảng gán chi nhánh mới — một feature riêng | pending | — |
| A-07 | Chỉ có **4** nguồn liệt kê nhân viên. Đã quét `apps/api/src/modules` theo `UserEntity` / `EmployeeProfileEntity`; phần còn lại là resolver id → tên hoặc export, không phải picker | medium | no | Sót một bề mặt → thêm 1 UoW; phát hiện được bằng chính ticket rà soát T-05-01 | pending | — |
| A-08 | Ô "Nhân viên phụ trách" trong form khách hàng POS (`MembershipSection`) không phải bề mặt cần sửa: prop `accountManagers` mặc định `[]` và không caller nào truyền dữ liệu thật | high | no | Nếu về sau có người nối dữ liệu vào đó, nó thành nguồn rò thứ 5 | pending | — |
| A-09 | Thu hẹp danh sách Thu ngân ở POS "Bàn giao ca" theo chi nhánh là **đúng mong muốn**, không phải hồi quy — ca làm việc vốn thuộc một chi nhánh | medium | no | Người bàn giao ca cho nhân sự chi nhánh khác sẽ không chọn được người nhận | pending | — |
| A-10 | `ActorContext.branchId` luôn có giá trị trên 4 endpoint này khi request đến từ UI (jwt > header > branchIds[0]) | medium | no | Actor không chi nhánh nào nhận danh sách rỗng thay vì lỗi — fail-closed có chủ ý, bọc bằng AC-12 | pending | — |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
|----|----------------|----------------------|-------------|
| A-11 | Dùng lại nguyên `UsersService.visibleUserIds()` cho cả 4 điểm | `visibleUserIds()` lọc theo **mọi** chi nhánh actor thuộc về, cộng thêm tài khoản cấp cao hơn — rộng hơn A-01. Dùng nguyên si thì admin đứng ở HN vẫn thấy nhân viên HCM | Sinh ADR-01: viết vị ngữ riêng theo chi nhánh đang làm việc; `visibleUserIds()` giữ nguyên cho màn Nhân viên |
| A-12 | `user_branch_assignments.branch_id` là `varchar` nên join cần `::text` (theo ghi chú cũ về `invoices.branch_id`) | Kiểm `information_schema`: cả 4 cột id của bảng này đều là `uuid` | Vị ngữ join thẳng `uba.user_id = u.id` không cast; chỉ tham số raw SQL cần `$n::uuid` |
