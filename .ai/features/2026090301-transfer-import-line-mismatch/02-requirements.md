---
feature: transfer-import-line-mismatch
stories: 3
acceptance_criteria: 11
---

# Requirements — Nhập phiếu điều chuyển sau khi sửa phiếu xuất

## US-01 — Sửa phiếu xuất thì lệnh điều chuyển đi theo

Là nhân viên kho chi nhánh gửi, tôi muốn sửa phiếu xuất điều chuyển (thêm mặt hàng,
sửa số lượng, xoá dòng) mà chi nhánh nhận vẫn nhập được, để không phải huỷ lệnh điều
chuyển rồi làm lại từ đầu.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Thêm mặt hàng mới vào phiếu xuất
```gherkin
Given một lệnh điều chuyển đã xuất, chi nhánh nhận CHƯA nhập
  And phiếu xuất của nó đang mang mặt hàng A
When chi nhánh gửi sửa phiếu xuất, thêm một dòng cho mặt hàng B (chưa từng có trên lệnh)
Then transfer_order_lines có thêm một dòng cho B với requested_qty đúng bằng số lượng vừa thêm
  And dòng mới mang organization_id, transfer_order_id, created_by và source_storage_id của lệnh
```

**AC-02** — Nhập được sau khi thêm mặt hàng
```gherkin
Given phiếu xuất vừa được sửa để thêm mặt hàng B
When chi nhánh nhận chọn chứng từ điều chuyển đó và bấm Lưu phiếu nhập
Then phiếu nhập được tạo và ghi sổ, không có lỗi 400
  And phiếu nhập có đủ dòng của cả A và B, đúng số lượng phiếu xuất đang mang
```

**AC-03** — Sửa số lượng dòng có sẵn
```gherkin
Given lệnh điều chuyển có dòng cho mặt hàng A với requested_qty = 3
When chi nhánh gửi sửa phiếu xuất, đổi số lượng A từ 3 thành 7
Then transfer_order_lines của A có requested_qty = 7
  And không có dòng trùng lặp nào được chèn thêm cho A
```

**AC-04** — Xoá bớt dòng khỏi phiếu xuất
```gherkin
Given lệnh điều chuyển có dòng cho A (3) và B (5)
When chi nhánh gửi sửa phiếu xuất, xoá hẳn dòng B
Then requested_qty của B về 0, không âm
  And chi nhánh nhận vẫn lưu được phiếu nhập, và phiếu nhập không có dòng B
```

**AC-05** — Ba thao tác trong cùng một lần sửa
```gherkin
Given lệnh điều chuyển có dòng cho A (3) và B (5)
When chi nhánh gửi sửa phiếu xuất một lần: xoá B, đổi A thành 4, thêm C (2)
Then transfer_order_lines có A = 4, B = 0, và một dòng C = 2
  And chi nhánh nhận lưu được phiếu nhập với đúng hai dòng A và C
```

**AC-06** — Giảm số lượng cho mặt hàng lệnh chưa từng có thì không chèn dòng rác
```gherkin
Given lệnh điều chuyển không có dòng nào cho mặt hàng D
When cascade nhận một delta âm cho D
Then không có dòng transfer_order_lines nào được chèn cho D
  And một cảnh báo được ghi log để lệch dữ liệu thật không biến mất im lặng
```

## US-02 — Đối soát và bù dữ liệu đang lệch

Là kế toán kho, tôi muốn các lệnh điều chuyển đang lệch dòng sẵn trong hệ thống được
phát hiện và bù, để chi nhánh nhận không kẹt ngay sau khi bản sửa lên.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-07** — Đối soát ra đúng danh sách lệch
```gherkin
Given cơ sở dữ liệu có lệnh điều chuyển mà phiếu xuất mang mặt hàng không có trên lệnh
When chạy script đối soát ở chế độ chỉ đọc
Then script liệt kê từng lệnh: số hiệu lệnh, số hiệu phiếu xuất, trạng thái, và các mặt hàng thiếu
  And script không ghi gì vào cơ sở dữ liệu ở chế độ này
```

**AC-08** — Bù đúng phạm vi
```gherkin
Given danh sách lệch từ AC-07
When chạy script ở chế độ ghi
Then chỉ những lệnh CHƯA nhập và CHƯA huỷ được bù thêm dòng transfer_order_lines
  And lệnh đã CANCELLED hoặc đã có phiếu nhập không bị chạm tới
  And chạy lại lần hai không tạo thêm dòng nào (idempotent)
```

**AC-09** — Bù không đụng sổ kho
```gherkin
Given script bù vừa chạy xong
When so sánh stock_ledger_entries và stock_balances trước và sau
Then không có bản ghi nào thay đổi
```

## US-03 — Bẫy `[rows, rowCount]` không tái diễn

Là người bảo trì, tôi muốn khuôn `UPDATE … RETURNING` được đọc kết quả qua một chỗ
duy nhất, để lỗi "đếm nhầm vì TypeORM bọc mảng" không lặp lại lần thứ ba.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-10** — Một helper dùng chung, có test khoá hành vi
```gherkin
Given TypeORM trả [rows, rowCount] cho UPDATE/DELETE … RETURNING và mảng dòng cho SELECT/INSERT … RETURNING
When mã đọc kết quả một truy vấn RETURNING qua helper dùng chung
Then helper trả về mảng dòng thật trong cả bốn trường hợp
  And có unit test khoá lại đúng bốn hình dạng đó, để nâng cấp TypeORM làm vỡ test chứ không làm vỡ nghiệp vụ
```

**AC-11** — Chỗ dính bẫy còn lại được sửa
```gherkin
Given StockLedgerService.setTracked cập nhật N dòng stock_balances
When gọi API đánh dấu theo dõi tồn
Then phản hồi trả updated = N
  And không còn trả 2 bất kể cập nhật bao nhiêu dòng
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Hồi quy | Không đổi hành vi khi chi nhánh nhận đã nhập (`importGoodsReceiptId` khác null) — đường đó vẫn bị `assertExportIssueCanBeEdited` chặn | T-01-04 |
| Bằng chứng | Nhánh insert phải được chứng minh là **thực sự chạy** trên Postgres thật, không chỉ qua mock — đây đúng là chỗ bản sửa 24/08 chết mà test vẫn xanh | T-01-03 |
| Vận hành | Script đối soát chạy được trên bản sao prod trước, in ra kế hoạch, rồi mới chạy chế độ ghi | T-02-01, T-02-02 |
