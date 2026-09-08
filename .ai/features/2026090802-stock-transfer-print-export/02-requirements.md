---
feature: stock-transfer-print-export
stories: 2
acceptance_criteria: 8
---

# Requirements — In / Xuất khẩu phiếu chuyển kho

Quy ước: "phiếu chuyển kho" = bản ghi `StockTransferEntity` mở từ trang Chuyển kho; "cùng bố cục
với phiếu Nhập/Xuất" = cùng 5 khối của `VoucherPrintPayload` (đầu phiếu, thông tin, bảng hàng,
tổng + số tiền bằng chữ, ô ký) do cùng renderer vẽ.

---

## US-01 — API trả payload in và file Excel cho phiếu chuyển kho

Là backoffice, tôi cần API cho phiếu chuyển kho trả cùng loại payload in và cùng loại file Excel
như phiếu Nhập/Xuất, để FE dùng lại nguyên đường In/Xuất khẩu sẵn có.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Payload in đúng bố cục MISA
```gherkin
Given một phiếu chuyển kho đã lưu có ít nhất một dòng hàng thuộc org của tôi
When gọi GET /inventory/stock/transfers/:id/print-payload với quyền inventory.transfer.read
Then nhận 200 với kind = STOCK_TRANSFER, title = "PHIẾU CHUYỂN KHO", paper = A4
And lineColumns theo thứ tự: STT, Mã SKU, Tên hàng hóa, Kho xuất, Vị trí xuất, Kho nhập, Vị trí nhập, ĐVT, Số lượng, Đơn giá, Thành tiền, Giá bán (ẩn), Thành tiền giá bán (ẩn), Ghi chú (ẩn)
And info gồm "Người vận chuyển" và "Diễn giải"
And totals có Số lượng và Thành tiền cộng dồn, totalsLabel = "Tổng", amountInWords là số tiền bằng chữ của tổng Thành tiền
And signatures = [Người lập phiếu, Người nhận hàng, Thủ kho, Kế toán trưởng, Giám đốc]
```

**AC-02** — Giá trị dòng lấy từ quan hệ của dòng
```gherkin
Given một dòng chuyển kho có kho xuất, vị trí xuất, kho nhập, vị trí nhập, đơn giá và số lượng
When dựng payload
Then dòng in có sourceWarehouse/destWarehouse = tên kho, sourcePosition/destPosition = tên vị trí
And unitPrice = đơn giá dòng, lineTotal = lineValue của dòng (hoặc đơn giá × số lượng khi lineValue trống)
And uom/sku/name lấy từ item; salePrice = giá bán item, saleTotal = giá bán × số lượng
```

**AC-03** — Phiếu không có dòng
```gherkin
Given một phiếu chuyển kho không có dòng hàng
When dựng payload
Then lines = [], totals = null, amountInWords không có
```

**AC-04** — Xuất Excel
```gherkin
Given phiếu ở AC-01
When gọi GET /inventory/stock/transfers/:id/export
Then nhận 200, Content-Type spreadsheetml, Content-Disposition attachment; filename="phieu-chuyen-kho.xlsx"
And workbook mở được, có sheet với tiêu đề PHIẾU CHUYỂN KHO, hàng tiêu đề cột như AC-01, dòng Tổng, dòng Số tiền viết bằng chữ và khối ký
```

**AC-05** — Cách ly org
```gherkin
Given token của một org khác
When gọi print-payload hoặc export với id phiếu của org tôi
Then nhận 404 và body không chứa số phiếu hay tên hàng
```

**AC-06** — Chỉ scope org, không chặn theo chi nhánh
```gherkin
Given người dùng cùng org, đang chọn chi nhánh khác chi nhánh xuất của phiếu
When gọi print-payload
Then nhận 200 (giống Lệnh điều chuyển; phiếu chuyển kho có thể liên chi nhánh)
```

## US-02 — Nút In / Xuất khẩu hoạt động trên dialog phiếu chuyển kho

Là thủ kho, tôi muốn bấm In và Xuất khẩu trên phiếu chuyển kho đã lưu, để in phiếu ký và gửi
file Excel như đang làm với phiếu Nhập/Xuất.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-07** — Nút bật khi phiếu đã lưu, tắt khi tạo mới
```gherkin
Given tôi ở trang Chuyển kho
When mở một phiếu đã lưu (xem hoặc sửa)
Then hai nút In và Xuất khẩu trên thanh công cụ dialog được bật
When bấm Thêm mới
Then hai nút In và Xuất khẩu bị tắt
```

**AC-08** — In và Xuất khẩu dùng nguyên đường của phiếu Nhập/Xuất
```gherkin
Given một phiếu chuyển kho đã lưu đang mở
When bấm In
Then FE gọi print-payload của phiếu chuyển kho rồi mở hộp thoại in của trình duyệt với phiếu do renderVoucherHtml vẽ
When bấm Xuất khẩu
Then FE tải file .xlsx từ route export, giữ tên file server đặt (rơi về phieu-chuyen-kho.xlsx)
And khi API lỗi, hiện toast lỗi và nút không bị kẹt ở trạng thái đang xử lý
```

## Non-functional

| Kind        | Requirement                                                                     | Verified by |
| ----------- | ------------------------------------------------------------------------------- | ----------- |
| Bảo mật     | Route mới yêu cầu `inventory.transfer.read`; org khác 404 không lộ trường        | T-01-05     |
| Tương thích | `openapi.snapshot.json` + `schema.ts` sinh lại và commit; `pnpm -r build` xanh    | T-01-03     |
| Nhất quán   | Không sửa renderer; payload đi qua `renderVoucherHtml` / `VoucherXlsxWriter` như 3 chứng từ kho khác | T-01-02, T-01-04 |
