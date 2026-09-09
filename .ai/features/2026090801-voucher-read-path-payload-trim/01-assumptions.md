---
feature: voucher-read-path-payload-trim
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | P1 áp cho **cả sáu** trang phiếu, không chỉ Nhập kho | high | yes | Toàn bộ hình dạng plan: 2 UoW hay 7 | confirmed | Akenzy, 2026-09-08 — "Cả 4 trang phiếu còn lại" |
| A-02 | Nhân bản / Sửa / In tem mã nạp dòng **khi bấm**, có spinner, nút bị khoá trong lúc chờ | high | yes | UOW-01/02 đổi hẳn cách mở dialog | confirmed | Akenzy, 2026-09-08 — "Await khi bấm + spinner" |
| A-03 | Badge dùng route riêng `GET /inventory/transfer-orders/importable/count` → `{ count }` | high | yes | Hợp đồng API + api-client sinh lại | confirmed | Akenzy, 2026-09-08 |
| A-04 | P3 = Redis-cache `resolveUserRoles` + `resolveUserBranches` + `listMyBranches`; **không** bọc cache quanh `getSession(jti)` | high | yes | Bọc sai lớp = phiên thu hồi sống thêm 300 s | confirmed | Akenzy, 2026-09-08 |
| A-05 | Ba loại phiếu chưa phân trang (Lệnh điều chuyển, Chuyển kho, Kiểm kê) làm **phân trang đầy đủ**: cột `line_no` + migration + backfill + endpoint CQRS `/lines/search` + panel cuộn vô hạn | high | yes | ±15 ticket và 3 migration trên bảng dòng | confirmed | Akenzy, 2026-09-08 — "Phân trang đầy đủ cả ba" |
| A-06 | `/inventory/transfer-orders/importable` **giữ nguyên** `lines` trong phản hồi; trang Điều chuyển từ cửa hàng khác không đổi | high | yes | TransferInPage:541 đọc `selectedRow.lines` | confirmed | Akenzy, 2026-09-08 — "Giữ nguyên, chỉ thêm /count" |
| A-07 | Đổi mặc định BE `includeLines` là **breaking**; mặc định giữ `true`, chỉ client đổi cách gọi | high | yes | Mọi consumer khác của `GET /:id` | confirmed | Suy ra từ `voucher-detail-query.dto.ts` (mặc định đã tài liệu hoá là `true`) + ADR-03 của `2026083002`; xác nhận trong `00-intent.md` § Out of scope |
| A-08 | Với `transfer_order_lines`, backfill `ORDER BY created_at, ctid` khôi phục đúng thứ tự gõ | high | yes | Sai = mọi Lệnh điều chuyển cũ đảo thứ tự dòng | confirmed | Đo trên `erp_dev_3008` (bản restore prod): mã hàng tăng dần ở **84,1 %** cặp liền kề theo `ctid` và theo `(created_at, ctid)`, so với 49,3 % theo `id`. `created_at` một mình vô dụng: 248/392 phiếu có trùng, phủ 5 681/5 840 dòng |
| A-09 | Với `stock_transfer_lines`, backfill `ORDER BY ctid` **không** khôi phục thứ tự gõ — nó đóng băng đúng thứ tự đang hiển thị hôm nay, và đó là mục tiêu | medium | yes | Người dùng thấy dòng phiếu chuyển kho cũ đảo chỗ sau khi phân trang | confirmed | Đo trên `erp_dev_3008`, phiếu ≥5 dòng: `ctid` 53,7 % vs `id` 49,3 % — tín hiệu gần bằng không. Nhưng FE hôm nay đọc `row.lines` từ `leftJoinAndSelect` **không có `ORDER BY`** (`search-stock-transfers-v2.handler.ts:67-72`), tức đang hiển thị theo thứ tự vật lý; đóng băng `ctid` giữ nguyên hiện trạng, không đảo gì |
| A-10 | Cắt `lines` khỏi danh sách Chuyển kho **không** làm hỏng cột "Tổng tiền" | high | yes | Cột tiền về 0 trên mọi hàng | confirmed | `transferTotal` (`StockTransferPage.tsx:181-184`) ưu tiên `t.totalAmount`; handler v2 đã có sẵn `TOTAL_AMOUNT_SUBQUERY` (`search-stock-transfers-v2.handler.ts:27`) dùng cho chân lưới — chuyển `totalAmount` từng hàng sang subquery đó là thay thế 1-1 |
| A-11 | Hook badge phải gate bằng `inventory.transfer.read` (quyền route đòi), không phải `inventory.transfer.import` (quyền tab) | medium | no | Badge biến mất với một nhóm vai trò, hoặc vẫn còn 403 nền | confirmed | `transfer-order.controller.ts:383-385` khai `@RequirePermission("inventory.transfer.read")`; gate theo quyền của tab sẽ vẫn 403 với ai có `import` mà thiếu `read` |
| A-12 | `stock_take_lines` rỗng trên snapshot prod nên backfill không có gì để đo | high | no | Không đo được ≠ không có rủi ro khi prod thật có dữ liệu | confirmed | `select count(*) from stock_take_lines` = 0 trên `erp_dev_3008`. Migration vẫn phải viết đúng; verify chỉ chứng minh được trên dữ liệu tự tạo |
| A-13 | Cache roles/branches TTL 300 s, khớp `RbacService` | medium | no | Đổi vai trò chậm hiệu lực tối đa 5 phút nếu invalidate sót | confirmed | `rbac.service.ts:10` `CACHE_TTL_SECONDS = 300`; dùng một hằng số chung để hai cache không lệch nhau |
| A-14 | `pos-web` không cần sửa: nó gọi `/branches/me` (`branch.service.ts:9`) và hưởng cache server miễn phí | high | no | Không có — chỉ là phạm vi | confirmed | Ghi trong `00-intent.md` § Out of scope |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
| --- | --- | --- | --- |
| A-R1 | "`/branches/me` và `/auth/session` chưa được cache" (cách đặt vấn đề ban đầu) | Client **đã** cache: `/auth/session` `staleTime: Infinity` + `refetchOnWindowFocus: false` (`useAuth.tsx:59`, `App.tsx:66-74`), `/branches/me` `staleTime: 5 phút` (`useBranches.ts:47`). Quyền cũng đã có Redis cache 300 s kèm invalidate (`rbac.service.ts:26-38`) | P3 thu hẹp còn đúng ba hàm chưa cache: `resolveUserRoles`, `resolveUserBranches`, `listMyBranches`. Không thêm cache phía client, không thêm `Cache-Control` |
| A-R2 | Badge nặng vì payload | Payload chỉ ~10 hàng. Giá nằm ở server: `listImportable` nạp phiếu xuất gốc chỉ để cộng `lineTotal`, mà `GoodsIssueEntity.lines` là `eager: true` và mỗi dòng eager `item` + `location` — chi nhánh nặng nhất trên snapshot prod kéo **163 dòng** để in ra một chữ số | AC của P2 đo bằng **số truy vấn/số dòng nạp**, không đo bằng byte. `/importable` giữ nguyên (A-06) nên eager-load vẫn còn ở trang đó — chỉ hết trên mọi trang khác |
| A-R3 | Panel "Chi tiết" của Nhập kho còn đọc `lines` từ `GET /:id` | Đã phân trang từ `2026083002` qua `POST /v2/goods-receipts/{id}/lines/search` (`PurchaseOrdersPage.tsx:979-996`) | Nhập kho + Xuất kho chỉ cần sửa **client**, không có việc BE — đó là hai UoW rẻ nhất, làm trước để lấy số đo |
