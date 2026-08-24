---
feature: invoice-number-format
stories: 4
acceptance_criteria: 17
---

# Requirements — invoice-number-format

## US-01 — Hệ thống cấp số hoá đơn theo định dạng YYMMDDxxxx

Là **kế toán**, tôi muốn số hoá đơn mang sẵn ngày lập và số thứ tự trong ngày,
để đọc tờ giấy là biết ngay hoá đơn thuộc ngày nào mà không phải tra hệ thống.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Hoá đơn bán hàng đầu tiên trong ngày
```gherkin
Given hôm nay là 21/08/2026 và công ty chưa lập hoá đơn bán nào trong ngày
When thu ngân thanh toán một đơn bán hàng
Then mã hoá đơn được cấp là "2608210001"
And mã đó được lưu vào invoices.code
```

**AC-02** — Số thứ tự tăng dần trong ngày
```gherkin
Given hoá đơn "2608210001" đã được lập hôm nay
When thu ngân thanh toán đơn bán hàng kế tiếp
Then mã hoá đơn được cấp là "2608210002"
```

**AC-03** — Reset sang ngày mới
```gherkin
Given hoá đơn cuối cùng của ngày 21/08/2026 là "2608210007"
When thu ngân thanh toán một đơn bán hàng vào ngày 22/08/2026
Then mã hoá đơn được cấp là "2608220001"
```

**AC-04** — Hoá đơn trả hàng mang đuôi TH
```gherkin
Given hôm nay là 21/08/2026 và chưa có phiếu trả/đổi nào trong ngày
When thu ngân hoàn tất một phiếu TRẢ HÀNG
Then mã hoá đơn được cấp là "2608210001TH"
```

**AC-05** — Hoá đơn đổi hàng dùng chung dải số với trả hàng
```gherkin
Given phiếu trả hàng "2608210001TH" đã được lập hôm nay
When thu ngân hoàn tất một phiếu ĐỔI HÀNG
Then mã hoá đơn được cấp là "2608210002TH"
```

**AC-06** — Bán và trả là hai dải số độc lập, không đâm nhau
```gherkin
Given hôm nay chưa có chứng từ nào
When thu ngân lập lần lượt một đơn bán rồi một phiếu trả hàng
Then hai mã là "2608210001" và "2608210001TH"
And cả hai cùng tồn tại, không có lỗi trùng mã
```

**AC-07** — Mỗi chi nhánh có bộ đếm riêng, độc lập với chi nhánh khác *(sửa lại theo A-10/ADR-07 —
đảo ngược bản gốc "nhiều chi nhánh dùng chung một bộ đếm")*
```gherkin
Given chi nhánh MT211 Đà Nẵng và chi nhánh Cần Thơ thuộc cùng một công ty, cùng chưa lập hoá đơn
  bán nào trong ngày 21/08/2026
When mỗi chi nhánh lập một đơn bán hàng trong cùng ngày 21/08/2026
Then cả hai mã đều là "2608210001"
And không có lỗi vi phạm ràng buộc unique — hai hoá đơn khác branch_id được phép trùng chuỗi mã
```

**AC-16** — Đối chiếu cuối ngày theo chi nhánh không nhảy số
```gherkin
Given chi nhánh Cần Thơ đã lập các hoá đơn bán "2608240001".."2608240005" trong ngày, không xen
  hoá đơn của chi nhánh nào khác
When kế toán lọc danh sách hoá đơn theo "Ngày tạo: Hôm nay" và chi nhánh Cần Thơ
Then dải số hiển thị liên tục từ 0001 đến 0005, không có số nào bị thiếu do chi nhánh khác chiếm
```

**AC-17** — Chi nhánh chưa từng có rule riêng tự động được cấp một bộ đếm khi lập hoá đơn kế tiếp
```gherkin
Given chi nhánh Bình Dương mới tạo, chưa từng có rule đánh số INVOICE/RETURN riêng, và bộ đếm
  dùng chung của công ty hôm nay đang ở giá trị 12
When thu ngân ở chi nhánh Bình Dương thanh toán đơn bán hàng đầu tiên trong ngày
Then một rule đánh số theo chi nhánh Bình Dương được tạo, sao chép đúng định dạng của rule dùng
  chung hiện tại
And mã hoá đơn được cấp không trùng với bất kỳ mã nào chi nhánh Bình Dương đã từng phát trong
  ngày hôm đó (bộ đếm mới được fast-forward lên tối thiểu bằng giá trị 12 trước khi cấp số đầu tiên)
```

**AC-08** — Các loại chứng từ khác không đổi
```gherkin
Given rule đánh số của phiếu thu, nhập kho, khách hàng đang là PT/IMP/KH
When lập một phiếu thu, một phiếu nhập kho và một khách hàng mới
Then mã của chúng vẫn theo định dạng cũ ("PT000013", "IMP000046", "KH000202")
```

**AC-09** — Mã hoá đơn cũ không bị viết lại
```gherkin
Given hoá đơn "INV-202608-00013" và "RTN-202608-00035" đã tồn tại
When migration đổi định dạng đánh số được chạy
Then hai mã đó giữ nguyên không đổi
```

## US-02 — Số in trên phiếu là số thật của hoá đơn

Là **thu ngân**, tôi muốn số trên tờ giấy đưa khách chính là số tra được trong hệ thống,
để khi khách mang phiếu tới đổi trả thì tìm ra đúng hoá đơn đó.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-10** — Phiếu in lúc thanh toán mang số thật
```gherkin
Given thu ngân bật "In hóa đơn" và hoàn tất thanh toán một đơn bán hàng
When phiếu được in
Then dòng "Số:" trên phiếu bằng đúng invoices.code của hoá đơn vừa tạo
And không có số nào được sinh ở phía client
```

**AC-11** — In lại khớp với tờ in lần đầu
```gherkin
Given hoá đơn "2608210001" đã in lúc thanh toán
When mở hoá đơn đó từ danh sách hoá đơn và in lại
Then dòng "Số:" của tờ in lại là "2608210001", giống hệt tờ đầu
```

**AC-12** — Tra cứu bằng số trên giấy ra đúng hoá đơn
```gherkin
Given khách mang tới phiếu có số "2608210001"
When thu ngân gõ "2608210001" vào ô tìm hoá đơn ở màn Đổi trả hàng
Then hoá đơn tương ứng hiện ra trong danh sách kết quả
```

## US-03 — Phiếu tạm tính không mang số giả

Là **thu ngân**, tôi không muốn phiếu tạm tính mang một con số trông như số hoá đơn,
để khách không nhầm phiếu tạm tính là hoá đơn đã lập.

**Priority:** must
**Depends on:** US-02

### Acceptance criteria

**AC-13** — Tạm tính in ra không có dòng Số
```gherkin
Given giỏ hàng đang có hàng và chưa thanh toán
When thu ngân in phiếu tạm tính
Then tiêu đề là "HÓA ĐƠN TẠM TÍNH"
And phiếu không hiển thị dòng "Số:"
```

## US-04 — Màn cấu hình đánh số dựng được định dạng mới

Là **quản trị viên**, tôi muốn màn Cấu hình đánh số chứng từ tạo và xem trước được
định dạng `YYMMDDxxxx`, để về sau đổi lại mà không cần lập trình viên.

**Priority:** should
**Depends on:** US-01

### Acceptance criteria

**AC-14** — Chọn được định dạng ngày YYMMDD và dấu phân cách rỗng
```gherkin
Given tôi mở màn Cấu hình đánh số chứng từ và sửa rule của loại "Hóa đơn"
When tôi chọn định dạng ngày "YYMMDD", tiền tố rỗng, độ dài số 4 và dấu phân cách rỗng
Then ô xem trước hiển thị "YYMMDD0000"
And lưu được, không bị API từ chối vì tiền tố rỗng
```

**AC-15** — Xem trước có hậu tố và giữ nguyên rule cũ
```gherkin
Given rule "Trả hàng" có hậu tố "TH", dấu phân cách rỗng
And rule "Phiếu thu" vẫn là tiền tố "PT", không có ngày
When tôi mở danh sách rule
Then rule "Trả hàng" xem trước là "YYMMDD0000TH"
And rule "Phiếu thu" xem trước vẫn là "PT000000" như trước
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Tương thích ngược | Mọi rule đang tồn tại render y hệt trước khi đổi (dấu `-` mặc định giữ nguyên) | T-01-02 |
| Toàn vẹn dữ liệu | Không có `UPDATE invoices SET code` ở bất kỳ đâu trong migration | T-01-04 |
| Đồng thời | Hai phiên thanh toán song song không bao giờ nhận cùng một số | T-01-03 |
| Đa tổ chức | Migration áp cho mọi organization đang có rule INVOICE/RETURN, không hardcode org nào | T-01-04 |
