# Tài liệu tính năng — Module Khuyến mại (MISA eShop / MShopKeeper)

**URL khảo sát:** `https://giaymt.mshopkeeper.vn/main#promotion`
**Tenant:** giaymt · **Chi nhánh:** Chi nhánh 211 TP. Đà Nẵng · **Tài khoản:** Phan Thanh Hà
**Ngày khảo sát:** 21/07/2026
**Phạm vi:** khảo sát read-only (mở form, đổi option, xem dialog). **Không tạo / sửa / xóa bất kỳ bản ghi nào.**
**Tài liệu yêu cầu dẫn xuất:** [`docs/25-promotion-req.md`](./25-promotion-req.md) (REQ-KM-001)

> Đây là tài liệu **khảo sát hệ tham chiếu bên ngoài**, mô tả hành vi của MISA eShop — **không phải** đặc tả của jack-erp. Đặc tả yêu cầu nằm ở REQ-KM-001.

---

## 1. Tổng quan module

Module **Khuyến mại** gồm 2 màn hình, chuyển qua lại bằng link ở header:

| Màn hình | Route | Nội dung |
|---|---|---|
| Chương trình khuyến mại | `#promotion` | Danh sách + tạo/sửa 5 loại chương trình khuyến mại (CTKM) |
| Thẻ voucher | `#voucher` | Danh sách + phát hành voucher theo mệnh giá |

Dữ liệu hiện có trên tenant: **4 CTKM** (đều là loại *Giảm giá hàng hóa*, trạng thái *Đang theo dõi*, ngày bắt đầu 05/04/2026, không có ngày kết thúc):

- GIÀY NỮ ONSALE 30%
- GIÀY NAM ONSALE 30%
- GIÀY NỮ ONSALE 50%
- GIÀY NAM ONSALE 50%

Màn hình Voucher hiện **không có dữ liệu**.

---

## 2. Màn hình danh sách "Chương trình khuyến mại"

### 2.1. Thanh công cụ

| Nút | Chức năng | Phím tắt |
|---|---|---|
| **+ Thêm mới** ▾ | Dropdown chọn 1 trong 5 loại CTKM để tạo mới | — |
| **Nhân bản** | Copy CTKM đang chọn sang form "Thêm mới" đã điền sẵn toàn bộ dữ liệu (kể cả danh sách hàng hóa). Chưa lưu cho đến khi bấm *Lưu* | — |
| **Sửa** | Mở CTKM đang chọn ở chế độ chỉnh sửa | `Ctrl+E` |
| **Xóa** | Xóa CTKM đang chọn | — |
| **Nạp** | Tải lại dữ liệu danh sách | — |

Trong form còn có `Ctrl+Shift+S` = **Lưu và thêm mới**.

### 2.2. Bộ lọc theo kỳ

Dropdown kỳ + **Từ ngày** / **Đến ngày** + nút **Lấy dữ liệu**.

Các lựa chọn kỳ: `Hôm nay`, `Hôm qua`, `Tuần này`, `Tuần trước`, `Tháng này`, `Tháng trước`, `Quý này`, `Quý trước`, `6 tháng trước`, `Năm nay` (mặc định), `Năm trước`, `Khác`.

### 2.3. Lưới danh sách

Cột: `☑` · **Chương trình khuyến mại** · **Ngày bắt đầu** · **Ngày kết thúc** · **Áp dụng cho** · **Hình thức khuyến mại** · **Mô tả** · **Trạng thái**

Mỗi cột có ô lọc riêng ngay dưới header:

- **Cột text** — nút toán tử với 5 phép: `• Chứa` · `= Bằng` · `+ Bắt đầu bằng` · `- Kết thúc bằng` · `! Không chứa`
- **Cột ngày** — toán tử `=` + date picker
- **Áp dụng cho** — `Tất cả` / `Tất cả khách hàng` / `Nhóm khách hàng` / `Khách hàng có sinh nhật` / `Khách hàng có hạng thẻ`
- **Hình thức khuyến mại** — `Tất cả` / `Giảm giá hóa đơn` / `Giảm giá hàng hóa` / `Tặng hàng hóa` / `Mua m tặng n` / `Giảm giá theo mức`
- **Trạng thái** — `Tất cả` / `Đang theo dõi` / `Ngừng theo dõi`

> ⚠️ **Lưu ý vận hành:** bộ lọc **Trạng thái mặc định = "Đang theo dõi"**, không phải "Tất cả". Các CTKM đã ngừng theo dõi sẽ **không hiện** trong danh sách cho đến khi đổi bộ lọc này.

### 2.4. Phân trang

`Trang [n] trên [m]` · nút đầu/trước/sau/cuối · nút làm mới · chọn số dòng/trang (mặc định 50) · góc phải hiển thị `Hiển thị 1 - 4 trên 4 kết quả`.

---

## 3. Cấu trúc chung của form CTKM

Cả 5 loại đều dùng chung khung sau (khác nhau ở khối **KHUYẾN MẠI / GIẢM GIÁ**).

### 3.1. Thanh nút

`Lưu` · `Lưu và thêm mới` · `Hủy bỏ` (lặp lại ở cả đầu và cuối trang).

### 3.2. Tab

- **Khuyến mại** — thông tin chính
- **Điều kiện áp dụng** — điều kiện kích hoạt (chỉ có ở *Giảm giá hóa đơn*, *Giảm giá hàng hóa*, *Tặng hàng hóa*)

### 3.3. THÔNG TIN CHUNG

| Trường | Kiểu | Ghi chú |
|---|---|---|
| **Trạng thái** | Radio `Đang theo dõi` / `Ngừng theo dõi` | **Chỉ xuất hiện khi Sửa**, không có khi Thêm mới |
| **Tên chương trình** | Text | **Bắt buộc** — bỏ trống sẽ báo lỗi viền đỏ |
| **Mô tả** | Text | |
| **Áp dụng cho** | Dropdown | 4 giá trị, xem dưới |

**"Áp dụng cho"** và trường phụ đi kèm:

| Giá trị | Trường phụ hiện thêm |
|---|---|
| Tất cả khách hàng | — |
| Nhóm khách hàng | **Nhóm khách hàng** (multi-select) |
| Khách hàng có sinh nhật | — |
| Khách hàng có hạng thẻ | **Hạng thẻ** (dropdown; tenant này chỉ có `Thẻ thành viên`) |

### 3.4. THỜI GIAN ÁP DỤNG

| Trường | Ghi chú |
|---|---|
| **Ngày bắt đầu** / **Ngày kết thúc** | *"Bỏ trống từ ngày, đến ngày nếu không giới hạn thời gian"* |
| **Theo ngày trong tuần** | 7 checkbox: Thứ 2 → Chủ nhật (lọc theo thứ) |
| **Giờ bắt đầu** / **Giờ kết thúc** | Khung giờ vàng trong ngày |
| **Giới hạn giá trị giảm** | ⚠️ Chỉ xuất hiện ở *Giảm giá theo mức → Giá trị hóa đơn* — trần số tiền giảm tối đa |

### 3.5. Checkbox cuối form

**"Tự động áp dụng chương trình khuyến mại này khi tính tiền"** — mặc định **bật**.

> 🔎 **Hành vi quan sát được:** khi chuyển tab *Điều kiện áp dụng* sang một điều kiện khác `Không yêu cầu điều kiện`, checkbox này **tự động bị bỏ tick**. Nghĩa là CTKM có điều kiện sẽ mặc định phải chọn thủ công tại quầy, trừ khi tick lại.

### 3.6. Dialog "Chọn hàng hóa" (dùng chung mọi form)

Bấm biểu tượng kính lúp trong ô **Mã SKU** để mở:

- Bộ lọc **Nhóm hàng hóa** — cây 2 cấp. Trên tenant này: `QUÀ TẶNG` › Phiếu quà tặng; `GIÀY DÉP` › Giày nhập, Giày nam, Giày nữ, Giày thể thao, Giày hở mũi, Dép nam, Dép nữ, Sandal nam, Sandal nữ, Sapo nam, …
- Ô tìm kiếm *"Nhập mã SKU, tên hàng hóa"* + nút **Tìm kiếm**
- Bộ đếm: *"0 mẫu mã (0 hàng hóa) đã chọn"*
- Lưới: `☑` · Mã SKU · Tên hàng hóa · Nhóm hàng hóa · Đơn vị tính · Số lượng
- **Mỗi dòng có nút `+` mở rộng ra danh sách mẫu mã** (biến thể theo size). VD `ABA2777` → `ABA2777-D-38`, `-39`, `-40`, … Cho phép tick cả hàng cha hoặc từng mẫu mã riêng.
- Phân trang: **50 dòng/trang, 50 trang** (~2.500 SKU trên tenant này)
- Nút **Chọn** / **Hủy bỏ**

---

## 4. Chi tiết 5 loại chương trình khuyến mại

### 4.1. Giảm giá hóa đơn

Giảm trực tiếp trên tổng hóa đơn.

**Tab Khuyến mại**

- **PHẠM VI ÁP DỤNG** (radio):
  - `Chỉ hàng hóa chưa áp dụng khuyến mại` (mặc định)
  - `Tất cả hàng hóa trong hóa đơn`
- **KHUYẾN MẠI** (radio):
  - `Giảm giá theo [ ] %`
  - `Giảm giá theo số tiền [ ]`

**Tab Điều kiện áp dụng** (radio 3 lựa chọn):

1. `Không yêu cầu điều kiện` *(mặc định)*
2. `Tổng tiền hàng trên hóa đơn lớn hơn hoặc bằng [ ] tính trên [dropdown]` — dropdown 3 giá trị:
   - `Tất cả hàng hóa`
   - `Hàng hóa chưa khuyến mại`
   - `Hàng hóa thuộc nhóm hàng hóa` → hiện thêm khối **NHÓM HÀNG HÓA ÁP DỤNG** với 2 radio:
     - **Hàng hóa thuộc 1 trong các nhóm sau** — *"Hóa đơn có hàng hóa thuộc 1 trong các nhóm dưới đây và tổng giá trị của các hàng hóa đó lớn hơn hoặc bằng giá trị đã thiết lập thì được áp dụng khuyến mại"*
     - **Hàng hóa thuộc tất cả các nhóm sau** — *"Hóa đơn có đủ hàng hóa nằm trong các nhóm dưới đây và tổng giá trị các hàng hóa đó lớn hơn hoặc bằng giá trị đã thiết lập thì được áp dụng khuyến mại"*
     - Lưới: Mã nhóm hàng hóa · Tên nhóm hàng hóa
3. `Yêu cầu số lượng cụ thể` → lưới **HÀNG HÓA ÁP DỤNG**: Mã SKU · Tên hàng hóa · Đơn vị tính · **Lớn hơn hoặc bằng số lượng**

---

### 4.2. Giảm giá hàng hóa

Giảm giá trên từng mặt hàng / nhóm hàng. **Đây là loại đang được dùng cho cả 4 CTKM hiện hành.**

**Khối GIẢM GIÁ**

- **Giảm giá theo** (radio): `Nhóm hàng hóa` (mặc định) | `Hàng hóa`
- **Thiết lập** (radio): `Giảm giá theo %` | `Giảm giá theo số tiền` | `Đồng giá` — kèm 1 ô giá trị để áp hàng loạt cho toàn bộ dòng

**Cột lưới thay đổi theo lựa chọn:**

| Chế độ | Các cột |
|---|---|
| Nhóm hàng hóa | Mã nhóm hàng hóa · Tên nhóm hàng hóa · % giảm giá |
| Hàng hóa + `%` hoặc `số tiền` | Mã SKU · Tên hàng hóa · Đơn vị tính · Giá bán · **% giảm giá** · Giá khuyến mại |
| Hàng hóa + `Đồng giá` | Mã SKU · Tên hàng hóa · Đơn vị tính · Giá bán · Giá khuyến mại *(bỏ cột % giảm giá)* |

Cột **Giá khuyến mại** được tính tự động. VD dữ liệu thật: `AK111-V-36` giá bán `685.000` × 30% → giá khuyến mại `479.500`.

**Nhập khẩu / Xuất khẩu Excel** *(chỉ hiện ở chế độ "Hàng hóa")*

- **Nhập khẩu** mở wizard 3 bước: `1 Chọn tệp nguồn` → `2 Kiểm tra dữ liệu` → `3 Hoàn thành`
  - Vùng kéo-thả tệp hoặc link *Chọn tệp nguồn*
  - Link tải **tệp mẫu**: *"Nếu chưa có tệp mẫu, vui lòng tải tệp mẫu để nhập liệu và nhập khẩu hàng giảm giá tại đây"*
  - Nút *Trợ giúp*, *Tiếp tục*, *Hủy bỏ*
- **Xuất khẩu** chỉ bật khi lưới đã có dòng dữ liệu

**Tab Điều kiện áp dụng** — giống 4.1 nhưng phần "tính trên" là **radio 2 lựa chọn** (`Tất cả hàng hóa` / `Hàng hóa chưa khuyến mại`), **không có** tùy chọn theo nhóm hàng hóa.

---

### 4.3. Giảm giá theo mức

Chiết khấu bậc thang. **Form phức tạp nhất, không có tab "Điều kiện áp dụng"** (điều kiện chính là bảng bậc thang).

**Khối GIẢM GIÁ**

- **Loại giảm theo** — 2 dropdown ghép:

  | Dropdown 1 (căn cứ tính bậc) | Dropdown 2 (cách giảm) |
  |---|---|
  | `Số lượng hàng mua` | `Giảm giá theo phần trăm(%)` |
  | `Giá trị hàng mua` | `Giảm giá theo số tiền` |
  | `Giá trị hóa đơn` | `Đồng giá` |

- **Tính trên** (radio): `Từng hàng hóa trong nhóm khuyến mại` | `Tất cả hàng hóa trong nhóm khuyến mại`
- **Giảm giá theo** (radio): `Hàng hóa` | `Mẫu mã` | `Nhóm hàng hóa`
- **+ Thêm nhóm** — tạo nhiều **nhóm khuyến mại** dạng tab (`Nhóm 1 ✕`, `Nhóm 2 ✕`, …). **Mỗi nhóm có danh sách hàng hóa riêng và bảng bậc thang riêng.**
- **Nhập khẩu / Xuất khẩu** Excel
- Lưới hàng hóa: Mã SKU · Tên hàng hóa · Đơn vị tính
- **Bảng bậc thang**: `Từ` · `Đến` · `% giảm giá` — thêm/xóa dòng tùy ý. Tiêu đề bảng đổi theo Dropdown 1: *"Số lượng mua"* / *"Giá trị hàng mua"* / *"Giá trị hóa đơn"*

**Trường hợp đặc biệt — `Loại giảm theo = Giá trị hóa đơn`:**

- Xuất hiện thêm trường **Giới hạn giá trị giảm** ở khối THỜI GIAN ÁP DỤNG (trần số tiền giảm)
- **Ẩn toàn bộ** phần "Tính trên", "Giảm giá theo", các tab nhóm và lưới hàng hóa
- Chỉ còn duy nhất bảng bậc thang `Từ` / `Đến` / `% giảm giá`

---

### 4.4. Tặng hàng hóa

Tặng quà kèm hóa đơn.

**Khối TẶNG HÀNG HÓA**

- Radio: `Tặng một trong danh sách hàng hóa` (khách chọn 1) | `Tặng tất cả trong danh sách hàng hóa` (tặng hết)
- **Nhập khẩu / Xuất khẩu** Excel
- Lưới: Mã SKU · Tên hàng hóa · Đơn vị tính · Giá bán · **Số lượng**

**Tab Điều kiện áp dụng** — giống 4.1, riêng nhánh "Tổng tiền hàng…" có thêm **checkbox đặc thù**:

> **☐ Tăng số lượng quà tặng theo cấp số nhân của tổng tiền hóa đơn**
>
> *"Ví dụ: CTKM tặng 1 đôi tất khi tổng tiền hóa đơn lớn hơn bằng 200.000đ. Theo cấp số nhân sẽ tặng 2 đôi tất khi tổng tiền lớn hơn bằng 400.000đ, tặng 3 đôi tất khi tổng tiền lớn hơn bằng 600.000đ,…"*

---

### 4.5. Mua m tặng n

Layout **2 cột song song**, không có tab "Điều kiện áp dụng".

#### Cột trái — "Điều kiện mua để được hưởng khuyến mại"

**Radio kiểu tặng:** `Tặng hàng hóa cụ thể` (mặc định) | `Tặng hàng hóa rẻ nhất`

**Chế độ A — `Tặng hàng hóa cụ thể`**

- Radio phạm vi: `Hàng hóa` | `Mẫu mã` (mặc định) | `Nhóm hàng hóa`
- Dòng mô tả động: *"Mua **1 trong những** hàng hóa sau"* (số lấy từ cột SL)
- Nhập khẩu / Xuất khẩu
- Lưới: Mã SKU · Tên hàng hóa · Đơn vị tính · **SL**

**Chế độ B — `Tặng hàng hóa rẻ nhất`**

- Cột phải biến mất, gộp thành 1 khối
- Công thức: **Mua `[m]` hàng hóa được tặng `[n]` hàng hóa rẻ nhất**
- Radio phạm vi + lưới: Mã SKU · Tên hàng hóa · Đơn vị tính

#### Cột phải — "Hàng hóa được tặng" *(chỉ ở Chế độ A)*

- Radio: `Tặng một trong danh sách hàng hóa` | `Tặng tất cả trong danh sách hàng hóa`
- Nhập khẩu / Xuất khẩu
- Lưới: Mã SKU · Tên hàng hóa · Đơn vị tính · **SL tặng**

---

## 5. Màn hình "Thẻ voucher" (`#voucher`)

### 5.1. Danh sách

Thanh công cụ: `+ Thêm mới` · `Nhân bản` · `Sửa` · `Xóa` · `Nạp`
(Nhân bản / Sửa / Xóa bị **disable** khi chưa chọn dòng nào.)

Cột: **Nhà phát hành** · **Voucher** · **Ngày bắt đầu** · **Ngày kết thúc** · **Mô tả** · **Mệnh giá** · **Tổng số lượng** · **Tổng giá trị voucher** · **Tổng giá trị áp dụng** · **Trạng thái**

Có dòng **tổng cộng** ở đầu lưới cho các cột số. Bộ lọc Trạng thái mặc định `Đang theo dõi`.

Hiện trạng tenant: **Không có dữ liệu**.

### 5.2. Dialog "Thêm mới Voucher"

| Trường | Bắt buộc |
|---|---|
| Ngày bắt đầu | |
| Ngày kết thúc | *"Bỏ trống từ ngày, đến ngày nếu không giới hạn thời gian"* |
| **Nhà phát hành** | ✅ |
| **Voucher** (mã) | ✅ |
| **Mệnh giá** | ✅ |
| Mô tả | |

Nút: `Trợ giúp` · `Lưu` · `Lưu và thêm mới` · `Hủy bỏ`

---

## 6. Bảng đối chiếu nhanh 5 loại CTKM

| | Giảm giá hóa đơn | Giảm giá hàng hóa | Giảm giá theo mức | Tặng hàng hóa | Mua m tặng n |
|---|:---:|:---:|:---:|:---:|:---:|
| Tab "Điều kiện áp dụng" | ✅ | ✅ | ❌ | ✅ | ❌ |
| Giảm theo % | ✅ | ✅ | ✅ | — | — |
| Giảm theo số tiền | ✅ | ✅ | ✅ | — | — |
| Đồng giá | ❌ | ✅ | ✅ | — | — |
| Chọn theo Nhóm hàng hóa | chỉ ở điều kiện | ✅ | ✅ | ❌ | ✅ |
| Chọn theo Mẫu mã | ❌ | ❌ | ✅ | ❌ | ✅ |
| Nhiều nhóm khuyến mại | ❌ | ❌ | ✅ | ❌ | ❌ |
| Nhập/Xuất khẩu Excel | ❌ | ✅ | ✅ | ✅ | ✅ |
| Bậc thang (Từ–Đến) | ❌ | ❌ | ✅ | ❌ | ❌ |
| Trần giảm giá | ❌ | ❌ | ✅ (Giá trị hóa đơn) | ❌ | ❌ |

Bộ tính năng dùng chung cho **cả 5 loại**: Tên/Mô tả · Áp dụng cho (4 kiểu khách hàng) · Ngày bắt đầu–kết thúc · Lọc theo thứ trong tuần · Khung giờ · Nhân bản · Trạng thái Đang/Ngừng theo dõi.

---

## 7. Ghi nhận & khuyến nghị

1. **Bộ lọc Trạng thái mặc định là "Đang theo dõi"** — CTKM đã ngừng sẽ biến mất khỏi danh sách. Đây là nguyên nhân phổ biến của báo cáo "mất chương trình khuyến mại".
2. **Chọn điều kiện áp dụng sẽ tự động tắt "Tự động áp dụng khi tính tiền"** — nếu muốn CTKM có điều kiện vẫn tự chạy tại quầy, phải tick lại thủ công trước khi lưu.
3. **4 CTKM hiện hành không có ngày kết thúc** → chạy vô thời hạn cho tới khi ai đó chuyển sang *Ngừng theo dõi*. Nên đặt ngày kết thúc cho các đợt sale.
4. **Không có cơ chế xử lý xung đột hiển thị trên UI** — GIÀY NỮ ONSALE 30% và GIÀY NỮ ONSALE 50% cùng đang chạy. Cần xác minh tại POS xem CTKM nào thắng khi 1 SKU nằm trong cả hai.
5. **Voucher chưa được sử dụng** (0 bản ghi) dù module đã sẵn sàng.
6. **Chỉ trường "Tên chương trình" là bắt buộc** — về mặt UI có thể lưu một CTKM giảm 0% không có hàng hóa nào. Nên có quy ước đặt tên/kiểm tra nội bộ.

---

## 8. Phạm vi chưa kiểm thử

Những mục sau **chưa** được xác minh vì cần ghi dữ liệu vào hệ thống production hoặc thao tác ở màn hình khác:

- Lưu thật một CTKM (validate phía server, thông báo lỗi khi lưu)
- Hành vi thực tế khi tính tiền tại POS (thứ tự ưu tiên, cộng dồn nhiều CTKM)
- Chức năng **Xóa** CTKM và hộp thoại xác nhận
- Luồng **Nhập khẩu Excel** end-to-end (cấu trúc tệp mẫu, bước kiểm tra dữ liệu)
- Nội dung tệp **Xuất khẩu**
- Phát hành và sử dụng **Voucher** thực tế
- Phân quyền theo vai trò và phạm vi áp dụng **đa chi nhánh**
