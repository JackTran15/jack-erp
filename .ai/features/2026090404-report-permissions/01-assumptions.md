---
feature: report-permissions
blocking_open: 0
---

# Assumption register

Bốn dòng đầu là bốn câu đã hỏi chủ sản phẩm trước khi code (một lượt, 4 câu), và
đã được trả lời. A-05 là mâu thuẫn phát hiện khi đọc code, đã báo và đã được
quyết. A-06 là việc còn lại, không chặn.

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Phạm vi là cả 22 báo cáo của 4 nhóm, không làm từng nhóm một | medium | yes | Toàn bộ UOW-01..05; nếu chỉ làm 1 nhóm thì catalogue và guard đều thu nhỏ lại | confirmed | Chọn "Tất cả 22 báo cáo (4 nhóm)" — loc, 2026-09-04 |
| A-02 | Báo cáo tiền kẹp theo `actor.branchIds`, mở rộng toàn chuỗi bằng key consolidated riêng cho từng domain | medium | yes | UOW-02 viết lại; nếu giữ ladder cũ thì profit vẫn mượn key invoice và 4 báo cáo công nợ vẫn org-wide | confirmed | Chọn "Kẹp cứng theo branchIds được gán, trừ quyền toàn chuỗi" — loc, 2026-09-04 |
| A-03 | Báo cáo tồn kho thuần số lượng cho xem toàn hệ thống, không kẹp theo chi nhánh được gán | medium | yes | UOW-03; nếu sai thì cửa hàng vẫn không tra được tồn của nhau, tức là không giải quyết được yêu cầu gốc | confirmed | Chọn "Toàn hệ thống cho báo cáo thuần số lượng" — loc, 2026-09-04 |
| A-04 | Tách riêng quyền xem cột giá trị nhập/xuất trên báo cáo kho (đối chiếu MISA) | medium | yes | UOW-04; không có thì mở tồn kho toàn hệ thống đồng nghĩa lộ giá vốn của cửa hàng khác | confirmed | Chọn "Có — thêm inventory.reports.value.read" — loc, 2026-09-04 |
| A-05 | Chấp nhận con số báo cáo công nợ thay đổi, ghi đè quyết định cũ trong `docs/24-debt-reports-spec.md #1` ("công nợ khách hàng luôn gộp toàn chuỗi") | high | yes | Nếu không chấp nhận thì 4 báo cáo công nợ phải quay lại org-wide và quy tắc "cửa hàng không xem số của nhau" thủng ở đúng chỗ đó | confirmed | Đã báo rủi ro trước khi code; loc chọn phương án kẹp. Doc 24 đã cập nhật kèm ngày và lý do — 2026-09-04 |
| A-06 | Số liệu công nợ sau khi kẹp chưa được đối chiếu thủ công với kỳ vọng nghiệp vụ trên dữ liệu thật | low | no | Báo cáo ra số đúng theo thiết kế mới nhưng khác kỳ vọng của kế toán; sửa là đổi ngữ nghĩa clamp, không phải đổi kiến trúc | pending | — |
| A-07 | Sàn phạm vi chuyển từ `actor.branchId` (một chi nhánh active) sang `actor.branchIds` (tập được gán) là nới rộng có chủ đích cho user nhiều chi nhánh | high | no | User quản nhiều cửa hàng thấy nhiều hơn trước; với user một chi nhánh là no-op | confirmed | Ghi rõ khi bàn giao; test `report-query.util.spec.ts` khoá hành vi này — 2026-09-04 |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
| --- | --- | --- | --- |
| A-08 | Có thể gác per-report bằng `@RequirePermission` trên route | Mọi báo cáo trong một domain dùng chung route, `reportType` nằm trong body/query — decorator tĩnh không diễn đạt được | Sinh ra `ReportPermissionGuard` (T-01-03), theo tiền lệ `CrudPermissionGuard` |
| A-09 | Bỏ 4 key thô cũ, thay hẳn bằng key per-report | Bỏ là mọi role đang giữ key thô mất sạch báo cáo lúc deploy | Giữ 4 key cũ, đổi vai trò thành "quyền mở nhóm" (floor); migration cấp bù per-report (T-05-01) |
| A-10 | Kẹp anchor branch của drill-down điều chuyển vẫn giữ được sau khi báo cáo cha thành org-wide | Giữ thì user thấy dòng L0 của cặp cửa hàng nhưng 403 khi bấm xuống — bất nhất | Bỏ kiểm tra `permittedBranchIds` trong `resolveTransferPair`, chỉ giữ kiểm tra thuộc-org (T-03-03) |
