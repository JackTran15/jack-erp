---
feature: report-column-config-per-branch
blocking_open: 0
---

# Assumption register

| ID   | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| ---- | ---------- | ---------- | -------- | --------------------- | ------ | ---------- |
| A-01 | Chi nhánh chưa có cấu hình riêng thì **kế thừa bản chuỗi** (`branch_id IS NULL`); lần đầu bấm Lưu mới sinh bản riêng (copy-on-write) | high | yes | Toàn bộ quy tắc đọc/ghi của cả 4 miền; UOW-01 + UOW-02 viết lại | confirmed | Akenzy chọn "Kế thừa cấu hình chuỗi", 2026-08-28 |
| A-02 | Các bản ghi cấp chuỗi đang có **giữ nguyên**; migration không sửa/xoá hàng nào, chỉ đổi chỉ mục duy nhất và CHÈN thêm bản sao | high | yes | Nếu sai (phải xoá bản chuỗi) thì mất luôn đường fallback của A-01 | confirmed | Akenzy chọn "Giữ nguyên làm bản chuỗi", 2026-08-28 |
| A-03 | Việc nhân bản cấu hình theo chi nhánh chạy **một lần trong migration**, không có script CLI rời | high | yes | UOW-03: script đứng riêng vs khối SQL trong migration | confirmed | Akenzy chọn "Một lần trong migration", 2026-08-28 |
| A-04 | Chi nhánh mở sau này **không** được gieo sẵn; nó rơi về fallback ở A-01 cho tới khi có người bấm Lưu | high | yes | Nếu sai thì phải thêm consumer nghe `branch.created` + dedupe qua `processed_events` | confirmed | Akenzy chọn "Rơi về fallback", 2026-08-28 |
| A-05 | Ở chế độ "Xem theo chuỗi" (`useIsChainSelected`), Lưu ghi vào **bản chuỗi**; FE gửi `scope: chain\|branch` tường minh vì `api-axios` luôn đính `X-Branch-Id` từ `active_branch_id` kể cả khi đang xem chuỗi | high | yes | Hợp đồng DTO + 4 controller + hook FE; nếu sai thì bỏ hẳn `scope` | confirmed | Akenzy chọn "Ghi vào bản chuỗi", 2026-08-28 |
| A-06 | "Chi nhánh đang hoạt động" mà migration nhân bản tới = `branches.status = 'ACTIVE'` (`BranchStatus`), cùng `organization_id` với bản chuỗi | medium | no | Nhân bản chạm cả chi nhánh SUSPENDED/ARCHIVED — chỉ là hàng thừa, xoá mềm được | confirmed | Đúng. `BranchEntity` **không** khai `@DeleteDateColumn` nên `branches` không có xoá mềm; `status = 'ACTIVE'` là bộ lọc duy nhất cần. Đo trên `erp_dev`: 2 org, 3 chi nhánh ACTIVE, không có chi nhánh nào ở trạng thái khác. |
| A-07 | `report_templates` chỉ có vài hàng mỗi tổ chức (FE chỉ tạo đúng 1 template tên "Mặc định" cho mỗi `reportType`), nên tích chéo `templates × branches` trong migration là rẻ, chạy inline được | medium | no | Migration chậm trên tổ chức nhiều chi nhánh; phải chia lô | confirmed | Đúng trên `erp_dev`: **3 hàng** trước migration (2 sống + 1 xoá mềm), sinh thêm 4. Migration chạy tức thì. **Chưa đo trên production** — nếu ở đó có nhiều tổ chức × nhiều chi nhánh thì nên đếm trước khi deploy. |
| A-08 | Không có nơi nào ngoài 4 miền reporting đọc `report_templates` (grep chỉ thấy `modules/reporting/*` + `modules/inventory-reports/*`) | high | no | Một đường đọc khác vẫn thấy dữ liệu theo chuỗi ⇒ lệch | confirmed | Đúng, và giờ có ca test giữ: `template-scope-parity.spec.ts` quét thư mục và khẳng định **đúng 20** handler template, tất cả đều gọi `resolveTemplateScope`. Thêm miền thứ năm mà quên nối phạm vi ⇒ ca đó đỏ. |
| A-09 | UI chưa có màn quản lý nhiều template (chưa có ô đặt tên), nên đổi khoá duy nhất sang có `branch_id` không đụng luồng người dùng nào đang chạy | high | no | Nếu đã có UI đặt tên thì phải thêm chỉ dấu "bản này của chi nhánh nào" | confirmed | Đúng. `report-template.api.ts` vẫn đóng cứng `DEFAULT_TEMPLATE_NAME = "Mặc định"` và hook chỉ lấy `data[0]`. Khi nào có UI đặt tên thì `scope`/`branchId` đã có sẵn trong response để hiển thị. |
| A-10 | Quyền không đổi: đọc vẫn `reporting.*.branch.read`, ghi vẫn chưa gắn `RequirePermission` (đang bị chú thích trong 4 controller) | high | no | Người ở chi nhánh A sửa được bản chuỗi mà không có quyền chuỗi | confirmed | Đúng, và **vẫn là lỗ hổng đã biết**: `@RequirePermission(TEMPLATE_MANAGE)` còn bị chú thích ở create/update/delete của miền hoá đơn; ba miền còn lại dùng chung quyền *đọc* cho cả ghi. Ai gọi thẳng API với `scope=chain` đều sửa được bản chuỗi. Ngoài phạm vi feature này (xem UOW-02 § Not in scope) — cần một ticket riêng. |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
| -- | --------------- | --------------------- | ----------- |
| A-11 | Server tự suy ra được "đang xem chuỗi" từ ngữ cảnh request | `api-axios` đính `X-Branch-Id` từ `localStorage.active_branch_id` **không phân biệt** chế độ chuỗi, và `ActorContext.branchId` còn ưu tiên `fromJwt` trước cả header ⇒ mọi request ở chế độ chuỗi vẫn mang một `branchId` hợp lệ | Sinh ra A-05: `scope` phải do FE gửi tường minh, kéo theo đổi DTO của cả 4 miền (T-02-01) |
