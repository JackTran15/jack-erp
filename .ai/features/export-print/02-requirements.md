---
feature: export-print
stories: 6
acceptance_criteria: 25
---

# Requirements — Xuất khẩu / In

## US-01 — Xuất khẩu một báo cáo ra Excel

Là kế toán, tôi muốn tải báo cáo đang xem ra file Excel đúng bộ lọc và đúng các cột
đang hiển thị, để làm việc tiếp trên file mà không phải gõ lại.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Đúng cột đang hiển thị
```gherkin
Given tôi đang xem báo cáo "Tổng hợp nhập xuất tồn kho" và đã ẩn cột "Thương hiệu"
When tôi bấm "Xuất khẩu"
Then file .xlsx tải về có đúng các cột đang hiển thị, đúng thứ tự trên màn hình
And không có cột "Thương hiệu" trong file
```

**AC-02** — Đúng dữ liệu theo bộ lọc
```gherkin
Given tôi đã đặt kỳ báo cáo và bộ lọc kho
When tôi bấm "Xuất khẩu"
Then số dòng dữ liệu trong file bằng đúng `total` mà `POST search` trả về cho cùng bộ lọc
And dòng cuối là dòng tổng cộng, khớp với `totals` của `POST search`
```

**AC-03** — Nhãn cột do người dùng đặt lại
```gherkin
Given tôi đã đổi tên hiển thị một cột trong hộp thoại cấu hình cột
When tôi bấm "Xuất khẩu"
Then tiêu đề cột trong file dùng tên tôi đặt, không phải tên gốc trong catalog
```

**AC-04** — Dùng chung cho cả bốn miền báo cáo
```gherkin
Given báo cáo thuộc bất kỳ miền nào trong invoice / inventory / profit / debt
When tôi bấm "Xuất khẩu"
Then file tải về qua cùng một đường xử lý, không cần code riêng cho từng miền
```

**AC-05** — Vượt trần dòng (báo cáo tổng hợp, không có `exportSource`)
```gherkin
Given bộ lọc của tôi cho ra hơn 50.000 dòng trên một báo cáo tổng hợp
When tôi bấm "Xuất khẩu"
Then tôi nhận thông báo lỗi yêu cầu thu hẹp kỳ hoặc bộ lọc
And không có file rỗng hay file bị cắt cụt nào được tải về
```
> Thu hẹp 2026-07-27 (ADR-07): báo cáo kiểu liệt kê có `exportSource` không còn trần —
> xem AC-18.

**AC-06** — Phân tách theo tổ chức
```gherkin
Given tôi thuộc tổ chức A
When tôi gọi endpoint export với bộ lọc bất kỳ
Then mọi dòng trong file đều thuộc tổ chức A
```

**AC-07** — Cột không hợp lệ
```gherkin
Given request export chứa một khoá cột không có trong catalog của báo cáo
When server xử lý
Then trả 400 kèm danh sách khoá cột không hợp lệ
```

## US-02 — In bảng báo cáo

Là kế toán, tôi muốn in bảng báo cáo đang xem ra khổ A4, để kẹp vào hồ sơ.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-08** — In đúng bảng đang xem
```gherkin
Given tôi đang xem một báo cáo có bộ lọc và cấu hình cột riêng
When tôi bấm "In" và chọn khổ "A4 (ngang)"
Then hộp thoại in của trình duyệt mở ra với đúng các cột và dòng đang hiển thị
And phần đầu trang in có tên chi nhánh, tên báo cáo và khoảng thời gian lọc
```

**AC-09** — Chọn hướng giấy
```gherkin
Given tôi bấm "In"
When tôi chọn "A4 (dọc)" thay vì "A4 (ngang)"
Then bản in dùng hướng dọc
```

**AC-10** — Không mất trạng thái màn hình
```gherkin
Given tôi đang xem báo cáo ở trang 3
When tôi in xong và đóng hộp thoại in
Then màn hình báo cáo vẫn ở trang 3 với nguyên bộ lọc
```

## US-03 — In & xuất khẩu chứng từ kho

Là thủ kho, tôi muốn in phiếu nhập / xuất / chuyển kho ra A4 để ký nhận và lưu hồ sơ, và
tôi muốn xuất riêng một phiếu ra Excel để gửi cho người khác đối chiếu mà không phải in
ra giấy rồi chụp lại.

> Mở rộng 2026-07-27: khảo sát MISA §2.3/3.3/4.3 xác nhận cả 3 loại phiếu kho có cả nút
> In lẫn Xuất khẩu ở cấp chứng từ (không phải cấp danh sách); bản đầu của feature này chỉ
> chốt In. Người dùng xác nhận cần cả hai — thêm AC-23..25.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-11** — In phiếu kho
```gherkin
Given tôi đang mở chi tiết một phiếu nhập kho
When tôi bấm "In"
Then hộp thoại in mở ra với mẫu A4 chứa số phiếu, ngày, đối tượng, diễn giải
And bảng dòng hàng có mã SKU, tên hàng, kho, đơn vị tính, số lượng, đơn giá, thành tiền
And có dòng tổng cộng cùng chỗ ký cho người giao và người nhận
```

**AC-12** — Áp dụng cho cả ba loại phiếu kho
```gherkin
Given chứng từ là phiếu nhập kho, phiếu xuất kho, hoặc phiếu chuyển kho
When tôi bấm "In"
Then mẫu in tương ứng hiển thị đúng nhãn tiêu đề và đúng các cột riêng của loại đó
```

**AC-13** — Chứng từ không thuộc phạm vi
```gherkin
Given tôi yêu cầu payload in của một chứng từ thuộc tổ chức hoặc chi nhánh khác
When server xử lý
Then trả 404, không lộ dữ liệu chứng từ
```

**AC-23** — Xuất Excel một chứng từ kho
```gherkin
Given tôi đang mở chi tiết một phiếu nhập kho đã lưu (có id)
When tôi bấm "Xuất khẩu"
Then file .xlsx tải về có khối tiêu đề (chi nhánh, số phiếu, ngày, đối tượng)
And bảng dòng hàng đúng các cột và toàn bộ dòng đang hiển thị trên phiếu
And dòng cuối là dòng tổng cộng khớp với số lượng/thành tiền hiển thị trên màn hình
```

**AC-24** — Áp dụng cho cả ba loại phiếu kho, dùng chung export pipeline
```gherkin
Given chứng từ là phiếu nhập kho, phiếu xuất kho, hoặc phiếu chuyển kho
When tôi bấm "Xuất khẩu"
Then file tải về qua đúng ExportPipeline đã dựng ở US-01 (T-01-01..T-01-04)
And không có Writer hay Sink mới nào được viết riêng cho phiếu kho
And tiêu đề, nhãn khối đầu, và tập cột dòng hàng đúng theo loại phiếu tương ứng
```

**AC-25** — Chứng từ không thuộc phạm vi (export)
```gherkin
Given tôi yêu cầu export của một chứng từ thuộc tổ chức hoặc chi nhánh khác
When server xử lý
Then trả 404, không lộ dữ liệu chứng từ — cùng hành vi với AC-13
```

## US-04 — In phiếu thu chi

Là kế toán, tôi muốn in phiếu thu / chi tiền mặt và tiền gửi ra khổ A5, để người nộp
và người nhận cùng ký.

**Priority:** must
**Depends on:** US-03

### Acceptance criteria

**AC-14** — In phiếu quỹ
```gherkin
Given tôi đang mở chi tiết một phiếu thu tiền mặt
When tôi bấm "In"
Then hộp thoại in mở ra với mẫu A5 có số phiếu, ngày, đối tượng nộp, lý do
And có bảng diễn giải / số tiền / mục thu kèm dòng tổng
And có dòng "Số tiền bằng chữ" viết đúng tiếng Việt
```

**AC-15** — Áp dụng cho cả bốn loại phiếu quỹ
```gherkin
Given chứng từ là phiếu thu tiền mặt, chi tiền mặt, thu tiền gửi, hoặc chi tiền gửi
When tôi bấm "In"
Then mẫu in dùng đúng tiêu đề và đúng nhãn đối tượng nộp/nhận của loại đó
```

## US-05 — Xuất khẩu sổ chi tiết tiền mặt

Là kế toán, tôi muốn tải Sổ chi tiết tiền mặt ra Excel, để đối chiếu quỹ.

**Priority:** should
**Depends on:** US-01

### Acceptance criteria

**AC-16** — Xuất sổ quỹ
```gherkin
Given tôi đang xem Sổ chi tiết tiền mặt với khoảng ngày đã chọn
When tôi bấm "Xuất khẩu"
Then file .xlsx có dòng đầu "Số dư đầu kỳ", các dòng giao dịch theo thứ tự trên màn hình,
     và dòng cuối tổng số tiền thu / chi trong kỳ
```

**AC-17** — Cột số dư luỹ kế
```gherkin
Given sổ có nhiều dòng giao dịch
When tôi mở file đã tải
Then cột "Số tiền còn lại" ở mỗi dòng bằng số dư luỹ kế đúng như hiển thị trên màn hình
```

## US-06 — Xuất khẩu chịu được kỳ rộng

Là kế toán ở chi nhánh lớn, tôi muốn xuất báo cáo cả năm mà không bị chặn bởi trần dòng
và không làm chậm cả hệ thống cho người khác, để không phải chia nhỏ kỳ rồi ghép file
bằng tay.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-18** — Kỳ rộng không còn bị chặn ở report kiểu liệt kê
```gherkin
Given báo cáo "Danh sách hoá đơn" của một tổ chức có hơn 50.000 hoá đơn trong kỳ
When tôi bấm "Xuất khẩu"
Then file .xlsx tải về đầy đủ, không nhận lỗi vượt trần dòng
And dòng tổng cộng khớp với tổng của toàn bộ kỳ, không phải của một phần
```

**AC-19** — Trần dòng chặn trước khi nạp dữ liệu
```gherkin
Given báo cáo tổng hợp (không có `exportSource`) cho ra hơn 50.000 dòng
When server xử lý request export
Then trả 400 trước khi materialize dòng nào vào bộ nhớ
And áp dụng cho cả bốn miền báo cáo, không riêng inventory
```

**AC-20** — Không lặp và không sót dòng khi có ghi đồng thời
```gherkin
Given một export đang chạy trên đường keyset
When có bản ghi mới được tạo trong cùng khoảng thời gian đang xuất
Then file kết quả không chứa dòng lặp và không sót dòng nào đã tồn tại lúc bắt đầu
```

**AC-21** — Nguồn ngoài registry dùng được cùng pipeline
```gherkin
Given Sổ chi tiết tiền mặt không nằm trong report registry v2
When nó xuất Excel
Then nó cấp một `ExportFetcher` và đi qua đúng `ExportPipeline` như bốn miền báo cáo
And không dựng ExcelJS trực tiếp, không chép lại khối header/style
```

**AC-22** — Mức song song điều chỉnh được
```gherkin
Given `EXPORT_PARTITION_PARALLEL` đặt bằng 1
When một export chạy trên đường keyset
Then chỉ một truy vấn partition chạy tại một thời điểm
And log ghi lại số partition, số trang và số dòng của từng partition
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Reuse | Không thêm dependency mới ở `@erp/api` lẫn hai app web | T-01-01, T-03-01 |
| Reuse | Mọi workbook đi qua một builder dùng chung; không chép lại khối header/style | T-01-01 |
| Reuse | Mọi mẫu in đi qua một `DocumentPrinter` dùng chung, tái dùng pattern `InvoicePrinter` của pos-web | T-03-01 |
| Reuse | Fetch / render / sink là ba mảnh thay được; thêm nguồn hoặc định dạng không sửa hai mảnh còn lại | T-06-01, T-06-02 |
| Performance | Export đồng bộ, trả trong 1 request; report có `exportSource` stream theo trang, report còn lại chặn ở 50.000 dòng bằng `COUNT` chạy trước | T-06-03, T-06-07 |
| Performance | RAM của một export không tỉ lệ với số dòng ở phía writer; dòng chờ flush bị chặn bởi `EXPORT_BUFFER_HIGH_WATER` | T-06-02, T-06-03 |
| Security | Mọi truy vấn lọc theo `actor.organizationId`; chứng từ lọc thêm `branchId` | T-01-02, T-03-02 |
| i18n | Nội dung file và bản in tiếng Việt; source backend tiếng Anh | T-01-01, T-03-01 |
| Contract | `pnpm openapi:generate` chạy lại, commit snapshot + schema sinh ra | T-01-04 |
