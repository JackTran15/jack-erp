---
feature: stock-summary-ending-total
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Footer "Tồn cuối kỳ" của Tổng hợp nhập xuất tồn kho

Lỗi này là loại mà một `Assert` lỏng sẽ **không** bắt được: trước khi sửa, trang vẫn tải, vẫn
đủ dòng, vẫn có hàng Tổng, chỉ có hai ô in `0`. Mọi assert kiểu "text=Tổng" đều xanh ở cả bản
hỏng lẫn bản đã sửa. Vì vậy cột `Assert` dưới đây khoá **đúng con số**, và con số đó lấy từ
API chứ không đọc trên màn hình.

Toàn bộ 4 bước dùng **một URL duy nhất** — `/reports/inventory#inventory_in_out_stock_summary`.
Đây là chủ ý: `ReportPage` đọc report type từ hash **chỉ lúc mount**, còn bộ chạy dùng lại một
`page` và `goto` từng bước; hai bước chỉ khác hash trên cùng pathname sẽ là điều hướng
cùng-tài-liệu, trang không mount lại và bước sau chụp nhầm báo cáo trước trong khi vẫn xanh.
Giữ nguyên một hash thì cái bẫy đó không tồn tại — cái giá là hai báo cáo anh em phải chuyển
xuống mục "Not verified here" (xem ở dưới, có probe API thay thế).

## Số gốc — lấy từ API, không đọc từ UI

Tài khoản `${LOCAL_BACKOFFICE_EMAIL}`, chi nhánh **HCM** (`${LOCAL_BACKOFFICE_BRANCH_NAME}`),
`POST /reports/inventory/search`, `reportType: inventory-stock-summary`,
`viewMode: single`, `store.storeIds: [HCM]`:

| Kỳ / bộ lọc | total | Tồn đầu | Nhập | Xuất | **Tồn cuối** | **Giá trị tồn cuối** |
|---|---:|---:|---:|---:|---:|---:|
| 01–31/08/2026 | 1.602 | 0 | 2.481 | 445 | **2.036** | **623.069.333,33** |
| 01–15/08/2026 | 1.552 | 0 | 2.228 | 99 | **2.129** | **671.198.000** |
| 01–31/08 + Tên hàng hóa chứa `Dép` | 314 | 0 | 304 | 10 | **294** | **71.632.000** |

Cả ba dòng thoả `0 + nhập − xuất = tồn cuối`. Định dạng là `Intl.NumberFormat("vi-VN")`:
phân cách nghìn là dấu chấm, thập phân là dấu phẩy.

**Bản trước khi sửa trả `endingQty: null, endingValue: null` cho đúng ba truy vấn này**
(probe chạy trên cùng server, sau khi `git stash` bản vá) — và `formatReportNumber` quy `null`
về `0`. Đó chính là con số 0 người dùng báo.

## Steps

Năm bước chạy nối tiếp trên **một page duy nhất, không có lần mount lại nào** (xem đoạn mở
đầu), nên state của lưới — số trang, bộ lọc cột, vị trí cuộn ngang — **chảy từ bước trước sang
bước sau**. Thứ tự dưới đây là một phần của kịch bản: S3 để lại trang 33, S4 dùng chính bộ lọc
cột để kéo lưới về trang 1, S5 mở đầu bằng việc **xoá** bộ lọc đó.

Bảng rộng 24 cột. Ở 1440px, khi cụm **Tồn cuối kỳ** vào khung hình thì cụm **Tồn đầu kỳ** bị
cắt mất cột "Số lượng" — S2 đến S5 đọc được Nhập / Xuất / Tồn cuối nhưng không đọc được tồn đầu.
Nên S1 tồn tại chỉ để chụp cụm Tồn đầu kỳ ở đúng vị trí cuộn khác, trên **cùng một lần tải** với
S2; hai ảnh ghép lại mới đủ bốn số hạng.

Mỗi bước chỉ assert những con số nằm trong ảnh **của chính nó**. Đây không phải chi tiết vụn:
`text=` của Playwright coi một ô đã cuộn khuất trong container là "visible", nên một bước assert
`text=2.036` mà khung hình lại dừng ở cụm "Xuất trong kỳ" sẽ **xanh với một tấm ảnh không chứng
minh gì**. Lần chạy đầu của kịch bản này dính đúng cái đó, hai lần, theo hai hướng cuộn ngược
nhau.

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Kỳ 08/2026, trang 1, cuộn tới cụm **Tồn đầu kỳ** — số hạng đầu của hàng Tổng: 0 / 0, cạnh Nhập 2.481 / 779.048.000 và Xuất 445 / 155.978.666,67 | `/reports/inventory#inventory_in_out_stock_summary` | `fill [aria-label="Từ ngày"] = 2026-08-01; fill [aria-label="Đến ngày"] = 2026-08-31; click button:has-text("Lấy dữ liệu"); wait text=trên 1602 kết quả; scroll th:has-text("Sắp nhận về"); scroll th:has-text("Tồn đầu kỳ")` | AC-02 | `text=2.481; text=779.048.000; text=155.978.666,67; count tbody tr:not([aria-hidden]) = 50` |
| S2 | **Cùng lần tải đó, cuộn sang cụm "Tồn cuối kỳ"** — hàng Tổng hiện 2.036 / 623.069.333,33, đúng bằng `0 + 2.481 − 445` và `0 + 779.048.000 − 155.978.666,67`. Đây là bước chính | `/reports/inventory#inventory_in_out_stock_summary` | `fill [aria-label="Từ ngày"] = 2026-08-01; fill [aria-label="Đến ngày"] = 2026-08-31; click button:has-text("Lấy dữ liệu"); wait text=trên 1602 kết quả; scroll th:has-text("Tồn cuối kỳ")` | AC-01, AC-02 | `text=Tồn cuối kỳ; text=2.036; text=623.069.333,33; count tbody tr:not([aria-hidden]) = 50` |
| S3 | **Trang cuối** (33/33, chỉ còn 2 dòng): hai ô Tổng y nguyên — chúng mô tả cả 1.602 dòng chứ không phải trang đang xem | `/reports/inventory#inventory_in_out_stock_summary` | `click [aria-label="Trang cuối"]; wait text=YMT25019-N-41; scroll th:has-text("Tồn cuối kỳ")` | AC-03 | `text=2.036; text=623.069.333,33; count tbody tr:not([aria-hidden]) = 2` |
| S4 | **Lọc cột "Tên hàng hóa" chứa `Dép`**: 1.602 → 314 dòng, Tổng đi theo tập đã lọc (294 / 71.632.000) — và lưới tự về trang 1 | `/reports/inventory#inventory_in_out_stock_summary` | `fill [aria-label="Lọc Tên hàng hóa"] = Dép; wait text=trên 314 kết quả; scroll th:has-text("Tồn cuối kỳ")` | AC-04 | `text=294; text=71.632.000; no-text=623.069.333,33` |
| S5 | Xoá bộ lọc cột, **thu hẹp kỳ** còn 01–15/08: Tổng đổi sang 2.129 / 671.198.000, vẫn đúng `0 + 2.228 − 99` | `/reports/inventory#inventory_in_out_stock_summary` | `fill [aria-label="Lọc Tên hàng hóa"] = ; fill [aria-label="Từ ngày"] = 2026-08-01; fill [aria-label="Đến ngày"] = 2026-08-15; click button:has-text("Lấy dữ liệu"); wait text=trên 1552 kết quả; scroll th:has-text("Tồn cuối kỳ")` | AC-02, AC-04 | `text=2.129; text=671.198.000; no-text=71.632.000` |

## Đọc bằng chứng

- **S2 là ảnh chẩn đoán**, S1 chỉ bù phần bị cắt. Cả hai trên cùng một lần tải 1.602 dòng, nên
  ghép lại là đủ bốn số hạng để người xem tự cộng trừ mà không cần tin lời mô tả. Ở bản chưa
  sửa, ảnh S1 **giống hệt** (ba cụm kia chưa bao giờ hỏng) còn ảnh S2 có hai ô Tổng cuối cùng là
  `0` trong khi Nhập là 2.481.
- **S3 là tấm gọn nhất để gửi kèm**: trang cuối chỉ có 2 dòng nên bảng hẹp lại, và cả hàng Tổng
  `0 | 2.481 | 779.048.000 | 445 | 155.978.666,67 | 2.036 | 623.069.333,33` nằm trọn trong một
  khung hình.
- **`wait` của mỗi bước là cổng dữ liệu, không phải cổng render.** Lưới dùng `keepPreviousData`,
  và `page.waitForLoadState("networkidle")` mà bộ chạy gọi sau mỗi hành động trả về **ngay lập
  tức** với XHR không-điều-hướng — lần chạy đầu, bước "trang cuối" mất đúng 100ms và chụp được
  một trang có pager ghi "33 trên 33" nhưng thân bảng vẫn là 50 dòng của trang 1. Vì vậy mỗi
  bước chờ một thứ **chỉ tồn tại ở trạng thái mới**: `trên 314 kết quả` (tổng số dòng đến từ
  response), `YMT25019-N-41` (mã chỉ có ở trang cuối).
- **`no-text=` mới là nửa quan trọng của S4 và S5.** `text=2.129` một mình vẫn có thể xanh nhờ
  một dòng dữ liệu tình cờ mang số đó; `no-text=71.632.000` thì đỏ ngay nếu footer còn giữ tổng
  của bước trước. Cặp này phân biệt "footer đã cập nhật" với "ảnh chụp trước khi dữ liệu về".
- **S3** phân biệt hai giả thuyết mà ảnh trang 1 không phân biệt được: "tổng toàn tập" và "tổng
  của trang". Trang cuối chỉ còn 2 dòng, nên tổng-của-trang sẽ ra số nhỏ khác hẳn 2.036.
  `count tbody tr:not([aria-hidden]) = 2` khẳng định đúng là đang ở trang cuối chứ không phải
  trang 1 vừa tải lại — không có nó, bước tự làm mình xanh. `count` **không chờ**, nên nó chỉ
  dùng được sau khi `wait` đã gác xong.
- Mọi `count tbody tr…` đều loại `[aria-hidden]` vì hàng đệm của `report-sticky-header-footer`
  nằm **trong** `<tbody>`; bỏ bộ lọc đó thì S1 đỏ với `got 51`.

## Not verified here

- **AC-05 (hai báo cáo anh em)** — không chụp được trong cùng lần chạy này: cả ba báo cáo kho
  dùng chung pathname `/reports/inventory` và chỉ khác hash, mà `ReportPage` đọc hash lúc mount
  còn bộ chạy dùng lại một `page`. Một bước sang
  `#inventory_in_out_stock_quantity_detail` sẽ chụp lại đúng báo cáo cũ **và vẫn xanh** — tệ hơn
  là không có bằng chứng.
  Thay bằng probe API trên cùng server, cùng kỳ 08/2026, cùng chi nhánh HCM:

  | reportType | total | endingQty | endingValue |
  |---|---:|---:|---:|
  | `inventory-stock-quantity-detail` | 1.632 | **2.036** | — (báo cáo này không có cột giá trị) |
  | `inventory-stock-summary-by-store` | 1.602 | **2.036** | **623.069.333,33** |

  Cả hai đều trả `null` trước khi sửa. Đây là cùng một dòng code (`readPeriodTotals`), nên probe
  đủ mạnh; muốn có ảnh thì phải tách thành feature verify riêng, mỗi báo cáo một thư mục.

- **AC-06 (hai nhánh SQL)** — "Thống kê theo" là một `SingleSelect` của Radix chứ không phải
  `<select>`, nên động từ `select` của bộ chạy không lái được nó, và lái bằng hai `click` liên
  tiếp thì bước sẽ có 6 hành động — quá ngưỡng "một bước nên dưới ba hành động" mà chính bộ
  chạy đặt ra. Đã probe trực tiếp, cùng kỳ và cùng phạm vi với S1:

  | statBy | nhánh SQL | total | endingQty | endingValue |
  |---|---|---:|---:|---:|
  | `item` (mặc định) | `buildItemSqls` | 1.602 | 2.036 | 623.069.333,33 |
  | `parent` | `buildAggSqls` | 903 | **2.036** | **623.069.333,33** |
  | `group` | `buildAggSqls` | 23 | **2.036** | **623.069.333,33** |

  Grain chỉ đổi cách gom dòng, không đổi tập — tổng phải bằng nhau, và bằng nhau thật ở cả hai
  nhánh SQL.

- **Bất biến theo cỡ trang** ở mức truy vấn (`limit` 1 vs 50 cho cùng `totals`) đã probe API và
  khoá bằng unit test `stock-period.service.spec.ts` → *"derives the closing totals instead of
  leaving them unset"*. S2 chứng minh phần người dùng nhìn thấy; test khoá phần hợp đồng.

## Notes

- Chạy bằng `admin@erp.local`, chi nhánh **HCM**. `post_login` trong `.ai/aidlc.yaml` chuyển
  sang chi nhánh này; nếu phiên rơi về "Chi nhánh kiểm thử" thì báo cáo chỉ còn 14 dòng và
  `endingQty` là 14 — bốn bước sẽ đỏ chứ không âm thầm chụp nhầm chi nhánh. Đó là lý do
  `Assert` khoá con số chứ không khoá nhãn.
- **Các mốc số ở đây sẽ dịch khi `erp_dev` có thêm chứng từ.** Trước khi sửa `Assert`: chạy lại
  probe API rồi kiểm `0 + nhập − xuất = tồn cuối`, đừng chỉnh cho vừa màn hình. Đẳng thức mới là
  thứ đang được kiểm; con số chỉ là hiện thân của nó trên dataset hôm nay.
