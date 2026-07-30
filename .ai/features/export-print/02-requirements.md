---
feature: export-print
stories: 7
acceptance_criteria: 35
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

## US-07 — Tài liệu xuất ra giống mẫu MISA

Là kế toán đang chuyển từ MISA eShop sang, tôi muốn file Excel và bản in của jack-erp trông
đúng như file tôi vẫn nộp và vẫn lưu, để không phải định dạng lại bằng tay trước khi in ký
hay gửi đi.

> Thêm 2026-07-30. Nguồn chuẩn: 8 file trong `examples/ERP` — `export_Phieu_nhap_kho.xlsx`,
> `export_Xuat_Khau_Xuat_Kho.xlsx`, `export_XuatKhauChuyenKho.xlsx`,
> `export_Doanh_thu_theo_mat_hang.xlsx` và 4 bản in `.pdf` tương ứng. Chúng đã được giải mã
> tới từng ô, từng `cellXf`, từng `mergeCell`; bảng đối chiếu nằm trong `03-logical-design.md`
> §"House style". Ba mẫu chứng từ `.xlsx` **có** dòng tiền-bằng-chữ và khối ký — đó là bằng
> chứng bác bỏ ADR-09, xem ADR-10.

**Priority:** must
**Depends on:** US-01, US-02, US-03

### Acceptance criteria

**AC-26** — House style của workbook báo cáo
```gherkin
Given tôi xuất bất kỳ báo cáo nào trong bốn miền invoice / inventory / profit / debt
When tôi mở file .xlsx tải về
Then mọi ô của hàng tiêu đề cột, hàng dữ liệu và hàng tổng đều có viền mảnh bốn cạnh
And hàng tiêu đề cột có nền màu FFFDE9D9 với chữ đen in đậm, không phải nền xanh chữ trắng
And số hiển thị theo định dạng #,##0
And tiêu đề báo cáo in đậm cỡ 18 căn giữa trên toàn bộ bề rộng cột
And file không có AutoFilter và không có freeze pane
```

**AC-27** — Excel chứng từ mang tiền-bằng-chữ và khối ký
```gherkin
Given tôi xuất Excel một phiếu nhập kho hoặc phiếu xuất kho có tiền
When tôi mở file .xlsx tải về
Then có một dòng "Số tiền viết bằng chữ: <số tiền đọc bằng tiếng Việt>" merge hết bề rộng
And bên dưới có dòng "Ngày.......tháng.......năm............" căn phải
And có khối 5 ô ký: Người lập phiếu, Người nhận hàng, Thủ kho, Kế toán trưởng, Giám đốc
And mỗi ô ký có dòng "(Ký, họ tên)" bên dưới
```

**AC-28** — Khối đầu chứng từ đúng ba dòng riêng
```gherkin
Given tôi xuất Excel hoặc in một phiếu kho
When tôi xem phần đầu tài liệu
Then tên chi nhánh và địa chỉ nằm ở hai dòng đầu, căn trái
And tiêu đề phiếu là một dòng riêng in đậm cỡ 18 căn giữa, không kèm số phiếu
And "Ngày <d> tháng <M> năm <yyyy>" là một dòng riêng căn giữa
And "Số: <số phiếu>" là một dòng riêng căn giữa
And các dòng thông tin chung (Đối tượng / Người giao / Diễn giải) in đậm căn trái, mỗi dòng một mục
```

**AC-29** — Tập cột đúng cho từng loại phiếu kho
```gherkin
Given chứng từ là phiếu nhập kho
When tôi xuất hoặc in
Then bảng dòng hàng có đúng các cột: STT, Mã SKU, Tên hàng hóa, ĐVT, Vị trí, SL, Đơn giá, Thành tiền, Ghi chú
And không có cột "Kho"

Given chứng từ là phiếu xuất kho
Then bảng dòng hàng có đúng các cột: STT, Mã SKU, Tên hàng hóa, ĐVT, Vị trí, Số lượng, Đơn giá, Thành tiền, Ghi chú

Given chứng từ là phiếu chuyển kho
Then tiêu đề là "PHIẾU CHUYỂN KHO", không phải "LỆNH ĐIỀU CHUYỂN"
And bảng dòng hàng có đúng các cột: STT, Mã SKU, Tên hàng hóa, Kho xuất, Vị trí xuất, Kho nhập, ĐVT, SL, Ghi chú

Given bất kỳ loại nào trong ba loại trên
Then dòng cuối bảng có nhãn tổng ("Tổng" với nhập/chuyển, "Cộng" với xuất) ở cột bên trái
```

**AC-30** — Bản in trùng bố cục với file Excel
```gherkin
Given tôi bấm "In" trên một phiếu kho
When hộp thoại in mở ra
Then bản in dùng font Times New Roman
And khối tên/địa chỉ chi nhánh căn trái, không căn giữa
And ngày và số phiếu nằm ở hai dòng riêng căn giữa, không gộp một dòng
And khối thông tin chung xếp dọc full width, không chia hai cột
And hàng tiêu đề bảng không có nền xám
And có dòng "Số tiền viết bằng chữ:", dòng "Ngày.......tháng.......năm............" căn phải, và 5 ô ký
```

**AC-31** — Đọc số thành chữ tiếng Việt
```gherkin
Given một số tiền bất kỳ
When gọi amountInWordsVi(số đó)
Then 0 cho ra "Không đồng chẵn."
And 18000000 cho ra "Mười tám triệu đồng chẵn."
And 315000 cho ra "Ba trăm mười lăm nghìn đồng chẵn."
And số có phần lẻ hàng đơn vị không kết thúc bằng "chẵn"
And số âm được đọc kèm tiền tố "Âm"
And số từ hàng tỷ trở lên đọc đúng nhóm tỷ / triệu / nghìn
```

**AC-32** — Dòng cửa hàng điều chuyển
```gherkin
Given phiếu nhập kho được sinh từ một lệnh điều chuyển
When tôi xuất hoặc in phiếu đó
Then khối thông tin chung có thêm dòng "Cửa hàng xuất điều chuyển: <tên kho/chi nhánh nguồn>"

Given phiếu xuất kho được sinh từ một lệnh điều chuyển
Then khối thông tin chung có thêm dòng "Cửa hàng nhận điều chuyển: <tên kho/chi nhánh đích>"

Given chứng từ không liên quan lệnh điều chuyển nào
Then không có dòng nào trong hai dòng trên
```

**AC-33** — Dòng kỳ và dòng bộ lọc trên đầu báo cáo
```gherkin
Given tôi xuất một báo cáo có đặt kỳ
When tôi mở file .xlsx
Then dưới tiêu đề có dòng "Từ ngày: dd/mm/yyyy Đến ngày: dd/mm/yyyy" in nghiêng căn giữa
And dưới nữa có một dòng tóm tắt các bộ lọc đang áp dụng, in nghiêng căn giữa
And điều này đúng cho cả bốn miền báo cáo, không riêng inventory
```

**AC-34** — Lưới cột chứng từ đúng mẫu: cột ẩn, cột gộp, khối ký từ cột B
```gherkin
Given tôi xuất Excel một phiếu nhập kho
When tôi mở file .xlsx
Then bảng có hai cột "Giá bán" và "Thành tiền giá bán" ở đúng vị trí của mẫu
And hai cột đó bị **ẩn** khi mở file
And "Giá bán" bằng giá bán mặc định của mặt hàng, "Thành tiền giá bán" = SL × giá bán
And ô "Tên hàng hóa" được gộp qua 4 cột (C:F) ở cả hàng tiêu đề lẫn mọi hàng dữ liệu
And ô ký đầu tiên ("Người lập phiếu") nằm ở cột B, các ô sau cách nhau một cột

Given chứng từ là phiếu xuất kho hoặc lệnh điều chuyển (phiếu chuyển kho)
Then áp dụng đúng ba điều trên

Given tôi bấm "In" thay vì "Xuất khẩu"
Then bản in **không** hiện hai cột ẩn đó, giống hệt bản in mẫu
```

**AC-35** — Tên file tải về là loại chứng từ
```gherkin
Given tôi bấm "Xuất khẩu" trên một phiếu nhập kho trong backoffice
When trình duyệt tải file về
Then tên file là "phieu-nhap-kho.xlsx"

Given chứng từ là phiếu xuất kho hoặc lệnh điều chuyển
Then tên file lần lượt là "phieu-xuat-kho.xlsx" và "phieu-chuyen-kho.xlsx"

Given tôi xuất một báo cáo
Then tên file là tên báo cáo dạng slug, ví dụ "doanh-thu-theo-mat-hang.xlsx"

Given backoffice và API nằm ở hai origin khác nhau
When trình duyệt đọc phản hồi
Then nó vẫn đọc được `Content-Disposition` do server đặt, không rơi về tên mặc định
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
