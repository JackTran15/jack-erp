---
feature: sales-report-km-and-drilldown
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Cột Khuyến mại + hai dialog drill-down

Chỉ `local-backoffice`: toàn bộ feature nằm trong `/reports/sales`, POS không có màn hình nào
đụng tới. Chỉ `desktop`: `BackofficeLayout` là vỏ desktop cố định (`ml-60`), không có
`matchMedia`/`useMediaQuery` ở đâu trong app, và không bug nào ở đây phụ thuộc chiều cao khung nhìn.

Chi nhánh **HCM** là chi nhánh duy nhất có hoá đơn trong kỳ tham chiếu. Chạy trên "Chi nhánh
kiểm thử" thì mọi màn hình rỗng và **mọi bước vẫn pass** — đó là cái bẫy phải tránh, nên
`post_login` của `local-backoffice` chuyển chi nhánh qua UI.

Mỗi `Path` mang một tham số `?v=` khác nhau. Không phải cache-busting cho vui: `page.goto` tới
một URL chỉ khác phần hash là điều hướng cùng-tài-liệu, SPA sẽ **không** remount và bước sau sẽ
chụp đúng báo cáo của bước trước. Query khác nhau ép tải lại thật.

Báo cáo ở phạm vi chi nhánh đơn không tự nạp (`appliedRequest` khởi tạo null), nên mọi bước đều
mở đầu bằng một cú bấm "Lấy dữ liệu".

Mọi bước cũng **tự đặt kỳ** `01/08/2026 – 31/08/2026` thay vì tin vào mặc định. Lần chạy đầu
tiên đỏ toàn bộ vì đúng chuyện này: phiên của tài khoản verify mở lên với kỳ "Hôm nay"
(25/08/2026) chứ không phải "Tháng này", nên mọi báo cáo rỗng và mọi assertion trượt. Một bộ
chứng cứ xanh trên màn hình rỗng còn tệ hơn không có, nên kỳ phải do bước quyết định, không phải
do trạng thái sót lại của tài khoản.

## Số kỳ vọng

Đo bằng SQL trên `erp_dev` ngày 25/08/2026, kỳ **01–31/08/2026**, chi nhánh HCM,
`status <> 'cancelled'` (45 hoá đơn). **Không** lấy từ giao diện.

| Đại lượng | Trước feature | Sau feature | Vì sao phân biệt được |
|---|---|---|---|
| Σ Khuyến mại — báo cáo theo hoá đơn | `9.214.000` | **`8.914.000`** | trừ 300.000 hoàn lại trên dòng `IN` |
| Σ Khuyến mại — `revenue-by-item` | `8.914.000` | `8.914.000` | vốn đã đúng; là mốc đối chiếu |
| Σ Điểm KM — `revenue-by-item` | `0` | **`650.000`** | hết hard-code placeholder |
| Tỷ lệ KM ngày 13/08 | `12,57` | **`21,31`** | `(719.000+500.000)/5.720.000`, có Điểm KM ở tử số |
| Khuyến mại ngày 19/08 | `5.450.000` | **`5.150.000`** | 5.450.000 của phần bán, trừ 300.000 hoàn lại |
| `RTN-202608-00022` / `-00023` | `0` mỗi cái | **`-150.000`** mỗi cái | chỉ thấy được ở cấp hoá đơn, trong dialog |

**Số nào phân biệt được giả thuyết:** `8.914.000` vs `9.214.000` phân biệt "đã sửa" với "chưa
sửa". `-150.000` phân biệt "sửa đúng dấu" với "cộng không dấu" — cộng không dấu cho `9.514.000`
ở tổng và `+150.000` ở hai hoá đơn đó.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Tổng Khuyến mại và Điểm KM của báo cáo ngày | `/reports/sales?v=s1#daily_sales_summary` | `fill input[aria-label="Từ ngày"] = 2026-08-01; fill input[aria-label="Đến ngày"] = 2026-08-31; click button:has-text("Lấy dữ liệu"); wait text=8.914.000` | AC-01, AC-02, AC-03 | `text=8.914.000; no-text=9.214.000; text=650.000` |
| S2 | Ngày 19/08 đã trừ hoàn lại; Tỷ lệ KM khớp công thức | `/reports/sales?v=s2#daily_sales_summary` | `fill input[aria-label="Từ ngày"] = 2026-08-01; fill input[aria-label="Đến ngày"] = 2026-08-31; click button:has-text("Lấy dữ liệu"); wait text=5.150.000` | AC-01, AC-04 | `text=5.150.000; text=21,31` |
| S3 | Bảng kê hóa đơn cho cùng tổng Khuyến mại | `/reports/sales?v=s3#invoice_and_order_list` | `fill input[aria-label="Từ ngày"] = 2026-08-01; fill input[aria-label="Đến ngày"] = 2026-08-31; click button:has-text("Lấy dữ liệu"); wait text=8.914.000` | AC-02 | `text=8.914.000; no-text=9.214.000` |
| S4 | Doanh thu theo mặt hàng: cùng tổng, Điểm KM hết rỗng | `/reports/sales?v=s4#revenue_by_product` | `fill input[aria-label="Từ ngày"] = 2026-08-01; fill input[aria-label="Đến ngày"] = 2026-08-31; click button:has-text("Lấy dữ liệu"); wait text=8.914.000` | AC-02, AC-03 | `text=8.914.000; text=650.000` |
| S5 | Click ô Ngày mở bảng kê hóa đơn của đúng ngày | `/reports/sales?v=s5#daily_sales_summary` | `fill input[aria-label="Từ ngày"] = 2026-08-01; fill input[aria-label="Đến ngày"] = 2026-08-31; click button:has-text("Lấy dữ liệu"); click a:has-text("2026-08-19"); wait text=BẢNG KÊ HÓA ĐƠN` | AC-06 | `text=BẢNG KÊ HÓA ĐƠN; text=Ngày 19/08/2026` |
| S6 | Footer dialog khớp dòng vừa click; hai hóa đơn EXCHANGE hiện khoản hoàn lại | `/reports/sales?v=s6#daily_sales_summary` | `fill input[aria-label="Từ ngày"] = 2026-08-01; fill input[aria-label="Đến ngày"] = 2026-08-31; click button:has-text("Lấy dữ liệu"); click a:has-text("2026-08-19"); wait text=31.600.000` | AC-01, AC-07 | `text=31.600.000; text=36.750.000; text=5.150.000; text=-150.000` |
| S7 | Mã hóa đơn trong dialog mở chi tiết chồng lên | `/reports/sales?v=s7#daily_sales_summary` | `fill input[aria-label="Từ ngày"] = 2026-08-01; fill input[aria-label="Đến ngày"] = 2026-08-31; click button:has-text("Lấy dữ liệu"); click a:has-text("2026-08-19"); click a:has-text("RTN-202608-00022"); wait text=HÓA ĐƠN THANH TOÁN` | AC-08 | `text=HÓA ĐƠN THANH TOÁN; text=BẢNG KÊ HÓA ĐƠN` |
| S8 | Click Tên hàng hóa mở chi tiết theo hóa đơn của đúng SKU | `/reports/sales?v=s8#revenue_by_product` | `fill input[aria-label="Từ ngày"] = 2026-08-01; fill input[aria-label="Đến ngày"] = 2026-08-31; click button:has-text("Lấy dữ liệu"); click a:has-text("Giày nam ABA2777-D-39"); wait text=CHI TIẾT DOANH THU MẶT HÀNG THEO HÓA ĐƠN` | AC-10 | `text=CHI TIẾT DOANH THU MẶT HÀNG THEO HÓA ĐƠN; text=Mã SKU ABA2777-D-39; text=3.000.000` |
| S9 | Bật phân bổ combo thì Tên hàng hóa hết click được | `/reports/sales?v=s9#revenue_by_product` | `fill input[aria-label="Từ ngày"] = 2026-08-01; fill input[aria-label="Đến ngày"] = 2026-08-31; click button:has-text("Chọn báo cáo"); click input[type="checkbox"] >> nth=1; click button:has-text("Đồng ý"); wait text=DD850` | AC-12 | `text=DD850; count table tbody tr td:nth-child(2) a = 0` |
| S10 | Không hồi quy: cột Ngày là text thường, mã hóa đơn vẫn click được | `/reports/sales?v=s10#invoice_and_order_list` | `fill input[aria-label="Từ ngày"] = 2026-08-01; fill input[aria-label="Đến ngày"] = 2026-08-31; click button:has-text("Lấy dữ liệu"); wait text=RTN-202608-00022` | AC-13, AC-14 | `count a:has-text("2026-08-19") = 0; count a:has-text("RTN-202608-00022") = 1` |
| S11 | Cờ `link` của backend không còn nghĩa "click được" | `/reports/sales?v=s11#revenue_detail_by_invoice_and_product` | `fill input[aria-label="Từ ngày"] = 2026-08-01; fill input[aria-label="Đến ngày"] = 2026-08-31; click button:has-text("Lấy dữ liệu"); wait text=ABA2777` | AC-13 | `text=ABA2777; count a:has-text("Giày nam") = 0` |
| S12 | Kỳ không có khoản khuyến mại hoàn lại đọc y hệt trước feature | `/reports/sales?v=s12#daily_sales_summary` | `fill input[aria-label="Từ ngày"] = 2026-08-01; fill input[aria-label="Đến ngày"] = 2026-08-15; click button:has-text("Lấy dữ liệu"); wait text=2.489.000` | AC-05 | `text=2.489.000; text=650.000` |

S12 là cách chứng minh AC-05 mà một lần chụp làm được: kỳ 01–15/08 không chứa hoá đơn EXCHANGE
nào mang khuyến mại hoàn lại, nên `Σ invoices.discount_amount` và `Σ dòng có dấu` bằng nhau
(2.489.000, đo bằng SQL). Con số đó **giống hệt** dưới cả cách tính cũ lẫn mới — đó chính là
điều AC-05 khẳng định. Nếu ai đó bỏ dấu `direction`, kỳ này vẫn xanh nhưng S1 và S6 đỏ ngay.

S11 là bằng chứng cho ADR-02: backend gắn `link: true` cho `itemName` qua `LINK_COLUMNS` toàn
cục, nên ô này **có** cờ trên báo cáo chi tiết — nhưng nó không nằm trong registry FE, nên không
phải link. Nếu ai đó lại buộc quyền click vào cờ backend, bước này đỏ ngay.

## Not verified here

Ba mục dưới đây **không thể** chụp màn hình được, không phải là chưa làm. `evidence_check.py`
vẫn báo đỏ cho chúng vì nó đòi ảnh cho mọi AC trong `verifies:` và không có cơ chế miễn trừ —
đó là hạn chế đã biết của công cụ, không phải khoảng trống của feature.

- **AC-09 (Xuất khẩu trong dialog)** — runner không mở được `.xlsx` để kiểm nội dung, nên chỉ
  chứng minh được "file tải về", không phải "file đúng phạm vi". Kiểm tay ở bước demo UOW-02.
- **AC-11 (lọc SKU chạy trong SQL)** — không quan sát được qua DOM: kết quả giống hệt nhau dù
  lọc ở SQL hay lọc sau khi nạp, chỉ khác lượng I/O. Chứng minh bằng spec khẳng định
  `lineItems.find` nhận `itemCode` trong `where`.
- **AC-15 (định dạng số của cột có link)** — hôm nay không cột **số** nào mang `link: true`
  trong bộ bốn báo cáo bán hàng, nên không dựng được ô để chụp. S11 chứng minh nửa còn lại của
  cùng thay đổi (cờ `link` không còn quyết định click). Phần định dạng nằm ở review T-02-02.
- **AC-12 ở grain Mẫu mã / Nhóm hàng / Nhãn hiệu** — S9 chỉ phủ nhánh `allocateComboRevenue`.
  Ba grain kia đi qua đúng một guard trong `resolveDrillDown`, nhưng ô chọn "Thống kê theo" là
  Radix combobox không có handle ổn định (không `name`, không `data-testid`). Đã kiểm tay:
  grain Mẫu mã cho 0 link trên cột Tên hàng hóa.
- **A-03 (mặt hàng đổi mã giữa kỳ)** — `erp_dev` không có dữ liệu như vậy. Đã chấp nhận rủi ro
  trong register, không dựng fixture.

## Notes

- Mọi con số neo vào `erp_dev` tại ngày chạy 25/08/2026. Kỳ **cố định** 01–31/08/2026 (không
  phải preset trượt "Tháng này"). Nếu ai đó tạo thêm hoá đơn tháng 8 thì phải đo lại bằng SQL
  rồi cập nhật bảng trên — **đừng** sửa số cho khớp màn hình.
- S7 và S10 phụ thuộc mã hoá đơn `RTN-202608-00022` còn tồn tại. Nếu bị xoá, đổi sang mã bất kỳ
  trong dialog ngày 19/08 và cập nhật cả hai bước.
- `Điểm KM` là số **phân bổ**, không phải ghi nhận theo dòng (ADR-04). Kế toán cần biết điều này
  trước khi dùng cột đó đối chiếu với sổ điểm.
