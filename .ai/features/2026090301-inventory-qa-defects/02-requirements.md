---
feature: inventory-qa-defects
stories: 4
acceptance_criteria: 23
---

# Requirements — inventory-qa-defects

## US-01 — Tổng hợp tồn kho lọc ra đúng thứ đã gõ

Là nhân viên kho, tôi muốn ô "Bộ lọc" chỉ trả về những dòng khớp,
để tin được con số trên lưới mà không phải đối chiếu tay.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Bộ lọc không còn rò dòng lạ
```gherkin
Given tôi đang ở một chi nhánh, chưa chọn kho, và chi nhánh đó có ít nhất một lệnh điều chuyển IN_PROGRESS về
When tôi gõ "DNGUAB064" vào ô "Bộ lọc" rồi bấm "Lấy dữ liệu"
Then mọi dòng trả về đều có Mã SKU hoặc Tên hàng hóa chứa "DNGUAB064"
And dòng "TXV6079" không xuất hiện
```

**AC-02** — Không còn dòng trùng cho cùng một SKU
```gherkin
Given một SKU có tồn ở kho A và đang có lệnh điều chuyển về kho B trong cùng chi nhánh
When tôi lọc theo mã SKU đó
Then SKU đó xuất hiện đúng một dòng cho mỗi kho có dữ liệu thật
And không có hai dòng cùng (SKU, kho)
```

**AC-03** — Phân trang nhất quán
```gherkin
Given kết quả lọc nhiều hơn một trang
When tôi xem trang 1
Then số dòng trả về không vượt quá pageSize
And tổng số bản ghi báo ở thanh phân trang bằng số dòng thực tế duyệt hết mọi trang
```

**AC-04** — Tổng ở footer khớp cột
```gherkin
Given tôi đang lọc theo một mã SKU
When tôi đọc tổng "Sắp nhận về" ở footer
Then nó bằng tổng cột "Sắp nhận về" của đúng những dòng đang hiển thị sau bộ lọc
```

**AC-05** — Không hồi quy tính năng "sắp nhận về"
```gherkin
Given tôi không gõ gì vào ô "Bộ lọc" và không đặt bộ lọc cột nào
When tôi mở Tổng hợp tồn kho ở một chi nhánh có hàng đang về
Then dòng hàng sắp nhận về vẫn hiển thị với SL tồn 0 và cột "Sắp nhận về" khác 0
```

## US-02 — Lọc được cột "Đối tượng" trên các màn chứng từ kho

Là kế toán kho, tôi muốn gõ tên nhà cung cấp / khách / nhân viên vào cột "Đối tượng",
để tìm chứng từ mà không phải cuộn tay qua cả tháng.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-06** — Nhập kho
```gherkin
Given tôi đang ở màn "Nhập kho"
When tôi gõ bất kỳ ký tự nào vào bộ lọc cột "Đối tượng"
Then API trả HTTP 200
And lưới hiển thị đúng những phiếu có tên đối tượng chứa chuỗi đã gõ
And không có toast "Máy chủ gặp sự cố"
```

**AC-07** — Xuất kho
```gherkin
Given tôi đang ở màn "Xuất kho"
When tôi gõ bất kỳ ký tự nào vào bộ lọc cột "Đối tượng"
Then API trả HTTP 200 và lưới lọc đúng
```

**AC-08** — Chuyển kho
```gherkin
Given tôi đang ở màn "Chuyển kho"
When tôi gõ vào bộ lọc cột "Đối tượng" hoặc cột người vận chuyển
Then API trả HTTP 200 và lưới lọc đúng
```

**AC-09** — Nhánh nhân viên trả đúng tên
```gherkin
Given tồn tại một phiếu có counterparty_kind = 'employee'
When tôi lọc "Đối tượng" theo một phần họ hoặc tên của nhân viên đó
Then phiếu đó nằm trong kết quả
And cột "Đối tượng" hiển thị "họ tên" ghép đúng
```

**AC-10** — Lưới test bắt được lỗi kiểu SQL
```gherkin
Given một test chạy trên Postgres thật (không mock QueryBuilder)
When test lọc "Đối tượng" trên cả ba loại chứng từ
Then test đỏ trên mã chưa sửa vì lỗi "operator does not exist: uuid = character varying"
And xanh sau khi sửa
```

## US-03 — Sắp xếp cột "Vị trí" ở In tem mã

Là nhân viên in tem, tôi muốn sắp xếp bảng theo cột Vị trí,
để đi lấy hàng theo tuyến kệ thay vì nhảy qua lại giữa các dãy.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-11** — Chu kỳ sắp xếp ba trạng thái
```gherkin
Given bảng In tem mã có nhiều dòng với mã vị trí khác nhau
When tôi bấm tiêu đề cột "Vị trí" lần thứ nhất, thứ hai, thứ ba
Then thứ tự lần lượt là tăng dần, giảm dần, rồi trở về thứ tự gốc
And mũi tên trên tiêu đề phản ánh đúng trạng thái đang áp dụng
```

**AC-12** — Dòng không có vị trí nằm cuối
```gherkin
Given một số dòng có locationCode rỗng
When tôi sắp xếp theo "Vị trí" tăng dần rồi giảm dần
Then những dòng rỗng luôn nằm cuối ở cả hai chiều
```

**AC-13** — In, Xuất khẩu và Xem trước theo đúng thứ tự đang nhìn
```gherkin
Given tôi đang sắp xếp theo "Vị trí"
When tôi bấm In tem mã, hoặc Xuất khẩu, hoặc nhìn khung Xem trước
Then thứ tự tem và thứ tự dòng khớp với thứ tự đang hiển thị trên bảng
```

**AC-14** — Sắp xếp theo SKU không hồi quy
```gherkin
Given tôi bấm tiêu đề "Mã SKU"
When bảng sắp xếp lại
Then hành vi giống hệt trước đợt sửa, kể cả quy tắc so sánh số trong mã ("N-9" trước "N-38")
And bấm "Vị trí" sau đó sẽ thay thế sắp xếp SKU, không cộng dồn
```

**AC-15** — Chế độ chuỗi không để lại sắp xếp treo
```gherkin
Given tôi đang sắp xếp theo "Vị trí"
When tôi chuyển sang chế độ chuỗi cửa hàng, nơi cột Kho và Vị trí bị ẩn
Then bảng không còn áp sắp xếp theo cột đã ẩn
```

## US-04 — Vị trí đã ngừng không được chào và không được tự điền

Là nhân viên kho, tôi muốn mọi ô chọn và mọi auto-fill chỉ đưa ra vị trí đang dùng được,
để không in tem hay lập chứng từ vào một kệ đã bỏ.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-16** — Dropdown bỏ chi tiết đã ngừng theo dõi
```gherkin
Given mặt hàng MY535-28-D-35 có A07.02 đang theo dõi và E03.01 đã ngừng theo dõi
When tôi mở dropdown "Vị trí" của dòng đó ở In tem mã
Then danh sách chỉ có A07.02
And E03.01 không xuất hiện
```

**AC-17** — Dropdown bỏ vị trí đã ngưng hoạt động
```gherkin
Given một vị trí có is_active = false nhưng mặt hàng vẫn còn dòng balance ở đó
When tôi mở dropdown "Vị trí" ở In tem mã
Then vị trí đó không xuất hiện
```

**AC-18** — Auto-fill chọn vị trí đang theo dõi
```gherkin
Given mặt hàng MY535-28-D-35 còn liên kết vị trí ưu tiên trỏ vào E03.01 đã ngừng theo dõi
And nó có tồn 3 ở A07.02 đang theo dõi
When tôi thêm mặt hàng đó vào bảng In tem mã
Then ô "Vị trí" tự điền A07.02
```

**AC-19** — Đã gán kệ nhưng chưa từng nhận hàng vẫn tự điền được
```gherkin
Given một mặt hàng có liên kết vị trí ưu tiên tới một kệ đang hoạt động
And chưa từng có dòng stock_balances nào cho cặp (mặt hàng, kệ) đó
When tôi thêm mặt hàng đó vào bảng
Then ô "Vị trí" vẫn tự điền đúng kệ đã gán
```

**AC-20** — Ô chọn vị trí ở form CRUD chung chỉ chào vị trí đang hoạt động
```gherkin
Given một form CRUD chung có trường locationId
When tôi gõ để tìm vị trí
Then chỉ vị trí có is_active = true xuất hiện
```

**AC-21** — Kiểm kê không tự điền vị trí đã ngừng
```gherkin
Given một mặt hàng có dòng balance đã ngừng theo dõi ở kệ có mã đứng đầu bảng chữ cái
When tôi thêm mặt hàng đó vào phiếu kiểm kê
Then vị trí tự điền là một kệ đang theo dõi, không phải kệ đã ngừng
```

**AC-22** — Trang quản trị vẫn thấy đủ
```gherkin
Given tôi mở trang "Vị trí hàng hóa", hoặc trang "Chi tiết vị trí" với bộ lọc trạng thái "Tất cả"
When trang tải xong
Then vị trí đã ngưng hoạt động và chi tiết đã ngừng theo dõi vẫn hiển thị đầy đủ
```

**AC-23** — Ngoại lệ Chuyển kho tạm được giữ nguyên
```gherkin
Given tôi đang ở màn "Chuyển kho tạm" trên POS
When tôi mở ô chọn Vị trí của một dòng
Then chi tiết đã ngừng theo dõi vẫn hiển thị, đúng như trước đợt sửa
```

## Non-functional

| Kind | Requirement | Verified by |
| ---- | ----------- | ----------- |
| Test | Ít nhất một test chạm Postgres thật cho biểu thức `counterpartyNameSql`; mock QueryBuilder không đủ vì lỗi kiểu SQL vô hình với nó | T-02-03 |
| Schema | Đợt này không có migration TypeORM; mọi thay đổi là logic đọc | T-04-01, T-04-02 |
| Hiệu năng | `POST /v2/inventory/stock/summary/search` không chậm đi đáng kể sau khi thêm bộ lọc vào khối pending | T-01-02 |
| Tương thích | `GET /inventory/stock/balances` giữ nguyên hành vi mặc định cho mọi caller cũ; bộ lọc vị trí là tuỳ chọn | T-04-01 |
