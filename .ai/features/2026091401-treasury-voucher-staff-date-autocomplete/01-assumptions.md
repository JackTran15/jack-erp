---
feature: treasury-voucher-staff-date-autocomplete
blocking_open: 0         # count of blocking + pending; must be 0 to pass G1
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-02 | Tắt autocomplete trên toàn backoffice: `Input` của `@erp/ui` mặc định `autocomplete="off"` (nơi dùng truyền giá trị khác vẫn thắng), cộng các `<input>` dạng text viết tay; POS không đổi | high | yes | Phạm vi hẹp hơn thì chỉ sửa `LookupField`; rộng hơn thì thêm UoW cho `pos-web` | confirmed | Akenzy chọn "Toàn backoffice" ngày 14/09/2026; mô tả phương án ghi rõ trang đăng nhập / đổi mật khẩu giữ giá trị riêng |
| A-03 | Danh sách Thu, chi tiền mặt sắp theo `voucher_date` giảm dần, rồi `created_at` giảm dần, rồi `id` | high | yes | Đổi ORDER BY trong handler và AC-13 | confirmed | Akenzy chọn "Ngày thu/chi mới nhất" ngày 14/09/2026 |
| A-04 | Phần In / Xuất phiếu áp dụng cho cả phiếu thu / chi tiền gửi: thêm dòng nhân viên thu/chi (`collected_by` / `paid_by`), nhãn cột ký đầu tiên theo A-16, bỏ dòng "Tài khoản ngân hàng" | high | yes | Bỏ 2 mapper tiền gửi khỏi UOW-01, AC-03 rút về tiền mặt | confirmed | Akenzy chọn "Cả tiền gửi" ngày 14/09/2026; mô tả phương án ghi rõ bỏ dòng Tài khoản ngân hàng |
| A-05 | Bỏ dòng "Quỹ tiền mặt" khỏi bản in và Excel của phiếu thu / chi tiền mặt — lấy từ chú thích trên ảnh 2 ("Xoá mục này") và ảnh 3 ("Bỏ mục này"), văn bản không nhắc | high | no | Giữ lại một dòng `infoRow` trong 2 mapper | confirmed | Đúng. Dòng "Quỹ tiền mặt" đã bỏ (T-01-03); spec mapper và e2e T-01-05 khẳng định không có; thấy trên bản in thật PC000044 / PT004767 ngày 14/09/2026. Akenzy xác nhận khi đóng G5 |
| A-06 | Dòng nhân viên đứng ngay trước dòng "Lý do" (cuối khối nếu phiếu không có lý do); nhãn "Nhân viên thu" trên phiếu thu, "Nhân viên chi" trên phiếu chi — cùng chữ với dialog (`ReceiptVoucherDialog.tsx:84`, `PaymentVoucherDialog.tsx:97`). Ảnh 3 chỉ ghi "Thêm 'Nhân viên chi'" cạnh khối thông tin, không chỉ vị trí | medium | no | Đổi thứ tự một phần tử mảng `info` trong 4 mapper | confirmed | Đúng. Dòng nhân viên đứng ngay trước "Lý do", nhãn "Nhân viên thu" / "Nhân viên chi"; spec 4 mapper và e2e khẳng định; thấy trên bản in thật PC000044 / PT004767; Akenzy không yêu cầu đổi vị trí. Akenzy xác nhận khi đóng G5 |
| A-07 | Dòng nhân viên trong khối thông tin chỉ lấy nhân viên thu/chi, không lùi về người tạo phiếu | medium | no | Dòng nhân viên hiện cả trên phiếu cũ không có nhân viên; sửa một biểu thức trong 4 mapper | confirmed | Đúng. Phiếu không có nhân viên không có dòng nhân viên, và sau A-17 không còn tra người tạo nữa; e2e T-01-05 khẳng định tên người tạo không xuất hiện trong payload. Akenzy xác nhận khi đóng G5 |
| A-08 | Dòng "Tham chiếu" trên phiếu tiền gửi giữ nguyên; chỉ dòng tài khoản bị bỏ | medium | no | Bỏ thêm một `infoRow` trong 2 mapper tiền gửi | confirmed | Đúng. "Tham chiếu" giữ trên phiếu tiền gửi, "Tài khoản ngân hàng" bỏ (T-01-04); spec mapper tiền gửi và e2e T-01-05 khẳng định. Không demo được trên trình duyệt (tài khoản không có chi nhánh chứa phiếu tiền gửi có nhân viên). Akenzy xác nhận khi đóng G5 |
| A-09 | Tên hiển thị lấy theo `VoucherStaffResolver` đang dùng cho phiếu tiền gửi: `họ + tên`, trống thì email — trùng cách dialog hiện "Nhân viên thu/chi" | high | no | Đổi hàm ghép tên ở một chỗ | confirmed | Đúng. Tên in ra là `họ + tên` của `VoucherStaffResolver` — bản in thật PC000044 hiện "003 Huỳnh Văn Trường", PT004767 hiện "002 Nguyễn Nhựt Hào". Akenzy xác nhận khi đóng G5 |
| A-11 | Đổi tên trường lọc `createdAt` → `voucherDate` trong `CashVoucherSearchV2Dto`, không giữ trường cũ. Chỉ backoffice gửi trường này (`use-cash-vouchers.ts`, `use-cash-voucher-export.ts`); không e2e nào lọc theo `createdAt`; không có client mobile nào gọi `/v2/cash-vouchers/*` trong repo | medium | yes | Một client ngoài repo đang gửi `createdAt` sẽ nhận 400 (`forbidNonWhitelisted`) — phải giữ `createdAt` làm alias | confirmed | Akenzy chọn "Không — đổi tên luôn" ngày 14/09/2026: không có client nào ngoài backoffice gửi `createdAt`; ADR-04 giữ nguyên, không alias |
| A-12 | Danh sách Thu chi tiền gửi không đổi — trang đó không có cột "Ngày tạo" (`apps/backoffice-web/src/pages/treasury/deposit/receipts-expenses` không chứa chuỗi này) | high | no | Thêm một ticket tương tự T-02 cho tiền gửi | confirmed | Đúng. `git diff main` không có thay đổi nào dưới `apps/backoffice-web/src/pages/treasury/deposit` (kiểm 14/09/2026); danh sách Thu chi tiền gửi giữ nguyên. Akenzy xác nhận khi đóng G5 |
| A-13 | Chrome tôn trọng `autocomplete="off"` với gợi ý lịch sử nhập — loại dropdown trong ảnh 5–7 (A01.02, Showroom BMT, W22.02 là giá trị người dùng từng gõ). Autofill địa chỉ / thẻ đã lưu có thể vẫn hiện trên ô Chrome đoán là địa chỉ | medium | no | Cần cách riêng cho từng ô bị Chrome bỏ qua (vd token `autocomplete` không chuẩn); thêm ticket | confirmed | **Kiểm được một phần.** Trên Chrome của Akenzy 14/09/2026, mọi ô text trên dialog chuyển kho (23), phiếu xuất kho (19), lưới Thu chi tiền mặt (6) và lưới Chuyển kho (5) mang `autocomplete="off"`; gõ "A" vào ô Đối tượng chỉ hiện bảng gợi ý của ứng dụng. Ảnh chụp của extension không bắt được dropdown gốc của Chrome, nên việc dropdown lịch sử thật sự biến mất chưa được chứng minh bằng ảnh. Chưa có ô nào bị báo vẫn hiện gợi ý. Akenzy xác nhận khi đóng G5, chấp nhận giới hạn này |
| A-14 | Phiếu thu POS có `staff_id` = thu ngân (`post-cash.step.ts:165`), nên bản in phiếu thu POS (ảnh 2) cũng có dòng "Nhân viên thu" | high | no | Phiếu POS không có dòng nhân viên — vẫn đúng AC-04 | confirmed | **Đúng phần lớn, không tuyệt đối.** Trong `erp_dev_3008` (14/09/2026) có 4.826 phiếu thu "POS sale", 4.486 phiếu có `staff_id` (vd PT004763 → "Nguyễn Bảo Quốc"); 340 phiếu không có `staff_id` nên in không có dòng "Nhân viên thu" — đúng AC-04, không phải lỗi. Akenzy xác nhận khi đóng G5, chấp nhận giới hạn này |
| A-15 | Không cần migration: mọi cột cần dùng đã có, và `voucher_date` đã có trong index danh sách của cả `cash_receipts` lẫn `cash_payments` | high | no | Thêm migration index cho `cash_payments` | confirmed | Đúng. Không migration nào được thêm hoặc sửa so với `main` dưới `apps/api/src/database/migrations` (kiểm 14/09/2026); lọc và sắp theo `voucher_date` chạy trên cột có sẵn. Akenzy xác nhận khi đóng G5 |
| A-16 | Cột ký đầu tiên của 4 loại phiếu quỹ mang nhãn "Nhân viên thu" (phiếu thu) / "Nhân viên chi" (phiếu chi) thay cho "Người lập phiếu" — cùng chữ với dòng nhân viên trong khối thông tin (`staffLabel`) | high | yes | Nhãn chữ ký trong 4 mapper, spec và e2e T-01-05 | confirmed | Akenzy trả lời 14/09/2026 sau khi xem bản Xuất khẩu: "Nếu là Phiếu Thu thì là Nhân viên thu, nếu là Phiếu Chi thì là Nhân viên chi". Reopen G1 lần 2 |
| A-17 | Không in sẵn tên dưới bất kỳ cột ký nào của 4 loại phiếu quỹ, ở cả In lẫn Xuất khẩu; tên nhân viên thu/chi chỉ xuất hiện ở dòng thông tin "Nhân viên thu/chi". Gỡ hẳn khả năng in tên (`signatureNames`) khỏi payload, renderer In, writer Excel, và bỏ việc tra tên người tạo phiếu | high | yes | Phải giữ `signatureNames` và nhánh tra người tạo; T-01-07, T-01-08 không cần | confirmed | Akenzy 14/09/2026 sau khi xem bản in PC000044: "Không cần fill sẵn name phía dưới Người phiếu chi; Người phiếu thu"; chọn "Bỏ hẳn phần in tên" (không để lại code chết). Bác A-01, A-10; reopen G1 lần 3 |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
| --- | --- | --- | --- |
| A-01 | Tên nhân viên thu/chi — trống thì tên người tạo phiếu (`created_by`) — in sẵn dưới cột ký đầu tiên. Akenzy đã chọn phương án này ở vòng hỏi đầu (14/09/2026) | Sau khi xem bản in, Akenzy không muốn in sẵn tên nào dưới chữ ký (A-17) | T-01-07 bỏ `signatureNames` và tra người tạo khỏi 4 mapper / 4 service / resolver; T-01-08 gỡ khả năng in tên khỏi payload, renderer In, writer Excel (hoàn tác phần code của T-01-01); AC-05..AC-08 viết lại; T-01-05 đổi kỳ vọng |
| A-10 | Tên in ở cuối cột ký, sau một khoảng trống để ký tay | Không còn tên nào dưới chữ ký | CSS `.signature-name` và các hàng trống trước hàng tên trong writer Excel bị gỡ (T-01-08) |

## Bằng chứng đã xem

- `cash-receipt-print.mapper.ts:57-63`, `cash-payment-print.mapper.ts:57-63`: `info` có "Quỹ tiền mặt", không có nhân
  viên; `SIGNATURES` là mảng nhãn thuần.
- `bank-receipt-print.mapper.ts:58-63`, `bank-payment-print.mapper.ts:58-63`: `info` có "Tài khoản ngân hàng" và "Tham
  chiếu", không có nhân viên. `BankReceiptsService.getById` đã gắn `collectedByName` qua `attachStaff`
  (`bank-receipts.service.ts:876`); phiếu tiền mặt không có trường tương ứng.
- `search-cash-vouchers-v2.handler.ts:136,154`: lọc `"createdAt"::date`, `ORDER BY "createdAt" DESC, id DESC`.
  `TreasuryCashReceiptsPage.tsx:152-159`: kỳ lọc được gộp vào khoá `createdAt`.
- `cash-voucher-v2.controller.ts:46`: cột xuất `{ col: 'createdAt', label: 'Ngày tạo' }`.
- `packages/ui/src/components/input.tsx`: không đặt `autoComplete`. 74 file backoffice dùng `Input`; `pos-web` không file
  nào import `Input` từ `@erp/ui`.
- Bản in thật PC000044 / PT004767 trên `local-backoffice` (14/09/2026, trước T-01-07): dòng "Nhân viên chi/thu" ngay
  trước "Lý do", không có "Quỹ tiền mặt", cột ký đầu tiên "Nhân viên chi/thu" có tên nhân viên bên dưới — chính phần tên
  bên dưới là thứ A-17 gỡ.
