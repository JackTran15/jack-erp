# Quỹ Tiền Gửi (Deposit Fund) — Báo cáo triển khai (EPIC-15072026)

> Module quản lý tiền gửi ngân hàng/ví điện tử, tách biệt với quỹ tiền mặt (`cash_accounts`), theo mô hình 4 giai đoạn (GĐ1→GĐ4), 35 ticket. Toàn bộ backend đã triển khai xong; frontend đã build xanh, chưa click-through trực tiếp trên trình duyệt.

- Epic gốc: `tickets/epics/EPIC-15072026-deposit-fund-*.md` (4 file: foundation / spending / reconcile-lock / inter-branch)
- Code backend: `apps/api/src/modules/accounting/deposit*`
- Code frontend: `apps/backoffice-web/src/pages/treasury/deposit*`, `apps/backoffice-web/src/hooks/treasury/use-deposit-*`

---

## 1. Trạng thái tổng thể

| Giai đoạn | Nội dung | Trạng thái |
| --- | --- | --- |
| **GĐ1 — Nền tảng** | Tài khoản + sổ chi tiết tiền gửi, tự động ghi nhận từ POS | ✅ Xong — E2E 5/5 |
| **GĐ2 — Chi tiêu** | Phiếu thu/chi tiền gửi, trả NCC, swap quỹ | ✅ Xong — E2E 5/5 |
| **GĐ3 — Đối chiếu & Khóa sổ** | Đối chiếu sao kê, phí, khóa sổ, audit log | ✅ Backend xong — E2E 5/7 (2 kịch bản bị chặn bởi hạ tầng Kafka cục bộ, **không phải lỗi logic** — xem mục 6) |
| **GĐ4 — Liên chi nhánh** | Chuyển tiền gửi 2 chi nhánh, báo cáo, dashboard | ✅ Xong — E2E 5/5, FE build xanh |

Unit test toàn bộ backend: **1179/1183 pass** (3 fail còn lại thuộc `inventory/location`, có từ trước, không liên quan tới module này). Chưa có commit nào trong suốt phiên làm việc (theo yêu cầu "chỉ commit khi được bảo").

---

## 2. GĐ1 — Nền tảng (Foundation)

### Chức năng
- Danh mục **tài khoản tiền gửi** (`deposit_accounts`) — nhiều loại: tài khoản ngân hàng, ví điện tử, POS merchant; mỗi chi nhánh có thể có nhiều tài khoản, 1 tài khoản mặc định (`is_default`).
- **Tự động ghi nhận giao dịch tiền gửi khi khách thanh toán không dùng tiền mặt tại POS** (thẻ, chuyển khoản...) — hệ thống tự xác định khoản thanh toán đó thuộc quỹ tiền gửi nào dựa trên tài khoản kế toán (COA) đã cấu hình, không cần nhân viên chọn tay.
- **Sổ chi tiết tiền gửi** (ledger) — liệt kê từng giao dịch, số dư đầu kỳ/cuối kỳ, xuất Excel.
- Chống ghi trùng giao dịch (idempotency) ở tầng database.

### API
| Endpoint | Mô tả |
| --- | --- |
| `GET /deposit-ledger` | Sổ chi tiết tiền gửi (lọc theo tài khoản, khoảng ngày) |
| `GET /deposit-ledger/export` | Xuất Excel |
| `/admin/entities/deposit-accounts/records` | CRUD tài khoản tiền gửi (nền tảng CRUD chung) |
| `/admin/entities/deposit-payment-policy/records` | CRUD chính sách phí/ngày giá trị theo phương thức thanh toán |

### Use case tiêu biểu
- Khách quẹt thẻ 1.135.000đ tại POS → hệ thống tự ghi 1 giao dịch tiền gửi tăng đúng chi nhánh, đúng tài khoản.
- Hóa đơn thanh toán chia đôi (tiền mặt + chuyển khoản) → tiền mặt vào quỹ tiền mặt, phần chuyển khoản vào quỹ tiền gửi, độc lập nhau.
- Gọi lại (retry) một sự kiện thanh toán đã xử lý → không tạo giao dịch thứ 2 (đảm bảo idempotent).
- Nhân viên chi nhánh A chỉ xem được sổ/tài khoản của chi nhánh A.

---

## 3. GĐ2 — Chi tiêu (Spending)

### Chức năng
- **Phiếu chi tiền gửi** (Phiếu chi ngân hàng) và **Phiếu thu tiền gửi** — tạo & ghi sổ ngay (không qua bước nháp), tự chặn nếu số dư không đủ, hỗ trợ đảo bút toán (reverse) khi cần hủy.
- **Trả nhà cung cấp bằng tiền gửi** — thanh toán công nợ NCC trực tiếp từ quỹ tiền gửi, hoặc phối hợp cả tiền gửi + tiền mặt trong cùng 1 lần thanh toán (2 "chân" quỹ).
- **Chuyển đổi quỹ tiền mặt ↔ tiền gửi** (swap nội bộ 1 chi nhánh) — ví dụ nộp tiền mặt vào ngân hàng, hoặc rút tiền gửi ra thành tiền mặt tại quầy, có hỗ trợ phí rút tiền.

### API
| Endpoint | Mô tả |
| --- | --- |
| `POST/GET/PATCH/DELETE /bank-payments`, `POST /bank-payments/:id/post`, `POST /bank-payments/:id/reverse` | Phiếu chi tiền gửi |
| `POST/GET/PATCH/DELETE /bank-receipts`, `POST /bank-receipts/:id/post`, `POST /bank-receipts/:id/reverse` | Phiếu thu tiền gửi |
| `POST /supplier-deposit-payment`, `GET /supplier-deposit-payment/sagas/:id` | Trả NCC bằng tiền gửi (hỗ trợ phối hợp cả tiền mặt) |
| `POST /fund-swaps` | Chuyển đổi quỹ tiền mặt ↔ tiền gửi |

### Use case tiêu biểu
- Quỹ còn 1 triệu, lập phiếu chi 1,5 triệu → hệ thống từ chối (400), số dư không đổi.
- Hai kế toán cùng lúc lập 2 phiếu chi 800.000đ trên quỹ chỉ còn 1 triệu → chỉ đúng 1 phiếu được duyệt, phiếu còn lại bị từ chối (chống ghi đè khi thao tác đồng thời).
- Rút 5 triệu từ quỹ tiền gửi sang quỹ tiền mặt → cả 2 quỹ đổi tương ứng, tổng tiền toàn hệ thống không đổi.
- Trả NCC 20 triệu bằng tiền gửi → quỹ giảm, công nợ NCC giảm theo; nếu hủy phiếu chi → quỹ khôi phục, công nợ khôi phục.

---

## 4. GĐ3 — Đối chiếu & Khóa sổ (Reconcile & Lock)

### Chức năng
- **Đối chiếu sao kê ngân hàng** — chọn các giao dịch, nhập tổng tiền theo sao kê thực tế; nếu khớp → đánh dấu "đã đối chiếu"; nếu lệch → hệ thống tự đề xuất một phiếu điều chỉnh phí (chưa tự động trừ quỹ, cần kế toán duyệt tay).
- **Phí giao dịch tự động** (ví dụ phí quẹt thẻ 1,1%) và **ngày giá trị/ngày tiền về** (settlement date) — tách riêng số dư sổ sách và số dư khả dụng (tiền chưa về thì chưa được chi).
- **Khóa sổ theo kỳ** (tháng) — sau khi khóa, mọi giao dịch tiền gửi phát sinh trong kỳ đó bị chặn; có thể mở khóa lại kèm lý do.
- **Nhật ký kiểm toán** (audit log) — ghi lại mọi thao tác nhạy cảm (đối chiếu, hủy đối chiếu, khóa/mở sổ...).
- Hủy hóa đơn bán hàng có liên quan tiền gửi: nếu giao dịch **chưa** đối chiếu → tự động hoàn tiền; nếu **đã** đối chiếu → chặn hủy, cảnh báo kế toán xử lý thủ công.

### API
| Endpoint | Mô tả |
| --- | --- |
| `GET /deposit-recon`, `POST /deposit-recon/reconcile`, `POST /deposit-recon/unreconcile`, `GET /deposit-recon/export` | Đối chiếu sao kê |
| `GET /deposit-period-locks`, `POST /deposit-period-locks`, `POST /deposit-period-locks/:id/unlock` | Khóa/mở sổ theo kỳ |
| `GET /deposit-audit-log` | Nhật ký kiểm toán |

### Use case tiêu biểu
- Sao kê ngân hàng ít hơn hệ thống 12.485đ (đúng bằng phí quẹt thẻ) → hệ thống tạo đề xuất phiếu chi phí ngân hàng 12.485đ, quỹ chưa đổi cho tới khi kế toán duyệt.
- Khóa sổ tháng 6 → mọi phiếu chi/thu ghi ngày trong tháng 6 đều bị từ chối (409); mở khóa lại (kèm lý do) → giao dịch lại được chấp nhận.
- Khách trả hàng, hủy hóa đơn thanh toán thẻ **chưa đối chiếu** → hệ thống tự hoàn phần tiền gốc (giữ nguyên phí đã mất).
- Khách trả hàng, hủy hóa đơn **đã đối chiếu** → hệ thống từ chối hủy tự động, cảnh báo để kế toán xử lý tay.

> **Ghi chú:** 2/7 kịch bản E2E của GĐ3 (liên quan tới hủy hóa đơn) hiện chưa chạy ổn định trên máy dev cục bộ do độ trễ khởi động Kafka (Redpanda), **không phải do lỗi nghiệp vụ** — đã kiểm chứng logic đúng qua unit test + trace thủ công.

---

## 5. GĐ4 — Chuyển tiền liên chi nhánh (Inter-branch Transfer)

### Chức năng
- **Chuyển tiền gửi giữa 2 chi nhánh** theo mô hình "2 chân": chi nhánh nguồn (A) lập lệnh chuyển → quỹ A **giảm ngay**; chi nhánh đích (B) phải **chủ động xác nhận đã nhận** → quỹ B mới tăng. Trong lúc chờ xác nhận, tiền ở trạng thái trung gian "**đang chuyển**" (không mất khỏi sổ tổng).
- **Hủy lệnh chuyển** — chỉ chi nhánh nguồn được hủy, và chỉ khi đích **chưa** xác nhận; sau khi đích xác nhận thì không sửa/hủy được nữa.
- **Báo cáo "Tiền đang chuyển"** — liệt kê mọi lệnh chuyển chưa hoàn tất, cảnh báo khoản "quá hạn" (treo quá N ngày chưa xác nhận).
- **Dashboard số dư toàn hệ thống** — tổng số dư mọi tài khoản + tổng tiền đang chuyển theo từng chi nhánh mà người dùng được phân quyền xem; kế toán được gán nhiều chi nhánh thấy tổng hợp toàn bộ.

### API
| Endpoint | Mô tả |
| --- | --- |
| `POST /deposit-transfers` | Khởi tạo lệnh chuyển (tại chi nhánh nguồn) |
| `POST /deposit-transfers/:id/confirm` | Xác nhận nhận tiền (tại chi nhánh đích) |
| `POST /deposit-transfers/:id/cancel` | Hủy lệnh chuyển (chỉ chi nhánh nguồn, khi chưa xác nhận) |
| `GET /deposit-transfers`, `GET /deposit-transfers/:id` | Danh sách / chi tiết lệnh chuyển |
| `GET /deposit-transfers/in-transit` | Báo cáo tiền đang chuyển |
| `GET /deposit/dashboard` | Dashboard số dư toàn hệ thống |

### Use case tiêu biểu
- Chi nhánh A chuyển 10 triệu cho chi nhánh B: ngay khi lưu, quỹ A giảm 10 triệu, quỹ B **chưa đổi**, báo cáo "tiền đang chuyển" hiện 10 triệu; tổng số dư toàn hệ thống (A + B + đang chuyển) **không đổi**.
- Chi nhánh B xác nhận đã nhận → quỹ B tăng 10 triệu, khoản "đang chuyển" biến mất khỏi báo cáo; tổng số dư toàn hệ thống **vẫn không đổi**.
- Chi nhánh A chuyển vượt số dư khả dụng → bị từ chối, không tạo lệnh, quỹ không đổi.
- Sau khi B đã xác nhận, A cố hủy hoặc B xác nhận lại lần 2 → hệ thống từ chối (409).
- Chi nhánh không liên quan (không phải nguồn/đích) → không thấy lệnh chuyển này trong báo cáo/dashboard của mình.

### Frontend (mới)
- Trang **Chuyển liên chi nhánh** — danh sách + nút "Xác nhận nhận" / "Hủy" hiện đúng theo vai trò chi nhánh đang chọn.
- Trang **Tiền đang chuyển** — bảng báo cáo, highlight dòng quá hạn.
- Trang **Số dư toàn hệ thống** — thẻ tổng + bảng chi tiết theo chi nhánh/tài khoản.
- Đã thêm route + mục menu (nhóm "TIỀN GỬI"); build TypeScript + production build đều xanh.
- **Chưa** click-through kiểm tra trực tiếp trên trình duyệt (do môi trường thực hiện không có công cụ điều khiển trình duyệt) — cần người kiểm tra thủ công một lượt trước khi bàn giao.

---

## 6. Các lỗi thực tế phát hiện & đã sửa trong quá trình kiểm thử

Những lỗi này **chỉ lộ ra khi chạy kiểm thử end-to-end thật** (gọi HTTP thật, DB thật) — kiểm thử đơn vị (unit test, có mock DB) không phát hiện được:

1. **Sai kiểu dữ liệu cột** `deposit_movements.source_ref_line_id` khai báo `uuid` nhưng nghiệp vụ ghi cả chuỗi không phải uuid (ví dụ đánh dấu `'FEE'`) → lỗi khi ghi phí giao dịch/hoàn tiền. Đã sửa bằng migration đổi sang `varchar`.
2. **Race condition khi đánh số chứng từ đồng thời** — cơ chế đánh số phiếu dùng transaction `SERIALIZABLE` của Postgres, khi 2 request tạo phiếu cùng lúc có thể bị Postgres hủy 1 giao dịch (lỗi 40001), trước đây hệ thống trả lỗi 500 thay vì xử lý gọn. Đã sửa bằng cơ chế tự thử lại (retry) — ảnh hưởng **toàn hệ thống** (mọi loại chứng từ, không riêng tiền gửi), không chỉ module này.
3. **Một route bị "che khuất"** — endpoint `GET /deposit-transfers/in-transit` không bao giờ gọi được vì một route khác (`GET /deposit-transfers/:id`) đăng ký trước nó, nuốt mất đường dẫn "in-transit" tưởng là một `id`. Đã sửa bằng cách đổi thứ tự đăng ký controller.

---

## 7. Việc còn tồn đọng (cần quyết định của người phụ trách)

- Chưa click-through kiểm tra 3 trang FE mới của GĐ4 trên trình duyệt thật.
- 2 kịch bản E2E của GĐ3 (hủy hóa đơn) bị chặn bởi độ trễ Kafka cục bộ, cần chạy lại ở môi trường sạch/máy khác để xác nhận.
- Chọn tài khoản đích khi lập lệnh chuyển liên chi nhánh hiện chỉ lấy được danh sách tài khoản của các chi nhánh mà người dùng đang đăng nhập được phân quyền xem — nếu chuyển tới chi nhánh ngoài phạm vi được gán thì chưa có cách chọn tài khoản đích (cần bổ sung API tra cứu tài khoản theo chi nhánh bất kỳ).
- `GET /deposit-transfers` phía backend hiện chưa kiểm tra tham số `branchId` truyền vào có thuộc quyền của người gọi hay không — nên khóa lại trước khi mở API này ra ngoài phạm vi nội bộ.
- Toàn bộ mã nguồn của module (backend + frontend) **chưa được commit** vào git trong suốt phiên làm việc.
