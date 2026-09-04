---
feature: transfer-import-line-mismatch
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Prod đang chạy code có `609b2922` (fix upsert 24/08), nên đây là lỗ hổng còn sót chứ không phải lỗi cũ chưa deploy | high | yes | Nếu sai thì việc cần làm chỉ là deploy, toàn bộ UoW sửa code thành thừa | confirmed | Akenzy xác nhận 2026-09-03 ("Prod đã có 609b2922") |
| A-02 | Thao tác QA làm là thêm mặt hàng mới **và** sửa số lượng **và** xoá dòng trong cùng đợt sửa phiếu xuất | high | yes | Quyết định kịch bản test hồi quy phải phủ; nếu chỉ sửa số lượng thì cơ chế gốc là cái khác | confirmed | Akenzy chọn cả 3 phương án, 2026-09-03 |
| A-03 | Hướng nghiệp vụ: phiếu xuất là sự thật, lệnh điều chuyển tự nới theo (không khoá lưới phiếu xuất, không bỏ kiểm tra ở `confirmImport`) | high | yes | Đảo hướng thì thiết kế lật hoàn toàn sang khoá UI chi nhánh gửi | confirmed | Akenzy chọn "Tự nới lệnh điều chuyển (giữ hướng hiện tại)", 2026-09-03 |
| A-04 | `manager.query()` trả `[rows, rowCount]` cho `UPDATE`/`DELETE … RETURNING` và trả thẳng mảng dòng cho `SELECT`/`INSERT … RETURNING` | high | yes | Nếu sai thì chẩn đoán gốc sai, cả feature vô nghĩa | confirmed | Đo thật trên Postgres bằng TypeORM 0.3.28 của repo (bảng TEMP): `[[],0]` / `[[{id}],1]`; khớp `PostgresQueryRunner.js:198-203` và comment sẵn có ở `sync-admin-permissions.seed.ts:86-93` |
| A-05 | Không tồn tại đường lệch dòng thứ hai: mọi mặt hàng có trên `goods_issue_lines` mà thiếu ở `transfer_order_lines` đều đến từ một lần sửa phiếu xuất | medium | no | Sót một nguồn lệch → 400 vẫn tái phát sau khi fix; T-01-03 (đối soát) sẽ lộ ra | confirmed | Truy vết 4 đường sinh phiếu xuất: `deriveExportLines` và `buildExportLinesFromInput` đều chặn item ngoài lệnh; `TransferOrderService.update()` chặn sửa dòng khi `IN_PROGRESS`; FE khoá lưới nhập bằng `linesLocked` |
| A-06 | Bù `transfer_order_lines` chỉ là dữ liệu kế hoạch — không phát sinh bút toán, không đụng `stock_ledger_entries` / `stock_balances` | high | yes | Nếu sai, backfill sẽ làm lệch tồn kho và sổ kế toán | confirmed | `transfer_order_lines` không có cột giá trị; chỉ `buildImportLinesFromInput` và `deriveExportLines` đọc nó; ghi sổ đi qua `goods_issue_lines` / `goods_receipt_lines` |
| A-07 | Các lệnh điều chuyển đang lệch dòng trong prod đều đã `CANCELLED` (người dùng huỷ để né lỗi), nên backfill chỉ cần chạm lệnh **chưa** nhập và **chưa** huỷ | medium | no | Nếu còn lệnh IN_PROGRESS lệch, chi nhánh nhận vẫn kẹt sau khi deploy → T-01-03 xử đúng nhóm này | confirmed | Truy vấn `prod_3008`: toàn bộ lệnh có `missing_items > 0` đều `status = CANCELLED`; ảnh chụp DB lúc 03/09 09:20, trước thời điểm QA 12:01 |
| A-08 | Unit test hiện có (`transfer-order.service.spec.ts:1085`) xanh giả vì mock `dataSourceManagerQuery.mockResolvedValueOnce([])` — trả mảng rỗng, đúng thứ TypeORM **không** trả | high | no | Sửa code mà không sửa mock thì test vẫn không bảo vệ được gì | confirmed | Đọc spec: mock trả `[]` (length 0) nên nhánh insert chạy trong test; thực tế TypeORM trả `[[],0]` (length 2) |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
| --- | --- | --- | --- |
| A-09 | Người dùng quét mã vạch thêm dòng thẳng vào lưới phiếu nhập điều chuyển | `GoodsReceiptFormDialog:439` đặt `linesLocked = isView \|\| sourceTransferOrderId !== null`, và `prefillFromTransferOrder` gọi `setLines(mapped)` (thay, không nối) — FE không thể tạo ra dòng ngoài phiếu xuất | Loại bỏ một nhánh nghi vấn; không có UoW nào cho FE |
| A-10 | Lệnh điều chuyển bị mất dòng do `TransferOrderService.update()` xoá và ghi lại `transfer_order_lines` | `update()` chỉ cho thay dòng khi `DRAFT`; ở `IN_PROGRESS` `dto.lines !== undefined` bị ném `BadRequestException` ngay | Không cần đụng `update()`; thu hẹp phạm vi về đúng `adjustRequestedQty` |
| A-11 | Nhánh `INSERT … ON CONFLICT … RETURNING` ở `stock-ledger.service.ts:937` cũng dính bẫy | `raw.command` của lệnh INSERT rơi vào `default:` của TypeORM → trả thẳng mảng dòng; chỉ `UPDATE`/`DELETE` mới bị bọc | Không sửa chỗ đó; chỉ `stock-ledger.service.ts:703` (`setTracked`) dính |
