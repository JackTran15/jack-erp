---
feature: warehouse-report-filters-all-reports
stories: 6
acceptance_criteria: 16
---

# Requirements — Bộ lọc Báo cáo > Kho

Ngữ cảnh đo: DB `erp_dev_3008`, chi nhánh HCM `c3bf1922-3a2e-42d9-b00d-a7129efe592c`,
kỳ 2026-01-01 → 2026-12-31. `POST /reports/inventory/search` trả **201**.

## US-01 — Đưa bản sửa tháng 8 về `main`

Là người dùng báo cáo kho, tôi muốn bản sửa D1–D5 đã nghiệm thu tháng 8 thực sự có mặt trên
`main`, để không phải báo lại cùng một lỗi lần thứ ba.

**Priority:** must · **Depends on:** —

**AC-01** — Nhóm cha gộp toàn bộ nhóm con
```gherkin
Given cây nhóm có "GIÀY DÉP" (11 nhóm con, 0 mặt hàng gắn trực tiếp)
And không lọc nhóm thì "Tổng hợp nhập xuất tồn kho" trả 9593 dòng
When tôi lọc theo nhóm "GIÀY DÉP"
Then lưới trả về đúng tổng các nhóm lá bên dưới, một số > 0
And không dòng nào thuộc nhóm ngoài cây "GIÀY DÉP"
```

**AC-02** — Hậu duệ mọi cấp, không chỉ con trực tiếp
```gherkin
Given nhóm ông "PHỤ KIỆN" có 16 nhóm con và 0 mặt hàng gắn trực tiếp
When tôi lọc theo "PHỤ KIỆN"
Then lưới trả về > 0 dòng
```

**AC-03** — Nhóm lá giữ nguyên hành vi
```gherkin
Given tôi lọc theo nhóm lá "Giày nam"
When lưới tải xong
Then số dòng vẫn đúng bằng 2205 như trước khi sửa
```

**AC-04** — D2/D3/D4/D5 còn nguyên hiệu lực trên `main`
```gherkin
Given bản sửa đã được đưa về main
When tôi chạy lại toàn bộ test đi kèm 1cb20a60
Then tất cả xanh
And đặt "Thương hiệu" ở một báo cáo rồi đổi sang báo cáo không khai dòng đó
Then số dòng bằng đúng lúc không lọc thương hiệu
```

## US-02 — "Thống kê theo" không còn làm hỏng bộ lọc ĐVT / Thương hiệu

Là nhân viên kho, tôi muốn đổi "Thống kê theo" sang Mẫu mã hoặc Nhóm hàng hóa mà bộ lọc
"Đơn vị tính"/"Thương hiệu" đang đặt vẫn chạy, để xem tồn của từng nhóm nhưng chỉ tính hàng
thuộc đơn vị tính mình quan tâm.

**Priority:** must · **Depends on:** US-01

**AC-05** — Không còn 400 ở hạt gộp
```gherkin
Given tôi ở "Tổng hợp nhập xuất tồn kho" với "Đơn vị tính" = "Đôi"
When tôi đổi "Thống kê theo" sang "Mẫu mã", rồi sang "Nhóm hàng hóa"
Then cả hai lần đều trả 201, không phải 400
```

**AC-06** — Lọc thật theo thành viên, không phải bỏ qua
```gherkin
Given một nhóm hàng có cả mặt hàng ĐVT "Đôi" lẫn ĐVT khác
When tôi xem ở "Thống kê theo" = "Nhóm hàng hóa" với "Đơn vị tính" = "Đôi"
Then số lượng của nhóm đó nhỏ hơn khi không lọc ĐVT
And lớn hơn 0
```

**AC-07** — Đúng trên cả 5 báo cáo khai "Thống kê theo"
```gherkin
Given 5 báo cáo khai dòng "Thống kê theo"
When tôi chạy 10 tổ hợp (Mẫu mã, Nhóm hàng hóa) × 5 báo cáo, mỗi lần kèm một giá trị Thương hiệu
Then 0/10 trả 400
```

**AC-08** — Chân trang và phân trang mô tả cùng tập với lưới
```gherkin
Given tôi lọc ở hạt gộp bằng ĐVT
When tôi lật tới trang cuối
Then tổng số dòng khớp số dòng thực sự duyệt được
And các số chân trang bằng tổng của chính tập đó
```

## US-03 — Không còn ô lọc hiện ra mà không làm gì

Là người xem báo cáo, tôi muốn mọi dòng lọc trên form đều có tác dụng, để không tin nhầm vào
một kết quả mình tưởng đã lọc.

**Priority:** must · **Depends on:** —

**AC-09** — "Số lượng tồn kho theo cửa hàng" không còn chào mời kỳ báo cáo
```gherkin
Given báo cáo này đọc tồn tại thời điểm hiện tại và không có khái niệm kỳ
When tôi mở form lọc của nó
Then không có dòng "Kỳ báo cáo" và không có dòng "Từ ngày / đến ngày"
```

**AC-10** — Các báo cáo khác không mất dòng lọc kỳ
```gherkin
Given 7 báo cáo kho còn lại đều khai dòng kỳ
When tôi mở form lọc của từng cái
Then dòng "Kỳ báo cáo" vẫn còn, và đổi kỳ vẫn đổi số dòng
```

## US-04 — Ô lọc trên lưới drill-down lọc thật

Là người mở dialog chi tiết điều chuyển, tôi muốn gõ vào ô lọc trên đầu cột và thấy lưới hẹp
lại, thay vì nhận về nguyên tập cũ.

**Priority:** must · **Depends on:** —

**AC-11** — `columnFilters` được áp dụng, không bị vứt
```gherkin
Given tôi mở "Chi tiết phiếu nhập xuất điều chuyển" và lưới có N dòng
When tôi gõ một giá trị có thật vào ô lọc của một cột
Then số dòng nhỏ hơn N
And mọi dòng còn lại đều khớp giá trị đó
```

**AC-12** — Cột không lọc được thì không hiện ô
```gherkin
Given một cột của dialog không có spec trong engine
When lưới vẽ hàng lọc
Then cột đó không có ô nhập
And không thao tác nào trên dialog trả 400
```

## US-05 — Số tổng và chân trang bằng đúng tập đang xem

Là người đối soát, tôi muốn con số tổng khớp số dòng đếm được, để không đi tìm những dòng
không tồn tại.

**Priority:** should · **Depends on:** —

**AC-13** — `countSql` dùng cùng ràng buộc với câu truy vấn trang
```gherkin
Given "Tổng hợp hàng hóa đã điều chuyển theo cửa hàng" ở hạt Mẫu mã hoặc Nhóm hàng hóa
When tôi so tổng số dòng với số dòng thật sự duyệt được qua mọi trang
Then hai con số bằng nhau
```

**AC-14** — Không có trang ma
```gherkin
Given tổng số dòng chia cho cỡ trang ra P trang
When tôi mở trang thứ P
Then trang đó có ít nhất một dòng
```

## US-06 — Rà soát toàn tuyến, không sót báo cáo nào

Là người đã phải báo lỗi này hai lần, tôi muốn có bằng chứng cho **mọi** báo cáo kho ở **mọi**
hạt, để biết lần này đã quét hết.

**Priority:** must · **Depends on:** US-01, US-02, US-03, US-04

**AC-15** — Không tổ hợp nào trả 400
```gherkin
Given 11 loại báo cáo kho và 3 giá trị "Thống kê theo"
When tôi quét mọi tổ hợp báo cáo × hạt × từng dòng lọc mà báo cáo đó khai
Then không tổ hợp nào trả 400
```

**AC-16** — Không bộ lọc nào được nhận rồi bỏ qua
```gherkin
Given cùng bộ quét đó
When với mỗi bộ lọc tôi chạy một lần có giá trị và một lần không
Then hoặc số dòng đổi, hoặc bộ lọc đó không được form chào mời
And không có trường hợp nhận giá trị, trả 201, mà tập kết quả không đổi
```
