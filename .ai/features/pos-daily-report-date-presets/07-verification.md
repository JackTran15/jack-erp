---
feature: pos-daily-report-date-presets
environments: [local-pos]
viewports: [desktop, laptop]
---

# Verification — POS Báo cáo theo ngày: lọc được các mốc thời gian

Chạy trên chi nhánh HCM (`${LOCAL_POS_BRANCH_ID}`). Kỳ mặc định của trang là **"Hôm nay"**
(`useState("TODAY")`), và chi nhánh này **không có hoá đơn nào của hôm nay** — nên trạng thái
xuất phát là một báo cáo rỗng. Đó là thứ làm bằng chứng đọc được: mỗi preset có dữ liệu phải
kéo báo cáo ra khỏi số 0.

Hai viewport là có chủ ý. `desktop` 1440×900 **không** tái hiện được lỗi — popover vừa đủ lọt.
`laptop` 1440×720 (chiều cao thật của MacBook 13" sau khi trừ thanh công cụ Chrome) mới là nơi
footer "Áp dụng / Hủy" bị đẩy khỏi khung nhìn. Bug này là bug hình học, nên viewport chính là
điều kiện tái hiện.

## Số kỳ vọng

Lấy **độc lập với màn hình**: gọi thẳng `POST /reports/pos/daily-summary` bằng đúng token và
`X-Branch-Id` của phiên kiểm thử, rồi mới đối chiếu với UI.

| Kỳ | Hàng bán › Giá trị | TỔNG (1) − (2) | Tổng SL hoá đơn |
|---|---:|---:|---:|
| Hôm nay (24/08) | 0 | 0 | 0 |
| 7 ngày gần đây (18–24/08) | 55.350.000 | 11.623.000 | 14 |
| 14 ngày gần đây (11–24/08) | 113.850.000 | 50.633.000 | 45 |
| Toàn bộ | 120.080.000 | 50.633.000 | 53 |

"7 ngày" và "14 ngày" cho số **khác nhau**, nên chúng phân biệt được "lọc đúng mốc" với "chỉ
cần có lọc là xong". "14 ngày" và "Toàn bộ" trùng `TỔNG (1) − (2)` nhưng khác Hàng bán — nên
bước nào so hai kỳ đó phải so bằng Hàng bán, không so bằng TỔNG.

Đối chiếu từ SQL trên `erp_dev` (hoá đơn không tính `draft`, theo ngày `Asia/Ho_Chi_Minh`):
22/08 → 1 · 20/08 → 1 · 19/08 → 13 · 18/08 → 4 · 15/08 → 13 · 14/08 → 18 · 13/08 → 9 · 12/08 → 2.

## Steps

Dropdown là popover hai bước: chọn radio chỉ ghi vào buffer `pending`, phải bấm **"Áp dụng"**
mới commit. Vì vậy mỗi bước chạy đủ mở → chọn → áp dụng, rồi **`wait` trên một con số của kỳ
mới** trước khi chụp: query dùng `placeholderData: keepPreviousData`, chụp ngay sau cú click sẽ
bắt được số của kỳ **cũ** và ảnh sẽ nói dối. Kỳ báo cáo là state của component, không lưu vào
URL hay localStorage, nên không bước nào thừa hưởng lựa chọn của bước trước.

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Trạng thái xuất phát: kỳ "Hôm nay", báo cáo rỗng | `/pos/daily-report` | `wait text=HÀNG BÁN` | AC-02 | `no-text=55.350.000; no-text=113.850.000` |
| S2 | Dropdown mở — footer "Áp dụng / Hủy" phải nằm trong khung hình, kể cả ở `laptop` | `/pos/daily-report` | `click [aria-label="Lọc theo khoảng thời gian"]; wait text=Toàn bộ` | AC-01 | `text=Toàn bộ; text=Áp dụng; text=Hủy` |
| S3 | Preset "Toàn bộ" áp dụng và kéo báo cáo khỏi 0 | `/pos/daily-report` | `click [aria-label="Lọc theo khoảng thời gian"]; click text=Toàn bộ; click text=Áp dụng; wait text=120.080.000` | AC-02 | `text=120.080.000; text=50.633.000` |
| S4 | Preset "7 ngày gần đây" lọc đúng khoảng của nó | `/pos/daily-report` | `click [aria-label="Lọc theo khoảng thời gian"]; click text=7 ngày gần đây; click text=Áp dụng; wait text=55.350.000` | AC-02, AC-03, AC-04 | `text=55.350.000; text=11.623.000; no-text=113.850.000` |
| S5 | Preset "14 ngày gần đây" cho số khác hẳn preset 7 ngày | `/pos/daily-report` | `click [aria-label="Lọc theo khoảng thời gian"]; click text=14 ngày gần đây; click text=Áp dụng; wait text=113.850.000` | AC-03, AC-04 | `text=113.850.000; text=50.633.000; no-text=55.350.000` |
| S6 | Tab Doanh thu theo mặt hàng lọc theo cùng preset | `/pos/daily-report` | `click text=Doanh thu theo mặt hàng; click [aria-label="Lọc theo khoảng thời gian"]; click text=14 ngày gần đây; click text=Áp dụng; wait text=(11/08/2026 00:00 - 24/08/2026 23:59)` | AC-05 | `text=(11/08/2026 00:00 - 24/08/2026 23:59)` |
| S7 | "Khác" vẫn mở dialog Từ/Đến như cũ | `/pos/daily-report` | `click [aria-label="Lọc theo khoảng thời gian"]; click text=Khác; click text=Áp dụng; wait text=Chọn thời gian` | AC-06 | `text=Chọn thời gian; text=Đồng ý` |

## Not verified here

- **AC-01 chỉ được chứng minh bằng ảnh chụp.** Bốn dạng assert của bộ chạy (`text=`, `no-text=`,
  `count`) không đọc được hình học khung nhìn, và Playwright cuộn tới nút "Áp dụng" kể cả khi
  người dùng thật không nhìn thấy nó — nên `text=Áp dụng` ở S2 xanh cả trước lẫn sau khi sửa.
  Bằng chứng thật là `evidence/local-pos/laptop/S2.png`: trước khi sửa, danh sách chạy tới đáy
  màn hình và footer bị cắt hẳn; sau khi sửa, danh sách cuộn và footer nằm ở giữa khung hình.
- **AC-05 chỉ kiểm tới dải ngày trên toolbar**, chưa assert một con số trong bảng doanh thu theo
  mặt hàng. Hai tab dùng chung một `issuedAt` (`use-daily-report.ts` — `revenueIssuedAt` chỉ
  thêm cận dưới sentinel khi `from` rỗng), nên dải ngày đúng là điều kiện đủ mạnh, nhưng nó
  không bắt được lỗi nếu bảng tự lọc sai bên trong.

## Notes

Các con số kỳ vọng neo theo **ngày chạy 2026-08-24** và theo fixture hiện có của `erp_dev`.
Preset là khoảng trượt: chạy lại sau vài ngày thì "7 ngày gần đây" tụt khỏi 18/08 và mọi con số
đổi. Nếu chạy lại vào ngày khác, gọi lại `POST /reports/pos/daily-summary` cho từng khoảng để
tính lại bảng trên trước khi tin vào verdict.

Đường dẫn có tiền tố `/pos` vì POS được phục vụ dưới base path `/pos/`
(`vite.config.ts` → `base: "/pos/"`, `App.tsx` → `basename={import.meta.env.BASE_URL}`).
