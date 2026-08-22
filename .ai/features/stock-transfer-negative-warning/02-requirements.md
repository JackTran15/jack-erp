# Requirements — Phiếu chuyển kho: cho phép chuyển quá tồn (kho xuất âm)

Bối cảnh: trên `Phiếu chuyển kho` (backoffice, `/inventory/stock-transfers`), server chặn cứng
mọi phiếu làm tồn tại vị trí xuất xuống dưới 0 — `StockTransferService.post()` khoá bản ghi
`stock_balances` rồi ném `Không đủ tồn để chuyển: …`, và `createAndPost` bọc lại thành
`Không thể chuyển kho: …`. Người dùng không có đường đi tiếp.

Sổ kho vốn đã cho phép số âm ở mọi chứng từ khác — phiếu xuất kho chỉ **cảnh báo** phía client
(`OverstockConfirmDialog`) rồi ghi sổ bình thường, và `transfer-order.service.ts` ghi rõ
"Ledger allows negative balances — warned client-side, never blocked here". Chuyển kho phải theo
đúng quy ước đó.

| ID | Given / When / Then |
|---|---|
| AC-01 | **Given** một phiếu chuyển kho mới với Kho xuất `Kho Lưu trữ HCM` và một dòng hàng có số lượng lớn hơn số tồn tại kho đó, **when** bấm "Lưu", **then** hiện hộp thoại cảnh báo "Xác nhận xuất quá số lượng tồn" liệt kê đúng hàng hoá / số tồn / ĐVT / kho xuất kèm hai lựa chọn "Không" và "Tiếp tục" — và **không** hiện lỗi chặn `Không đủ tồn để chuyển`. |
| AC-02 | **Given** hộp thoại cảnh báo đang mở, **when** bấm "Tiếp tục", **then** phiếu được lưu và ghi sổ kho, và tồn của hàng hoá đó tại kho xuất trở thành số âm. |
| AC-03 | **Given** hộp thoại "Thêm mới phiếu chuyển kho" đang mở, **when** nhìn thanh công cụ của hộp thoại, **then** không còn nút "Thêm mới" — nút "Thêm mới" duy nhất còn lại là nút mở phiếu trên thanh công cụ của trang. |
| AC-04 | **Given** phiếu xuất kho và phiếu chuyển kho giờ dùng chung `findOverstockRows` (một request `POST /inventory/stock/balances/batch`), **when** mở phiếu xuất kho và xuất một mã quá số tồn, **then** phiếu xuất vẫn cảnh báo đúng như trước và báo **cùng một số tồn** mà phiếu chuyển kho báo cho cùng mã tại cùng kho. |
| AC-05 | **Given** hộp thoại "Chọn kho" của phiếu chuyển kho, **when** mở dropdown Kho xuất, **then** cột "Mã kho" hiện đúng mã của kho (ví dụ `KLT`) chứ không phải `—`. Trang chuyển kho đang cắt storage xuống `{id, name}` trước khi truyền vào dialog nên `code` bị mất — ba picker chọn kho còn lại (nhập kho, xuất kho, lệnh điều chuyển) truyền nguyên object nên không dính. |
