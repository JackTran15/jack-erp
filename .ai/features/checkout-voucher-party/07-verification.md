---
feature: checkout-voucher-party
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Phiếu thu/chi sinh từ POS ghi rõ khách và nhân viên

Chỉ khai `local-backoffice`. Một bảng Steps chạy trên **mọi** environment feature khai báo, nên
đường dẫn POS không được nằm chung bảng với đường dẫn backoffice. Việc bán hàng trên POS là
**điều kiện dựng dữ liệu**, không phải bước chụp ảnh — xem `## Chuẩn bị dữ liệu`.

Desktop-only: cả hai app là màn hình quầy / back-office, không có layout mobile
(`BackofficeLayout` là shell `ml-60` cố định, không có `matchMedia` ở đâu cả).

Điều feature này phải chứng minh **không phải** "trang có mở được" mà là "bốn ô có chữ trong
đó". Nhãn "Nhân viên thu" luôn hiển thị kể cả khi ô rỗng — assert vào nhãn là tự lừa mình. Vì
vậy mọi Assert dưới đây bám vào **giá trị** lấy từ dữ liệu chuẩn bị ở bước dưới.

## Chuẩn bị dữ liệu

Chạy trước khi verify, một lần, và ghi lại tên khách đã dùng:

1. API trên `:4000` phải là **của repo này**. Kiểm bằng
   `lsof -nP -iTCP:4000 -sTCP:LISTEN` — đường dẫn process phải nằm trong `jack-erp`, không phải
   một checkout khác. Đây là bẫy đã xảy ra thật khi viết feature này (xem `## Notes`).
2. Backoffice → Danh mục khách hàng: chọn/khai một khách **có địa chỉ**. Ghi lại tên và địa chỉ.
3. Bán **hai** đơn tiền mặt cho khách đó, cùng nhân viên bán hàng — một qua checkout v2
   (`POST /v2/pos/checkout`, sinh `PT000044`) và một qua v1 (`POST /invoices/:id/checkout`,
   sinh `PT000045` qua `PosCashSaleConsumer`). Hai đường ghi phiếu khác nhau hoàn toàn
   (inline trong transaction vs. Kafka consumer), nên một đơn không chứng minh được đường kia.
4. Phiếu thu vừa sinh phải là dòng **đầu tiên** của danh sách Thu/chi tiền mặt (sắp xếp mặc
   định theo ngày giảm dần) — đó là dòng các bước dưới bấm vào.

Phiên đăng nhập đã lưu (`.ai/.auth/local-backoffice.json`) hết hạn rất nhanh (access token 15
phút). Lần chạy thứ hai trở đi mà không xoá nó sẽ đỏ toàn bộ với
`redirected to sign-in — the session was not accepted`. **Xoá file đó trước mỗi lần chạy.**

Bấm vào dòng chỉ **chọn** nó (tick checkbox + mở panel "Chi tiết" ở dưới), không mở phiếu.
Phải bấm tiếp nút **Xem** trên thanh công cụ. Lần chạy đầu tiên sai đúng chỗ này: S1–S3 xanh
còn S4/S5 đỏ, và ảnh chụp cho thấy dialog chưa từng mở — đỏ vì script, không phải vì feature.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Danh sách Thu, chi tiền mặt mở được và có phiếu thu POS vừa sinh | `/treasury/cash/receipts-expenses` | — | AC-01 | `text=Thu, chi tiền mặt` |
| S2 | Cả phiếu của v1 (PT000045) lẫn của v2 (PT000044) đều mang tên khách trên danh sách | `/treasury/cash/receipts-expenses` | — | AC-01 | `text=PT000045; text=PT000044; text=A HẬU` |
| S3 | Mở phiếu thu đầu danh sách: Đối tượng nộp và Người nộp mang tên khách | `/treasury/cash/receipts-expenses` | `click table tbody tr:first-child; click text=Xem` | AC-01 | `text=Người nộp; text=A HẬU` |
| S4 | Cùng phiếu đó: ô Địa chỉ mang **địa chỉ của khách**, không phải của chi nhánh | `/treasury/cash/receipts-expenses` | `click table tbody tr:first-child; click text=Xem` | AC-03 | `count input[value="CAN THO"] = 1` |
| S5 | Dialog mở đúng phiếu của đơn vừa bán, và ô Nhân viên thu có mặt | `/treasury/cash/receipts-expenses` | `click table tbody tr:first-child; click text=Xem` | AC-04 | `text=Nhân viên thu; count input[value="PT000045"] = 1` |

## Not verified here

Bốn động từ `click/fill/wait/scroll` không dựng nổi một phiên bán hàng, nên mọi thứ cần **giao
dịch nhiều bước** cố ý nằm ngoài bảng trên, kèm thứ đang phủ nó:

- **AC-02 (khách vãng lai), AC-05 (tiền thừa)** — cần chốt thêm hai đơn với điều kiện khác nhau
  rồi mở đúng phiếu tương ứng. Phủ bởi unit test của hai consumer (`cash-voucher-consumers.spec.ts`)
  và, cho đường v2, bởi e2e `checkout-voucher-party.e2e-spec.ts` đọc **thẳng cột DB**
  (`partner_type IS NULL`, `partner_address_snapshot = '45 Nguyễn Huệ'`).
- **AC-06, AC-07, AC-08 (phiếu chi đổi trả)** — cần bán rồi trả, hai phiên POS liên tiếp. Phủ
  bởi unit test `RefundCashConsumer` / `RefundBankConsumer`. **Đây là chỗ yếu nhất của feature**:
  chưa có hàng thật nào cho đường hoàn tiền, và ô tương ứng trong DoD của UOW-02 đang để trống
  đúng vì thế.
- **AC-09…AC-12 (phiếu thu của checkout v2)** — số phiếu liền mạch, không thêm bút toán, replay
  không nhân đôi: không quan sát được bằng một ảnh chụp. Phủ bởi e2e chạy trên `erp_test` thật,
  4 khẳng định, gồm phép đếm `journal_entries` trước/sau.
- **AC-13 (phiếu thu tiền gửi)** — cần một đơn chuyển khoản và một quỹ tiền gửi đã cấu hình.
  Phủ bởi e2e đơn hỗn hợp (40k tiền mặt + 60k chuyển khoản → `NTTK000001`).
- **AC-10, AC-11, AC-14, AC-15** — bất biến về sổ sách và khả năng chịu lỗi, không có bề mặt UI.
- **Giá trị của ô "Nhân viên thu" (AC-04)** — hiện đúng `NV000001 · Nhân viên HCM` trên ảnh S5,
  nhưng không assert được vì lý do kỹ thuật ở `## Notes`. Phủ bằng e2e trên DB thật và bằng
  chính ảnh S5.

## Notes

- Chạy bằng tài khoản có `accounting.cash_receipt.read`; thiếu quyền thì mục "Thu, chi tiền mặt"
  không hiện trong sidebar và cả năm bước cùng đỏ vì lý do không liên quan gì tới feature.
- Assert của S2/S3/S4 bám vào dữ liệu do `## Chuẩn bị dữ liệu` dựng: khách **A HẬU**, địa chỉ
  **CAN THO**, nhân viên bán hàng **NV000001** (`staff-hcm@erp.local`). Đổi dữ liệu thì phải
  sửa ba dòng này — cố ý bám **giá trị** thay vì nhãn, vì nhãn luôn xanh kể cả khi ô rỗng.
- Assert của S4 (`CAN THO`) **chỉ xuất hiện trong dialog**, không có trên danh sách phía sau —
  nên nó thật sự chứng minh dialog đã render giá trị. Riêng `A HẬU` ở S3 có trên cả hai, nên S3
  assert kèm nhãn `Người nộp` vốn chỉ có trong dialog.
- **Giới hạn của cơ chế assert, đã đo chứ không đoán:** `text=` chỉ đọc text node, còn bốn ô
  này là `<input>`; `count input[value="…"]` đọc **thuộc tính** `value`, mà React chỉ ghi thuộc
  tính đó ở lần render đầu. `CAN THO` đến từ `initial` nên có thuộc tính và assert được.
  `NV000001` / `Nhân viên HCM` đến **sau** một lệnh gọi mạng (`fetchStaffById` →
  `GET /admin/users/:id`), React cập nhật property chứ không cập nhật thuộc tính, nên
  `count input[value="NV000001"]` trả về 0 **dù ô hiện đúng chữ trên màn hình** (xem ảnh S5).
  Vì vậy S5 chỉ assert được "đúng phiếu, có ô Nhân viên thu"; giá trị trong ô do ảnh S5 và
  e2e (`receipt.staff_id === users.id` của nhân viên bán hàng) chứng minh.
- Chọn khách **có** địa chỉ là có chủ ý: nó chứng minh nhánh chính của AC-03 (địa chỉ khách
  thắng). Nhánh thoái lui về địa chỉ chi nhánh đã có e2e phủ (`partner_address_snapshot =
  '45 Nguyễn Huệ'` cho đơn khách vãng lai).
- S2 cố ý assert **cả hai** số phiếu: `PT000045` là của đường v1 (consumer), `PT000044` của
  đường v2 (inline). Trên cùng ảnh còn thấy `PT000043/42/40` — phiếu cũ, cột đối tượng trống —
  nên ảnh đó tự nó là bằng chứng trước/sau.
- **Bẫy đã xảy ra thật:** `:4000` từng chạy API biên dịch của một checkout khác
  (`erp/be/erp2`, nhánh `ERP-1408-400`) trong khi hai frontend là của `jack-erp`. Cả năm bước
  vẫn "chạy được" nhưng bốn ô rỗng, và kết quả đỏ đó **không nói gì** về feature này. Bước 1
  của `## Chuẩn bị dữ liệu` tồn tại chính vì chuyện đó.
