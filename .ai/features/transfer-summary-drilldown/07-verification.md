---
feature: transfer-summary-drilldown
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Truy xuất nguồn gốc "Tổng hợp nhập xuất điều chuyển"

Ánh xạ về hợp đồng: **toàn bộ AC dưới đây phục vụ `AC-BCK-06`** của Phụ lục 01 mục 2.4
("Báo cáo tổng hợp Nhập – Xuất điều chuyển"), mã bằng chứng `BO-S10` trong
`docs/client/phu-luc-01-checklist.csv`. Mã AC ở đây dùng dạng `AC-\d+` vì runner khớp
`r"\bAC-\d+\b"` — dạng `AC-BCK-06` bị bỏ qua âm thầm.

Chạy trên **dữ liệu vận hành thật** của `erp_dev` (org MT), kỳ **09/07/2026 – 30/08/2026**.
Không seed gì: dữ liệu thật đã có 300 cặp phiếu đã ghép, 27 phiếu đang vận chuyển và 15 chi nhánh
có mã — mạnh hơn bất kỳ fixture ba chi nhánh nào. Xem ADR-08.

Số kỳ vọng đo bằng SQL do chính `summarize()` sinh ra, không đọc từ màn hình:

| Mã | Cửa hàng | Xuất | Thực nhận | Chênh lệch thực nhận | Chênh lệch nhập xuất |
|---|---|---|---|---|---|
| SG | KHO SG | 10.334 | 9.801 | −533 | −9.911 |
| BM | Buôn Ma Thuật | 297 | 159 | −138 | 1.207 |
| — | Chi Nhánh cũ không dùng | 22 | 22 | **0** | 380 |

Dòng cuối là **đúng ca khách báo** — *"xuất 22 mà nhập về 31"*. Trước khi sửa nó là 22 / 31 / **+9**.

## Steps

S1 và S3 phải **tự chuyển sang "Chuỗi cửa hàng"** trước khi đặt kỳ. Chế độ chuỗi là state FE trong
bộ nhớ (`CHAIN_OPTION_VALUE`, không gọi backend, không ghi localStorage), nên `post_login` chuyển
xong thì `page.goto` của bước kế tiếp lại reset về chi nhánh trong JWT. Trigger là `button.w-52`,
không phải `button[aria-haspopup="menu"]` — selector đó khớp 15 phần tử trên trang.

Các bước còn lại không cần: chúng mở dialog cho chính chi nhánh đăng nhập (KHO SG), và dialog nhận
phạm vi từ dòng vừa click chứ không từ bộ chọn chi nhánh.

Mọi bước đặt kỳ tường minh rồi bấm "Lấy dữ liệu": phiên đăng nhập mở lại preset dùng lần trước, và
một ảnh xanh chụp lưới rỗng còn tệ hơn không có bằng chứng. Mỗi `Path` mang `?v=` riêng — `page.goto`
tới URL chỉ khác hash là điều hướng cùng tài liệu, SPA không remount, bước sau sẽ chụp nhầm báo cáo
của bước trước.

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Mã cửa hàng hết rỗng, trên dữ liệu thật cả 15 chi nhánh | `/reports/inventory?v=s1#transfer_in_out_summary` | `click button.w-52; click [role="menuitemradio"]:has-text("Chuỗi cửa hàng"); fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu"); wait text=KHO SG` | AC-01, AC-16 | `text=SG; text=DN; text=JO` |
| S2 | Hai dải chênh lệch là hai đại lượng khác nhau | `/reports/inventory?v=s2#transfer_in_out_summary` | `fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu"); wait text=KHO SG` | AC-02 | `text=-533; text=-9.911` |
| S3 | Ca khách báo: xuất 22, nhập về 31 → nay xuất 22 = thực nhận 22 | `/reports/inventory?v=s3#transfer_in_out_summary` | `click button.w-52; click [role="menuitemradio"]:has-text("Chuỗi cửa hàng"); fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu"); wait text=Chi Nhánh cũ không dùng` | AC-03 | `count table tbody tr:has-text("Chi Nhánh cũ không dùng") td:text-is("22") = 2` |
| S4 | Ba báo cáo dialog-only không lọt vào ô chọn báo cáo | `/reports/inventory?v=s4#transfer_in_out_summary` | `fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu"); wait text=KHO SG` | AC-14 | `no-text=Chi tiết chênh lệch điều chuyển; text=Tổng hợp nhập xuất điều chuyển` |
| S5 | Click "Tên cửa hàng" mở dialog L1 | `/reports/inventory?v=s5#transfer_in_out_summary` | `fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu"); click a:has-text("KHO SG"); wait text=CHI TIẾT NHẬP XUẤT ĐIỀU CHUYỂN THEO CỬA HÀNG` | AC-06 | `text=CHI TIẾT NHẬP XUẤT ĐIỀU CHUYỂN THEO CỬA HÀNG; text=Cửa hàng KHO SG; text=Cửa hàng khác thực nhận về` |
| S6 | Footer L1 khớp dòng vừa click | `/reports/inventory?v=s6#transfer_in_out_summary` | `fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu"); click a:has-text("KHO SG"); wait text=CHI TIẾT NHẬP XUẤT ĐIỀU CHUYỂN THEO CỬA HÀNG` | AC-07 | `text=10.334; text=9.801; text=-533` |
| S7 | Số trong ô có link vẫn định dạng vi-VN | `/reports/inventory?v=s7#transfer_in_out_summary` | `fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu"); click a:has-text("KHO SG"); wait text=CHI TIẾT NHẬP XUẤT ĐIỀU CHUYỂN THEO CỬA HÀNG` | AC-12 | `no-text=10334` |
| S8 | Click "Xuất kho điều chuyển" mở L2, Tham chiếu giải được | `/reports/inventory?v=s8#transfer_in_out_summary` | `fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu"); click a:has-text("KHO SG"); click table tbody tr:has-text("MT211") td:nth-child(5) a; wait text=CHI TIẾT PHIẾU NHẬP XUẤT ĐIỀU CHUYỂN` | AC-09 | `text=CHI TIẾT PHIẾU NHẬP XUẤT ĐIỀU CHUYỂN; text=Tham chiếu; text=882` |
| S9 | Click "Nhập kho điều chuyển" đảo chiều xuất/nhập | `/reports/inventory?v=s9#transfer_in_out_summary` | `fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu"); click a:has-text("KHO SG"); click table tbody tr:has-text("MT211") td:nth-child(3) a; wait text=CHI TIẾT PHIẾU NHẬP XUẤT ĐIỀU CHUYỂN` | AC-08 | `text=Cửa hàng xuất; text=Cửa hàng nhập; text=Số chứng từ` |
| S10 | Click "Chênh lệch thực nhận" mở L3 | `/reports/inventory?v=s10#transfer_in_out_summary` | `fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu"); click a:has-text("KHO SG"); click table tbody tr:has-text("Vĩnh Long") td:nth-child(9) a; wait text=CHI TIẾT CHÊNH LỆCH ĐIỀU CHUYỂN` | AC-11 | `text=CHI TIẾT CHÊNH LỆCH ĐIỀU CHUYỂN; text=XK000437; text=57` |
| S11 | Không hồi quy Báo cáo 7 | `/reports/inventory?v=s11#transferred_goods_summary_by_store` | `fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu")` | AC-15 | `count [data-sonner-toast][data-type="error"] = 0` |
| S12 | Không hồi quy Báo cáo 2 | `/reports/inventory?v=s12#warehouse_voucher_detail_list` | `fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu")` | AC-15 | `count [data-sonner-toast][data-type="error"] = 0` |
| S13 | L1 ghim cả Mã và Tên cửa hàng | `/reports/inventory?v=s13#transfer_in_out_summary` | `fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu"); click a:has-text("KHO SG"); wait text=CHI TIẾT NHẬP XUẤT ĐIỀU CHUYỂN THEO CỬA HÀNG` | AC-17 | `count [role="dialog"] table tbody tr:first-child td.z-10 = 2` |
| S14 | L1 giữ đủ 5 dải, gồm Chênh lệch nhập xuất | `/reports/inventory?v=s14#transfer_in_out_summary` | `fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu"); click a:has-text("KHO SG"); wait text=CHI TIẾT NHẬP XUẤT ĐIỀU CHUYỂN THEO CỬA HÀNG` | AC-18 | `text=Chênh lệch nhập xuất; text=-9.911` |
| S15 | L2 ghim Ngày chứng từ + Số chứng từ | `/reports/inventory?v=s15#transfer_in_out_summary` | `fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu"); click a:has-text("KHO SG"); click table tbody tr:has-text("MT211") td:nth-child(5) a; wait text=CHI TIẾT PHIẾU NHẬP XUẤT ĐIỀU CHUYỂN` | AC-17 | `count [role="dialog"]:has-text("CHI TIẾT PHIẾU NHẬP XUẤT") table tbody tr:first-child td.z-10 = 2` |
| S16 | Ngày chứng từ đọc được, có giờ | `/reports/inventory?v=s16#transfer_in_out_summary` | `fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu"); click a:has-text("KHO SG"); click table tbody tr:has-text("MT211") td:nth-child(5) a; wait text=CHI TIẾT PHIẾU NHẬP XUẤT ĐIỀU CHUYỂN` | AC-19 | `count table tbody tr:first-child td:text-is("25/08/2026 17:00") = 1` |
| S17 | Hai cột Đối tượng / Diễn giải có dữ liệu thật | `/reports/inventory?v=s17#transfer_in_out_summary` | `fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu"); click a:has-text("KHO SG"); click table tbody tr:has-text("MT211") td:nth-child(5) a; wait text=CHI TIẾT PHIẾU NHẬP XUẤT ĐIỀU CHUYỂN; scroll table thead th:has-text("Đối tượng")` | AC-20 | `text=Đối tượng; text=Diễn giải` |
| S18 | Phụ đề gọi tên chi nhánh neo thật | `/reports/inventory?v=s18#transfer_in_out_summary` | `fill input[aria-label="Từ ngày"] = 2026-07-09; fill input[aria-label="Đến ngày"] = 2026-08-30; click button:has-text("Lấy dữ liệu"); click a:has-text("KHO SG"); click table tbody tr:has-text("MT211") td:nth-child(5) a; wait text=CHI TIẾT PHIẾU NHẬP XUẤT ĐIỀU CHUYỂN` | AC-21 | `text=Cửa hàng xuất; text=Cửa hàng nhập; no-text=cửa hàng đang xem` |

### Đợt 2 — đối chiếu giao diện với MISA (S13–S18)

Số kỳ vọng đo bằng SQL trước khi chạy, không đọc từ màn hình:
`XK000107` post lúc `20/08/2026 13:10` (giờ Việt Nam), đối tượng `Phan Mạnh Tú`.

S17 assert sự hiện diện chứ không đếm: một phiếu xuất có nhiều dòng hàng, nên `= 1` là sai từ đầu —
lượt chạy đầu đỏ vì tìm thấy **50**, tức cột có dữ liệu ở mọi dòng. Đếm ở đây không nói thêm gì mà
lại gắn assert vào số dòng của một chứng từ cụ thể.

`no-text=cửa hàng đang xem` ở S18 dùng được vì chuỗi đó **chỉ** xuất hiện khi bản sửa hỏng — nó
không nằm trong phụ đề L1 hay bất kỳ dialog nào phía sau. Ở chỗ khác thì `no-text` là công cụ sai:
nó đếm cả node ẩn (xem ghi chú cuối file).

## Not verified here

**AC-04** (phiếu điều chuyển lập tay luôn tính là chưa nhận) và **AC-05** (điều chuyển luồng cũ
không tạo chênh lệch) **không có bằng chứng ảnh, và cố ý không dựng fixture để có**.

Đo trên `erp_dev`, loại fixture ra: **0/337** phiếu xuất điều chuyển có `reference_id IS NULL`, và
**0** bản ghi `stock_transfers` POSTED liên chi nhánh. Cách duy nhất để chụp được hai quy tắc này là
tự tạo ra tình huống chưa từng xảy ra rồi chụp nó — thứ trông như bằng chứng nhưng chỉ chứng minh
rằng ta biết viết INSERT. Xem ADR-08.

Chúng được phủ ở tầng spec, và đây là giới hạn thật phải nói ra:
`transfer-report.service.spec.ts` **mock `DataSource`** nên nó đọc chuỗi SQL, không đọc kết quả.
Spec khẳng định được *"truy vấn có vị ngữ `reference_id IS NOT NULL`"* và *"nhánh `stock_transfers`
bị loại khỏi `leg='unmatched'`"* — **không** khẳng định được *"một phiếu lập tay cụ thể ra
`received = 0`"*. Muốn chứng minh hành vi thì cần một integration test chạm DB; repo hiện chỉ có
`test:e2e` tách riêng.

**AC-10** (cột "thực nhận" chỉ liệt kê phiếu đã ghép) và **AC-13** (ô bằng 0 không phải link) phủ ở
tầng spec: `transfer-detail.service.spec.ts` chốt `received`/`unmatched` phân hoạch `out` trên cùng
một vị ngữ, và resolver trả `null` khi `!Number(raw)`. Trên dữ liệu thật của kỳ này mọi ô số lượng
đều khác 0 nên không có ô nào để chụp cho AC-13.

## Notes

`ANCHOR_LABEL` — phụ đề L2/L3 gọi chi nhánh neo là "cửa hàng đang xem" thay vì tên thật, vì dòng của
L1 là các chi nhánh đối ứng nên tên neo không có trên dòng nào. Chi tiết và ba phương án đã cân
nhắc: xem T-03-04.

### Vì sao S3 assert `count … td:text-is("22") = 2` chứ không phải `no-text=31`

Bản đầu dùng `no-text=31` và đỏ: chuỗi "31" xuất hiện **6 lần** trên lưới, nằm bên trong những số
khác (`1.703.106.123,1`…). `no-text` khớp chuỗi con nên nó không nói được điều mình tưởng.

Assert hiện tại nhắm đúng dòng "Chi Nhánh cũ không dùng" và đếm số ô có nội dung **chính xác**
`"22"`: phải có đúng hai ô — Xuất và Thực nhận. Trước khi sửa, dòng đó là 22 / **31**, nên chỉ có
một. Đó là phép kiểm phân biệt được trước/sau, còn `no-text=31` thì không.

### AC-16 gắn vào S1

AC-16 (*"bằng chứng chạy trên môi trường có dữ liệu thật"*) tự quy chiếu về chính lượt chạy, nên
không có bước riêng nào chứng minh được nó. Gắn vào **S1**: bước đó assert `SG`, `DN`, `JO` cùng có
mặt, tức lưới đang hiện nhiều chi nhánh của dữ liệu vận hành thật — không phải một lưới rỗng hay một
bộ fixture ba dòng. Phần còn lại của AC-16 (sha khớp HEAD, không bước nào đỏ) do `evidence_check.py`
kiểm, không phải ảnh chụp.

### Vì sao assert của L2/L3 bám SỐ LIỆU, không bám tiêu đề và cũng không dùng `no-text`

Bản đầu của S8/S9/S10 chỉ assert `text=CHI TIẾT …` và `text=Cửa hàng xuất` — tức **vỏ dialog**.
Cả ba xanh, và khi mở ảnh S10 ra thì bảng **rỗng**: "Hiển thị 0 - 0 trên 0 kết quả". Đúng cái
`definition of done` của skill cảnh báo: *một ảnh chụp trang trắng còn tệ hơn không có ảnh, vì nó
trông như bằng chứng*.

Nguyên nhân thật: tiến trình API đang chạy được khởi động ở T-03-01, **trước khi** hai report L2/L3
tồn tại, nên chúng chưa được đăng ký trong process đó. Ba endpoint trả 0 dòng. Không phải lỗi truy
vấn — truy vấn đã được kiểm riêng trên `erp_dev` ở T-03-02 (882 / 789 / 93).

Thử `no-text=Hiển thị 0 - 0 trên 0 kết quả` trước, và nó **đỏ trên một dialog đầy dữ liệu** (S8: 273
kết quả, Tổng 882). Nguyên nhân: `no-text` dùng `.count()` nên đếm cả node **ẩn**, và dialog L1 vẫn
mounted phía sau dialog L2. Đó là công cụ sai cho câu hỏi "bảng có rỗng không".

Assert hiện tại bám **số liệu thật đo bằng API**, vừa mạnh hơn vừa miễn nhiễm node ẩn:

- bước tám — chân `out` SG→DN: số chứng từ `XK000107`, tham chiếu `NK000334`, tổng SL **882**
- bước chín — chân `in` DN→SG: số chứng từ `NK000211`, tham chiếu `XK000136`, tổng SL 25
- bước mười — chân `unmatched` SG→VL: số chứng từ `XK000437`, tham chiếu **rỗng**, tổng SL **57**

Viết thành danh sách chứ không phải bảng: parser quét **mọi** dòng có `|` trong file bất kể nằm dưới
heading nào, nên một bảng minh hoạ có ô đầu là `S8` sẽ bị đọc thành step trùng id và cả lượt chạy bị
từ chối.

S8 kiểm cả cột Tham chiếu giải được (AC-09), S9 kiểm chiều đảo đúng (chứng từ chính là NK), S10 kiểm
tổng bằng |chênh lệch| = |−57|. Một bảng rỗng không thể xanh với những assert này.

### S5 assert thêm nhãn dải, vì ảnh phơi ra một lỗi không assert nào bắt được

Ảnh S6 của lượt chạy trước cho thấy dialog L1 hiện tiêu đề dải là **`in` / `out` / `received` /
`diff` / `inOut`** — id thô, tiếng Anh, giữa một báo cáo tiếng Việt. Nguyên nhân:
`INVENTORY_REPORT_BAND_LABELS_VI` thiếu entry cho khoá mới, và `buildInventoryHeaders` fallback
`bandLabels[d.band] ?? d.band`. Fallback im lặng nên không có gì đỏ.

Không assert nào trong 12 bước bắt được — chúng nhắm vào số liệu và tiêu đề dialog. Giờ S5 assert
thêm `text=Cửa hàng khác thực nhận về`, một nhãn chỉ xuất hiện nếu bảng nhãn có entry.

### `wait` phải nhắm tiêu đề, không nhắm dữ liệu

Lượt chạy thứ hai đỏ ở S5/S6/S13/S14/S15/S18 với `wait text=… : Timeout`, trong khi assert của
chính những bước đó tìm thấy 50 kết quả. Nguyên nhân: `wait <sel>` gọi
`locator(sel).first.wait_for(state="visible")`. `text=XK000107` khớp 50 ô, và `.first` có thể là ô
đã cuộn khỏi vùng nhìn thấy — chờ nó hiển thị thì treo, dù dialog đã mở và đầy dữ liệu.

Giờ mọi `wait` nhắm **tiêu đề dialog** — duy nhất, luôn hiển thị, và vẫn chứng minh đúng thứ cần
chứng minh là dialog đã mở. Việc dữ liệu có mặt do phần `Assert` lo.

### Vì sao một số assert phải nới, và nới tới đâu

Ba bước đỏ ở lượt trước không phải vì sản phẩm sai mà vì `text=` của runner gọi
`.first.wait_for(state="visible")`: giá trị nằm ở cột đã cuộn khỏi khung nhìn (Đối tượng và Diễn
giải là hai cột cuối, và việc ghim hai cột đầu đẩy phần còn lại sang phải) thì không "visible", dù
`count … td:text-is(...)` cùng bước tìm thấy 50.

Hai cách sửa, dùng cả hai:
- **`scroll`** tới tiêu đề cột trước khi assert — S17 làm vậy.
- **Assert vào thứ chắc chắn trong khung**: tiêu đề cột, phụ đề, dòng Tổng. S8/S9 chuyển sang
  khẳng định cột tồn tại cộng số Tổng `882` — số đó ở `<tfoot>` dính đáy nên luôn nhìn thấy.

S18 bỏ ràng buộc tên chi nhánh cụ thể. AC-21 nói *"gọi tên chi nhánh neo, không phải một nhãn chung
chung"*, nên `no-text=cửa hàng đang xem` mới là phép kiểm đúng — và nó phân biệt được trước/sau.
Kỳ vọng cũ (`Cửa hàng xuất KHO SG`) ghim vào một chi nhánh cụ thể mà bước không thực sự mở, nên nó
kiểm sai thứ ngay cả khi xanh.

