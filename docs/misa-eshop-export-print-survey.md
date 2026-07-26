# Khảo sát chức năng Xuất khẩu / In — MISA eShop

> Nguồn khảo sát: `https://giaymt.mshopkeeper.vn/main#...` (production, read-only, đăng nhập sẵn). Mục đích: đối chiếu để triển khai **Xuất khẩu (Excel/PDF)** và **In (print)** cho các Báo cáo kho hàng và các loại Phiếu trong jack-erp — hiện **chưa có** cả hai chức năng này ở cả 2 nơi (đã grep codebase, không thấy thư viện xuất Excel/PDF nào được dùng ngoài `inventory/csv` — vốn chỉ phục vụ import/export **danh mục hàng hoá**, không phải export báo cáo/phiếu).
>
> Ngày khảo sát: 2026-07-26. Người thực hiện: Claude (browser automation), theo yêu cầu của Akenzy.

---

## 0. Kết luận nhanh (tóm tắt cho người triển khai)

| Nhóm màn hình                            | Có nút "In"                               | Có nút "Xuất khẩu" | Cấp áp dụng                                                                              | Backend pattern quan sát được                                                                                                                                           |
| ---------------------------------------- | ----------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Báo cáo Kho (`rp_stock`, 12 loại)        | ✅ (chọn khổ giấy A4 ngang/dọc)            | ✅ (Excel)          | **Toàn bảng** (theo bộ lọc hiện tại), có dialog "Sửa mẫu" chọn/ẩn cột                    | `POST /backendg2/api/ReportList/printdata`, `POST /backendg2/api/ReportList/exportdata` — 1 API dùng chung cho **mọi loại báo cáo**, phân biệt bằng payload (report id) |
| Phiếu Nhập kho / Xuất kho / Chuyển kho   | ✅ (nhiều mẫu in khác nhau)                | ✅ (Excel)          | **Từng phiếu** (mở chi tiết rồi mới thấy nút) — **list không có nút export/print riêng** | Click "In" mở tab mới `blob:...` (PDF render client-side); "Xuất khẩu" không mở tab mới → tải file trực tiếp                                                            |
| Thu/Chi tiền mặt, Thu/Chi tiền gửi       | ✅ (2 khổ giấy: A5 / khổ 80 — máy in bill) | ✅ (Excel)          | **Từng phiếu**                                                                           | Giống trên                                                                                                                                                              |
| Sổ chi tiết tiền mặt / tiền gửi (ledger) | ❌ **không có nút In**                     | ✅ (Excel)          | **Toàn bảng**                                                                            | Chỉ có `Xuất khẩu`, không có `In` — đây là báo cáo dạng sổ (ledger), không phải chứng từ                                                                                |

**Pattern kiến trúc chính cần note:******
1. **Báo cáo (report) và sổ (ledger)** → export/print áp dụng cho **toàn bảng** đang hiển thị (theo filter), có cấu hình cột riêng (dialog "Sửa mẫu"/gear icon), export chỉ xuất các cột đang "Hiển thị = true".
2. **Chứng từ/phiếu (voucher)** → export/print áp dụng cho **1 chứng từ** tại một thời điểm (không có bulk export ở list), mỗi loại phiếu có **2+ mẫu in khác nhau** (mẫu chuẩn theo giá mua vs mẫu có mã vạch, hoặc khổ giấy A4 vs khổ 80mm cho máy in nhiệt).
3. **In** dùng cho phiếu ⇒ mở **preview PDF trong tab mới** trước khi in thật (`window.open(blob:...)`), không phải gọi `window.print()` trực tiếp — cho phép user xem trước, tải, rồi mới bấm in từ trình duyệt.
4. Có 2 khổ giấy cố định lặp lại xuyên suốt: **A4** (in văn phòng) và **80mm/"Khổ 80"** (máy in hoá đơn nhiệt POS) — nên thiết kế template hệ thống hỗ trợ song song 2 khổ này ngay từ đầu.

> **Giới hạn khảo sát:** Do sandbox của công cụ browser automation tách biệt với filesystem local, không thể tải/mở trực tiếp file Excel/PDF thực tế xuất ra để đọc byte-by-byte. Cột dữ liệu ghi nhận dưới đây lấy từ (a) bảng hiển thị trên màn hình, và (b) dialog cấu hình cột "Sửa mẫu" (nơi có) — đây chính là danh sách cột mà MISA dùng để build cả bảng lẫn file xuất, nên độ tin cậy cao. Cả `printdata` và `exportdata` API đều trả **HTTP 200** ở mọi lần test → xác nhận chức năng hoạt động, không phải placeholder.

---

## 1. Báo cáo Kho hàng — `#rp_stock`

Menu **Báo cáo → Kho**. Có **12 loại báo cáo** trong dropdown "Chọn báo cáo":

1. Tổng hợp nhập xuất tồn kho *(mặc định — khảo sát chi tiết bên dưới)*
2. Bảng kê chi tiết phiếu nhập xuất kho
3. Chi tiết số lượng nhập xuất tồn kho
4. Tổng hợp nhập xuất kho theo cửa hàng
5. Số lượng tồn kho theo cửa hàng
6. Tồn kho hàng hóa dưới mức tối thiểu
7. Tổng hợp nhập xuất điều chuyển
8. Tổng hợp hàng hóa điều chuyển theo cửa hàng
9. Tổng hợp hàng hóa chuyển kho tạm
10. Hàng hóa xuất kho tạm
11. Thời gian lưu kho hàng hóa
12. Xuất kho hàng hóa theo lý do

> Ghi chú đối chiếu: jack-erp (`docs/22-inventory-reports-views.md`) đã có **7/12 báo cáo tương đương** dưới `/reports/storage/*` (contract v2, registry-driven `GET /reports/inventory/columns`, `POST /reports/inventory/search`). Đây chính là nơi nên gắn thêm 2 endpoint export/print mới — tái dùng column catalog đã có sẵn thay vì định nghĩa lại.

### 1.1. Bộ lọc chung (header) — áp dụng mọi báo cáo Kho

| Filter             | Kiểu                                                   | Ghi chú |
| ------------------ | ------------------------------------------------------ | ------- |
| Kỳ báo cáo         | select (Tháng này / Tháng trước / Tuỳ chọn...)         |         |
| Từ ngày / Đến ngày | date                                                   |         |
| Cửa hàng           | radio: Tất cả / Theo nhóm cửa hàng (multi-select chip) |         |
| Kho                | select: Tất cả kho / chọn kho cụ thể                   |         |
| Nhóm hàng hóa      | select                                                 |         |
| Thống kê theo      | select (Hàng hóa / ...)                                |         |
| Đơn vị tính        | select                                                 |         |

### 1.2. Cột dữ liệu — "Tổng hợp nhập xuất tồn kho" (báo cáo mặc định, khảo sát đầy đủ)

Lấy từ dialog **"Sửa mẫu"** (icon ⚙ cạnh nút Xuất khẩu) — đây là danh sách cột **đầy đủ và authoritative**, mỗi dòng có 2 checkbox `Hiển thị` / `Cố định cột` (freeze/pin), tick/untick được và **Lưu** thành template cá nhân:

| #   | Cột (Tên cột dữ liệu) | Nhóm cha       | Ghi chú                                                 |
| --- | --------------------- | -------------- | ------------------------------------------------------- |
| 1   | Mã SKU                | —              |                                                         |
| 2   | Tên hàng hóa          | —              |                                                         |
| 3   | Nhóm hàng hóa         | —              |                                                         |
| 4   | Thương hiệu           | —              |                                                         |
| 5   | Mã vị trí             | —              |                                                         |
| 6   | Số lượng              | Tồn đầu kỳ     |                                                         |
| 7   | Giá trị               | Tồn đầu kỳ     |                                                         |
| 8   | Số lượng              | Đang chuyển đi | hàng đang trên đường chuyển kho, chưa nhập vào kho đích |
| 9   | Giá trị               | Đang chuyển đi |                                                         |
| 10  | Số lượng              | Tồn cuối kỳ    |                                                         |
| 11  | Giá trị               | Tồn cuối kỳ    |                                                         |
| 12  | Ảnh hàng hóa          | —              |                                                         |
| 13  | Mã SKU mẫu mã         | —              | mã của "parent" variant group                           |
| 14  | Tên Mẫu mã            | —              |                                                         |
| 15  | Màu sắc               | —              | thuộc tính biến thể                                     |
| 16  | Size                  | —              | thuộc tính biến thể                                     |
| 17  | Đơn vị tính           | —              |                                                         |
| 18  | Tên vị trí            | —              |                                                         |
| 19  | Số lượng              | Nhập trong kỳ  |                                                         |
| 20  | Giá trị               | Nhập trong kỳ  |                                                         |
| 21  | Số lượng              | Xuất trong kỳ  |                                                         |
| 22  | Giá trị               | Xuất trong kỳ  |                                                         |
| 23  | Số lượng              | Sắp nhận về    | hàng đã đặt mua/điều chuyển đến, chưa về kho            |
| 24  | Giá trị               | Sắp nhận về    |                                                         |
| 25  | Nhà cung cấp          | —              |                                                         |

Bảng hiển thị trên màn hình mặc định chỉ show một tập con (Mã SKU, Tên hàng hóa, Nhóm hàng hóa, Thương hiệu, Mã vị trí, Tồn đầu kỳ SL/GT, Đang chuyển đi SL/GT, Tồn SL) — phần còn lại ẩn theo template mặc định nhưng vẫn xuất ra Excel nếu user tick hiển thị.

Cuối bảng có dòng **tổng cộng** (SUM) cho mọi cột số.

### 1.3. Cơ chế Xuất khẩu / In

- Nút **In** → dropdown 2 lựa chọn khổ giấy: **"Khổ A4 (ngang)"**, **"Khổ A4 (dọc)"** → gọi `POST /backendg2/api/ReportList/printdata`.
- Nút **Xuất khẩu** → gọi `POST /backendg2/api/ReportList/exportdata` (xuất Excel trực tiếp, không hỏi thêm option).
- Nút ⚙ (gear, cạnh Xuất khẩu) → mở dialog **"Sửa mẫu"** để cấu hình cột hiển thị/ẩn + cố định cột + thứ tự (kéo thả), có nút **"Lấy mẫu ngầm định"** (reset về default) và **"Lưu"** — cấu hình này áp dụng cho cả 3 nơi: bảng trên màn hình, file In, và file Xuất khẩu.
- Cả `printdata` và `exportdata` trả **200** khi test.

**Đề xuất cho jack-erp:** endpoint `GET /reports/inventory/columns` đã có sẵn catalog cột (VI label, band, width...) — chỉ cần thêm 2 endpoint `POST /reports/inventory/export` (trả file Excel, dùng `exceljs`) và `POST /reports/inventory/print` (trả PDF hoặc HTML render-to-PDF, dùng cùng `columns[]` mà user đã chọn trong `report_templates`). Không cần thiết kế cột riêng — tái dùng contract v2 hiện có.

---

## 2. Phiếu Nhập kho — `#inward`

### 2.1. Danh sách (list)

Toolbar: `Thêm mới | Nhân bản | Xem | Sửa | Xóa | Nạp | In tem mã`. **Không có nút Xuất khẩu/In ở cấp danh sách** — chỉ có ở trong từng phiếu.

Cột bảng danh sách:

| Cột           | Ghi chú                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Ngày          |                                                                                                          |
| Số phiếu nhập | link mở chi tiết, format `NK######`                                                                      |
| Đối tượng     | nhà cung cấp / cửa hàng nguồn                                                                            |
| Tổng tiền     |                                                                                                          |
| Diễn giải     |                                                                                                          |
| Lý do         |                                                                                                          |
| Loại chứng từ | vd: "Phiếu nhập kho điều chuyển", "Phiếu nhập kho hàng trả lại", "Phiếu nhập hàng - Ghi nợ nhà cung cấp" |

Panel **"Chi tiết"** dưới bảng (khi chọn 1 dòng) hiển thị các dòng hàng hóa của phiếu: `Mã SKU | Tên hàng hóa | Kho | Vị trí | Đơn vị tính | SL theo chứng từ | SL thực tế | Đơn giá | Thành tiền | Ghi chú`.

### 2.2. Chi tiết phiếu (dialog "Nhập kho")

- **Mục đích nhập kho**: radio `Khác` / `Điều chuyển từ cửa hàng khác` (+ field "Kho tổng" khi chọn điều chuyển)
- **THÔNG TIN CHUNG**: Đối tượng, Người giao, Diễn giải, Tham chiếu (link tới phiếu xuất nguồn nếu là điều chuyển), Tài liệu đính kèm
- **CHỨNG TỪ**: Số phiếu nhập, Ngày nhập, Giờ nhập
- **CHI TIẾT** (bảng dòng hàng, có filter theo từng cột + checkbox "Quét mã vạch", nút "Chọn kho", "Nhập khẩu"): Mã SKU, Tên hàng hóa, Kho, Vị trí, Đơn vị tính, SL theo chứng từ, SL thực tế, Đơn giá, Thành tiền, Ghi chú — dòng cuối tổng SL theo chứng từ + SL thực tế.

### 2.3. Xuất khẩu / In

Toolbar dialog: `Trước | Sau | Thêm mới | Sửa | Lưu | Xóa | Hoãn | In ▾ | Xuất khẩu | Trợ giúp | Đóng`.

- **In** có dropdown **2 mẫu**: **"PNK theo giá mua"**, **"PNK có mã vạch"**. Bấm mẫu → mở **tab mới với PDF preview** (`blob:https://.../<uuid>`), render sẵn để xem/in/tải — không cần chọn khổ giấy riêng (mẫu đã cố định layout).
- **Xuất khẩu**: xuất Excel của phiếu hiện tại (không mở tab mới, tải trực tiếp).

---

## 3. Phiếu Xuất kho — `#outward`

### 3.1. Danh sách

Toolbar giống Nhập kho: `Thêm mới | Nhân bản | Xem | Sửa | Xóa | Nạp | In tem mã`.

Cột: `Ngày | Số phiếu xuất (XK######) | Đối tượng | Tổng tiền | Diễn giải | Lý do | Loại chứng từ` (vd: "Phiếu xuất kho điều chuyển", "Phiếu xuất kho bán hàng"). Panel Chi tiết dưới: `Mã SKU | Tên hàng hóa | Kho | Vị trí | Đơn vị tính | Số lượng | Đơn giá | Thành tiền | Ghi chú`.

### 3.2. Chi tiết phiếu

- **Mục đích xuất kho**: vd "Điều chuyển đến cửa hàng khác" (+ Kho tổng)
- **THÔNG TIN CHUNG**: Đối tượng, Người giao, Diễn giải, Tham chiếu, Tài liệu đính kèm
- **CHỨNG TỪ**: Số phiếu xuất, Ngày xuất, Giờ xuất
- **CHI TIẾT**: ghi chú hướng dẫn *"Khi bỏ trống đơn giá, chương trình sẽ tự động tính đơn giá xuất kho"* (auto-cost) — cột: Mã SKU, Tên hàng hóa, Kho, Vị trí, Đơn vị tính, Số lượng, Đơn giá, (Thành tiền, Ghi chú — ngoài khung nhìn nhưng có trong panel Chi tiết cấp list)

### 3.3. Xuất khẩu / In

Toolbar dialog có thêm nút **"Tiện ích"** (dropdown, chưa khảo sát sâu — không thuộc phạm vi export/print). Nút **In** có **4 mẫu**:

- **Phiếu xuất kho (80)** — khổ 80mm (máy in nhiệt)
- **PXK chuyển hàng theo giá mua (A4)**
- **In tem mã** (in tem/barcode cho từng dòng hàng, không phải in phiếu)
- **PXK có mã vạch**

**Xuất khẩu**: xuất Excel của phiếu hiện tại.

---

## 4. Phiếu Chuyển kho — `#transferstock`

### 4.1. Danh sách

Toolbar: `Thêm mới | Nhân bản | Xem | Sửa | Xóa | Nạp` (không có "In tem mã" ở đây).

Cột: `Ngày | Số phiếu (CK######) | Đối tượng | Tổng tiền | Diễn giải`. Panel Chi tiết: `Mã SKU | Tên hàng hóa | Kho xuất | Vị trí xuất | Kho nhập | Vị trí nhập | Đơn vị tính | Số lượng | Đơn giá | Thành tiền | Ghi chú`.

### 4.2. Chi tiết phiếu

- **THÔNG TIN CHUNG**: Người vận chuyển (mã nhân viên + tên), Diễn giải, Tài liệu đính kèm
- **CHỨNG TỪ**: Số phiếu chuyển, Ngày chuyển, Giờ chuyển
- **CHI TIẾT**: ghi chú *"Khi bỏ trống đơn giá, chương trình sẽ tự động tính đơn giá xuất kho"* — cột: Mã SKU, Tên hàng hóa, Kho xuất, Vị trí xuất, Kho nhập, Vị trí nhập, (Đơn vị tính, Số lượng, Đơn giá, Thành tiền, Ghi chú ngoài khung nhìn)

### 4.3. Xuất khẩu / In

Nút **In** có **2 mẫu**: **"PCK theo giá mua"**, **"PCK có mã vạch"** — cùng pattern với Nhập/Xuất kho. **Xuất khẩu** xuất Excel phiếu hiện tại.

---

## 5. Thu, Chi tiền mặt — `#receipt_cash`

Trang này gộp **cả Phiếu thu và Phiếu chi tiền mặt** vào 1 list (nút "Thêm mới" có dropdown con: **"Phiếu thu tiền"** / **"Phiếu chi tiền"**). Có 2 tab liên quan trên header: "Kiểm kê tiền mặt", "Sổ chi tiết tiền mặt" (→ mục 6).

### 5.1. Danh sách

Cột: `Ngày | Số chứng từ | Loại chứng từ | Tổng tiền | Đối tượng nộp/nhận | Lý do`.

Filter **"Loại chứng từ"** có ít nhất 8 sub-type (đều tiền mặt):
`Phiếu thu tiền mặt`, `Phiếu thu nợ - Tiền mặt`, `Phiếu thu đặt cọc - Tiền mặt`, `Phiếu chi tiền mặt`, `Phiếu trả nợ - Tiền mặt`, `Phiếu nhập hàng - Tiền mặt`, `Phiếu trả lại hàng mua - Tiền mặt`, `Phiếu chi đặt cọc - Tiền mặt`.

> Đây chính là bằng chứng cho thấy 1 "cash movement" có nhiều **mục đích nghiệp vụ** (thu nợ, đặt cọc, trả hàng...) nhưng dùng chung 1 khung phiếu — giống định hướng `CashMovement` hiện có trong `docs/entities/07-accounting.md`.

### 5.2. Chi tiết — Phiếu thu

- **Mục đích thu**: radio `Khác` / `Thu nợ`
- **THÔNG TIN CHUNG**: Đối tượng nộp (mã + tên), Người nộp, Địa chỉ, Lý do thu, Nhân viên thu (mã + tên), Tham chiếu (link, vd tới `UNC000004` khi phiếu này được sinh tự động từ 1 phiếu chi tiền gửi), Tài liệu đính kèm
- **CHỨNG TỪ**: Số phiếu thu, Ngày thu, checkbox **Tính vào công nợ**, checkbox **Tính vào doanh thu**
- **CHI TIẾT**: `Diễn giải | Số tiền | Mục thu` — dòng tổng cuối bảng

Nút **In**: 2 mẫu — **"Phiếu thu (Khổ A5)"**, **"Phiếu thu (Khổ 80)"**.

### 5.3. Chi tiết — Phiếu chi

- **Mục đích chi**: vd `Khác` / `Chi khác`
- **THÔNG TIN CHUNG**: Đối tượng nhận, Người nhận, Địa chỉ, Lý do chi, Nhân viên chi
- **CHỨNG TỪ**: Số phiếu chi, Ngày chi, checkbox **"Tính vào"** + dropdown loại (vd "Chi phí"), Tham chiếu
- **CHI TIẾT**: `Diễn giải | Số tiền | Mục chi`

Nút **In**: **"Phiếu chi (Khổ A5)"**, **"Phiếu chi (Khổ 80)"**.

### 5.4. Xuất khẩu

Cả 2 loại phiếu đều có nút **Xuất khẩu** trong toolbar dialog chi tiết (không có ở cấp list).

---

## 6. Sổ chi tiết tiền mặt — `#ledger_cash`

Đây là **báo cáo dạng sổ cái** (running ledger), khác hẳn 2 mục trên — **không có nút In**, chỉ có **Xuất khẩu**.

### 6.1. Cột dữ liệu

| Cột                | Ghi chú                                      |
| ------------------ | -------------------------------------------- |
| Ngày chứng từ      |                                              |
| Số phiếu thu       | link, rỗng nếu dòng là chi                   |
| Số phiếu chi       | link, rỗng nếu dòng là thu                   |
| Diễn giải          |                                              |
| Số tiền thu        |                                              |
| Số tiền chi        |                                              |
| Số tiền còn lại    | **running balance** — cộng dồn qua từng dòng |
| Đối tượng nộp/nhận |                                              |
| Nhân viên thu/chi  |                                              |

Dòng đầu tiên luôn là **"Số dư đầu kỳ"** (opening balance theo khoảng ngày filter). Dòng cuối bảng: tổng `Số tiền thu` / `Số tiền chi` trong kỳ.

Mỗi dòng đại diện 1 giao dịch — có thể là Phiếu thu/chi tiền mặt (link tới `PT###`/`PC###`) **hoặc** 1 chứng từ khác có phát sinh tiền mặt (vd hoá đơn bán hàng `2607050002`, phiếu trả hàng `...TH`) — tức sổ này **tổng hợp từ nhiều nguồn**, không chỉ từ phiếu thu/chi thủ công.

### 6.2. Xuất khẩu

Chỉ 1 nút **Xuất khẩu** (Excel), không có tuỳ chọn khổ giấy vì không có In. Request `exportdata` → 200.

---

## 7. Thu, Chi tiền gửi — `#receipt_deposit`

Cấu trúc **giống hệt mục 5** (Thu/Chi tiền mặt) nhưng cho tài khoản ngân hàng, khác biệt:

- List có thêm cột **"Số tài khoản"**.
- Phiếu chi tiền gửi có field thêm: **"Tài khoản chi"**, và **Mục đích chi** có option đặc thù **"Chuyển tiền gửi thành tiền mặt"** — kèm checkbox quan trọng:
  > ☑ **"Tự động sinh phiếu thu tiền ngay sau khi chi"** — tick sẵn theo mặc định. Khi tick, hệ thống tự tạo 1 `Phiếu thu tiền mặt` tương ứng và gán 2 chiều qua field **Tham chiếu** (phiếu chi tiền gửi ↔ phiếu thu tiền mặt). Đây là cơ chế **fund-swap 1-click** giữa 2 quỹ.
- Số phiếu có prefix **`UNC`** (Ủy nhiệm chi) thay vì `PT`/`PC`.

Nút **In**: **"Phiếu chi (Khổ A5)"**, **"Phiếu chi (Khổ 80)"** — cùng pattern. **Xuất khẩu** tương tự.

---

## 8. Sổ chi tiết tiền gửi — `#ledger_deposit`

Y hệt mục 6 (Sổ chi tiết tiền mặt) nhưng thêm cột **"Số tài khoản"** giữa "Số phiếu chi" và "Diễn giải":

`Ngày chứng từ | Số phiếu thu | Số phiếu chi | Số tài khoản | Diễn giải | Số tiền thu | Số tiền chi | Số tiền còn lại | Đối tượng nộp/nhận | Nhân viên thu/chi`

Không có nút In, chỉ **Xuất khẩu**. Có dòng "Số dư đầu kỳ" và tổng cuối bảng giống mục 6.

---

## 9. Đề xuất triển khai cho jack-erp

### 9.1. Gap hiện tại

- Chưa có bất kỳ export-to-Excel/PDF hay print-preview nào cho **báo cáo kho** (`inventory-reports` module) lẫn **phiếu** (`goods-receipt`, `goods-issue`, `transfer-order`, và các module treasury tiền mặt/tiền gửi chưa rà — xem [[project_cash_vouchers_epic]] / [[project_one_cash_fund_per_branch]] trong memory).
- `inventory/csv` hiện chỉ export **danh mục hàng hóa** (import/export catalog), không phải export **báo cáo** hay **phiếu**.

### 9.2. Kiến trúc đề xuất — theo đúng 2 pattern quan sát được

**A. Cho Báo cáo/Sổ (bulk export toàn bảng, theo filter hiện tại):**
- Thêm 2 endpoint dùng chung theo registry đã có (`InventoryReportRegistry` — xem `docs/22-inventory-reports-views.md`):
  - `POST /reports/inventory/:reportType/export` → trả file `.xlsx` (dùng `exceljs`), cột lấy từ `report_templates` (đã có bảng này, dùng chung với invoice reports) — chỉ xuất cột có `visible=true`, đúng thứ tự `order`.
  - `POST /reports/inventory/:reportType/print` → trả PDF (render HTML→PDF, hoặc trả HTML để FE tự mở tab mới rồi `window.print()` — xem cách MISA làm ở mục 0.3).
- Áp dụng tương tự cho `Sổ chi tiết tiền mặt`/`tiền gửi` (nếu jack-erp có tương đương — check `modules/accounting` cash ledger).
- **Không cần** tuỳ chọn khổ giấy cho báo cáo dạng bảng (MISA cũng chỉ có A4 ngang/dọc, đơn giản).

**B. Cho Phiếu/Chứng từ (export/print 1 chứng từ, nhiều mẫu):**
- Mỗi loại phiếu (`GoodsReceipt`, `GoodsIssue`, `StockTransfer`, `CashReceipt`, `CashPayment`, `DepositReceipt`, `DepositPayment`) cần:
  - `GET /:module/:id/export` → Excel của riêng chứng từ đó.
  - `GET /:module/:id/print?template=<key>` → PDF, với **tối thiểu 2 template**: 1 bản chuẩn (A4/A5 — khổ văn phòng) và 1 bản khổ **80mm** (cho máy in bill POS) — bám sát UX MISA vì các cửa hàng bán lẻ VN đã quen dùng máy in nhiệt tại quầy.
  - Với Phiếu xuất kho: cân nhắc thêm mẫu **"có mã vạch"** nếu nhân viên kho dùng máy quét khi nhận/giao hàng.
- FE: khi bấm "In", mở tab mới hiển thị PDF preview (giống MISA) thay vì gọi `window.print()` trực tiếp — tránh block script bởi native print dialog và cho phép user tải file trước khi in.

### 9.3. Việc cần làm tiếp (không nằm trong scope khảo sát này)

- Xác nhận chính xác field/tên cột **tiếng Việt chuẩn** khi implement UI thật (bản khảo sát này đã ghi đúng theo MISA, dùng trực tiếp được).
- Đo khối lượng dữ liệu thực tế (số dòng tối đa 1 lần export) để quyết định export đồng bộ (return file ngay) hay bất đồng bộ (job + notification, giống `InventoryImportJobEntity` đã có pattern cho import).
- Quyết định thư viện PDF: `puppeteer` (render HTML có sẵn, chất lượng cao, nặng) vs `pdfkit`/`pdf-lib` (nhẹ, phải tự vẽ layout). Với việc phải hỗ trợ nhiều mẫu in đẹp (có logo, chữ ký), khuyến nghị **puppeteer** hoặc **wkhtmltopdf** để tái dùng template HTML/CSS thay vì code layout bằng tay.
