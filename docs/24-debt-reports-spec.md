# Đặc tả báo cáo công nợ (Debt Reports)

> Đây là tài liệu **thu thập yêu cầu** (requirements gathering), không phải tài
> liệu implement. Mục đích: điền chi tiết filter/cột cho từng báo cáo trước khi lên
> ticket code. Phần "Nguồn dữ liệu gợi ý" đã điền sẵn dựa trên khảo sát codebase
> hiện tại; các bảng "Bộ lọc" và "Cột hiển thị" để trống, cần điền tay.

## Bối cảnh chung

Frontend đã có khung khai báo báo cáo tại
[`apps/backoffice-web/src/constants/reports/report-type.constant.ts`](../apps/backoffice-web/src/constants/reports/report-type.constant.ts):
enum `REPORT_TYPE_DEBTS` đã khai báo sẵn 5/6 report key với đúng tên tiếng Việt bên
dưới, nhưng **chưa có `filterConfig`/`tableConfig`** (chưa wire registry), và
**thiếu hẳn key cho "Công nợ khách hàng"**. Khi implement, mỗi báo cáo cần:

1. Một cặp `single_filterRegistryXxx` / `chain_filterRegistryXxx` +
   `single_tableRegistryXxx` / `chain_tableRegistryXxx` trong
   `apps/backoffice-web/src/constants/reports/report-registry/` (xem mẫu
   [`report-revenue-detail-by-invoice-and-product.registry.ts`](../apps/backoffice-web/src/constants/reports/report-registry/report-revenue-detail-by-invoice-and-product.registry.ts)).
2. Wire vào `REPORT_TYPE_DEBTS_METADATA` trong `report-type.constant.ts`
   (bổ sung key `CUSTOMER_DEBTS` mới cho báo cáo #1).
3. Backend theo pattern "3-API registry-driven" đã dùng cho báo cáo bán hàng/kho
   (`apps/api/src/modules/reporting/invoice-report/`,
   `apps/api/src/modules/reporting/report-core/`, xem
   [`docs/22-inventory-reports-views.md`](./22-inventory-reports-views.md) mục 0 để
   biết chi tiết contract `columns` / `search` / `filter-options` / `templates`).

Khái niệm cửa hàng đơn (`STORE_TYPE.SINGLE`) vs chuỗi (`STORE_TYPE.CHAIN`): mỗi báo
cáo có thể có bộ filter khác nhau giữa 2 chế độ này (VD: chuỗi cho phép chọn nhiều
cửa hàng qua `REPORT_FILTERS_LINE.STORE`, cửa hàng đơn dùng
`REPORT_FILTERS_LINE.STORE_SINGLE`).

---

## 1. Công nợ khách hàng

### Mục đích
Xem tổng công nợ hiện tại của từng khách hàng (tổng phát sinh, đã thu, còn phải
thu), dùng để theo dõi/nhắc thu nợ theo khách hàng.

### Report type key (dự kiến)
`CUSTOMER_DEBTS` — **key mới**, cần bổ sung vào enum `REPORT_TYPE_DEBTS` (hiện chưa
có, khác với 4 báo cáo còn lại đã có sẵn key).

### Nguồn dữ liệu gợi ý
- `InvoiceDebtEntity` (`apps/api/src/modules/pos/entities/invoice-debt.entity.ts`)
  — nợ theo hoá đơn tín dụng POS: `customerId`, `originalAmount`, `paidAmount`,
  `remainingAmount`, `status` (OPEN/PAID/OVERDUE), `dueDate`, `issuedAt`.
- `ReceivableEntity` (`apps/api/src/modules/accounting/receivables/receivable.entity.ts`)
  — sổ kế toán phải thu: `customerId`, `amount`, `settledAmount`, `status`
  (DRAFT/POSTED/PARTIALLY_SETTLED/SETTLED/WRITTEN_OFF).
- Cần quyết định: báo cáo tổng hợp theo khách hàng lấy từ `InvoiceDebtEntity`
  (nợ POS), `ReceivableEntity` (sổ kế toán), hay gộp cả hai — **cần xác nhận**.
- `CustomerEntity` không có field debt/balance riêng — số dư nợ phải tính động từ
  các bảng trên.
- **Mockup tham khảo (ảnh chụp UI mẫu do người dùng cung cấp)**: báo cáo là dạng
  **sổ công nợ theo kỳ** (opening/increase/decrease/closing), không phải chỉ số dư
  hiện tại. Công thức: `Nợ cuối kỳ (4) = Nợ đầu kỳ (1) + Tăng trong kỳ (2) − Giảm
  trong kỳ (3)`. Đây đúng là dạng "period ledger" đã có tiền lệ trong repo ở
  `StockPeriodService`
  (`apps/api/src/modules/inventory-reports/services/stock-period.service.ts`) —
  CTE tính tồn đầu kỳ/nhập/xuất/tồn cuối kỳ cho báo cáo kho. Khi implement, nên
  tham khảo trực tiếp cấu trúc CTE này, áp dụng cho ledger công nợ:
  - "Tăng trong kỳ" = tổng `originalAmount` các `InvoiceDebtEntity` phát sinh
    trong khoảng `[Từ ngày, Đến ngày]`.
  - "Giảm trong kỳ" = tổng `amount` các `DebtPaymentEntity` (thanh toán) phát sinh
    trong khoảng đó.
  - "Nợ đầu kỳ" = số dư nợ tại thời điểm trước "Từ ngày" (tính luỹ kế).
  - **Cần xác nhận**: nguồn số liệu là `InvoiceDebtEntity`/`DebtPaymentEntity`
    (nợ POS) hay `ReceivableEntity`/`ReceivableSettlementEntity` (sổ kế toán),
    hay gộp cả hai.

### Phạm vi & quyền
- Ảnh mẫu cho thấy filter **"Chuỗi cửa hàng"** ở góc trên bên phải trang báo cáo
  (không phải filter trong dialog) — đây là filter **STORE_TYPE** (đơn/chuỗi) ở
  cấp trang, áp dụng chung cho mọi báo cáo, không phải riêng báo cáo này.
  Cần xác nhận thêm: công nợ khách hàng có tính riêng theo từng cửa hàng
  (`branchId` trên hoá đơn) hay gộp theo toàn tổ chức khi xem "Chuỗi cửa hàng"
  (khách hàng có thể mua ở nhiều cửa hàng trong cùng chuỗi).

### Bộ lọc (điền tay)

| Tên filter | Field backend | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|---|
| Kỳ báo cáo | `reportPeriod` | select (preset) | Không | Ảnh mẫu: "Năm nay" — cần liệt kê đủ preset (Hôm nay/Tuần này/Tháng này/Năm nay/Tuỳ chọn...) |
| Từ ngày | `fromDate` | date | Có (khi kỳ = Tuỳ chọn) | Mặc định theo preset kỳ báo cáo |
| Đến ngày | `toDate` | date | Có (khi kỳ = Tuỳ chọn) | Mặc định theo preset kỳ báo cáo |
| Cửa hàng / Chuỗi cửa hàng | `branchId` / `branchIds[]` | select | Không | Filter cấp trang (STORE_TYPE), không thuộc dialog "Chọn báo cáo" |
| Mã khách hàng | `customerCode` | text | Không | Ảnh cấu hình cột cho thấy đây cũng là ô lọc theo cột (column filter), không chỉ hiển thị |
| Tên khách hàng | `customerName` | text | Không | Cột filter tương tự |
| Số điện thoại | `customerPhone` | text | Không | Cột filter tương tự |
| Email | `customerEmail` | text | Không | Cột filter tương tự |
| Nợ đầu/tăng/giảm/cuối kỳ | `openingDebt`/`increaseDebt`/`decreaseDebt`/`closingDebt` | number (so sánh ≤) | Không | Ảnh dialog kết quả cho thấy có ô lọc "≤" trên từng cột số tiền |

### Cột hiển thị (điền tay)

Thứ tự và tên cột lấy đúng theo ảnh "Sửa mẫu" (dialog cấu hình cột) người dùng cung
cấp — đã có sẵn `Hiển thị`/`Cố định cột` cho từng cột trong ảnh.

| Thứ tự | Tên cột | Field backend (đề xuất) | Kiểu dữ liệu | Cố định cột | Ghi chú |
|---|---|---|---|---|---|
| 1 | Mã khách hàng | `customerCode` | text | Có | = `ReportTableColumn.CUSTOMER_CODE` (đã có sẵn trong enum) |
| 2 | Tên khách hàng | `customerName` | text, link | Có | = `ReportTableColumn.CUSTOMER_NAME` (đã có sẵn); ảnh mẫu hiển thị dạng link xanh |
| 3 | Nhóm khách hàng | `customerGroup` | text | Không | = `ReportTableColumn.CUSTOMER_GROUP` (đã có sẵn); nguồn: `CustomerEntity.groupId` |
| 4 | Số điện thoại | `customerPhone` | text | Không | = `ReportTableColumn.CUSTOMER_PHONE` (đã có sẵn) |
| 5 | Email | `customerEmail` | text | Không | **Cột mới** — chưa có trong `ReportTableColumn`; nguồn: `CustomerEntity.email` |
| 6 | Nợ đầu kỳ (1) | `openingDebt` | number | Không | **Cột mới** — xem công thức period-ledger ở mục "Nguồn dữ liệu gợi ý" |
| 7 | Tăng trong kỳ (2) | `increaseDebt` | number | Không | **Cột mới** |
| 8 | Giảm trong kỳ (3) | `decreaseDebt` | number | Không | **Cột mới** |
| 9 | Nợ cuối kỳ (4)=(1)+(2)-(3) | `closingDebt` | number | Không | **Cột mới**; công thức tính ở FE hoặc BE cần nhất quán — khuyến nghị tính ở BE để tránh sai số làm tròn |
| 10 | Tỉnh thành | `province` | text | Không | **Chưa có nguồn dữ liệu** — `CustomerEntity` chỉ có 1 field `address` tự do, không tách tỉnh/quận/phường. Cần xác nhận: parse từ `address`, hay bổ sung field cấu trúc mới trên `CustomerEntity`? |
| 11 | Quận/Huyện | `district` | text | Không | **Chưa có nguồn dữ liệu** — tương tự trên |
| 12 | Phường/Xã | `ward` | text | Không | **Chưa có nguồn dữ liệu** — tương tự trên |
| 13 | Địa chỉ | `address` | text | Không | Nguồn: `CustomerEntity.address` (field có sẵn) |
| 14 | Mã thẻ thành viên | `membershipCardNumber` | text | Không | Nguồn: `MembershipCardEntity.cardNumber` (`apps/api/src/modules/customer/membership-card.entity.ts`) — quan hệ 1-1 với customer |
| 15 | Hạng thẻ | `membershipTier` | text/select | Không | Nguồn: `MembershipCardEntity.tier` (enum `MembershipTier`: NONE/SILVER/GOLD/DIAMOND) |

Footer/tổng cuối bảng: ảnh mẫu cho thấy dòng tổng (subtotal) chỉ cộng dồn 4 cột số
tiền (Nợ đầu kỳ/Tăng/Giảm/Nợ cuối kỳ), khớp với `summaryLabel: "Tổng"` đã dùng ở
các báo cáo khác.

### Câu hỏi mở / rủi ro
- Nguồn số liệu ledger: `InvoiceDebtEntity`/`DebtPaymentEntity` (nợ POS) vs
  `ReceivableEntity`/`ReceivableSettlementEntity` (sổ kế toán) — vs gộp cả hai?
  + Cả hai
- Công nợ tính theo chi nhánh hay theo toàn tổ chức khi ở chế độ "Chuỗi cửa hàng"?
  + Tất cả chi nhánh kể cả chuỗi cửa hàng hay cửa hàng
- Cột Tỉnh thành/Quận huyện/Phường xã: **không có nguồn dữ liệu hiện tại**
  (`CustomerEntity.address` là 1 field text tự do) — cần quyết định có bỏ 3 cột
  này, parse từ address, hay thêm field cấu trúc mới vào `CustomerEntity`.
  + Chỉ hiển thị cột Địa chỉ, tạm thời bỏ qua 3 cột Tỉnh thành/Quận huyện/Phường xã. giống Import/export khách hàng
- "Nợ cuối kỳ" tính real-time (query động theo period) hay có cache/snapshot theo
  ngày (giống cache 45s của inventory reports)?
  + Tính real-time theo period

---

## 2. Chi tiết công nợ phải thu theo mặt hàng

### Mục đích
Xem chi tiết từng dòng hàng hoá trong các hoá đơn còn nợ, để biết khách hàng nợ
tiền của mặt hàng/nhóm hàng nào.

### Report type key (dự kiến)
`REPORT_TYPE_DEBTS.RECEIVABLES_DETAIL_BY_PRODUCT` (đã có sẵn trong enum,
`backendKey` chưa gán).

### Nguồn dữ liệu gợi ý
- `InvoiceDebtEntity` (nợ theo hoá đơn) join `InvoiceItemEntity`
  (`apps/api/src/modules/pos/entities/invoice-item.entity.ts`) — line item:
  `itemCode`, `itemName`, `unit`, `quantity`, `unitPrice`, `lineTotal`.
- Pattern tương tự báo cáo đã có "Chi tiết doanh thu theo hóa đơn và mặt hàng"
  (`report-revenue-detail-by-invoice-and-product.registry.ts`) — có thể tái dùng
  gần như nguyên cấu trúc cột (mã SKU, tên hàng, nhóm hàng, đơn vị, số lượng, đơn
  giá...) và chỉ thêm cột công nợ (`remainingAmount`, `dueDate`, `status`).
- **Mockup tham khảo (ảnh chụp UI mẫu do người dùng cung cấp)**: đây là **sổ chi
  tiết công nợ của 1 khách hàng cụ thể** (không phải danh sách nhiều khách hàng như
  báo cáo #1) — dialog filter có "Khách hàng *" bắt buộc chọn đúng 1 khách hàng.
  Mỗi dòng trong bảng là **1 chứng từ** (hoá đơn phát sinh nợ, hoặc phiếu thu tiền
  nợ), có dòng đầu tiên cố định là "Số dư công nợ đầu kỳ" (opening balance), sau đó
  là các dòng chứng từ trong kỳ, cột "Số dư cuối kỳ" chạy dạng số dư luỹ kế (running
  balance) qua từng dòng — giống sổ chi tiết ngân hàng/sổ cái, không phải 1 dòng
  tổng hợp/kỳ như báo cáo #1.
  - Cột "Loại chứng từ" khớp gần như chính xác với enum có sẵn
    `InvoiceDebtEntity.documentType` (`CREDIT_INVOICE` = hoá đơn bán chịu,
    `PAYMENT_RECEIPT` = phiếu thu nợ, `ADJUSTMENT` = điều chỉnh) — dòng loại
    `CREDIT_INVOICE` mới có dữ liệu mặt hàng (SKU/tên hàng/nhóm hàng/ĐVT/số
    lượng/đơn giá); dòng `PAYMENT_RECEIPT`/`ADJUSTMENT` các cột mặt hàng để trống,
    chỉ có số tiền.
  - **Đã xác nhận bằng số liệu mẫu thật** (ảnh có số cụ thể): "Đã thu" (7) và "Nợ
    tăng (8)" **KHÔNG** cùng khái niệm với "Nợ giảm" (9) — chúng là 2 cặp khái niệm
    khác nhau:
    - Với **mỗi dòng hàng hoá thuộc hoá đơn** (`CREDIT_INVOICE`): `Đã thu (7) + Nợ
      tăng (8) = Tổng (6)`. Đây là **phân bổ thanh toán ngay lúc bán** — phần nào
      của dòng hàng được khách trả ngay (tiền mặt/chuyển khoản tại quầy) rơi vào
      "Đã thu", phần còn lại chưa trả (ghi nợ) rơi vào "Nợ tăng". Ảnh mẫu: 6 dòng
      đầu của hoá đơn có Đã thu = Tổng (840.000), Nợ tăng = 0 (trả đủ ngay); dòng 7
      trả 1 phần (Đã thu 465.000 + Nợ tăng 375.000 = 840.000); 6 dòng cuối chưa trả
      gì (Đã thu = 0, Nợ tăng = 840.000) — tức **hoá đơn cho nợ 1 phần** (mixed
      payment: vừa trả tiền vừa ghi nợ), rất khớp với nghiệp vụ "top-up debt" nhắc
      trong commit gần đây (`b38708a3` — reset payment line khi kích hoạt nợ).
    - Với **dòng phiếu thu nợ** (`PAYMENT_RECEIPT`): chỉ có "Nợ giảm" (9) = số tiền
      thu được kỳ này, không liên quan "Đã thu"/"Nợ tăng" (2 cột này = 0 trên dòng
      phiếu thu).
    - Ngoài ra, mỗi **hoá đơn (nhóm dòng hàng)** còn có 1 dòng **"Cộng"** (subtotal)
      ngay sau các dòng hàng của hoá đơn đó — cộng dồn số lượng + toàn bộ cột tiền
      của các dòng hàng cùng hoá đơn. Cấu trúc bảng là **group theo chứng từ**:
      dòng đầu group hiện Ngày/Số chứng từ/Loại chứng từ/Diễn giải/Chi nhánh (các ô
      này để trống ở các dòng hàng tiếp theo cùng group — giống merged cell), rồi
      1 dòng "Cộng" chốt group, rồi group chứng từ tiếp theo.
    - "Số dư cuối kỳ" (10) xác nhận là **số dư luỹ kế chạy theo từng dòng** (không
      phải theo group): giữ nguyên khi Nợ tăng/giảm = 0, cộng dồn +Nợ tăng mỗi dòng
      hàng, rồi trừ Nợ giảm ở dòng phiếu thu — khớp đúng phép tính
      `số dư dòng N = số dư dòng N-1 + Nợ tăng dòng N − Nợ giảm dòng N`.
  - Công thức (3)=(1)*(2), (4), rồi nhảy sang (6)=(3)-(4): xác nhận **số (5) không
    xuất hiện trong bảng** — nhiều khả năng là lỗi đánh số thứ tự công thức trong
    UI mẫu (không phải cột bị ẩn), có thể bỏ qua khi implement.
  - **Đã xác nhận entity thật đứng sau dòng "Phiếu thu"** (click vào "Số chứng từ"
    của dòng `PAYMENT_RECEIPT` mở dialog chi tiết phiếu thu): entity là
    `CashReceiptEntity`
    (`apps/api/src/modules/accounting/cash-vouchers/cash-receipts/cash-receipt.entity.ts`),
    không phải field tự sinh:
    - `documentNumber` = "Số phiếu thu" (VD `PT000002`), `voucherDate` = "Ngày thu".
    - `purpose` (enum `CashReceiptPurpose`) = "Mục đích thu" (ảnh mẫu: "Thu nợ" —
      kèm nút "Chọn hoá đơn thu nợ" để chọn 1 hoặc nhiều hoá đơn được thu).
    - `partnerId`/`partnerNameSnapshot` = "Đối tượng nộp" (mã KH + tên KH).
    - `reason` = **chính là field "Lý do thu"**, mặc định gợi ý dạng "Thu nợ từ
      {tên KH}" nhưng là **field lưu thật, có thể sửa tay** — không phải chuỗi tự
      sinh thuần tuý ở query time như phỏng đoán trước đó. → "Diễn giải" của dòng
      `PAYMENT_RECEIPT` trong báo cáo = `CashReceiptEntity.reason`.
    - `staffId` = "Nhân viên thu" (ảnh: mã `0000` + tên "Phan Thanh Hà") — cột mới
      có thể cân nhắc thêm vào báo cáo (chưa có trong danh sách 18 cột hiện tại).
    - Tab "Chi tiết" là `CashReceiptLineEntity[]`
      (`cash-receipt-line.entity.ts`): mỗi dòng có `description` (Diễn giải dòng
      chi tiết), `amount` (Số tiền), `categoryId` → "Mục thu" (ảnh: "Thu từ bán
      hàng") — **1 phiếu thu có thể có nhiều dòng chi tiết**, và qua nút "Chọn hoá
      đơn thu nợ" có khả năng **1 phiếu thu phân bổ cho nhiều hoá đơn/`InvoiceDebtEntity`
      khác nhau** — cần tính đến khi tổng hợp "Nợ giảm" (9) theo từng hoá đơn cụ
      thể trong báo cáo (không phải luôn 1-1 giữa phiếu thu và hoá đơn).
    - Có `debt-collection-saga.entity.ts`/`.service.ts`
      (`apps/api/src/modules/accounting/cash-vouchers/debt-collection/`) — saga
      tạo đồng thời `CashReceiptEntity` + settle `InvoiceDebtEntity` liên quan qua
      `DebtPaymentEntity`, cùng pattern với saga công nợ nhà cung cấp đã ghi nhận ở
      mục 3 (`SupplierDebtPaymentEntity` + Phiếu Chi).
    - Ngược lại, dòng `CREDIT_INVOICE` (hoá đơn) hiện **không thấy field mô tả nào
      tương ứng trên `InvoiceDebtEntity`** — "Ghi công nợ khách hàng cho hóa đơn
      ..." nhiều khả năng vẫn là chuỗi ghép động (template) khi hiển thị, khác với
      dòng phiếu thu (lấy trực tiếp từ `reason` đã lưu). **Cần xác nhận lại.**
  - **UI hành vi**: cột "Số chứng từ" là link — click vào dòng `PAYMENT_RECEIPT` mở
    dialog chi tiết "Phiếu thu" (như ảnh mẫu); dòng `CREDIT_INVOICE` nhiều khả năng
    mở chi tiết hoá đơn tương ứng (chưa có ảnh xác nhận).
  - **Ảnh mẫu mở rộng (nhiều dòng hơn) xác nhận thêm**:
    - "Loại chứng từ" có **nhiều hơn 2 nhãn hiển thị** trong thực tế: "Hóa đơn bán
      hàng", "Phiếu thu nợ - Tiền mặt", và cả **"Phiếu thu tiền mặt"** (không có chữ
      "nợ") — dòng `PT000001` dùng nhãn này nhưng **vẫn** làm giảm "Nợ giảm" (9) =
      150.000. Vậy nhãn "Phiếu thu nợ..." vs "Phiếu thu..." có thể không đồng nghĩa
      với việc phiếu đó có/không ảnh hưởng công nợ — **cần xác nhận**: nhãn hiển thị
      lấy theo `CashReceiptEntity.purpose` cụ thể ra sao (có bao nhiêu giá trị
      `CashReceiptPurpose`, và giá trị nào của `purpose` xuất hiện trong báo cáo
      công nợ — chỉ `purpose = DEBT` hay mọi phiếu thu có allocate vào nợ bất kể
      `purpose`?).
    - Mỗi group hoá đơn luôn kết thúc bằng dòng "Cộng", **kể cả khi hoá đơn chỉ có
      1 dòng hàng** (VD hoá đơn `2607050010`: 1 dòng số lượng 3, theo sau vẫn có
      dòng "Cộng" giống hệt) — xác nhận dòng "Cộng" là quy tắc cố định của mọi
      group, không phụ thuộc số dòng hàng.
    - Có **dòng tổng cuối toàn báo cáo** (không nhãn, dòng cuối cùng bảng) — khác
      dòng "Cộng" của từng chứng từ: cộng dồn Số lượng/Tiền hàng/Khuyến mại/Tổng/Đã
      thu/Nợ tăng/Nợ giảm trên **toàn bộ kỳ báo cáo** (mọi chứng từ), riêng "Số dư
      cuối kỳ" ở dòng tổng này = số dư luỹ kế cuối cùng (không phải tổng cộng dồn),
      khớp với hành vi đã ghi nhận ở báo cáo #1 (`summaryLabel: "Tổng"`).

### Phạm vi & quyền
- Theo cửa hàng (branch) — hoá đơn luôn gắn `branchId`; ảnh mẫu có cột "Chi nhánh"
  ở cuối bảng (khác báo cáo #1 — ở đây "chi nhánh" là 1 cột dữ liệu trên từng dòng
  chứng từ, không phải chỉ filter cấp trang) → gợi ý báo cáo này gộp dữ liệu nhiều
  chi nhánh của khách hàng đó khi xem ở chế độ "Chuỗi cửa hàng".
- **Xác nhận thêm từ ảnh mẫu**: header đang chọn **"Chi nhánh Nguyễn Trãi - CT"**
  (chế độ cửa hàng đơn, không phải "Chuỗi cửa hàng"), nhưng dòng chứng từ hiển thị
  lại thuộc **"Chi nhánh 211 TP. Đà Nẵng"** — khác branch đang chọn ở header. Điều
  này cho thấy báo cáo công nợ theo khách hàng **luôn gộp dữ liệu xuyên chi nhánh**
  của khách hàng đó, bất kể đang chọn cửa hàng đơn hay chuỗi ở header (bộ chọn
  cửa hàng ở header có thể chỉ ảnh hưởng ngữ cảnh làm việc, không phải filter giới
  hạn dữ liệu của báo cáo này) — **cần xác nhận lại với nghiệp vụ thực tế** vì đây
  là quan sát suy ra từ 1 ảnh mẫu, chưa chắc đúng trong mọi trường hợp.

### Bộ lọc (điền tay)

| Tên filter | Field backend | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|---|
| Nhóm KH | `customerGroupId` | select | Không | Ảnh mẫu: "Tất cả" — dùng để thu hẹp danh sách chọn khách hàng bên dưới |
| Khách hàng | `customerId` | select (single) | **Có** | Khác báo cáo #1 (không bắt buộc) — báo cáo này luôn xem theo 1 khách hàng cụ thể |
| Kỳ báo cáo | `reportPeriod` | select (preset) | Không | Ảnh mẫu: "Tháng này" |
| Từ ngày | `fromDate` | date | Có (khi kỳ = Tuỳ chọn) | |
| Đến ngày | `toDate` | date | Có (khi kỳ = Tuỳ chọn) | |
| Cửa hàng / Chuỗi cửa hàng | `branchId` / `branchIds[]` | select | Không | Filter cấp trang (STORE_TYPE) |
| Số chứng từ / Loại chứng từ / Diễn giải / Mã SKU / ... | tương ứng từng cột | text/select/number | Không | Ảnh dialog "Sửa mẫu" cho thấy mọi cột đều có ô lọc riêng (column filter), không chỉ 4 cột filter chính trong dialog "Chọn báo cáo" |

### Cột hiển thị (điền tay)

Thứ tự và tên cột lấy theo ảnh "Sửa mẫu"; công thức lấy theo ảnh bảng kết quả
(lưu ý số thứ tự công thức trong ảnh nhảy từ (4) sang (6), bỏ qua (5) — xem câu hỏi
mở).

| Thứ tự | Tên cột | Field backend (đề xuất) | Kiểu dữ liệu | Cố định cột | Ghi chú |
|---|---|---|---|---|---|
| 1 | Ngày | `date` | date | Có | Ngày phát sinh chứng từ (`InvoiceDebtEntity.issuedAt` hoặc `DebtPaymentEntity.paidAt`); chỉ hiện trên dòng đầu mỗi group chứng từ |
| 2 | Số chứng từ | `documentNumber` | text, link | Có | Mã hoá đơn (VD `2607050008`, nếu `CREDIT_INVOICE`) hoặc mã phiếu thu (VD `PT000002`, nếu `PAYMENT_RECEIPT`); chỉ hiện trên dòng đầu group |
| 3 | Loại chứng từ | `documentType` | text/select | Không | Nhãn hiển thị thực tế: "Hóa đơn bán hàng" (`CREDIT_INVOICE`), "Phiếu thu nợ - Tiền mặt" (`PAYMENT_RECEIPT` + `paymentMethod=CASH`) — gợi ý nhãn ghép `documentType` + `paymentMethod` của `DebtPaymentEntity` |
| 4 | Diễn giải | `description` | text | Không | Dòng `PAYMENT_RECEIPT`: = `CashReceiptEntity.reason` (field lưu thật, VD "Thu nợ từ Dev Test"). Dòng `CREDIT_INVOICE`: template `"Ghi công nợ khách hàng cho hóa đơn số {documentNumber}"` — cần xác nhận build động hay lưu field thật |
| 5 | Mã SKU | `itemCode` | text | Không | = `ReportTableColumn.SKU`; nguồn `InvoiceItemEntity.itemCode`; trống ở dòng phiếu thu và dòng "Cộng" |
| 6 | Tên hàng hóa | `itemName` | text | Không | = `ReportTableColumn.PRODUCT_NAME`; nguồn `InvoiceItemEntity.itemName` |
| 7 | Nhóm hàng hóa | `productGroup` | text | Không | = `ReportTableColumn.PRODUCT_GROUP` |
| 8 | ĐVT | `unit` | text | Không | = `ReportTableColumn.UNIT`; nguồn `InvoiceItemEntity.unit` |
| 9 | Số lượng (1) | `quantity` | number | Không | = `ReportTableColumn.QUANTITY`; dòng "Cộng" = tổng số lượng các dòng hàng cùng hoá đơn |
| 10 | Đơn giá (2) | `unitPrice` | number | Không | = `ReportTableColumn.UNIT_PRICE`; dòng "Cộng" để trống (không cộng đơn giá) |
| 11 | Tiền hàng (3)=(1)*(2) | `revenueGoods` | number | Không | = `ReportTableColumn.REVENUE_GOODS`; dòng "Cộng" = tổng tiền hàng |
| 12 | Khuyến mại (4) | `revenuePromotion` | number | Không | = `ReportTableColumn.REVENUE_PROMOTION`; ảnh mẫu: 360.000 / 1.200.000 ≈ 30% mỗi dòng |
| 13 | Tổng (6)=(3)-(4) | `total` | number | Không | **Cột mới** hoặc tái dùng `REVENUE_TOTAL`; số (5) không xuất hiện trong bảng — nhiều khả năng lỗi đánh số trong UI mẫu, không phải cột thiếu |
| 14 | Đã thu (7) | `collectedAmount` | number | Không | **Cột mới**; = phần Tổng (6) khách trả ngay lúc bán (`Đã thu + Nợ tăng = Tổng` trên mỗi dòng hàng) |
| 15 | Nợ tăng (8) | `debtIncrease` | number | Không | **Cột mới**; = phần Tổng (6) chưa trả, ghi vào nợ; dòng phiếu thu luôn = 0 |
| 16 | Nợ giảm (9) | `debtDecrease` | number | Không | **Cột mới**; = `DebtPaymentEntity.amount` trên dòng phiếu thu; dòng hoá đơn luôn = 0 |
| 17 | Số dư cuối kỳ (10) | `runningBalance` | number | Không | **Cột mới**; số dư luỹ kế: `dòng N = dòng N-1 + Nợ tăng(N) − Nợ giảm(N)` — chạy theo TỪNG DÒNG HÀNG (không phải theo group hoá đơn) |
| 18 | Chi nhánh | `branchName` | text | Không | = `ReportTableColumn.STORE_NAME`; chỉ hiện trên dòng đầu group; xem "Phạm vi & quyền" — ảnh mẫu cho thấy có thể khác chi nhánh đang chọn ở header |

Dòng đầu bảng cố định "Số dư công nợ đầu kỳ" — không phải 1 chứng từ, chỉ có số ở
cột "Số dư cuối kỳ" (10) (các cột khác = 0/trống); cần xác nhận cách tính: luỹ kế
mọi phát sinh trước "Từ ngày" (tương tự "Nợ đầu kỳ" ở báo cáo #1).

Mỗi group chứng từ hoá đơn (nhiều dòng hàng) kết thúc bằng 1 dòng **"Cộng"** — chỉ
có số ở cột Số lượng/Tiền hàng/Khuyến mại/Tổng/Đã thu/Nợ tăng/Nợ giảm/Số dư cuối kỳ,
cột Ngày/Số chứng từ/Loại chứng từ/Diễn giải/SKU/Tên hàng/Nhóm hàng/ĐVT/Đơn giá để
trống ở dòng này.

### Câu hỏi mở / rủi ro
- Chỉ hiện chứng từ của khách hàng đang còn nợ (status OPEN/OVERDUE), hay hiện cả
  chứng từ đã tất toán (để đối chiếu lịch sử)? Ảnh mẫu không lọc theo status.
- ~~Ý nghĩa chính xác của "Đã thu" (7) so với "Nợ giảm" (9)~~ — **đã làm rõ** bằng
  số liệu mẫu thật, xem mục "Nguồn dữ liệu gợi ý" ở trên.
- ~~"Diễn giải" của dòng `CREDIT_INVOICE` lấy từ đâu~~ — **đã trả lời**: template
  cố định `"Ghi công nợ khách hàng cho hóa đơn số {documentNumber}"` (VD: "Ghi công
  nợ khách hàng cho hóa đơn số 2607050008"). Vẫn cần xác nhận: template này build
  động ở FE/BE tại thời điểm hiển thị, hay lưu thành field thật trên
  `InvoiceDebtEntity` giống `CashReceiptEntity.reason`.
- 1 `CashReceiptEntity` có thể phân bổ cho nhiều `InvoiceDebtEntity` (qua "Chọn
  hoá đơn thu nợ") — cách tách "Nợ giảm" (9) theo đúng từng hoá đơn khi 1 phiếu
  thu áp dụng cho nhiều hoá đơn cùng lúc? *(chưa có câu trả lời)*
  + Mỗi phiếu thu nợ, chỉ có 1 dòng trong report, Nếu hoá đơn không cập nhật Đã thu thì =0 và phiếu thu sẽ là nợ giảm
- Có nên thêm cột "Nhân viên thu" (`CashReceiptEntity.staffId`) vào báo cáo không —
  hiện chưa có trong 18 cột nhưng có sẵn trên chứng từ gốc?
  + Không
- Cách tính "Số dư công nợ đầu kỳ" (luỹ kế trước "Từ ngày") — theo `InvoiceDebtEntity`
  hay cần snapshot riêng?
  + Theo `InvoiceDebtEntity`, luỹ kế trước "Từ ngày".
- Xác nhận báo cáo có thực sự gộp xuyên chi nhánh cho 1 khách hàng hay không (xem
  quan sát ở "Phạm vi & quyền").
  + Có cột Chi nhánh để thể hiện, nên sẽ lấy data của tất cả chi nhánh mà khách hàng sử dụng.

---

## 3. Công nợ nhà cung cấp

### Mục đích
Xem tổng công nợ hiện tại với từng nhà cung cấp (tổng phát sinh, đã trả, còn phải
trả).

### Report type key (dự kiến)
`REPORT_TYPE_DEBTS.SUPPLIER_DEBTS` (đã có sẵn trong enum, `backendKey` chưa gán).

### Nguồn dữ liệu gợi ý
- `SupplierDebtEntity` (`apps/api/src/modules/inventory/supplier-debt/supplier-debt.entity.ts`)
  — nợ theo phiếu nhập kho: `supplierId`, `referenceCode`, `goodsReceiptId`,
  `originalAmount`, `paidAmount`, `remainingAmount`, `status` (OPEN/PAID/OVERDUE),
  `dueDate`, `issuedAt`.
- `ProviderEntity` (`apps/api/src/modules/inventory/location/provider.entity.ts`)
  — thông tin nhà cung cấp: `maxDebt` (hạn mức nợ), `debtTermDays` (thời hạn công
  nợ theo ngày).
- `SupplierDebtPaymentEntity` — lịch sử thanh toán từng đợt.
- **Mockup tham khảo (ảnh chụp UI mẫu do người dùng cung cấp)**: cấu trúc **giống hệt
  báo cáo #1 "Công nợ khách hàng"** — cùng dạng sổ công nợ theo kỳ
  (opening/increase/decrease/closing), cùng công thức `Nợ cuối kỳ (4) = Nợ đầu kỳ
  (1) + Tăng trong kỳ (2) − Giảm trong kỳ (3)`. Khác biệt duy nhất: **ít cột hơn hẳn**
  (chỉ 6 cột so với 15 cột của báo cáo #1 — không có nhóm/SĐT/email/địa chỉ/thẻ
  thành viên, khớp với `ProviderEntity` có field set đơn giản hơn `CustomerEntity`).
  Áp dụng cùng gợi ý kiến trúc period-ledger (CTE opening/increase/decrease/closing
  kiểu `StockPeriodService`) đã ghi ở báo cáo #1, với nguồn:
  - "Tăng trong kỳ" = tổng `originalAmount` các `SupplierDebtEntity` phát sinh
    trong kỳ.
  - "Giảm trong kỳ" = tổng `amount` các `SupplierDebtPaymentEntity` phát sinh
    trong kỳ.
  - "Nợ đầu kỳ" = số dư nợ luỹ kế trước "Từ ngày".
  - Lưu ý thứ tự cột trong ảnh dialog "Sửa mẫu": **"Tăng trong kỳ" xếp trước "Nợ
    đầu kỳ"** (khác báo cáo #1 — ở đó "Nợ đầu kỳ" xếp trước "Tăng trong kỳ") nhưng
    công thức hiển thị trên bảng kết quả thực tế vẫn để "Nợ đầu kỳ (1)" trước "Tăng
    trong kỳ (2)" theo đúng số thứ tự công thức — **thứ tự cột trình bày trong dialog
    cấu hình không nhất thiết khớp thứ tự hiển thị thực tế trên bảng**, cần xác nhận
    thứ tự cột cuối cùng khi implement.

### Phạm vi & quyền
- `ProviderEntity` scoping là `ORGANIZATION` (không tách theo branch trong CRUD
  registry) — nhưng `GoodsReceiptEntity`/`SupplierDebtEntity` có `branchId` thật
  trong dữ liệu.
- **Đã xác nhận trực tiếp bởi người dùng** (áp dụng cho cả báo cáo #3 và #4): khi
  xem ở chế độ "Chuỗi cửa hàng", có thêm filter SingleSelect "Cửa hàng", mặc định
  = "chuỗi cửa hàng" (gộp toàn chuỗi); khi xem theo từng chi nhánh riêng thì
  KHÔNG có filter "Cửa hàng" này (đã ở ngữ cảnh 1 chi nhánh). Vậy: mặc định gộp
  toàn chuỗi/tổ chức, có thể thu hẹp về 1 cửa hàng cụ thể qua filter phụ — giải
  quyết dứt điểm câu hỏi mở trước đó về phạm vi chi nhánh của báo cáo này.

### Bộ lọc (điền tay)

| Tên filter | Field backend | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|---|
| Nhóm NCC | `supplierGroupId` | select | Không | Ảnh mẫu: "Tất cả" — nguồn: `SupplierGroupEntity` |
| Kỳ báo cáo | `reportPeriod` | select (preset) | Không | Ảnh mẫu: "Tháng này" |
| Từ ngày | `fromDate` | date | Có (khi kỳ = Tuỳ chọn) | |
| Đến ngày | `toDate` | date | Có (khi kỳ = Tuỳ chọn) | |
| Cửa hàng (chỉ khi xem Chuỗi cửa hàng) | `branchId` | select (single) | Không | Mặc định = "chuỗi cửa hàng" (gộp); ẩn khi đang xem theo 1 chi nhánh cụ thể — xem "Phạm vi & quyền" |
| Mã NCC / Tên nhà cung cấp | `supplierCode` / `supplierName` | text | Không | Ô lọc theo cột, giống báo cáo #1 |
| Nợ đầu/tăng/giảm/cuối kỳ | tương ứng từng cột | number (so sánh ≤) | Không | Suy theo pattern báo cáo #1; ảnh mẫu chưa có dữ liệu để xác nhận trực tiếp |

### Cột hiển thị (điền tay)

Chỉ 6 cột theo đúng ảnh "Sửa mẫu" — đơn giản hơn nhiều so với báo cáo #1.

| Thứ tự | Tên cột | Field backend (đề xuất) | Kiểu dữ liệu | Cố định cột | Ghi chú |
|---|---|---|---|---|---|
| 1 | Mã NCC | `supplierCode` | text | Có | = `ReportTableColumn.SUPPLIER_CODE` (đã có sẵn trong enum); nguồn `ProviderEntity.code` |
| 2 | Tên nhà cung cấp | `supplierName` | text | Có | = `ReportTableColumn.SUPPLIER_NAME` (đã có sẵn); nguồn `ProviderEntity.name` |
| 3 | Nợ đầu kỳ (1) | `openingDebt` | number | Không | **Cột mới**; xem công thức period-ledger ở mục "Nguồn dữ liệu gợi ý" |
| 4 | Tăng trong kỳ (2) | `increaseDebt` | number | Không | **Cột mới** |
| 5 | Giảm trong kỳ (3) | `decreaseDebt` | number | Không | **Cột mới** |
| 6 | Nợ cuối kỳ (4)=(1)+(2)-(3) | `closingDebt` | number | Không | **Cột mới**; tính ở BE để tránh sai số làm tròn, giống báo cáo #1 |

### Câu hỏi mở / rủi ro
- ~~Lọc theo cửa hàng nhập hàng hay theo toàn tổ chức?~~ — **đã giải quyết**, xem
  "Phạm vi & quyền" (mặc định gộp toàn chuỗi, có filter phụ thu hẹp về 1 cửa hàng).
- Có cần hiển thị `maxDebt`/hạn mức còn lại so với dư nợ hiện tại không? Ảnh mẫu
  hiện tại không có cột này.
  + Không
- Thứ tự cột thực tế: "Nợ đầu kỳ" trước hay sau "Tăng trong kỳ"? Ảnh dialog cấu
  hình và công thức trên bảng kết quả gợi ý thứ tự hơi khác nhau — cần chốt 1 thứ
  tự trước khi code.
  + Nợ đầu kỳ trước, default chỉ có 2 cột NCC và tên NCC là cố định.

**Ảnh mẫu với dữ liệu thật**: header chọn 1 chi nhánh cụ thể ("Chi nhánh 211 TP.
Đà Nẵng"), kỳ "Năm nay" (01/01/2026-31/12/2026) → 1 dòng kết quả: NCC "ABA - AN BA",
Tăng trong kỳ = 39.200.000, Nợ đầu kỳ = 0, Giảm trong kỳ = 0, Nợ cuối kỳ =
39.200.000 — khớp với phiếu nhập `NK000373` (xem báo cáo #4) nhập tại "Kho 211 DN"
thuộc đúng chi nhánh đang chọn. Khớp với quy tắc filter phụ "Cửa hàng" đã xác nhận
ở "Phạm vi & quyền": khi chọn xem theo 1 chi nhánh cụ thể, báo cáo tự nhiên chỉ
hiện dữ liệu của chi nhánh đó (không cần filter phụ nữa vì đã ở ngữ cảnh 1 chi
nhánh). Click vào tên NCC ("AN BA") mở thẳng dialog "Phiếu nhập hàng" chi tiết —
khác báo cáo #2 (nơi click "Số chứng từ" mới mở chi tiết); cần xác nhận hành vi
khi NCC có nhiều hơn 1 phiếu trong kỳ (drill-through sang báo cáo #4, hay mở phiếu
gần nhất?).

---

## 4. Chi tiết công nợ nhà cung cấp theo chứng từ và mặt hàng

### Mục đích
Xem chi tiết từng phiếu nhập kho (chứng từ) còn nợ nhà cung cấp, và chi tiết từng
mặt hàng trong phiếu đó.

### Report type key (dự kiến)
`REPORT_TYPE_DEBTS.SUPPLIER_DEBTS_DETAIL_BY_DOCUMENT_AND_PRODUCT` (đã có sẵn
trong enum, `backendKey` chưa gán).

### Nguồn dữ liệu gợi ý
- `SupplierDebtEntity` (1-1 với `goodsReceiptId`) join
  `GoodsReceiptEntity`/`GoodsReceiptLineEntity`
  (`apps/api/src/modules/inventory/goods-receipt/`) — chứng từ:
  `documentNumber`, `receivedAt`, `paymentMethod`; dòng hàng:
  `quantity`, `unitPrice`, `lineTotal`, liên kết item/location/bin.
- Lưu ý: `GoodsReceiptEntity`/`SupplierDebtEntity` **chưa nằm trong generic CRUD
  registry** — phải viết query/handler riêng (không tự động có REST CRUD).
- **Mockup tham khảo (ảnh dialog "Phiếu nhập hàng" thật, mở từ báo cáo #3)**, đã
  đối chiếu trực tiếp với `goods-receipt.entity.ts`/`goods-receipt-line.entity.ts`:
  - Số phiếu nhập thực tế **`NK000373`** — comment trong code ghi
    `documentNumber` "Auto-generated on post (PNK-YY-####)" nhưng đây chỉ là ví dụ
    trong comment, không phải format cố định: numbering thật theo
    `DocumentNumberRule`/`DocumentNumberCounter` cấu hình theo từng tổ chức (xem
    [`docs/19-document-numbering-rules.md`](./19-document-numbering-rules.md)) —
    org này đang cấu hình prefix "NK" + số đếm, không có "PNK-YY-".
  - Radio "Ghi nợ nhà cung cấp" / "Thanh toán ngay" + dropdown "Tiền mặt" = đúng
    `GoodsReceiptEntity.paymentMethod` (enum `GoodsReceiptPaymentMethod`: `CASH` |
    `CREDIT`) — chỉ `CREDIT` ("Ghi nợ nhà cung cấp") mới phát sinh `SupplierDebtEntity`.
  - Nút "Chọn phiếu đặt hàng" — liên kết `PurchaseOrderEntity` qua
    `referenceId`/`referenceType` (enum `GoodsReceiptReferenceType`).
  - "Người giao" = `GoodsReceiptEntity.deliveredBy` (varchar 200, ảnh: "TEST").
  - "NV mua hàng" = `GoodsReceiptEntity.purchasingEmployeeId` (uuid, resolve ra
    `{id, name}` qua field transient `purchasingEmployee`) — mã "0000" trong ảnh
    nhiều khả năng là mã nhân viên hiển thị riêng, không phải field trên entity.
  - "Diễn giải" = **chưa xác định chính xác là field nào** — entity có **cả 2**
    field text: `reason` (varchar 500) và `description` (varchar 2000). Ảnh mẫu chỉ
    hiện 1 ô "Diễn giải" duy nhất ("DEV TEST") nên cần xác nhận UI đang bind vào
    field nào (khác khái niệm "Diễn giải" ở báo cáo #2 vốn dùng
    `CashReceiptEntity.reason` của 1 entity hoàn toàn khác).
  - "Tham chiếu" = có thể là field `references` (jsonb array, comment: "FE-supplied
    reference codes shown as Tham chiếu") — field phụ, có thể không cần đưa vào
    cột báo cáo.
  - CHỨNG TỪ: "Ngày nhập" + "Giờ nhập" tách riêng hiển thị (16:25) — cả 2 đều lấy
    từ 1 cột duy nhất `receivedAt` (timestamptz), tách ngày/giờ ở tầng hiển thị FE.
  - Bảng CHI TIẾT dòng hàng khớp `GoodsReceiptLineEntity`: `itemId`→Mã SKU/Tên hàng
    hóa, `locationId`→"Kho"+"Vị trí" (ảnh hiện "Kho 211 DN"/"E31.03" — **cần xác
    nhận `LocationEntity` có phân cấp Kho/Vị trí hay đây là 2 cấp
    Storage/Location riêng**, vì `GoodsReceiptLineEntity` chỉ có 1 `locationId` +
    `binId` chứ không có field "Kho" riêng), `uomCode`→ĐVT, `quantity`, `unitPrice`,
    `lineTotal`.
  - **Footer phiếu nhập có "Tiền CK"/"Tiền thuế" — và ảnh mẫu thật của báo cáo #4
    (bên dưới) xác nhận đây LÀ cột thật cần có** (không phải placeholder), nhưng
    **hiện KHÔNG có field tương ứng** trên `GoodsReceiptLineEntity` (chỉ có
    `quantity`/`unitPrice`/`lineTotal`, không có `discountPercent`/`discountAmount`/
    `taxRate`/`taxAmount`) → đây là **schema gap thật sự cần bổ sung** khi
    implement báo cáo #4 (thêm cột vào `GoodsReceiptLineEntity` hoặc tính từ nguồn
    khác), không chỉ là nghi ngờ như ghi chú trước.

### Mockup thật của báo cáo #4 (ảnh chụp UI mẫu do người dùng cung cấp)

Khác hẳn dự đoán suy theo báo cáo #2 ở bản nháp trước — đã thay bằng dữ liệu thật:

- **Filter dialog** có thêm 1 dòng **"Thống kê theo"** (groupBy) với ít nhất 2 giá
  trị: "Hàng hóa" (SKU/`ItemEntity`) và "Mẫu mã" (`ProductEntity` — mẫu sản phẩm
  gốc trước khi sinh biến thể, xem `VariantGenerationService` trong
  `modules/inventory/product/`).
  - **Đã xác nhận bằng ảnh mẫu thứ 2**: "Thống kê theo" **không chỉ đổi cách nhóm,
    mà đổi hẳn bộ cột hiển thị**. Khi chọn **"Mẫu mã"**: bảng **KHÔNG có 8 cột công
    thức (1)-(8)** (không có Số lượng/Đơn giá/%CK/Tiền CK/Thuế suất/Tiền thuế) —
    chỉ còn "Thành tiền" và "Tiền thanh toán" là 2 số tổng (không kèm công thức),
    rồi tới thẳng "Công nợ tăng/giảm trong kỳ"/"Nợ cuối kỳ". Khi chọn **"Hàng hóa"**
    (ảnh mẫu trước): đủ 20 cột với công thức (1)-(8) chi tiết.
  - Số dòng dữ liệu **không đổi** giữa 2 chế độ (vẫn 14 dòng của phiếu `NK000373`,
    cùng giá trị "Tiền thanh toán"=2.800.000/dòng, cùng luỹ kế "Công nợ tăng trong
    kỳ" 2.8M→...→39.2M) — nghĩa là "Mẫu mã" **không gộp nhiều dòng SKU thành 1
    dòng**, chỉ ẩn bớt cột chi tiết định giá.
  - Ở chế độ "Mẫu mã", cột "Mã SKU" và "Tên hàng hóa" đều hiện **cùng 1 giá trị**
    ("ABA3335" — mã mẫu mã gốc, không có hậu tố biến thể như "-D-38") lặp lại trên
    mọi dòng của phiếu, khác chế độ "Hàng hóa" (mỗi dòng có SKU/tên hàng khác nhau
    theo biến thể thật). **Cần xác nhận**: đây có phải hành vi đúng (2 cột này đổi
    ý nghĩa thành "Mã mẫu mã"/"Tên mẫu mã" khi ở chế độ Mẫu mã), hay là dữ liệu
    demo chưa đầy đủ.
- **"Loại chứng từ"** hiển thị dạng ghép: **"Phiếu nhập hàng - Ghi nợ nhà cung cấp"**
  (khớp `documentType` + `paymentMethod=CREDIT`) — cùng pattern ghép nhãn đã xác
  nhận ở báo cáo #2 ("Hóa đơn bán hàng" / "Phiếu thu nợ - Tiền mặt").
- **Công thức 8 bước, KHÔNG có khoảng trống số thứ tự** (khác báo cáo #2 từng nhảy
  từ (4) sang (6)) — xác nhận thêm giả thuyết trước đó rằng gap ở báo cáo #2 là lỗi
  UI, không phải quy luật chung:
  `(1) Số lượng`, `(2) Đơn giá`, `(3) Thành tiền=(1)*(2)`, `(4) % CK`,
  `(5) Tiền CK=(3)*(4)`, `(6) Thuế suất`, `(7) Tiền thuế=[(3)-(5)]*(6)`,
  `(8) Tiền thanh toán=(3)-(5)+(7)`.
- **Phát hiện quan trọng, khác hẳn báo cáo #2**: "Công nợ tăng trong kỳ" và
  "Công nợ giảm trong kỳ" ở đây **KHÔNG phải giá trị delta của riêng dòng đó** (như
  "Nợ tăng"/"Nợ giảm" ở báo cáo #2) — mà là **tổng luỹ kế (cumulative) từ đầu kỳ
  đến dòng hiện tại**. Số liệu mẫu (14 dòng cùng 1 phiếu `NK000373`, mỗi dòng Tiền
  thanh toán = 2.800.000): "Công nợ tăng trong kỳ" chạy 2.800.000 → 5.600.000 →
  8.400.000 → ... → 39.200.000 (= 14 × 2.800.000) — tăng dần đúng bằng tổng dồn
  "Tiền thanh toán" các dòng trước đó cộng dòng hiện tại. Và "Nợ cuối kỳ" ở mỗi
  dòng = `Nợ đầu kỳ (80.360.000) + Công nợ tăng trong kỳ (luỹ kế đến dòng đó) −
  Công nợ giảm trong kỳ (luỹ kế đến dòng đó)` — verify khớp: dòng 1:
  80.360.000+2.800.000−0=83.160.000 ✓; dòng cuối: 80.360.000+39.200.000−0=
  119.560.000 ✓. **Đây là điểm khác biệt kiến trúc quan trọng nhất so với báo cáo
  #2** — nếu implement sai (copy công thức delta-per-row của báo cáo #2) sẽ ra kết
  quả sai. Dòng "Cộng" cuối group cũng lấy giá trị luỹ kế cuối cùng (không cộng
  dồn thêm 1 lần nữa).
- Cột **"Serial/IMEI"** — mới, chưa xác nhận nguồn dữ liệu (có thể liên quan
  serial-tracking trên `ItemEntity`/dòng nhập, cần tra thêm nếu nghiệp vụ có dùng).
- Xác nhận: dòng đầu bảng vẫn là **"Số dư công nợ đầu kỳ"** (ảnh: 80.360.000),
  giống báo cáo #2.

### Phạm vi & quyền
- Theo cửa hàng nhận hàng (branch trên `GoodsReceiptEntity`).
- **Đã được người dùng xác nhận trực tiếp (áp dụng cho cả báo cáo #3 và #4)**: khi
  xem ở chế độ **"Chuỗi cửa hàng"**, có thêm 1 filter **SingleSelect "Cửa hàng"**,
  mặc định = "chuỗi cửa hàng" (xem gộp toàn chuỗi); khi xem ở chế độ **từng chi
  nhánh** (branch selector chọn 1 chi nhánh cụ thể) thì **KHÔNG có** filter "Cửa
  hàng" này (vì đã ở ngữ cảnh 1 chi nhánh rồi). → 2 báo cáo NCC (#3, #4) mặc định
  gộp xuyên toàn chuỗi, có thể thu hẹp về 1 cửa hàng cụ thể qua filter phụ này —
  **giải quyết dứt điểm** câu hỏi mở trước đó về phạm vi chi nhánh của báo cáo #3.

### Bộ lọc

Theo đúng ảnh dialog "Chọn báo cáo" thật của báo cáo #4.

| Tên filter | Field backend | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|---|
| Cửa hàng | `branchId` | select (single) | Không | **Xác nhận: nằm ngay trong dialog "Chọn báo cáo"**, ngay dưới "Báo cáo" — mặc định "Chuỗi cửa hàng" (gộp); chỉ hiện khi đang xem ở chế độ Chuỗi cửa hàng, ẩn khi đã chọn 1 chi nhánh cụ thể ở header |
| Thống kê theo | `groupBy` | select | Không | "Hàng hóa" / "Mẫu mã" — **đổi cả bộ cột hiển thị**, xem "Mockup thật của báo cáo #4" |
| Nhóm NCC | `supplierGroupId` | select | Không | Ảnh mẫu: "Tất cả" |
| Nhà cung cấp | `supplierId` | select (single) | **Có** | Giống báo cáo #2 (khách hàng bắt buộc) — ảnh mẫu: "AN BA" |
| Kỳ báo cáo | `reportPeriod` | select (preset) | Không | Ảnh mẫu: "Tháng này" |
| Từ ngày / Đến ngày | `fromDate`/`toDate` | date | Có (khi Tuỳ chọn) | |

### Cột hiển thị

Theo đúng ảnh "Sửa mẫu" (20 cột) + ảnh bảng kết quả thật — đây là bộ cột đầy đủ khi
"Thống kê theo" = **"Hàng hóa"**. Khi chọn **"Mẫu mã"**, bỏ các cột số 10-16 (Số
lượng, Đơn giá, %CK, Tiền CK, Thuế suất, Tiền thuế) — chỉ giữ Thành tiền, Tiền
thanh toán (dạng số tổng, không có công thức kèm theo) rồi tới thẳng 3 cột công nợ
luỹ kế — xem chi tiết ở mục "Mockup thật của báo cáo #4".

| Thứ tự | Tên cột | Field backend (đề xuất) | Kiểu dữ liệu | Ghi chú |
|---|---|---|---|---|
| 1 | Ngày | `date` | date | `GoodsReceiptEntity.receivedAt`; chỉ hiện dòng đầu group |
| 2 | Số chứng từ | `documentNumber` | text, link | VD `NK000373` |
| 3 | Loại chứng từ | `documentType` | text | VD "Phiếu nhập hàng - Ghi nợ nhà cung cấp" — ghép `documentType`+`paymentMethod` |
| 4 | Mã SKU | `itemCode` | text | `GoodsReceiptLineEntity.itemId` → `ItemEntity` |
| 5 | Tên hàng hóa | `itemName` | text | |
| 6 | Diễn giải | `reason`/`description` | text | Xem field ambiguity ở mục "Nguồn dữ liệu gợi ý" |
| 7 | Nhóm hàng hóa | `categoryName` | text | |
| 8 | Đơn vị tính | `uomCode` | text | |
| 9 | Serial/IMEI | `serialNumber` | text | **Cột mới** — nguồn dữ liệu chưa xác nhận |
| 10 | Số lượng (1) | `quantity` | number | |
| 11 | Đơn giá (2) | `unitPrice` | number | |
| 12 | Thành tiền (3)=(1)*(2) | `lineTotal` | number | = `GoodsReceiptLineEntity.lineTotal` |
| 13 | % CK (4) | `discountPercent` | number | **Schema gap** — chưa có field trên entity |
| 14 | Tiền CK (5)=(3)*(4) | `discountAmount` | number | **Schema gap** — chưa có field trên entity |
| 15 | Thuế suất (6) | `taxRate` | number | **Schema gap** — chưa có field trên entity |
| 16 | Tiền thuế (7)=[(3)-(5)]*(6) | `taxAmount` | number | **Schema gap** — chưa có field trên entity |
| 17 | Tiền thanh toán (8)=(3)-(5)+(7) | `paymentAmount` | number | Giá trị per-dòng (không luỹ kế) — dùng làm input cho cột luỹ kế bên dưới |
| 18 | Công nợ tăng trong kỳ | `cumulativeDebtIncrease` | number | **Luỹ kế** tổng "Tiền thanh toán" từ đầu kỳ đến dòng hiện tại — KHÔNG phải delta/dòng (xem phân tích ở trên) |
| 19 | Công nợ giảm trong kỳ | `cumulativeDebtDecrease` | number | **Luỹ kế** tương tự, từ các dòng thanh toán/phiếu chi |
| 20 | Nợ cuối kỳ | `closingBalance` | number | = Nợ đầu kỳ + (18) − (19), tính lại mỗi dòng (không phải cộng dồn từ dòng trước) |

### Câu hỏi mở / rủi ro
- Nguồn dữ liệu "Serial/IMEI" — cần xác nhận trong nghiệp vụ có theo dõi serial
  hay không (chưa thấy field trong `GoodsReceiptLineEntity` hiện tại).
  + Không
- "Diễn giải" bind vào `reason` hay `description` trên `GoodsReceiptEntity`?
  + Bind vào `reason`
- **Cần bổ sung schema** cho `%CK`/`Tiền CK`/`Thuế suất`/`Tiền thuế` trên
  `GoodsReceiptLineEntity` (hoặc entity liên quan) — hiện không có, nhưng báo cáo
  #4 cần các cột này thật (không phải placeholder).
  + Không, mặc định 0 cho đến khi có entity mới.
- Có dòng "Cộng" theo từng phiếu nhập giống báo cáo #2 không? Ảnh mẫu hiện tại
  (1 phiếu, 14 dòng) có dòng "Cộng" ở cuối — xác nhận có, giống báo cáo #2.
  Có
- Cột "Kho"/"Vị trí" (thấy ở dialog phiếu nhập) không xuất hiện trong 20 cột của
  "Sửa mẫu" báo cáo #4 — xác nhận có cố ý bỏ 2 cột này khỏi báo cáo hay chỉ chưa
  hiện trong ảnh mẫu.
  + Có cố ý bỏ 2 cột này khỏi báo cáo, chỉ hiện khi xem phiếu nhập hàng chi tiết.

---

## 5. Công nợ đối tác giao hàng

### Mục đích
*(Chưa xác định — xem phần rủi ro bên dưới.)*

### Report type key (dự kiến)
`REPORT_TYPE_DEBTS.DELIVERY_PARTNER_DEBTS` (đã có sẵn key + nhãn trong enum, nhưng
**chưa có nguồn dữ liệu backing**).

### Nguồn dữ liệu gợi ý
**Không có.** Khảo sát codebase không tìm thấy entity/bảng nào theo dõi "đối tác
giao hàng" (delivery partner) hay công nợ với đối tác giao hàng. Chỉ tồn tại:
- `GoodsReceiptEntity.deliveredBy` — field text tự do (200 ký tự), chỉ ghi chú tên
  người/đơn vị giao hàng, không có bảng quan hệ, không track công nợ.
- `ListCarriersQueryDto` trong module temp-warehouse — thực chất tìm kiếm
  nhân viên/user làm "người vận chuyển" nội bộ (context xuất kho tạm), không liên
  quan đến đối tác giao hàng bên ngoài hay công nợ.

### Phạm vi & quyền
*(Chưa xác định — phụ thuộc vào việc entity nguồn dữ liệu là gì.)*

### Bộ lọc (điền tay)

| Tên filter | Field backend | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|---|
| | | | | |

### Cột hiển thị (điền tay)

| Thứ tự | Tên cột | Field backend | Kiểu dữ liệu | Căn lề | Ghi chú |
|---|---|---|---|---|---|
| | | | | | |

### Câu hỏi mở / rủi ro
- **Cần xác nhận nguồn dữ liệu trước khi thiết kế filter/cột.** Ứng viên cần làm rõ:
  - "Đối tác giao hàng" là đơn vị vận chuyển/logistics thu hộ COD (cần model entity
    mới, VD `DeliveryPartnerEntity` + bảng công nợ tương ứng)?
  - Hay là một phân loại của `ProviderEntity` hiện có (nhà cung cấp dịch vụ giao
    hàng, lọc theo loại hình)?
  - Hay một khái niệm nghiệp vụ khác chưa từng được model trong hệ thống?
- Nếu cần entity mới: đây sẽ là công việc lớn hơn 4 báo cáo còn lại (cần thêm
  migration, entity, luồng ghi nhận công nợ/thanh toán) — nên tách thành epic/ticket
  riêng sau khi chốt được nguồn dữ liệu.

---

## Tạm hoãn: Tổng hợp công nợ phải thu theo tuổi nợ

Báo cáo này **không đưa vào đợt đặc tả lần này**. Lý do: dữ liệu hạn thanh toán
(due date) hiện chưa được thu thập đầy đủ trong thực tế vận hành, nên bucket tuổi
nợ (0-30/31-60/61-90/90+ ngày) sẽ không phản ánh đúng thực tế nghiệp vụ nếu làm
ngay bây giờ.

Ghi chú kỹ thuật (để tham khảo khi mở lại): logic bucket tuổi nợ mẫu đã tồn tại ở
`apps/api/src/modules/reporting/reporting.service.ts` (endpoint
`receivables-aging`/`payables-aging`), và cả `InvoiceDebtEntity.dueDate` lẫn
`ReceivableEntity.dueDate` đã có sẵn field trong schema — chỉ là chưa được nhập
liệu đầy đủ trong vận hành. Khi quy trình nghiệp vụ bắt buộc nhập hạn thanh toán
đầy đủ, có thể quay lại đặc tả báo cáo này theo cùng khung mẫu ở trên.

---

## Bước tiếp theo

1. Điền các bảng "Bộ lọc" và "Cột hiển thị" còn trống cho 5 báo cáo ở trên (bảng #5
   cần chốt nguồn dữ liệu trước).
2. Sau khi điền xong, dùng skill `feature-planning` (gõ `/feature-planning` hoặc
   yêu cầu "plan feature: báo cáo công nợ") để tạo epic + ticket theo convention
   của repo (`tickets/epics/`, `tickets/tickets/`).
3. Khi implement, tham khảo 2 pattern có sẵn:
   - Frontend registry: `apps/backoffice-web/src/constants/reports/report-registry/*.ts`
     (mẫu gần nhất về mặt cấu trúc dữ liệu: `report-revenue-detail-by-invoice-and-product.registry.ts`).
   - Backend 3-API registry-driven contract (columns / search / filter-options /
     templates): `apps/api/src/modules/reporting/invoice-report/` và
     `apps/api/src/modules/reporting/report-core/`, mô tả kiến trúc trong
     [`docs/22-inventory-reports-views.md`](./22-inventory-reports-views.md) mục 0.
4. Bổ sung enum key `CUSTOMER_DEBTS` vào `REPORT_TYPE_DEBTS`
   (`apps/backoffice-web/src/constants/reports/report-type.constant.ts`) khi bắt
   đầu code báo cáo #1 — hiện tại enum này chưa có key cho "Công nợ khách hàng".
