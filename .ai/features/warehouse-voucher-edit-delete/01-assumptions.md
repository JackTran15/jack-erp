---
feature: warehouse-voucher-edit-delete
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | Sửa một phiếu **đã ghi sổ** chỉ ghi thêm bút toán **chênh lệch** vào sổ kho và sổ kế toán; dòng ledger cũ bất biến; số phiếu giữ nguyên | high | yes | Toàn bộ UOW-01/03; đổi sang đảo-rồi-ghi-lại là viết lại hết | confirmed | Akenzy chốt 2026-08-17, câu hỏi "Cơ chế sửa" — chọn "Ghi chênh lệch (delta)" |
| A-02 | Không chặn sửa/xoá vì lý do nghiệp vụ; cho phép tồn kho âm sau khi ghi chênh lệch | high | yes | Bỏ guard = bỏ luôn các test guard; thêm lại guard sau là đổi hợp đồng lỗi của API | confirmed | Akenzy chốt 2026-08-17, câu hỏi "Chặn sửa" — chọn "Không chặn gì, cho âm kho" |
| A-03 | Phiếu nhập công nợ đã trả NCC một phần vẫn sửa/xoá được; dư nợ tính lại theo giá trị mới, phần đã trả vượt quá để lại thành **số dư trả trước** (`remainingAmount` âm, `status = OVERPAID`); không tự sinh phiếu thu hoàn tiền | high | yes | UOW-02: cần thêm giá trị enum `OVERPAID` + migration; đổi sang "sinh phiếu thu" kéo cả miền cash-vouchers vào | confirmed | Akenzy chốt 2026-08-17, câu hỏi "Nợ đã trả" — chọn "Thành số dư trả trước NCC" |
| A-04 | Sửa/xoá chân phiếu do lệnh điều chuyển sinh ra **lan sang chân đối ứng** ở chi nhánh kia | medium | yes | UOW-04 tồn tại hay không; ảnh hưởng sổ kho của 2 chi nhánh | confirmed | Akenzy chốt 2026-08-17, câu hỏi "Điều chuyển" — chọn "Trong phạm vi — lan sang chân đối ứng" |
| A-05 | Sửa phiếu xuất làm tăng số lượng: phần tăng thêm tính theo **giá bình quân tại thời điểm sửa**; phần giảm đảo theo đúng đơn giá đã ghi của phiếu | high | yes | Công thức giá vốn trong UOW-03; sai thì giá trị tồn kho lệch dần theo từng lần sửa | confirmed | Akenzy chốt 2026-08-17, câu hỏi "Giá vốn" — chọn "Bình quân tại thời điểm sửa" |
| A-06 | Cả bốn lối (sửa/xoá × nhập/xuất) đều khoá row bằng `SELECT … FOR UPDATE` và đọc lại trạng thái trong transaction trước khi ghi chênh lệch | high | yes | Không có khoá thì double-click ghi chênh lệch hai lần — sai số nặng hơn hiện trạng | confirmed | Akenzy chốt 2026-08-17, câu hỏi "Khoá trùng" — chọn "Có — bắt buộc" |
| A-07 | Phạm vi là phiếu nhập kho (`goods_receipts`) + phiếu xuất kho (`goods_issues`); phiếu thu/chi tiền mặt độc lập nằm ngoài | high | yes | Toàn bộ decomposition | confirmed | Akenzy chốt 2026-08-17, câu hỏi "Phạm vi" — chọn "Phiếu nhập + Phiếu xuất kho" |
| A-08 | Khi sửa/xoá phiếu nhập **tiền mặt**, phần chênh lệch tiền đi qua `CashService.recordMovement` (WITHDRAWAL khi tăng, DEPOSIT khi giảm) kèm bút toán chênh lệch, **và** sinh chứng từ quỹ điều chỉnh tương ứng (phiếu chi bổ sung khi tăng, phiếu thu hoàn khi giảm) qua outbox | low | yes | UOW-02: chỉ ghi cash movement thì số dư quỹ đúng nhưng sổ quỹ thiếu chứng từ; sinh chứng từ thì phải mở thêm topic + consumer phía cash-receipts | confirmed | Akenzy chốt 2026-08-17 — chọn "Sinh chứng từ điều chỉnh": tăng tiền sinh phiếu chi bổ sung, giảm tiền sinh phiếu thu hoàn, đều qua outbox. Phiếu chi/thu gốc giữ nguyên, không huỷ và không đánh số lại |
| A-09 | Đổi đơn giá mà không đổi số lượng vẫn phải ghi một dòng stock ledger `quantity = 0`, `lineValue = chênh lệch`, vì `getInstantAverageCost` tính bình quân từ chính các dòng ledger | medium | no | Bỏ qua thì giá vốn bình quân giữ giá cũ, mọi phiếu xuất sau đó tính sai giá vốn | pending | — |
| A-10 | Dòng ledger chênh lệch dùng `ADJUSTMENT_INCREASE`/`ADJUSTMENT_DECREASE`, giữ nguyên `referenceType = 'GOODS_RECEIPT' \| 'GOODS_ISSUE'` và `referenceId` trỏ về phiếu gốc, `notes` ghi rõ "Điều chỉnh phiếu …" | high | no | Báo cáo Nhập-Xuất-Tồn phân loại theo dấu nên số dư vẫn đúng; chỉ ảnh hưởng cách đọc sổ chi tiết | pending | — |
| A-11 | Sửa được: dòng hàng (thêm/bớt/đổi số lượng, đơn giá, kho/vị trí), đối tượng, diễn giải, ngày chứng từ, người giao. **Không** sửa được: `paymentMethod` (CASH ↔ CREDIT), chi nhánh, mục đích phiếu | medium | no | Người dùng gõ nhầm hình thức thanh toán vẫn phải xoá tạo lại | pending | — |
| A-12 | Quyền: phiếu nhập dùng lại `goods_receipt.write` (đang gác `@Patch`); phiếu xuất thêm khoá quyền mới `inventory.goods-issue.update`, seed cho các vai đã có `inventory.goods-issue.create` | medium | no | Người dùng thật thiếu quyền sau khi deploy → nút Sửa bấm vào là 403 | pending | — |
| A-13 | Ghi vết ở mức chứng từ là đủ: cập nhật `updatedBy`/`updatedAt` trên phiếu + `notes` trên dòng ledger chênh lệch. Không dựng bảng version, không bắt nhập lý do sửa | medium | no | Kiểm toán hỏi "ai sửa cái gì" thì chỉ tra được qua sổ kho, không có diff | pending | — |
| A-14 | Sửa không đổi `postedAt` của các dòng ledger cũ; dòng chênh lệch mang `postedAt = thời điểm sửa`. Ngày chứng từ (`receivedAt`/`occurredAt`) sửa được nhưng vẫn không xuống sổ kho — đúng như hiện trạng, vì đã chốt để ngoài phạm vi | high | no | Báo cáo theo kỳ vẫn lệch như hiện nay; feature này không làm nó tệ thêm | pending | — |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
|----|----------------|----------------------|-------------|
| A-15 | Mở nút Sửa chỉ cần bỏ điều kiện `status !== "DRAFT"` ở frontend | Backend phiếu xuất **không có endpoint update nào**, và DTO update của phiếu nhập thiếu `paymentMethod` nên `forbidNonWhitelisted` trả 400 | Không có UoW "chỉ sửa frontend"; UOW-05 phụ thuộc UOW-01/03 |
| A-16 | Có thể tận dụng luồng DRAFT sẵn có: tạo DRAFT, sửa, rồi post | Không client nào tạo DRAFT; hai endpoint v2 tạo DRAFT không ai gọi. Dựng luồng DRAFT nghĩa là đổi hành vi "Lưu là ghi sổ ngay" mà người dùng đang quen | Bỏ hướng DRAFT; sửa thẳng trên phiếu đã ghi sổ (A-01) |
