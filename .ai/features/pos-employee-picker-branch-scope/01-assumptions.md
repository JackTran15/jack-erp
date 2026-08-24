---
feature: pos-employee-picker-branch-scope
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Thu hẹp bộ lọc Thu ngân/NVBH chỉ áp dụng cho POS; backoffice chain-store report giữ nguyên hành vi org-wide | high | yes | Chọn sai thì hoặc báo cáo chuỗi hợp nhất hỏng, hoặc POS vẫn sai — quyết định lại là viết lại UOW-02 | resolved | User chốt 2026-08-24: chỉ POS. Lý do: `resolveBranchIds` (`report-query.util.ts:53-93`) cho phép chọn nhiều cửa hàng khi có `reporting.invoice.consolidated.read`; thu hẹp toàn cục sẽ làm dropdown thu ngân trống nghĩa ở chế độ hợp nhất |
| A-02 | Nguồn "Người vận chuyển" là user active có bản ghi `user_branch_assignments` của chi nhánh, không lọc thêm theo `employee_profiles` | high | yes | Lọc theo hồ sơ HR sẽ tái hiện đúng lỗi rỗng đang phải sửa; đổi lại là đổi query lõi của UOW-01 | resolved | User chốt 2026-08-24: lấy user gán chi nhánh. Mã nhân viên chỉ dùng để tìm và hiển thị, không dùng để loại user chưa có hồ sơ HR |
| A-03 | Quyền `inventory.temp-warehouse.read` đã đủ cho mọi role POS dùng màn Chuyển kho tạm, nên đổi endpoint không phát sinh 403 | high | no | Nếu sai, picker đổi từ "rỗng" sang "403 hiện ra rỗng" — cùng triệu chứng, khó soi hơn | resolved | Đã đọc `org-role-permissions.ts:109-112, 203-205`: SALES/CASHIER/WAREHOUSE đều được seed `inventory.temp-warehouse.{read,write,close}` kèm chú thích "POS Chuyển kho nhanh"; ngoài ra trang này vốn đã gọi `sessions/active` với cùng permission |
| A-04 | Thêm field optional `employeeCode` vào `TempWarehousePublicUser` không phá đường hydrate carrier trên line đã lưu | high | no | Nếu bắt buộc thay vì optional, `loadCarriers()` và mọi fixture line sẽ vỡ type | resolved | Khai báo `employeeCode?: string \| null`; các đường dựng `TempWarehousePublicUser` khác (`loadCarriers()`, `collectCarriersFromLines`) không set field này và vẫn hợp lệ |
| A-05 | Không consumer nào của `PosSearchPopover` hôm nay cần phân trang, nên thêm prop `loadMore` optional là đủ và không đổi hành vi ai khác | high | no | Nếu sai, một picker khác đột nhiên bỏ giới hạn `maxSuggestions` | resolved | Grep `PosSearchPopover` trong `apps/pos-web/src`: mọi call site đều chỉ truyền `search`; nhánh bỏ cắt `maxSuggestions` chỉ chạy khi `loadMore` khác undefined |
| A-06 | `actor.branchIds` (JWT `branchIds`) là danh sách đủ để phán quyết một `branchId` gửi lên có hợp lệ không | medium | no | Nếu JWT không mang `branchIds`, mọi request POS kèm `branchId` sẽ bị 403 và dropdown lại rỗng | resolved | `actor-context.decorator.ts:20-21, 34` đọc `user.branchIds` từ JWT và luôn set (mảng rỗng nếu không có); chính header `X-Branch-Id` cũng đã được đối chiếu với danh sách này ở `:24-25`, nên POS gửi active branch thì chắc chắn nằm trong đó |
| A-07 | Danh sách nhân viên một chi nhánh có thể vượt 20 dòng, nên phân trang cuộn là có thật chứ không phải trang trí | medium | no | Nếu mọi chi nhánh đều dưới 20 người thì `loadMore` không bao giờ chạy và không kiểm chứng được | resolved | Chọn `pageSize = 20` thay vì giữ 50 chính là để nhánh này chạy được ở chi nhánh cỡ vừa; bước verify yêu cầu chạy trên chi nhánh có > 20 user, nếu dữ liệu local không đủ thì seed thêm trước khi chụp evidence |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
| --- | --- | --- | --- |
| A-08 | Sửa `listSalesmen` cho lọc theo branch là cách ngắn nhất, vì FE đang gọi sẵn endpoint đó | `GET /branches/:id/salesmen` còn phục vụ picker NVBH ở màn Checkout (`use-query-sales-hierarchy.ts`), và nó đọc `employee_profiles` chứ không đọc `user_branch_assignments` — đổi nó là đổi hai màn và vẫn không giải quyết được gốc rỗng | Bỏ hướng này, chuyển sang dùng lại `GET /inventory/temp-warehouse/carriers` (ADR-01). Lỗ hổng scope của `/branches/:id/salesmen` được ghi nhận riêng, không xử lý trong feature này |
