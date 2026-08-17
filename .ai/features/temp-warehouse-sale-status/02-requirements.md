---
feature: temp-warehouse-sale-status
stories: 4
acceptance_criteria: 12
---

# Requirements — Sửa nhãn trạng thái bán trên báo cáo "Hàng hóa xuất kho tạm"

> **Sửa phạm vi 2026-08-15.** Bản đầu có 14 AC, gồm sáu AC cho nguồn bán showroom
> (AC-02/03/05/06/07/08 cũ). Nguồn đó đã cài xong rồi **gỡ** theo quyết định của chủ sở hữu — xem
> ADR-05. Sáu AC ấy không còn áp dụng và được liệt kê ở cuối để giữ dấu vết, không phải để thực hiện.

Quy ước chung:

- "báo cáo" = `inventory-temp-warehouse-out`, dùng chung cho cả trang đơn cửa hàng
  (`/reports/storage/temporary-issues`), chế độ chuỗi cửa hàng, Xuất khẩu Excel và In —
  tất cả đi qua `TempWarehouseReportService.list`.
- Mọi dòng báo cáo đến từ `temp_warehouse_lines`, cụ thể là cặp xuất↔trả ghép FIFO.
- "kỳ" = `[startDate, endDate)` do bộ lọc kỳ giải ra.

---

## US-01 — Nhãn đọc đúng luồng đã xảy ra

Là quản lý cửa hàng, tôi muốn dòng bán trong báo cáo mang tên đúng nghiệp vụ đã diễn ra,
để không hiểu nhầm là hàng trưng bày showroom.

**AC-01** — Dòng kho tạm đã bán đọc là `Bán hàng kho tạm`
```gherkin
Given một dòng temp_warehouse_lines direction 'warehouse_to_showroom' có invoice_id
When báo cáo chạy cho kỳ chứa dòng đó
Then cột Trạng thái của dòng đó bằng "Bán hàng kho tạm"
```

**AC-02** — Hàng trưng showroom bán ra đọc là `Bán hàng trưng bày`
```gherkin
Given một hóa đơn đã chốt bán mặt hàng X mà không dòng kho tạm nào nhận
When báo cáo chạy cho kỳ chứa hóa đơn đó
Then có một dòng Trạng thái "Bán hàng trưng bày", SL bán = SL trên hóa đơn
And SL xuất = 0, SL trả = 0, SL tồn = 0 (hàng chưa từng vào kho tạm)
And nhãn "Trả hàng trưng bày" vẫn giữ nguyên nghĩa cũ (trả hàng VỀ KHO, không phải khách trả)
```

**AC-03** — Bốn trạng thái còn lại giữ nguyên nghĩa
```gherkin
Given dữ liệu sinh ra các trạng thái "Chuyển kho xuất đi", "Chuyển kho trả lại",
      "Trả hàng trưng bày", "Xuất không bán" và cặp ghép cân bằng (rỗng)
When báo cáo chạy sau thay đổi
Then mỗi dòng vẫn nhận đúng trạng thái như trước thay đổi
```

**AC-04** — Số dòng không đổi
```gherkin
Given cùng một bộ dữ liệu và cùng một bộ lọc
When so báo cáo trước và sau thay đổi
Then số dòng bằng nhau, và bốn cột số (SL xuất / SL trả / SL bán / SL tồn) bằng nhau từng dòng
```

---

## US-02 — Lọc theo trạng thái dùng được ở mọi chế độ

Là người dùng báo cáo, tôi muốn dropdown Trạng thái liệt kê đúng những giá trị báo cáo
thực sự phát ra, để lọc ra kết quả thay vì lưới rỗng.

**AC-05** — Danh sách trạng thái đúng và thống nhất
```gherkin
Given trang báo cáo ở chế độ đơn cửa hàng và ở chế độ chuỗi cửa hàng
When mở bộ lọc cột Trạng thái
Then cả hai nơi liệt kê đúng 6 giá trị: "Xuất không bán", "Trả hàng trưng bày",
     "Bán hàng kho tạm", "Bán hàng trưng bày", "Chuyển kho xuất đi", "Chuyển kho trả lại"
And không có giá trị nào không bao giờ khớp dòng nào
```

**AC-06** — Chọn trạng thái thì lọc thật
```gherkin
Given lưới đang hiện dòng của nhiều trạng thái khác nhau
When chọn "Bán hàng kho tạm" ở bộ lọc cột Trạng thái
Then mọi dòng hiển thị đều có Trạng thái "Bán hàng kho tạm"
And dòng tổng ở footer chỉ cộng những dòng đó
```

**AC-07** — Danh sách khai báo một lần
```gherkin
Given mã nguồn sau thay đổi
When tìm nơi liệt kê các giá trị trạng thái của báo cáo này
Then chỉ TEMP_WAREHOUSE_OUT_STATUS_OPTIONS khai báo chúng
And trang đơn cửa hàng lẫn registry chuỗi cửa hàng đều import lại từ đó
```

---

## US-03 — Xuất khẩu và In khớp lưới

Là người dùng báo cáo, tôi muốn file Excel đọc y như màn hình, để gửi đi mà không phải
kiểm lại từng dòng.

**AC-08** — Excel và bản in khớp lưới
```gherkin
Given lưới đang hiển thị kết quả của một bộ lọc
When bấm Xuất khẩu và mở file Excel
Then cột Trạng thái chứa đúng bộ giá trị như trên lưới, gồm "Bán hàng kho tạm"
And dòng tổng trong file bằng dòng tổng ở footer lưới
And bản in (print-payload) chứa cùng các dòng và cùng dòng tổng
```

---

## US-04 — Bảy trạng thái phủ đúng lưới nghiệp vụ

Là quản lý kho, tôi muốn mọi trạng thái báo cáo phát ra đều tương ứng một thao tác có thật trên
màn Chuyển kho tạm, để đọc báo cáo là biết chuyện gì đã xảy ra.

Kho tạm **không có tồn kho riêng**: lúc quét vào, sổ vẫn ghi hàng ở kho nguồn; nó chỉ dịch chuyển
khi một phiếu chuyển kho được post. Nên trạng thái là lưới **chiều × đã hạch toán chưa**:

| | Chưa post phiếu | Đã post, không bán | Đã post + đã bán |
| --- | --- | --- | --- |
| **Xuất đi** | `Xuất không bán` | `Chuyển kho xuất đi` | `Bán hàng kho tạm` |
| **Trả lại** | `Trả hàng trưng bày` | `Chuyển kho trả lại` | *(không tồn tại)* |

**AC-09** — Bốn trạng thái kho tạm còn lại đọc đúng thao tác đã làm
```gherkin
Given tab Xuất đi quét một mặt hàng rồi bấm "Xử lý chuyển kho"
Then dòng đó đọc "Chuyển kho xuất đi"
Given tab Trả lại quét một mặt hàng rồi bấm "Xử lý chuyển kho"
Then dòng đó đọc "Chuyển kho trả lại"
Given tab Trả lại quét một mặt hàng không khớp lần xuất nào trong kỳ
Then dòng đó đọc "Trả hàng trưng bày", SL xuất = 0, SL tồn = −1
Given tab Xuất đi và tab Trả lại cùng quét một mặt hàng, cùng người vận chuyển
Then hai sự kiện gộp thành đúng một dòng, cột Trạng thái để rỗng
```

**AC-10** — SL tồn không tính phần đã chuyển kho
```gherkin
Given một dòng đã bấm "Xử lý chuyển kho" (có transfer_id, không có invoice_id)
When đọc cột SL tồn của dòng đó
Then SL tồn = 0, vì phiếu đã post nên hàng hết treo ở kho tạm
And dòng đã bán (mang cả transfer_id lẫn invoice_id) vẫn chỉ bị trừ một lần
```

**AC-11** — Đóng kho tạm không đổi báo cáo
```gherkin
Given một phiên kho tạm được đóng bằng bất kỳ chế độ nào
When báo cáo chạy lại cho cùng kỳ
Then không dòng nào đổi trạng thái hay số liệu
And dòng AUTO_BALANCED do chế độ "Xuất đi/Trả lại kho tạm" sinh ra không vào báo cáo
```

**AC-12** — Ghép cặp khoá theo người vận chuyển
```gherkin
Given một lần xuất của người A và một lần trả cùng mặt hàng của người B
When báo cáo chạy
Then hai dòng riêng biệt: "Xuất không bán" và "Trả hàng trưng bày", không gộp thành cặp cân bằng
```

---

## AC đã gỡ (nguồn bán showroom)

Giữ lại để người đọc sau hiểu vì sao code từng có `tw_claimed` / `showroom` / `movements`, và vì
sao git history có một vòng cài-rồi-gỡ. **Không thực hiện.**

| AC cũ | Nội dung | Vì sao gỡ |
| --- | --- | --- |
| AC-02 cũ | Hàng trưng showroom bán ra sinh dòng `Bán hàng trưng bày` | Nguồn `invoice_items` bị gỡ (ADR-05) |
| AC-03 cũ | Dòng showroom có SL xuất/trả/tồn = 0 | — |
| AC-05 cũ | Không thiếu không trùng khi một hóa đơn chỉ đi một luồng | — |
| AC-06 cũ | Chia đôi khi kho tạm chỉ nhận một phần | — |
| AC-07 cũ | Dòng kho tạm stage ngoài kỳ vẫn chặn được đếm trùng | — |
| AC-08 cũ | Hóa đơn nháp / đã hủy / dòng IN không sinh dòng showroom | — |

Ba defect mà việc theo đuổi các AC này phát hiện ra **vẫn còn giá trị** và đã được ghi lại:
lệch múi giờ khi UNION hai kiểu timestamp, trừ nhiều lần khi hóa đơn tách dòng, và bất đối xứng
`status` giữa hai nhánh khi hủy hóa đơn. Xem ADR-05.
