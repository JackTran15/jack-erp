---
feature: report-sticky-header-footer
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Header và dòng Tổng dính khi cuộn bảng báo cáo

Tính sticky là thứ **DSL assertion không phát biểu được**. Playwright coi một phần tử đã cuộn
khuất trong container vẫn là "visible" (nó chỉ đòi bounding box khác rỗng), nên
`text=Mã SKU` xanh y hệt nhau ở bản có sticky lẫn bản không. Vì vậy các bước dưới đây theo đúng
lối đã dùng cho `barcode-sku-sort`: **Assert khoá phần khung** (đúng báo cáo, dữ liệu đã tải,
đủ 50 dòng, đúng nhãn cột), còn **bằng chứng nằm trong chính tấm ảnh** — ảnh chụp là
viewport-only nên nó phản ánh đúng thứ đang hiện trên màn tại thời điểm đã cuộn.

Đường dẫn xen kẽ pathname có chủ đích. `ReportPage` đọc report type từ URL hash **chỉ lúc
mount** (`ReportPage.tsx:33-38`), còn `ReportUrlSync` ghi ngược state → hash. Hai bước liên tiếp
chỉ khác nhau ở hash sẽ là điều hướng cùng-tài-liệu: trang không mount lại, `ReportUrlSync` viết
hash cũ đè lại, và bước sau chụp nhầm báo cáo trước trong khi vẫn xanh. Nên S4 (`/reports/profit`)
chen giữa S3 và S5 (`/reports/sales`) để mỗi lần đổi báo cáo đều là điều hướng thật.

S4 đứng ngay sau S3 và dùng **đúng cùng một URL**, có chủ đích: nó chỉ đổi kỳ rồi bấm lại
"Lấy dữ liệu" nên không cần mount lại. Đẩy nó xuống cuối bảng sẽ khiến nó đứng sau S6 — cùng
`/reports/sales` nhưng khác hash — tức đúng cái bẫy điều hướng cùng-tài-liệu nói ở trên.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Nền: bảng đã tải 50 dòng, chưa cuộn — header, hàng lọc và hàng Tổng ở đúng vị trí gốc | `/reports/sales#revenue_detail_by_invoice_and_product` | `fill [aria-label="Từ ngày"] = 2026-08-01; fill [aria-label="Đến ngày"] = 2026-08-31; click button:has-text("Lấy dữ liệu"); wait tbody tr:nth-child(50)` | AC-06 | `text=Mã SKU; text=Tổng; count tbody tr:not([aria-hidden]) = 50` |
| S2 | **Cuộn dọc xuống giữa bảng** — header + hàng lọc dính đỉnh, hàng Tổng dính đáy, cùng một khung hình | `/reports/sales#revenue_detail_by_invoice_and_product` | `fill [aria-label="Từ ngày"] = 2026-08-01; fill [aria-label="Đến ngày"] = 2026-08-31; click button:has-text("Lấy dữ liệu"); wait tbody tr:nth-child(50); scroll tbody tr:nth-child(50); scroll tbody tr:nth-child(22)` | AC-01, AC-02 | `text=Mã SKU; text=Tổng; count tbody tr:not([aria-hidden]) = 50` |
| S3 | **Cuộn dọc + cuộn ngang hết cỡ** — cột ghim "Ngày" đè lên header, thân bảng và hàng Tổng | `/reports/sales#revenue_detail_by_invoice_and_product` | `fill [aria-label="Từ ngày"] = 2026-08-01; fill [aria-label="Đến ngày"] = 2026-08-31; click button:has-text("Lấy dữ liệu"); wait tbody tr:nth-child(50); scroll tbody tr:nth-child(50); scroll tbody tr:nth-child(22); scroll tbody tr:nth-child(22) td:last-child` | AC-03 | `text=Ngày; text=Tổng; count tbody tr:not([aria-hidden]) = 50` |
| S4 | **Kỳ không có kết quả** — hàng Tổng vẫn nằm sát đáy vùng cuộn nhờ hàng đệm, không trôi lên dưới hàng lọc | `/reports/sales#revenue_detail_by_invoice_and_product` | `fill [aria-label="Từ ngày"] = 2025-01-01; fill [aria-label="Đến ngày"] = 2025-01-31; click button:has-text("Lấy dữ liệu"); wait text=0 kết quả` | AC-07 | `text=Tổng; text=0 kết quả; count tbody tr:not([aria-hidden]) = 0` |
| S5 | Báo cáo **không có dòng Tổng** ("Kết quả kinh doanh", `summaryLabel` rỗng có chủ đích) — cuộn dọc, header vẫn dính, không lỗi | `/reports/profit#business_results` | `fill [aria-label="Kỳ hiện tại — Từ ngày"] = 2026-08-01; fill [aria-label="Kỳ hiện tại — Đến ngày"] = 2026-08-31; click button:has-text("Lấy dữ liệu"); wait tbody tr:nth-child(5); scroll tbody tr:last-child` | AC-05 | `text=Kết quả kinh doanh; text=Khoản mục` |
| S6 | Báo cáo **có group header** ("Bảng kê hóa đơn và đơn hàng") — cuộn dọc, đủ **ba** tầng header dính và xếp liền nhau | `/reports/sales#invoice_and_order_list` | `fill [aria-label="Từ ngày"] = 2026-08-01; fill [aria-label="Đến ngày"] = 2026-08-31; click button:has-text("Lấy dữ liệu"); wait tbody tr:nth-child(20); scroll tbody tr:nth-child(20)` | AC-01 | `text=Doanh thu; text=Khách hàng thanh toán` |

S5 dùng selector ngày **khác** các bước còn lại. "Kết quả kinh doanh" là báo cáo so sánh hai kỳ
nên `ReportPageHeaderFilter` render nhánh `PeriodCompareHeaderFilter` với **bốn** ô ngày mang
nhãn `Kỳ trước — …` / `Kỳ hiện tại — …` (`ReportPageHeaderFilter.tsx:54-104`); nhãn trần
`Từ ngày` chỉ tồn tại ở nhánh một kỳ (`:146,159`). Lần chạy đầu tôi dùng nhãn trần cho cả năm
bước và bước đó đỏ ngay ở `fill` — ảnh của lần đó cho thấy bảng trống vì nút "Lấy dữ liệu" chưa
kịp được bấm, đúng kiểu "ảnh trông như bằng chứng" mà bộ này sinh ra để chặn.

## Đọc bằng chứng

- **S1 → S2** là cặp quyết định. Cùng một bảng, cùng 50 dòng; S1 nhìn thấy header vì bảng chưa
  cuộn, S2 nhìn thấy header **dù đã cuộn qua dòng thứ 22**. Ở bản chưa sửa, ảnh S2 chỉ có toàn
  dòng dữ liệu: không tên cột, không hàng Tổng. Hai lần `scroll` trong S2 là có chủ đích —
  `scrollIntoViewIfNeeded` cuộn tối thiểu, nên phải xuống đáy trước rồi kéo ngược lên dòng 22 thì
  mới dừng ở **giữa** bảng; nếu chỉ cuộn xuống đáy thì hàng Tổng lộ ra một cách tự nhiên và ảnh
  không chứng minh được gì về `bottom: 0`.
- **S4** là trường hợp mà `position: sticky` một mình **không** xử lý được: bảng rỗng thì
  `<table>` chỉ cao bằng header + hàng lọc + hàng Tổng, `bottom: 0` không có gì để bám. Đo tại
  1440×900 trước khi sửa: vùng cuộn 674px, thead 111px, tfoot 32px, mỗi dòng 41px ⇒ **dưới 13
  dòng** là hàng Tổng trôi lên nằm ngay dưới hàng lọc. Ảnh S4 cho thấy nó nằm sát đáy, và
  `count tbody tr:not([aria-hidden]) = 0` khẳng định đúng là bảng rỗng chứ không phải bảng có
  dữ liệu — hàng đệm bị loại khỏi phép đếm nên nó không tự làm mình xanh.
- **S3** là bằng chứng cho thang z-index ở ADR-02: cột **Ngày** phải đè lên mọi thứ trượt qua
  dưới nó ở **cả ba** vùng. Sai một mức z thì chữ của cột khác lộ lên trên cột ghim — nhìn ảnh
  là thấy ngay, `text=` thì không.
- **S6** là bằng chứng cho phép **đo** chiều cao. Báo cáo này có group nên hàng lọc nằm ở
  `top = h1 + h2`, cả hai đều đo trên DOM thật. Nếu phép đo hỏng, ba tầng chồng lên nhau hoặc hở
  ra một dải trống — cùng một tấm ảnh phủ luôn nhánh `hasGroups` mà S1–S3 không chạm tới.
- **S5** khoá nhánh không có `<tfoot>`: `withStickyBottom` không bao giờ được gọi, và trang vẫn
  phải chạy bình thường.

## Not verified here

- **AC-04 (kéo cột cho nhãn xuống dòng → hàng lọc tụt xuống theo)** không nằm trong `verifies`
  của UOW-01, có chủ đích. Ngữ pháp tương tác của bộ chạy có đúng năm động từ —
  `click / fill / select / wait / scroll` (`runner/actions.mjs:22`) — không có động từ kéo, mà
  đổi chiều rộng cột ở bảng này chỉ làm được bằng cách kéo tay nắm resize; hộp thoại **Thiết lập
  cột hiển thị** chỉ có ô hiện/ẩn và ô ghim, không có ô nhập chiều rộng. Đòi ảnh cho AC-04 là sai
  thể loại chứ không phải bỏ sót.
  Phần **cơ chế** của AC-04 có bằng chứng gián tiếp ngay trong bảng Steps: `top` của hàng lọc ở
  S6 là số đo thật chứ không phải hằng số, nên nếu `ResizeObserver` không chạy thì S6 đã hỏng.
  `T-01-02` vẫn giữ `verifies: [AC-04]` nên độ phủ AC trong `06-traceability.md` không thủng.

  Ngoài ra AC-04 **đã được kiểm bằng tay**, bằng một kịch bản Playwright rời có thể chạy lại:
  `manual-check-resize.mjs` cạnh tệp này (`node manual-check-resize.mjs out.png`, cần dev server
  ở :3000). Nó đăng nhập, mở đúng báo cáo, rồi kéo tay nắm resize của cột **Tên hàng hóa** hẹp
  dần cho tới khi nhãn cột xuống hai dòng. Kết quả: hàng tiêu đề cao thêm và hàng ô lọc tụt xuống
  theo, không hở khe, không chồng — đúng AC-04.

- **Cảnh báo `ResizeObserver loop completed with undelivered notifications`** cũng kiểm bằng kịch
  bản đó chứ không qua bảng Steps, vì hai lý do: `failure_signals.console_errors` đang tắt trong
  `.ai/aidlc.yaml`, và quan trọng hơn — Chrome bắn cảnh báo này ra **`pageerror`** chứ không phải
  `console`, mà bộ chạy chỉ lắng nghe `page.on("console")` (`runner/run.mjs:367`). Bật
  `console_errors` lên cũng sẽ không bắt được nó. Kịch bản rời lắng nghe **cả hai**, chạy qua sáu
  lần đổi kích thước khung nhìn cộng một lượt kéo cột: **0 lỗi, 0 cảnh báo ResizeObserver**.
- **Khung nhìn `laptop` (1440×720)** đã chạy xanh 5/5, nhưng trong **một lần gọi riêng**, không
  nằm trong bằng chứng gác cổng này. Lý do không phải tính năng mà là xung đột giữa hai thiết
  kế: `refresh()` của API **thu hồi jti cũ** khi xoay token (`auth.service.ts:164`) nên refresh
  token là dùng-một-lần, còn bộ chạy đăng nhập **một lần cho mỗi environment** rồi phát lại đúng
  một `storageState` cho mọi viewport (`runner/run.mjs:352-355`). Context desktop tiêu mất token,
  context laptop phát lại token đã bị thu hồi và bị đá về trang đăng nhập — mọi bước của viewport
  thứ hai đỏ với `redirected to sign-in`, bất kể chụp màn gì. Đây là lý do mọi feature khác trong
  repo này đều chỉ khai `viewports: [desktop]`.
  Ảnh của lần chạy laptop đó thực ra là bằng chứng **mạnh hơn** desktop: ở 720px, dòng dữ liệu bị
  cắt ở **cả hai** mép — một dòng cụt chui dưới hàng ô lọc và một dòng cụt chui dưới hàng Tổng —
  tức cả `top` lẫn `bottom: 0` đều đang che nội dung đang trượt qua.
- Mọi `count tbody tr…` đều loại `[aria-hidden]`, vì hàng đệm của T-01-04 nằm **trong**
  `<tbody>`. Bỏ bộ lọc đó thì S1–S3 đỏ với `got 51` — đúng như lần chạy đầu sau khi thêm hàng
  đệm, và đó là assertion làm đúng việc của nó: nó bắt được một thay đổi cấu trúc DOM mà mắt
  nhìn ảnh không thấy.
- Con số 50 trong `count tbody tr:not([aria-hidden]) = 50` là cỡ trang mặc định, không phải số dòng của dữ liệu —
  nó khẳng định trang đã đổ đủ dữ liệu để có thứ mà cuộn. Kỳ 01/08/2026–31/08/2026 phải còn dữ
  liệu ở chi nhánh mà `post_login` chuyển sang; nếu hết, đổi kỳ ở cả bốn bước chứ đừng bỏ `Assert`.
