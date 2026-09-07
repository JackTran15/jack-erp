---
feature: 2026090404-report-permissions
environments: [local-backoffice, local-backoffice-bm, local-backoffice-wh]
viewports: [desktop]
---

# Verification — Phân quyền báo cáo

Ba environment = ba vai trò trên cùng một app: `local-backoffice` (Quản trị hệ
thống), `local-backoffice-bm` (Quản lý chi nhánh, được gán 4 cửa hàng),
`local-backoffice-wh` (Nhân viên kho). Cột `Env` giới hạn step theo vai trò —
không có nó thì spec chỉ còn giữ được những assertion đúng với **mọi** vai trò,
mà đó đúng là tập không chứng minh được bất kỳ luật phân quyền nào.

Các cặp step đối nhau (S1/S2, S3/S4, S6/S7) là phần có giá trị nhất: cùng một
màn hình, hai vai trò, hai kết quả ngược nhau. Một cổng chặn hỏng sẽ làm đúng một
vế đỏ.

Thực tế quyền đã đối chiếu với `/auth/session` ngày 2026-09-07:

| Khóa | admin | bm | wh |
| --- | --- | --- | --- |
| `reporting.inventory.value.read` | có | có | **không** |
| `reporting.sales.daily-sales-summary.read` | có | có | **không** |
| `reporting.profit.read` (quyền mở nhóm) | có | có | **không** |
| `reporting.dashboard.consolidated.read` | có | **không** | **không** |

## Steps

| ID | Step | Path | Interaction | Verifies | Assert | Env |
|---|---|---|---|---|---|---|
| S1 | Báo cáo kho của vai trò kho, có dữ liệu tháng trước: chỉ có cột Số lượng | `/reports/inventory` | `click button[role=combobox]; click text=Tháng trước; click text=Lấy dữ liệu; wait table tbody tr:nth-child(5)` | AC-12 | `text=Số lượng; no-text=Giá trị; no-text=trên 0 kết quả` | local-backoffice-wh |
| S2 | Cùng báo cáo và cùng kỳ đó, vai trò có quyền giá trị: có cả hai nhóm cột | `/reports/inventory` | `click button[role=combobox]; click text=Tháng trước; click text=Lấy dữ liệu; wait table tbody tr:nth-child(5)` | AC-12 | `text=Số lượng; text=Giá trị; no-text=trên 0 kết quả` | local-backoffice, local-backoffice-bm |
| S3 | Ô chọn báo cáo Bán hàng của vai trò kho: mở ra đúng một mục | `/reports/sales` | `click text=Chọn báo cáo; wait text=Kỳ báo cáo; click :nth-match(button[role=combobox], 2)` | AC-01 | `count [data-radix-popper-content-wrapper] .max-h-60 > button = 1` | local-backoffice-wh |
| S4 | Cùng ô đó, vai trò đủ quyền: mở ra cả bốn mục | `/reports/sales` | `click text=Chọn báo cáo; wait text=Kỳ báo cáo; click :nth-match(button[role=combobox], 2)` | AC-01 | `count [data-radix-popper-content-wrapper] .max-h-60 > button = 4` | local-backoffice, local-backoffice-bm |
| S5 | Menu Bán hàng mở được và ra số khi chỉ được cấp đúng một báo cáo | `/reports/sales` | `click button[role=combobox]; click text=Tháng trước; click text=Lấy dữ liệu; wait table tbody tr:nth-child(5)` | AC-04 | `text=DOANH THU THEO MẶT HÀNG; no-text=trên 0 kết quả` | local-backoffice-wh |
| S6 | Nhóm Lợi nhuận bị chặn với vai trò không có quyền mở nhóm | `/reports/profit` | — | AC-04 | `text=Bảng điều khiển; no-text=Lấy dữ liệu` | local-backoffice-wh |
| S7 | Cùng đường dẫn đó, vai trò có quyền mở nhóm: vào được | `/reports/profit` | `wait text=Lấy dữ liệu` | AC-04 | `text=Lấy dữ liệu; no-text=Bảng điều khiển` | local-backoffice, local-backoffice-bm |
| S8 | Nhóm Công nợ cũng bị chặn với vai trò kho | `/reports/debts` | — | AC-04 | `text=Bảng điều khiển` | local-backoffice-wh |

## Not verified here

- **AC-06, AC-07, AC-08, AC-09** (kẹp phạm vi báo cáo tiền) — bằng chứng là một
  *phép so sánh số liệu* giữa hai vai trò trên cùng truy vấn. Cột `Env` cho phép
  viết hai step ngược nhau, nhưng assertion phải ghim một con số cụ thể của
  `erp_dev`, và con số đó đổi mỗi lần có giao dịch mới — một spec như vậy sẽ đỏ
  vì dữ liệu chứ không phải vì hồi quy. Đã đo trực tiếp qua API 2026-09-04: quản
  lý chi nhánh chạy "Lợi nhuận theo mặt hàng" Cửa hàng = Tất cả ra 1.337 dòng /
  968.262.000, quản trị hệ thống ra 4.007 dòng / 4.202.007.500; cửa hàng ngoài
  phạm vi trả 403 trên cả lợi nhuận và công nợ nhà cung cấp. Phủ bằng T-02-04.
- **AC-02, AC-03, AC-18** — hành vi tầng HTTP, không có bề mặt UI. Phủ bằng
  `report-permission.guard.spec.ts` (T-01-05).
- **AC-13, AC-14** — đích đến là file .xlsx và payload in. Phủ bằng
  `inventory-value-columns.spec.ts` (T-04-04).
- **AC-15, AC-16, AC-19** — migration và seed, không có bề mặt UI. Phủ bằng
  `report-permissions.contract.spec.ts` (T-05-03) + đối chiếu SQL sau khi chạy
  `pnpm migration:run`.
- **AC-05** — cần một vai trò giữ quyền mở nhóm nhưng không được cấp báo cáo nào
  trong nhóm đó. Không có tài khoản mẫu như vậy, và tạo một tài khoản chỉ để
  chụp ảnh thì bằng chứng nói về tài khoản đó chứ không nói về hệ thống.
- **AC-10, AC-11, AC-17** — phạm vi truy vấn. AC-11 còn một lý do riêng: ô chọn
  cửa hàng chỉ hiện ở chế độ "Chuỗi cửa hàng", đòi
  `reporting.dashboard.consolidated.read` mà cả bm lẫn wh đều không có. Phủ bằng
  T-03-02 và T-03-04.
- **`local-pos`** không nằm trong danh sách: feature có đụng phạm vi của
  `/reports/pos/daily-summary` nhưng không đổi giao diện pos-web.

## Notes

- **S1, S2, S5 lọc về "Tháng trước" trước khi chụp.** Kỳ mặc định của hai nhóm
  Bán hàng và Kho là "Hôm nay" (`DEFAULT_PERIOD_PRESET`), và `erp_dev` không có
  giao dịch hôm nay, nên bản đầu chụp ra bảng rỗng: đúng về cột nhưng không
  thuyết phục — một bảng rỗng thì "không có cột Giá trị" và "không có gì cả"
  trông giống hệt nhau. Lọc về tháng trước cho ~5.055 dòng ở báo cáo kho và
  ~1.337 dòng ở Doanh thu theo mặt hàng, nên cột giá trị vắng mặt *giữa dữ liệu
  thật*. Assert `no-text=trên 0 kết quả` khoá luôn điều đó: nếu kỳ lọc lại trượt
  về một khoảng rỗng thì step đỏ chứ không âm thầm xanh trên bảng trắng.
- Ô chọn kỳ là combobox **duy nhất** khi bảng lọc đang đóng, nên
  `click button[role=combobox]` là đủ và không cần `:nth-match` như S3/S4.
- S3/S4 phải **mở ô combobox** rồi mới đếm. Bản đầu chỉ mở bảng lọc rồi dùng
  `no-text=`, và nó xanh một cách vô nghĩa: các báo cáo khác nằm trong dropdown
  đang đóng nên `no-text` đúng kể cả khi quyền bị hỏng. Đếm mục sau khi mở mới là
  phép đo thật — 1 với vai trò kho, 4 với vai trò đủ quyền.
- Ô chọn báo cáo **không phải Radix Select**: nó là Popover (`role=dialog`,
  `data-radix-popper-content-wrapper`), mỗi mục là một `<button>` thường, nên
  `[role=option]` không khớp gì cả. Selector đúng là
  `[data-radix-popper-content-wrapper] .max-h-60 > button`.
- Trigger dùng `:nth-match(button[role=combobox], 2)` chứ không dùng text: trên
  trang này có 6 combobox, cái thứ nhất là "Kỳ báo cáo" ở thanh công cụ, cái thứ
  hai mới là "Báo cáo" trong bảng lọc. Bám theo text sẽ khớp nhầm `<h1>` của
  trang (CSS viết hoa nó, DOM vẫn là chữ thường) và cú click đó đóng luôn bảng lọc.
- S6 và S8 là **edge case chặn tuyến**: `routeAccess.resolveRouteAccess` trả
  `deny` khi vai trò không thỏa quyền của nav entry, và app đá về Bảng điều
  khiển. Nếu ai đó nới quyền nhóm cho vai trò kho thì hai step này đỏ — đúng như
  mong đợi.
- **Chỉ chụp ở viewport `desktop`, có lý do kỹ thuật.** Runner đăng nhập một lần
  cho mỗi environment rồi seed các viewport sau bằng `storage_state` chụp ngay
  sau khi đăng nhập. App giữ access token trong bộ nhớ, nên context viewport thứ
  hai phải đổi refresh token — mà `auth.service.ts:164` thu hồi jti cũ mỗi lần
  refresh (refresh token dùng một lần), nên context đó trình một jti đã bị thu
  hồi và bị đá về trang đăng nhập. Đây là tương tác giữa mô hình
  "một lần đăng nhập, nhiều context" của runner và cơ chế xoay refresh token của
  app. Muốn bằng chứng đa viewport thì phải sửa runner để đăng nhập lại cho từng
  viewport. Đây cũng là lưới back-office, không có thiết kế mobile riêng.
- Cache quyền Redis TTL 300s: sau khi đổi quyền vai trò, chờ hoặc restart API
  trước khi chạy lại.
