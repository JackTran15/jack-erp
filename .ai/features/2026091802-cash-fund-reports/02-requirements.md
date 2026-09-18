---
feature: cash-fund-reports
stories: 7
acceptance_criteria: 21
---

# Requirements — Báo cáo "Quỹ tiền" (5 báo cáo thu chi tiền mặt / tiền gửi)

Fixture cho AC (seed trong e2e của UOW-01, `erp_test`, một tổ chức, hai chi nhánh A và B,
một quỹ tiền mặt và một tài khoản tiền gửi mỗi chi nhánh, tài khoản tiền gửi A có
`opening_balance = 1.000.000`, `opening_date = 2026-01-01`):

| Mã | Chi nhánh | Loại | Ngày CT | Mục đích / mục | Số tiền | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| PT-01 | A | Phiếu thu TM | 2026-08-30 | POS_SALE | 500.000 | trước kỳ → vào số dư đầu kỳ |
| PT-02 | A | Phiếu thu TM | 2026-09-02 | POS_SALE | 700.000 | |
| PT-03 | A | Phiếu thu TM | 2026-09-05 | DEBT_COLLECTION | 300.000 | Thu từ bán hàng |
| PT-04 | A | Phiếu thu TM | 2026-09-06 | OTHER, mục "Thu lãi" | 50.000 | mục thu |
| PT-05 | A | Phiếu thu TM | 2026-09-07 | OTHER, không mục | 20.000 | Thu khác |
| PTG-01 | A | Thu tiền gửi | 2026-09-03 | DEBT_COLLECTION | 1.600.000 | Tiền gửi |
| PC-01 | A | Phiếu chi TM | 2026-09-04 | SUPPLIER_PAYMENT | 200.000 | Chi mua hàng hóa |
| PC-02 | A | Phiếu chi TM | 2026-09-08 | EXPENSE, 2 dòng: "Tiền điện" 90.000 + "Tiền nước" 10.000 | 100.000 | 2 mục chi; diễn giải "Tiền điện nước tháng 9" |
| PC-03 | A | Phiếu chi TM | 2026-09-09 | EXPENSE, mục "Tiền điện" | 60.000 | diễn giải "Tiền điện kho" |
| PC-04 | A | Phiếu chi TM | 2026-09-10 | REFUND, không mục | 40.000 | Chi khác |
| PC-05 | A | Phiếu chi TM | 2026-09-11 | EXPENSE, mục "Tiền lương" | 500.000 | **bị đảo** bởi PC-05R (2026-09-12) |
| PC-06 | B | Phiếu chi TM | 2026-09-05 | EXPENSE, mục "Tiền điện" | 30.000 | chi nhánh B |
| PC-07 | A | Phiếu chi TM | 2026-09-13 | EXPENSE, mục "Tiền điện" | 0 (DRAFT) | chưa ghi sổ → không đâu có |

Kỳ kiểm tra: `from = 2026-09-01`, `to = 2026-09-30`, chi nhánh A, trừ khi AC nói khác.
Kỳ vọng tại A: I = 500.000 (TM) / 1.000.000 (TG); II = 1.070.000 / 1.600.000; III = 400.000 / 0
(PC-05 và PC-05R triệt tiêu, A-04); IV = 1.170.000 / 2.600.000.

## US-01 — Mở màn hình báo cáo Quỹ tiền

Là chủ chuỗi / kế toán, tôi muốn thấy nhóm "Quỹ tiền" trong menu Báo cáo với 5 báo cáo,
để không phải vào MShopKeeper.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Menu và dropdown báo cáo
```gherkin
Given tôi đăng nhập backoffice với vai trò có quyền reporting.cash.read
When tôi mở menu Báo cáo
Then có mục "Quỹ tiền" trỏ tới /reports/cash-fund
And dialog "Chọn báo cáo" liệt kê đúng 5 báo cáo theo thứ tự: Tình hình thu chi, Bảng kê thu chi, Chi tiền theo mục chi, Bảng kê tiền chi theo mục chi, Chi tiền theo thời gian
And báo cáo nào tôi không có quyền theo REPORT_PERMISSION_KEYS thì không xuất hiện trong dropdown
```

**AC-02** — Không có quyền
```gherkin
Given tôi đăng nhập với vai trò không có reporting.cash.read và không có key báo cáo nào của domain cash
When tôi mở menu Báo cáo
Then không có mục "Quỹ tiền"
And POST /reports/cash-fund/search với bất kỳ reportType nào trả 403
And GET /reports/cash-fund/columns?reportType=cash-in-out-situation trả 403
```

## US-02 — Tình hình thu chi

Là kế toán, tôi muốn xem tiền đầu kỳ, thu, chi, cuối kỳ tách Tiền mặt / Tiền gửi cho một
kỳ, để chốt quỹ.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-03** — Khung dòng và cột
```gherkin
Given fixture ở trên, chi nhánh A, kỳ 09/2026
When tôi chạy báo cáo cash-in-out-situation
Then cột là Khoản mục, Tiền mặt, Tiền gửi, Tổng cộng
And dòng theo thứ tự: "I. Tiền đầu kỳ"; "II. Tiền thu trong kỳ" (bold); "Thu từ bán hàng"; các mục thu có phát sinh ("Thu lãi"); "Thu khác"; "III. Tiền chi trong kỳ" (bold); "Chi mua hàng hóa"; các mục chi có phát sinh theo displayOrder ("Tiền điện", "Tiền nước"); "Chi khác"; "IV. Tiền cuối kỳ (IV = I + II - III)" (bold)
And Tổng cộng của mỗi dòng = Tiền mặt + Tiền gửi
And Thu từ bán hàng = 1.000.000 / 1.600.000; Thu lãi = 50.000 / 0; Thu khác = 20.000 / 0; Chi mua hàng hóa = 200.000 / 0; Tiền điện = 150.000 / 0; Tiền nước = 10.000 / 0; Chi khác = 40.000 / 0
```

**AC-04** — Số dư đầu kỳ và cuối kỳ
```gherkin
Given fixture ở trên, chi nhánh A, kỳ 09/2026
When tôi chạy báo cáo cash-in-out-situation
Then I = 500.000 (Tiền mặt) và 1.000.000 (Tiền gửi)
And IV = I + II - III trên từng cột: 1.170.000 và 2.600.000
And khi chạy lại với kỳ 10/2026 thì I của kỳ 10 bằng IV của kỳ 09
```

**AC-05** — Mục có phát sinh mới hiện; phiếu đảo và phiếu nháp không tính
```gherkin
Given fixture ở trên (PC-05 bị đảo bởi PC-05R, PC-07 là DRAFT, mục "Tiền thuê" tồn tại nhưng không có phiếu)
When tôi chạy báo cáo cash-in-out-situation kỳ 09/2026
Then không có dòng "Tiền lương" và không có dòng "Tiền thuê"
And III = 400.000 / 0
```

**AC-06** — Không có dữ liệu vẫn giữ khung
```gherkin
Given chi nhánh A, kỳ 2025 (không có chứng từ nào)
When tôi chạy báo cáo cash-in-out-situation
Then vẫn có đúng 8 dòng: I; II; Thu từ bán hàng; Thu khác; III; Chi mua hàng hóa; Chi khác; IV — tất cả bằng 0
```

**AC-07** — Phạm vi chi nhánh
```gherkin
Given tôi thuộc chi nhánh A và không có reporting.cash.consolidated.read
When tôi chạy cash-in-out-situation (hoặc expenses-by-category, expenses-by-time) ở chế độ Chuỗi
Then số liệu chỉ gồm chi nhánh A (Tiền điện = 150.000, không có 30.000 của B)
And với tài khoản có reporting.cash.consolidated.read ở chế độ Chuỗi thì Tiền điện = 180.000
```

## US-03 — Bảng kê thu chi

Là kế toán, tôi muốn liệt kê từng chứng từ thu/chi (tiền mặt lẫn tiền gửi) trong kỳ với số
dư luỹ kế, lọc theo cửa hàng / nhân viên / phương thức, để đối chiếu từng phiếu.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-08** — Dòng chứng từ, dòng đầu kỳ và số dư luỹ kế
```gherkin
Given fixture ở trên, cửa hàng = A, kỳ 09/2026, Nhân viên = Tất cả, Phương thức = Tất cả
When tôi chạy báo cáo cash-in-out-list
Then dòng đầu tiên là "Số dư đầu kỳ" với Số dư cuối kỳ = 1.500.000 (500.000 TM + 1.000.000 TG)
And các dòng tiếp theo là 9 chứng từ POSTED có ngày chứng từ trong kỳ (PT-02..05, PTG-01, PC-01..04), sắp theo ngày chứng từ tăng dần rồi số chứng từ
And PC-05, PC-05R (đảo) và PC-07 (DRAFT) không có mặt
And mỗi dòng có đúng một trong Tiền thu / Tiền chi > 0 và Số dư cuối kỳ = số dư dòng trước + Tiền thu - Tiền chi; dòng cuối = 3.770.000
And dòng tổng chân bảng: Tiền thu = 2.670.000, Tiền chi = 400.000
And Loại chứng từ ∈ {Phiếu thu, Phiếu chi, Thu tiền gửi, Chi tiền gửi}; Phương thức thanh toán ∈ {Tiền mặt, Chuyển khoản}
```

**AC-09** — Lọc theo cửa hàng, nhân viên, phương thức
```gherkin
Given fixture ở trên, tài khoản có quyền hợp nhất
When tôi chọn Cửa hàng = Theo nhóm cửa hàng [A, B], Nhân viên = người lập PC-06, Phương thức = Tiền mặt
Then chỉ còn dòng PC-06 (30.000) sau dòng Số dư đầu kỳ
And phụ đề hiện "Xem theo cửa hàng: A, B" và "Nhân viên: <tên>"
And khi đổi Phương thức = Chuyển khoản với Nhân viên = Tất cả thì chỉ còn PTG-01
```

**AC-10** — Lọc theo cột
```gherkin
Given báo cáo cash-in-out-list đang hiện 9 chứng từ của A
When tôi nhập "Tiền điện" vào ô lọc cột Diễn giải (toán tử chứa)
Then chỉ còn PC-02 và PC-03
And khi nhập 100.000 vào ô lọc Tiền chi (toán tử ≤) thì PC-01 (200.000) biến mất
And số dư đầu kỳ và dòng tổng phản ánh đúng tập đã lọc
```

**AC-11** — Cột ẩn mặc định
```gherkin
Given báo cáo cash-in-out-list vừa mở lần đầu (chưa có mẫu lưu)
When tôi mở "Sửa mẫu"
Then danh sách cột theo đúng thứ tự: Ngày chứng từ📌, Số chứng từ📌, Loại chứng từ📌, Tham chiếu📌, Tiền thu, Tiền chi, Số dư cuối kỳ, Phương thức thanh toán, Tài khoản ngân hàng, Nhân viên thu/chi, Mã đối tượng, Đối tượng nộp/nhận, Diễn giải, Mã cửa hàng, Tên cửa hàng, Số hóa đơn
And "Mã đối tượng" và "Số hóa đơn" có Hiển thị = tắt; bốn cột đầu có Cố định cột = bật
And bật "Số hóa đơn" rồi Lưu → lưới hiện cột đó với số hoá đơn của PT-02
```

## US-04 — Chi tiền theo mục chi

Là chủ chuỗi, tôi muốn biết trong kỳ đã chi bao nhiêu cho từng mục, để thấy khoản nào lớn nhất.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-12** — Một dòng mỗi mục chi
```gherkin
Given fixture ở trên, chi nhánh A, kỳ 09/2026
When tôi chạy báo cáo expenses-by-category
Then có đúng 3 dòng theo Số tiền chi giảm dần: Tiền điện 150.000; Chi khác 40.000; Tiền nước 10.000
And dòng tổng chân bảng = 200.000
And "Chi mua hàng hóa" (PC-01, SUPPLIER_PAYMENT) không phải mục chi nên không có dòng
And cột ID Mục chi và Loại Mục chi có trong "Sửa mẫu", ẩn mặc định
```

**AC-13** — Drill-down sang bảng kê
```gherkin
Given báo cáo expenses-by-category đang hiện dòng "Tiền điện"
When tôi bấm vào tên "Tiền điện"
Then mở dialog Bảng kê tiền chi theo mục chi với cùng kỳ, cùng cửa hàng, Mục chi = Tiền điện
And dialog liệt kê PC-02 (dòng 90.000) và PC-03 (60.000), TỔNG CHI = 150.000
```

## US-05 — Bảng kê tiền chi theo mục chi

Là kế toán, tôi muốn liệt kê từng dòng chi gom theo mục, có tổng nhóm, để soát chứng từ của một mục.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-14** — Bố cục nhóm
```gherkin
Given fixture ở trên, cửa hàng = A, kỳ 09/2026
When tôi chạy báo cáo expense-list-by-category
Then dòng đầu tiên là "TỔNG CHI" với Giá trị = 200.000 (bold)
And tiếp theo, mỗi mục chi có phát sinh một dòng nhóm (tên mục + tổng nhóm, bold) rồi các dòng chi tiết thụt lề: "Chi khác" 40.000 → PC-04; "Tiền điện" 150.000 → PC-03 (60.000), PC-02 (90.000); "Tiền nước" 10.000 → PC-02 (10.000)
And nhóm không có mục ("Chi khác") đứng đầu, các mục còn lại theo displayOrder của mục chi (như ảnh 9: nhóm trống rồi mới tới nhóm có tên); chi tiết trong nhóm theo ngày chứng từ giảm dần
And một phiếu có nhiều dòng thuộc nhiều mục (PC-02) xuất hiện ở mỗi nhóm với Giá trị của dòng đó, không phải tổng phiếu
And dòng chi tiết có Số chứng từ là link mở phiếu, Phương thức thanh toán, Đối tượng, Người nhận, Nhân viên chi, Mã/Tên cửa hàng
And dòng tổng chân bảng = 200.000
```

**AC-15** — Phân trang trên danh sách đã làm phẳng
```gherkin
Given báo cáo expense-list-by-category có 120 dòng chi tiết trong 3 nhóm
When tôi mở trang 1 với 50 dòng/trang
Then "Hiển thị 1 - 50 trên N" đếm cả dòng nhóm lẫn dòng chi tiết (không đếm TỔNG CHI)
And trang 2 bắt đầu đúng ở dòng thứ 51 của danh sách phẳng; nhóm bị cắt ngang không lặp lại dòng nhóm
And dòng tổng chân bảng vẫn là tổng toàn bộ, không phải tổng trang
```

## US-06 — Chi tiền theo thời gian

Là chủ chuỗi, tôi muốn thấy tổng chi theo ngày / tuần / tháng, để phát hiện ngày chi bất thường.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-16** — Gom theo bucket thời gian
```gherkin
Given fixture ở trên, chi nhánh A, kỳ 09/2026, Thống kê theo = Ngày, Mục chi = Tất cả
When tôi chạy báo cáo expenses-by-time
Then có 3 dòng: 08/09/2026 100.000; 09/09/2026 60.000; 10/09/2026 40.000 (PC-01 là chi mua hàng, không phải mục chi; PC-05 bị đảo)
And dòng tổng = 200.000
And với Thống kê theo = Tháng, kỳ Năm nay, thì có một dòng "09/2026" = 200.000
And không có dòng cho ngày/tháng không phát sinh
```

**AC-17** — Lọc theo mục chi
```gherkin
Given báo cáo expenses-by-time đang hiện 3 dòng
When tôi chọn Mục chi = Tiền điện
Then còn 2 dòng: 08/09/2026 90.000; 09/09/2026 60.000; tổng 150.000
```

**AC-18** — Drill-down sang bảng kê
```gherkin
Given báo cáo expenses-by-time đang hiện dòng 08/09/2026
When tôi bấm vào ngày
Then mở dialog Bảng kê tiền chi theo mục chi với từ ngày = đến ngày = 08/09/2026, cùng cửa hàng và cùng Mục chi đang lọc
And dialog liệt kê hai dòng của PC-02 dưới hai nhóm Tiền điện / Tiền nước, TỔNG CHI = 100.000
```

## US-07 — Xuất khẩu, in, mẫu cột (cả 5 báo cáo)

Là kế toán, tôi muốn xuất Excel, in và lưu mẫu cột cho từng báo cáo như các nhóm báo cáo khác.

**Priority:** must
**Depends on:** US-02..06

### Acceptance criteria

**AC-19** — Xuất Excel
```gherkin
Given bất kỳ báo cáo nào trong 5 báo cáo đang hiện dữ liệu với bộ cột đang chọn
When tôi bấm Xuất khẩu
Then POST /reports/cash-fund/export trả file .xlsx có tiêu đề báo cáo, phụ đề kỳ/cửa hàng, đúng các cột đang hiển thị theo thứ tự, mọi dòng (không phân trang) và dòng tổng
And với cash-in-out-list, file xuất đi qua đường keyset (ReportExportSource) nên không bị chặn bởi row cap
```

**AC-20** — In
```gherkin
Given bất kỳ báo cáo nào đang hiện dữ liệu
When tôi bấm In
Then POST /reports/cash-fund/print-payload trả ReportDocumentPayload (title, subtitle, columns, rows, totals)
And FE render HTML in như các nhóm báo cáo khác (render-report-table-html.ts → window.print), dòng bold/thụt lề giữ nguyên
```

**AC-21** — Mẫu cột
```gherkin
Given báo cáo cash-in-out-list, tôi ở chế độ Chuỗi
When tôi mở Sửa mẫu, tắt "Tài khoản ngân hàng", chuyển "Diễn giải" lên vị trí 5, Lưu
Then POST /reports/cash-fund/templates lưu mẫu scope=chain
And tải lại trang: lưới áp mẫu đã lưu (không có Tài khoản ngân hàng, Diễn giải ở cột 5)
And "Lấy mẫu ngầm định" trả về thứ tự/hiển thị mặc định của AC-11
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Performance | `POST search` cho cash-in-out-situation với kỳ 1 năm trên ~50.000 chứng từ trả về < 2 s (tổng bằng SQL, không kéo dòng về RAM) | T-01-07 |
| Performance | cash-in-out-list và expense-list-by-category khai `countRows` để trả 400 trước khi vượt row cap (ADR-08 của report-core) | T-02-01, T-03-02 |
| Đối chiếu | Quy trình so số với MShopKeeper (chi nhánh, kỳ, 5 báo cáo, ảnh chụp hai bên) ghi ở DoD của từng UoW; chạy thủ công trước khi pass G4 | UoW DoD |
| Tương thích | Không đổi contract của các domain báo cáo khác; `report-permissions.contract.spec.ts` và `org-role-permissions.spec.ts` xanh | T-01-02 |
| Contract | `openapi.snapshot.json` + `packages/api-client` tái sinh sau khi có endpoint | T-01-07 |
