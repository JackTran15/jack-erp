---
feature: branch-deactivation
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Ngừng hoạt động cửa hàng

Chỉ `local-backoffice` và chỉ `desktop` ở vòng này: UOW-01 mới dựng **nút bấm**, chưa dựng
phần ẩn cửa hàng khỏi các bề mặt khác. POS và tài khoản một-chi-nhánh (`local-backoffice-bm`)
chỉ có gì để chụp sau UOW-02, và cả hai app đều không có layout mobile
(`BackofficeLayout` là shell `ml-60` cố định, không có `matchMedia` ở đâu cả).

Chi nhánh dùng để demo là **Chi nhánh kiểm thử** — không phải HCM. HCM là cửa hàng chính của
tổ chức nên theo thiết kế **không** ngừng được, và chính điều đó là nội dung của S5.

## Steps

Hai điều học được từ hai vòng chạy đỏ trước, ghi lại để người sau khỏi vấp:

1. Màn Cửa hàng đặt `disableRowClick={true}` — bấm vào dòng chỉ **chọn** dòng, muốn mở form
   phải bấm **Sửa** trên thanh công cụ.
2. **Lựa chọn dòng sống sót qua các bước.** Cùng một URL nên component không remount, dòng
   chọn ở bước trước còn nguyên; chọn thêm dòng thứ hai là **Sửa** bị vô hiệu và mọi thứ sau đó
   treo. Nên mỗi bước phải tự dọn: bấm ô chọn-tất-cả ở `thead` hai lần (chọn hết → bỏ hết) rồi
   mới chọn đúng dòng cần.

Selector quét theo `tbody tr:has-text(...)` chứ không dùng `text=`: `text=HCM` khớp cả ô chọn
chi nhánh trên thanh tiêu đề, còn `text=Chi nhánh …` khớp nhầm giữa các chi nhánh với nhau.

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Danh sách Cửa hàng mở ra đã lọc sẵn "Đang hoạt động" | `/admin/branches` | `wait tbody tr:has-text("HCM")` | AC-06 | `count tbody tr:has-text("Đang hoạt động") = 3` |
| S2 | Form sửa có ô "Ngừng hoạt động" chưa tích | `/admin/branches` | `wait tbody tr:has-text("Chi nhánh kiểm thử"); click thead input[type="checkbox"]; click thead input[type="checkbox"]; click tbody tr:has-text("Chi nhánh kiểm thử") input[type="checkbox"]; wait tbody tr:has-text("Chi nhánh kiểm thử") input[type="checkbox"]:checked; click button:has-text("Sửa"); wait #dialog-branch-inactive` | AC-01 | `count #dialog-branch-inactive = 1` |
| S3 | Hộp thoại xác nhận nêu hậu quả và số liệu tồn đọng | `/admin/branches` | `wait tbody tr:has-text("Chi nhánh kiểm thử"); click thead input[type="checkbox"]; click thead input[type="checkbox"]; click tbody tr:has-text("Chi nhánh kiểm thử") input[type="checkbox"]; wait tbody tr:has-text("Chi nhánh kiểm thử") input[type="checkbox"]:checked; click button:has-text("Sửa"); wait #dialog-branch-inactive; click #dialog-branch-inactive; click button:has-text("Lưu"); wait text=các thiết bị bán hàng` | AC-02 | `text=nhân viên chỉ thuộc cửa hàng này` |
| S4 | Bấm Có thì cửa hàng chuyển sang đã ngừng | `/admin/branches` | `select select[aria-label="Lọc Trạng thái"] = ; wait tbody tr:has-text("Chi nhánh kiểm thử"); click thead input[type="checkbox"]; click thead input[type="checkbox"]; click tbody tr:has-text("Chi nhánh kiểm thử") input[type="checkbox"]; wait tbody tr:has-text("Chi nhánh kiểm thử") input[type="checkbox"]:checked; click button:has-text("Sửa"); wait #dialog-branch-inactive; click #dialog-branch-inactive; click button:has-text("Lưu"); wait text=các thiết bị bán hàng; click button:has-text("Có"); wait tbody tr:has-text("Chi nhánh kiểm thử"):has-text("Ngừng hoạt động")` | AC-01, AC-06 | `count tbody tr:has-text("Ngừng hoạt động") = 1` |
| S5 | Cửa hàng chính không có ô tích, kèm lý do | `/admin/branches` | `wait tbody tr:has-text("TP.HCM"); click thead input[type="checkbox"]; click thead input[type="checkbox"]; click tbody tr:has-text("TP.HCM") input[type="checkbox"]; wait tbody tr:has-text("TP.HCM") input[type="checkbox"]:checked; click button:has-text("Sửa"); wait text=Đây là cửa hàng chính` | AC-05 | `text=Đây là cửa hàng chính của tổ chức nên không thể ngừng hoạt động.` |
| S6 | Bỏ tích thì cửa hàng hoạt động trở lại | `/admin/branches` | `select select[aria-label="Lọc Trạng thái"] = ; wait tbody tr:has-text("Chi nhánh kiểm thử"); click thead input[type="checkbox"]; click thead input[type="checkbox"]; click tbody tr:has-text("Chi nhánh kiểm thử") input[type="checkbox"]; wait tbody tr:has-text("Chi nhánh kiểm thử") input[type="checkbox"]:checked; click button:has-text("Sửa"); wait #dialog-branch-inactive; click #dialog-branch-inactive; click button:has-text("Lưu"); wait tbody tr:has-text("Chi nhánh kiểm thử"):has-text("Đang hoạt động")` | AC-03 | `count tbody tr:has-text("Ngừng hoạt động") = 0` |
| S7 | Đang đứng ở Chi nhánh 2, ngừng chính nó → tự chuyển sang chi nhánh khác | `/admin/branches` | `click button[aria-haspopup="menu"]:has-text("HCM"); click [role="menuitemradio"]:has-text("Chi nhánh 2"); wait button:has-text("Chi nhánh 2"); select select[aria-label="Lọc Trạng thái"] = ; wait tbody tr:has-text("Chi nhánh 2"); click thead input[type="checkbox"]; click thead input[type="checkbox"]; click tbody tr:has-text("Chi nhánh 2") input[type="checkbox"]; wait tbody tr:has-text("Chi nhánh 2") input[type="checkbox"]:checked; click button:has-text("Sửa"); wait #dialog-branch-inactive; click #dialog-branch-inactive; click button:has-text("Lưu"); wait text=các thiết bị bán hàng; click button:has-text("Có"); wait button:has-text("HCM")` | AC-12 | `count button:has-text("Chi nhánh 2") = 0` |
| S8 | Trả Chi nhánh 2 về hoạt động (dọn dữ liệu cho lần chạy sau) | `/admin/branches` | `select select[aria-label="Lọc Trạng thái"] = ; wait tbody tr:has-text("Chi nhánh 2"); click thead input[type="checkbox"]; click thead input[type="checkbox"]; click tbody tr:has-text("Chi nhánh 2") input[type="checkbox"]; wait tbody tr:has-text("Chi nhánh 2") input[type="checkbox"]:checked; click button:has-text("Sửa"); wait #dialog-branch-inactive; click #dialog-branch-inactive; click button:has-text("Lưu"); wait tbody tr:has-text("Chi nhánh 2"):has-text("Đang hoạt động")` | AC-03 | `count tbody tr:has-text("Ngừng hoạt động") = 0` |

Bộ lọc mặc định `Đang hoạt động` (yêu cầu #1) **làm hỏng chính kịch bản này**: ngừng xong là
dòng biến mất khỏi bảng, nên `wait` trên dòng đó không bao giờ đúng và bước sau không còn gì
để bấm. Mọi bước cần nhìn thấy dòng đã ngừng phải **xoá bộ lọc về "Tất cả"** trước.

> **Cảnh báo cho người chạy lại bộ này trên máy khác.** Verb `select` là thứ tôi thêm vào
> runner, mà `.claude/skills/ai-dlc-verify/` nằm trong `.gitignore` (dòng 31) — **bản vá đó
> không đi theo commit này**. Trên máy chưa có nó, S4/S6/S7/S8 sẽ chết ở
> `unrecognised interaction "select …"`. Cần đồng bộ skill riêng, hoặc đưa nó ra khỏi
> `.gitignore`. Đây là hạn chế thật của bộ chứng cứ này, không phải chi tiết nhỏ.

Việc đó cần một verb mà runner chưa có: `fill` không lái được `<select>` (Playwright từ chối,
"not an &lt;input&gt;…"). Đã thêm `select <selector> = <value>` vào
`.claude/skills/ai-dlc-verify/scripts/runner/actions.mjs` — giá trị rỗng chọn option trống,
tức là xoá bộ lọc.

Hai cái bẫy nữa, cùng một gốc — **`wait` phải bám vào trạng thái cuối, không bám vào chữ**:

- `wait text=Ngừng hoạt động` khớp ngay *nhãn ô tích* trong hộp thoại đang mở, nên qua tức thì
  và ảnh chụp trúng lúc nút còn ghi "Đang lưu…".
- `wait text=Đã cập nhật` (toast) nổ lúc refetch **bắt đầu**, không phải lúc bảng vẽ xong.

Assertion trong runner đánh giá **một lần, không retry** (`run.mjs:257`), nên mọi race đều thành
đỏ oan. Cả hai bước giờ chờ trên `tbody tr:has-text("<tên>"):has-text("<trạng thái>")` — chỉ
đúng khi hộp thoại đã đóng và bảng đã có dữ liệu mới.

**Mọi bước chọn dòng đều phải chờ hai lần**: chờ bảng vẽ xong trước khi động vào ô tích, và
chờ đúng dòng đó *đã được tích* trước khi bấm **Sửa**. Không có hai cái chờ này thì các cú
click đua với re-render — đã thấy đúng triệu chứng: hai dòng sai bị tích, **Sửa** xám, bước
sau treo 30 giây. Nó bùng lên ngay khi thêm `serverFilters` (một lần refetch nữa), tức là nó
vốn mong manh sẵn chứ không phải lỗi mới.

Thêm hai cái bẫy từ vòng chạy 5/7:

- **`text=` khớp trúng `<option>` vô hình.** Assert `text=Đang hoạt động` đỏ dù chữ đó có mặt
  bốn lần trên màn hình: phần tử **đầu tiên** trong DOM là `<option>` bên trong select lọc, mà
  option của một select đang đóng thì Playwright coi là không visible — runner dùng
  `getByText(...).first()` nên nó chờ đúng cái vô hình đó. Đếm theo dòng `tbody` thay vì bắt chữ.
- **`button[aria-haspopup="menu"]` khớp cả nút avatar**, và avatar đứng trước trong DOM, nên S7
  mở nhầm menu "Đăng xuất". Phải ghim thêm tên chi nhánh vào selector.

**S8 tồn tại để dọn dữ liệu.** S7 ngừng Chi nhánh 2 và không tự bật lại; thiếu S8 thì mỗi lần
chạy là để lại một chi nhánh đang ngừng trong DB dev, và lần chạy sau bắt đầu từ trạng thái bẩn
(đã xảy ra một lần).

Chuỗi thao tác dài hơn mức skill khuyến nghị (~3 verb). Đó là cái giá của việc mỗi bước phải
tự dọn trạng thái; tách nhỏ hơn cũng không giảm được vì bước nào cũng phải mở lại form từ đầu.

## Not verified here

- **S7 phải tự chuyển chi nhánh trước khi ngừng.** `LOCAL_BACKOFFICE_BRANCH_NAME=HCM` nên
  phiên verify luôn khởi động ở HCM; ngừng "Chi nhánh 2" từ đó **không** kích hoạt auto-switch,
  vì nó chỉ chạy khi chi nhánh *đang đứng* biến mất. Bản đầu tiên tôi viết đúng lỗi đó — bước
  vẫn xanh mà chẳng kiểm gì cả.

- **AC-04** (thiếu quyền → 403) được viết ở tầng API, không có bề mặt UI: ô tích chỉ hiện với người đã vào được màn
  Cửa hàng. Đã kiểm bằng tài khoản Branch Manager thật trên API đang chạy — cả ba đường
  (`PATCH /branches/:id`, `PATCH /admin/entities/branches/records/:id`,
  `POST /branches/:id/suspend`) đều trả 403 — và có unit test trong `branch.service.spec.ts`.
- **AC-07..AC-24** thuộc UOW-02..UOW-05, chưa dựng. Sẽ có bước verify riêng khi tới.

## Notes

- Chạy bằng tài khoản `${LOCAL_BACKOFFICE_EMAIL}` (có `branch.archive`). Tài khoản thiếu quyền
  sẽ không dựng lại được S3/S4.
- S3 và S4 **thay đổi dữ liệu**: chúng ngừng `Chi nhánh kiểm thử` thật. S6 trả nó về `ACTIVE`,
  nên thứ tự các bước là bắt buộc, không chạy lẻ được.
- Số trong hộp thoại ở S3 là số thật đọc từ DB (hiện là *2 nhân viên chỉ thuộc cửa hàng này*),
  nên nó sẽ đổi nếu dữ liệu seed đổi. `Assert` cố tình chỉ khớp phần nhãn, không khớp con số.
