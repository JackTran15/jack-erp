---
feature: report-column-config-per-branch
status: draft
---

# Intent — Lưu cấu hình cột báo cáo theo từng chi nhánh

## Problem

Cấu hình cột báo cáo ("Hiển thị cột" — thứ tự, ẩn/hiện, ghim, tên hiển thị) hiện được lưu
**theo chuỗi**, không theo chi nhánh. `report_templates` khoá duy nhất trên
`(organization_id, report_type, name)`; cả bốn miền handler (invoice / inventory / debt /
profit) đọc–ghi chỉ với `organizationId`, và cột `branch_id` mà `BaseEntity` sinh ra
**chưa bao giờ được ghi** — mọi bản ghi đều `NULL`.

Hệ quả: hai chi nhánh dùng chung một bộ cột. Chi nhánh A sắp lại cột cho hợp nghiệp vụ của
mình thì chi nhánh B mở báo cáo lên thấy bố cục của A. Không có cách nào để mỗi cửa hàng
giữ bố cục riêng, trong khi cấu trúc nghiệp vụ của từng chi nhánh khác nhau (chi nhánh kho
quan tâm cột tồn, chi nhánh bán lẻ quan tâm cột doanh thu).

Kèm theo: đã có sẵn dữ liệu cấu hình cấp chuỗi đang chạy trên production/dev. Đổi khoá lưu
mà không mang dữ liệu cũ theo thì mọi chi nhánh mất bố cục đã dựng — nên cần một **script
nhân bản cấu hình theo chi nhánh** chạy được lặp lại, không chỉ một lần trong migration.

## Success signal

1. Người dùng ở chi nhánh HCM đổi bố cục cột của một báo cáo và bấm Lưu; đăng nhập lại /
   tải lại trang ở chi nhánh đó thấy đúng bố cục vừa lưu.
2. Cùng tài khoản đó chuyển sang chi nhánh khác, mở đúng báo cáo đó, **không** thấy bố cục
   của HCM — thấy bố cục riêng của chi nhánh đang chọn.
3. Sau khi chạy script nhân bản, mỗi chi nhánh đang hoạt động của tổ chức có bản sao cấu
   hình của cấu hình chuỗi cũ; chạy script lần hai không tạo thêm bản trùng.

## Out of scope

- Cấu hình cột **theo từng người dùng** (per-user). Phạm vi vẫn là "dùng chung trong một
  chi nhánh", chỉ đổi khoá phạm vi từ tổ chức → chi nhánh.
- Bật lưu cấu hình cột cho nhóm **Công nợ** và **Lợi nhuận** trên FE — vẫn treo vì
  `buildColumnCatalog` chưa nhận `statBy`/`groupBy` (xem
  `.ai/features/report-filters-and-column-config/00-intent.md`). Backend đổi phạm vi cho cả
  4 miền vì dùng chung một bảng, nhưng FE vẫn chỉ bật `inventory` + `invoice`.
- Giao diện quản trị "áp cấu hình này cho mọi chi nhánh" trong backoffice. Việc nhân bản
  làm bằng script vận hành.
- Các trang báo cáo legacy `/reports/storage/*` (không có trong sidebar).
- Cấu hình bộ lọc lưu kèm (`filters` / `columnFilters`) không đổi ngữ nghĩa; nó đi theo cùng
  bản ghi template nên tự động cũng thành theo chi nhánh.

## Constraints

- `synchronize: false` — đổi lược đồ chỉ qua migration TypeORM viết tay
  (`migration:generate` sinh drift khổng lồ trên repo này).
- Chỉ mục duy nhất hiện tại `uq_report_templates_org_type_name` có `WHERE deleted_at IS NULL`.
  Thêm `branch_id` vào khoá mà cột đó còn `NULL` thì chỉ mục vô dụng — trong Postgres hai
  hàng `NULL` không đụng nhau. Phải quyết dứt điểm `branch_id` NOT NULL hay dùng biểu thức
  `COALESCE`.
- `ActorContext.branchId` phân giải theo thứ tự **jwt > header > branchIds[0]**; không được
  đọc `X-Branch-Id` trực tiếp trong handler.
- Bốn miền (invoice / inventory / debt / profit) có 4 bộ handler sao chép gần như y hệt trên
  cùng một entity — mọi thay đổi phạm vi phải áp cả bốn, nếu không sẽ rò dữ liệu chéo miền.
- Backend NestJS viết bằng tiếng Anh; chỉ chuỗi UI mới tiếng Việt.
