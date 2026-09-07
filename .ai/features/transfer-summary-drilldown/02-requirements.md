# Requirements — transfer-summary-drilldown

Mã AC dùng dạng `AC-\d+` **bắt buộc**: runner của ai-dlc-verify khớp `r"\bAC-\d+\b"`
(`verify.py:290`), nên dạng `AC-BCK-06` bị âm thầm bỏ qua — đó là lý do bảng Coverage của
[[phu-luc-01-audit]] rỗng dù 40/40 bước xanh. Ánh xạ về phụ lục: **toàn bộ AC dưới đây phục vụ
`AC-BCK-06` — "Báo cáo tổng hợp Nhập – Xuất điều chuyển"** (Phụ lục 01, mục 2.4), mã bằng chứng
`BO-S10` trong `docs/client/phu-luc-01-checklist.csv`.

Kỳ dùng trong mọi ví dụ: **01/09/2026 – 02/09/2026**, trên bộ seed tất định của T-01-02. Số cụ
thể phải **đo lại bằng SQL sau khi seed** rồi mới dán vào `07-verification.md`.

---

## US-01 — Kế toán kho đọc được số liệu điều chuyển mà không phải đoán

**AC-01** — Cột "Mã cửa hàng" có dữ liệu
```gherkin
Given báo cáo "Tổng hợp nhập xuất điều chuyển" mở trên kỳ 01/09/2026–02/09/2026
  And các chi nhánh trong tổ chức đã có `branches.code`
When lưới hiển thị
Then mỗi dòng hiện mã cửa hàng của chính nó ở cột đầu tiên
  And không dòng nào để trống cột đó
```

**AC-02** — Hai dải "chênh lệch" là hai đại lượng khác nhau
```gherkin
Given một chi nhánh vừa nhận hàng từ nơi khác vừa xuất hàng đi
When đọc dòng của chi nhánh đó
Then "Chênh lệch thực nhận" bằng `thực nhận − xuất`
  And "Chênh lệch nhập xuất điều chuyển" bằng `nhập − xuất`
  And hai giá trị khác nhau
  And dòng Tổng cộng đúng bằng tổng của các dòng ở cả hai dải
```

**AC-03** — "Chênh lệch thực nhận" không bao giờ dương
```gherkin
Given bất kỳ tổ chức, bất kỳ kỳ báo cáo nào
When báo cáo tính xong
Then mọi giá trị "Chênh lệch thực nhận / Số lượng" đều ≤ 0
  And đó là bất biến theo cấu trúc truy vấn, không phải theo dữ liệu
```
> Bất biến này thành lập vì `received` chỉ được cộng trên **chính** những dòng phiếu xuất đã cộng
> vào `out` (A-05). Không còn nhánh nào cộng `received` từ phía phiếu nhập.

**AC-04** — Phiếu điều chuyển lập tay luôn tính là chưa xác nhận nhận
```gherkin
Given một phiếu xuất `purpose='TRANSFER_OUT'` lập trực tiếp, không qua lệnh điều chuyển
  And do đó `reference_id IS NULL`
When báo cáo tính "Cửa hàng khác thực nhận về"
Then phiếu đó đóng góp 0 vào "thực nhận"
  And đóng góp đủ số lượng vào "xuất"
  And xuất hiện trong dialog "Chi tiết chênh lệch điều chuyển"
```

**AC-05** — Điều chuyển theo luồng cũ không tạo chênh lệch
```gherkin
Given một bản ghi `stock_transfers` trạng thái POSTED giữa hai chi nhánh
When báo cáo tính xong
Then "thực nhận" của nó bằng đúng "xuất" của nó
  And nó không xuất hiện trong dialog "Chi tiết chênh lệch điều chuyển"
```

---

## US-02 — Kế toán kho khoan từ dòng tổng hợp xuống từng chi nhánh đối ứng

**AC-06** — Click "Tên cửa hàng" mở chi tiết theo cửa hàng đối ứng
```gherkin
Given lưới báo cáo tổng hợp có dữ liệu
When click ô "Tên cửa hàng" của một dòng
Then mở dialog "CHI TIẾT NHẬP XUẤT ĐIỀU CHUYỂN THEO CỬA HÀNG"
  And phụ đề nêu tên cửa hàng vừa click và kỳ báo cáo
  And mỗi dòng là một chi nhánh đối ứng, với cùng bộ dải cột như báo cáo cha
  And dialog tự nạp dữ liệu, không phải bấm "Lấy dữ liệu" lần nữa
```

**AC-07** — Số trong dialog cộng về đúng dòng đã mở ra nó
```gherkin
Given dialog chi tiết theo cửa hàng đang mở từ dòng của chi nhánh X
When đọc dòng Tổng cộng của dialog
Then nó khớp dòng X của báo cáo cha trên cả sáu chỉ tiêu
  (nhập, xuất, thực nhận, chênh lệch thực nhận, chênh lệch nhập xuất, và giá trị tương ứng)
```

**AC-12** — Ô có link vẫn định dạng số theo `vi-VN`
```gherkin
Given một ô số lượng hoặc giá trị được phép click
When lưới render ô đó
Then số hiển thị theo định dạng vi-VN (dấu chấm ngăn nghìn, dấu phẩy thập phân)
  And không hiển thị số thô kiểu `12500000`
```

**AC-13** — Ô bằng 0 không phải là link
```gherkin
Given một ô số lượng có giá trị 0
When lưới render ô đó
Then ô là văn bản thường, không phải link
```
> Dialog rỗng tệ hơn một ô không bấm được: nó khiến người dùng nghi ngờ dữ liệu.

**AC-14** — Ba báo cáo chỉ-dùng-trong-dialog không lọt vào ô chọn báo cáo
```gherkin
Given người dùng mở ô "Chọn báo cáo" ở nhóm báo cáo kho
When danh sách hiển thị
Then vẫn đúng 8 báo cáo kho như trước
  And không có "Chi tiết nhập xuất điều chuyển theo cửa hàng"
  And không có "Chi tiết phiếu nhập xuất điều chuyển theo cửa hàng và chứng từ"
  And không có "Chi tiết chênh lệch điều chuyển"
```

---

## US-03 — Kế toán kho truy ra tận số phiếu

**AC-08** — Click "Nhập kho điều chuyển" đảo chiều xuất/nhập đúng
```gherkin
Given dialog chi tiết theo cửa hàng đang mở với chi nhánh neo là X
When click ô "Số lượng" thuộc dải "Nhập kho điều chuyển" trên dòng của chi nhánh Y
Then mở dialog "CHI TIẾT PHIẾU NHẬP XUẤT ĐIỀU CHUYỂN THEO CỬA HÀNG VÀ CHỨNG TỪ"
  And phụ đề ghi "Cửa hàng xuất Y" và "Cửa hàng nhập X"
  And "Số chứng từ" là phiếu nhập tại X
```

**AC-09** — Click "Xuất kho điều chuyển" giữ chiều và giải được Tham chiếu
```gherkin
Given dialog chi tiết theo cửa hàng đang mở với chi nhánh neo là X
When click ô "Số lượng" thuộc dải "Xuất kho điều chuyển" trên dòng của chi nhánh Y
Then phụ đề ghi "Cửa hàng xuất X" và "Cửa hàng nhập Y"
  And "Số chứng từ" là phiếu xuất tại X
  And với phiếu đã được xác nhận nhận, "Tham chiếu" hiện số phiếu nhập ghép
  And "Ngày chứng từ tham chiếu" hiện ngày post của phiếu đó
  And lưới có cột "Kho"
```

**AC-10** — Cột "thực nhận" chỉ liệt kê phiếu đã ghép được
```gherkin
Given một cặp chi nhánh có cả phiếu đã xác nhận nhận lẫn phiếu còn đang vận chuyển
When click ô "Số lượng" thuộc dải "Cửa hàng khác thực nhận về"
Then chỉ những phiếu xuất đã có phiếu nhập ghép được liệt kê
  And Σ cột "Số lượng" bằng đúng giá trị ô vừa click
```

**AC-11** — Click "Chênh lệch thực nhận" liệt kê phiếu chưa ai nhận
```gherkin
Given một cặp chi nhánh có chênh lệch thực nhận khác 0
When click ô "Số lượng" thuộc dải "Chênh lệch thực nhận"
Then mở dialog "CHI TIẾT CHÊNH LỆCH ĐIỀU CHUYỂN"
  And mọi dòng đều là phiếu xuất
  And cột "Tham chiếu" rỗng ở mọi dòng
  And Σ cột "Số lượng" bằng trị tuyệt đối của ô vừa click
```

---

## US-04 — Không hồi quy, và có bằng chứng

**AC-15** — Báo cáo 2 và Báo cáo 7 giữ nguyên
```gherkin
Given feature đã triển khai
When mở "Bảng kê chi tiết phiếu nhập xuất kho" và "Tổng hợp hàng hoá điều chuyển theo cửa hàng"
Then cả hai hiển thị đúng như trước, không toast lỗi
  And spec sẵn có của `document-detail.service` và `transfer-report.service.byBranch`
      chạy qua mà không phải sửa kỳ vọng
```

**AC-16** — Bằng chứng chạy trên môi trường có dữ liệu thật
```gherkin
Given seed điều chuyển tất định đã chạy trên local
When chạy `verify.py .ai/features/transfer-summary-drilldown --write`
Then mọi bước xanh trên `local-backoffice` ở viewport desktop
  And không bước nào chụp lưới rỗng
  And `08-evidence.md` có commit sha khớp HEAD
```

---

## US-05 — Đối chiếu giao diện với MISA (đợt 2)

**AC-17** — Cột định danh dính khi cuộn ngang
```gherkin
Given một dialog chi tiết điều chuyển đang mở trên lưới nhiều cột
When người dùng cuộn ngang
Then hai cột đầu vẫn hiện
  And ở L1 đó là "Mã cửa hàng" và "Tên cửa hàng"
  And ở L2/L3 đó là "Ngày chứng từ" và "Số chứng từ"
```

**AC-18** — L1 giữ đủ năm dải
```gherkin
Given dialog chi tiết theo cửa hàng đang mở
When đọc tiêu đề dải
Then vẫn có "Chênh lệch nhập xuất điều chuyển"
  And dòng Tổng của dialog đối chiếu được với dòng cha trên cả sáu chỉ tiêu
```
> MISA không có dải này. Giữ lại là quyết định D2 của người dùng, đổi lấy bất biến đối chiếu.

**AC-19** — Ngày chứng từ đọc được, có giờ
```gherkin
Given dialog chi tiết phiếu đang mở
When đọc cột "Ngày chứng từ" và "Ngày chứng từ tham chiếu"
Then giá trị theo dạng dd/MM/yyyy HH:mm, giờ Việt Nam
  And không phải chuỗi ISO thô
  And file xuất khẩu hiện đúng giá trị đó
```

**AC-20** — Hai cột "Đối tượng" và "Diễn giải"
```gherkin
Given dialog chi tiết phiếu đang mở
When đọc hai cột cuối
Then "Đối tượng" hiện đối tượng của chứng từ, hoặc tên chi nhánh đối ứng khi chứng từ không có
  And "Diễn giải" hiện ghi chú của chính dòng hàng
```

**AC-21** — Phụ đề gọi tên chi nhánh neo thật
```gherkin
Given dialog L2 hoặc L3 được mở từ một dòng của L1
When đọc phụ đề
Then nó gọi tên chi nhánh neo, không phải một nhãn chung chung
```

