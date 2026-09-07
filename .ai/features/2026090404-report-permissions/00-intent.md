---
feature: report-permissions
slug: 2026090404-report-permissions
owner: loc
created: 2026-09-04
status: done
---

# Intent — Phân quyền báo cáo

> **Hồ sơ này viết ngược (retroactive).** Code đã được implement và commit ở
> `f6ddd9bc` trên nhánh `feat/report-permissions` ngày 2026-09-04, trước khi bộ
> artifact AI-DLC này tồn tại. Các gate G0–G4 vì vậy được ký vào 2026-09-07, sau
> khi code đã chạy và đã verify. Ghi rõ ở đây để audit trail không bị đọc nhầm là
> quy trình đã chạy xuôi. Nội dung bên dưới mô tả đúng những gì đã làm và đã đo,
> không phải kế hoạch dự kiến.

## Problem

Hai vấn đề tách biệt, cùng nằm ở bề mặt báo cáo.

**1. Không cấp lẻ được báo cáo.** 22 báo cáo chỉ được gác bởi 4 permission thô —
một key cho mỗi menu. Ai mở được menu "Bán hàng" là xem được cả 4 báo cáo doanh
thu; ai mở được "Kho" là xem được cả 11 báo cáo kho. Chủ cửa hàng muốn cấp cho
một nhân viên đúng một báo cáo thì không có cách nào.

**2. Cửa hàng xem được số tiền của nhau.** Quy tắc nghiệp vụ là các cửa hàng
không được xem doanh số / kết quả kinh doanh / lợi nhuận / công nợ của nhau
(trừ quản lý hệ thống), nhưng code đang vi phạm ở ba chỗ:

- `customer-debts.report.ts` và `receivables-detail-by-product.report.ts` luôn
  tổng hợp toàn tổ chức bất kể vai trò.
- `supplier-debts.report.ts:128` nhận `filters.branchId` mà không kiểm tra quyền
  trên id đó.
- Báo cáo lợi nhuận mượn key consolidated của hóa đơn
  (`report-query.util.ts:22`), nên phạm vi của nó bị quyết định bởi một quyền
  thuộc domain khác.

Ngược lại, chiều còn lại đang quá chặt: báo cáo tồn kho kẹp theo chi nhánh được
gán, nên một cửa hàng không tra được tồn của cửa hàng khác — trong khi đây chính
là việc chủ sản phẩm muốn tạo điều kiện.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Quản trị hệ thống | Thấy mọi báo cáo, mọi cửa hàng | Không đổi |
| Quản lý chi nhánh | Mở menu là thấy cả nhóm; công nợ thấy số toàn chuỗi | Chỉ thấy báo cáo được cấp; số tiền kẹp về các cửa hàng mình quản lý |
| Nhân viên kho | Muốn tra tồn cửa hàng khác thì bị chặn; thấy luôn cột giá trị | Tra được tồn toàn hệ thống; không thấy cột giá trị |
| Nhân viên bán hàng / thu ngân | Có `reporting.invoice.branch.read` là mở được cả 4 báo cáo bán hàng | Chỉ đúng báo cáo POS thực sự chạy (`revenue-by-item`) |

## Success signal

Một vai trò bị bỏ tick một báo cáo bất kỳ thì (a) báo cáo đó rời khỏi ô chọn báo
cáo, và (b) gọi thẳng API với `reportType` đó trả 403 — đo được, không phải cảm
tính. Và: quản lý chi nhánh mở "Tất cả cửa hàng" trên báo cáo lợi nhuận phải ra
số nhỏ hơn quản trị hệ thống.

## Out of scope

- Báo cáo dashboard cũ (`/reports/dashboard`, `/reports/aging`, `/reports/cash`) —
  không có nav entry nên `routeAccess` đang cho qua; đó là lỗ hổng riêng, không
  thuộc phạm vi này.
- Đổi tên 4 key thô cũ — giữ nguyên tên để không role nào mất quyền khi deploy.
- `reporting.invoice-template.manage` — key này tồn tại, được seed, có nhãn,
  nhưng không endpoint nào enforce. Đợt này chỉ vá lỗ hổng template CRUD đang
  hoàn toàn không được gác, không tái sinh key đó.

## Constraints

| Kind | Detail |
| --- | --- |
| Backward compat | Không role nào được mất quyền tại thời điểm deploy; siết lại là một bước riêng, có chủ đích |
| Kiến trúc | Mọi báo cáo trong một domain dùng chung route (`POST /search` với `reportType` trong body) — decorator route-level không diễn đạt được per-report |
| Nghiệp vụ | Quy tắc mới mâu thuẫn với `docs/24-debt-reports-spec.md #1` (đã ghi "công nợ luôn gộp toàn chuỗi"); con số báo cáo công nợ sẽ đổi |
| Hạ tầng | Cache quyền Redis TTL 300s — sửa role không có hiệu lực ngay |

## Existing surface touched

- Tiền lệ tái sử dụng: `crud-permission.guard.ts` — cùng hình dạng "khóa quyền
  phải resolve theo request", đã giải cho `/admin/entities/:entityKey/**`.
- Feature liền kề: `transfer-summary-drilldown` (đã merge vào main qua #248) —
  3 báo cáo drill-down của nó nằm trong 11 key kho.
- Entry point: không có route mới; sửa 4 controller báo cáo hiện có + role editor.
