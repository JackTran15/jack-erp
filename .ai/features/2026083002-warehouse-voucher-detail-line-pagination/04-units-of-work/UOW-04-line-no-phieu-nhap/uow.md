---
id: UOW-04
slug: line-no-phieu-nhap
title: Dòng phiếu nhập cũng mang line_no, cùng cơ chế thứ tự với phiếu xuất
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-03]
requirements: [US-01]
verifies: [AC-04, AC-17]
risk: high
status: todo
rollback: revert migration bằng `pnpm migration:revert` (down đã viết) rồi hoàn tác commit service; `created_at` vẫn còn nguyên nên getLines trả về đúng thứ tự cũ ngay khi đổi lại order.
---

# UOW-04 — Dòng phiếu nhập cũng mang `line_no`

## Why this slice exists

`goods_receipt_lines` đang sắp theo `created_at` và **cho ra đúng thứ tự nhập** — A-05
kiểm điều đó ngày 30/8 và nó vẫn đúng. Slice này không sửa một lỗi hiển thị nào.

Nó tồn tại vì sau UOW-01, hai bảng dòng của hai loại phiếu song sinh biểu diễn cùng một
khái niệm bằng hai cơ chế khác nhau: một bên là cột số tường minh có ràng buộc unique,
một bên là dấu thời gian. Hai cơ chế cho cùng một khái niệm là thứ sẽ phân kỳ — và chỗ
nó phân kỳ chính là UOW-05, nơi một handler duy nhất phải trả dòng "theo line-order" cho
cả hai loại phiếu. Akenzy chốt hướng đối xứng ngày 2026-09-03 (A-14).

Rủi ro **high** không nằm ở logic mà ở chỗ ràng buộc mới đi vào một bảng đang chạy: từ
lúc `NOT NULL` có hiệu lực, mọi đường ghi dòng phiếu nhập bị sót sẽ ném lỗi ngay khi
người dùng lưu phiếu.

## Demo script

1. `pnpm migration:run` trên DB có sẵn phiếu nhập cũ → chạy sạch, không lỗi.
2. Mở một phiếu nhập cũ nhiều dòng, so thứ tự dòng với ảnh chụp trước khi chạy migration
   → **giống hệt**. Đây là điều phải chứng minh: backfill chép lại thứ tự thật chứ không
   xáo nó.
3. Tạo một phiếu nhập mới với ba dòng A, B, C → mở lại, thứ tự là A, B, C.
4. Sửa phiếu đó, chèn một dòng D vào **giữa** A và B, lưu → mở lại, thứ tự là A, D, B, C.
5. Chạy một phiếu kiểm kê có chênh lệch dương để sinh phiếu nhập tự động
   (`stock-take.service.ts:1590`) → phiếu sinh ra lưu được, dòng có `line_no` từ 1.
6. `SELECT goods_receipt_id, count(*), count(distinct line_no) FROM goods_receipt_lines
   GROUP BY 1 HAVING count(*) <> count(distinct line_no)` → không ra hàng nào.

## In scope

- Migration viết tay thêm `line_no` cho `goods_receipt_lines`, backfill, `NOT NULL`,
  unique index.
- `GoodsReceiptLineEntity` khai cột.
- Mọi đường ghi dòng phiếu nhập gán `lineNo`; `getLines` sắp theo `lineNo`.
- Test thứ tự cho đường tạo, đường sửa, và đường sinh từ kiểm kê.

## Not in scope

- Bỏ cột `created_at`. Nó vẫn là siêu dữ liệu hữu ích, chỉ thôi làm nguồn thứ tự.
- Đụng vào `goods_issue_lines` — UOW-01 đã xong phần đó.
- Đổi hình dạng endpoint đọc dòng. Đó là UOW-05.

## Risks

| Risk | Mitigation |
| --- | --- |
| Sót một đường ghi dòng phiếu nhập → lỗi ràng buộc lúc người dùng lưu | T-04-02 grep toàn repo cho `GoodsReceiptLineEntity` và đi qua **từng** chỗ dựng, gồm cả ngoài `modules/inventory`; không suy từ một đường |
| Backfill xáo thứ tự phiếu cũ | `ORDER BY created_at, id` chứ không `ORDER BY id`. Demo bước 2 so ảnh trước–sau, đó là bài kiểm thật |
| Hai dòng cùng `created_at` tới mili-giây cho thứ tự không xác định | `id` là khoá phụ trong `ORDER BY`, nên vẫn xác định |
| Người sau sửa `getLines` về `created_at` vì thấy cột đó còn đó | Comment tại chỗ trên entity và trên `getLines`, như UOW-01 đã làm bên phiếu xuất |

## Definition of done

- [x] AC-04, AC-17 pass
- [x] Chạy và revert được trên `erp_dev`; chạy trên `prod_3008` (162.776 dòng / 627 phiếu) hết 19,8 s
- [x] Trả rỗng trên cả `erp_dev` và `prod_3008`
- [x] 5 đường ghi liệt kê kèm file:line trong T-04-02, cộng 3 nơi đã đọc để loại (Excel import, transfer-order, debt-report)
- [x] Demoed và được chấp nhận ở gate G4 — Akenzy, 2026-09-03
