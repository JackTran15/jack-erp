---
feature: treasury-voucher-party-reason-edit
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Chỉ phiếu người dùng tự tạo mới được sửa và xoá — cưỡng chế bằng `reference_type = MANUAL` (do server ghi cứng), xem ADR-05. Phiếu do saga hoặc consumer sinh (POS bán hàng, thu nợ KH, trả nợ NCC, nhập hàng, hoán quỹ, chuyển tiền liên chi nhánh, đảo bút) vẫn chỉ Đảo được như hiện nay | medium | yes | Nếu sai theo hướng "phải sửa được cả phiếu saga": UOW-03 phải gọi thêm đường bù trừ của từng saga (`debtCollectionSaga.compensate`, `supplierDebtPaymentSaga.compensate`) → thêm ít nhất 1 UoW và đổi hình dạng hợp đồng | confirmed | Akenzy chốt vòng 2 ở G1, 2026-09-07 — chỉ `purpose` = Khác; phiếu saga giữ nguyên chỉ Đảo được |
| A-02 | Sửa phiếu đã ghi sổ = ghi bút toán **chênh lệch**, giữ nguyên số phiếu; xoá = sửa về rỗng (`after = []`) rồi soft-delete | high | yes | Toàn bộ UOW-03 | confirmed | Akenzy chốt ở vòng hỏi G0, 2026-09-07 — chọn "Kiểu kho, sửa tại chỗ + bút toán chênh lệch" |
| A-03 | Đối tượng tự nhập = thêm loại **"Khác"** vào ô Loại đối tượng; chọn xong thì ô tên mở khoá cho gõ tự do, lưu `partner_type = OTHER` + `partner_name_snapshot`, `partner_id = NULL`. Không tra cứu, không tạo bản ghi danh mục | high | yes | Toàn bộ UOW-01 | confirmed | Akenzy chốt ở vòng hỏi G0, 2026-09-07 |
| A-04 | Auto-fill Lý do → Diễn giải **chỉ** điền khi ô Diễn giải dòng 1 còn trống; đã gõ tay thì không đụng | high | yes | UOW-02 | confirmed | Akenzy chốt ở vòng hỏi G0, 2026-09-07 |
| A-05 | In và Xuất khẩu phiếu quỹ không thuộc feature này; nối tiếp `.ai/features/export-print/` UOW-04 | high | no | Không có — chỉ là ranh giới plan | confirmed | Akenzy chốt ở vòng hỏi G0, 2026-09-07 |
| A-06 | "check and support search the kind" nghĩa là ô **Loại đối tượng** trong `VoucherEntitySearchModal` phải có thêm mục "Khác", chứ không phải dựng một danh mục tên-tự-do tra cứu lại được ở phiếu sau | medium | yes | Nếu sai: cần một bảng lưu tên tự do đã dùng + endpoint tìm kiếm nó + migration → thêm 1 UoW backend trọn vẹn vào UOW-01 | confirmed | Akenzy chốt vòng 2 ở G1, 2026-09-07 — chỉ thêm mục "Khác" vào ô Loại đối tượng; không dựng danh mục tên tự do |
| A-07 | Sửa phiếu chi làm **tăng** số tiền mà quỹ không đủ số dư thì tôn trọng hành vi sẵn có của `CashService.recordMovement`: chặn khi `cash_accounts.allow_negative = false`, cho qua khi `= true`. Không thêm luật riêng cho đường sửa | medium | yes | Đổi error taxonomy và ít nhất 1 AC; nếu phải luôn cho âm thì lệch với hành vi tạo phiếu | confirmed | Akenzy chốt vòng 2 ở G1, 2026-09-07 — theo đúng `cash_accounts.allow_negative`, không thêm luật riêng cho đường sửa |
| A-08 | Sửa phiếu **không** cho đổi `voucherDate` sang kỳ đã khoá sổ (tiền gửi có `deposit-period-lock`); nếu ngày nằm ngoài kỳ mở thì từ chối | medium | yes | Nếu sai theo hướng "cho đổi tự do": bút toán chênh lệch rơi vào kỳ đã chốt, sai số liệu báo cáo đã phát hành | confirmed | Akenzy chốt vòng 2 ở G1, 2026-09-07 — từ chối sửa khi ngày cũ HOẶC ngày mới rơi vào kỳ đã khoá sổ |
| A-09 | Dùng lại đúng permission đã seed (`accounting.{cash,bank}_{receipt,payment}.{update,delete}`), không thêm key mới, không đổi vai trò nào | high | no | Thêm 1 ticket seed + gán vai trò | pending | — |
| A-10 | Không gộp ô Đối tượng của quỹ tiền sang `POST /v2/counterparties/search`; hai bộ picker trùng chức năng vẫn song song sau feature này | medium | no | Nếu sai: một đợt refactor riêng, không nằm trong plan này | pending | — |
| A-11 | Không có deadline hay release train ràng buộc; feature xong khi demo được ở G4 | low | no | Chỉ ảnh hưởng thứ tự thi công, không ảnh hưởng hình dạng plan | pending | — |
| A-12 | Bốn loại phiếu (thu/chi × tiền mặt/tiền gửi) đều trong phạm vi cho cả ba yêu cầu | high | no | Gấp đôi hoặc giảm nửa khối lượng UOW-01 và UOW-03 | confirmed | Akenzy nêu tường minh trong yêu cầu gốc: "Phiếu thu chi (Tiền mặc và tiền gửi)", 2026-09-07 |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
| --- | --- | --- | --- |
| A-13 | Yêu cầu #3 là "xây chức năng sửa/xoá phiếu" | Sửa/xoá **đã viết xong toàn bộ** ở cả 4 loại — route, service, DTO, permission, nút, mutation, modal xác nhận — và chết vì `create()` luôn ghi POSTED còn guard đòi DRAFT | UOW-03 chuyển từ "xây mới" sang "gỡ khoá + ghi bút toán chênh lệch"; phần lớn công sức nằm ở kế toán chứ không ở CRUD |
| A-14 | Yêu cầu #2 cần thêm cột hoặc trường mới cho "Lý do" | `reason varchar(500)` đã là free text sẵn trên cả 4 header, và cột **đầu tiên** của lưới chi tiết đã đúng là `description` / "Diễn giải" | UOW-02 thu lại còn thuần frontend, không migration, không đụng DTO |
| A-15 | Yêu cầu #1 cần thêm giá trị mới vào enum loại đối tượng | `CashVoucherPartnerType.OTHER` và `BankVoucherPartnerType.OTHER` đã có sẵn trong cả TypeScript lẫn kiểu enum Postgres, và `PartnerResolverService.resolve` đã bỏ qua `OTHER` với chú thích "free-text partner, no validation" | UOW-01 không cần migration đổi kiểu enum; việc còn lại là mở đường cho tên đi từ form xuống `partner_name_snapshot` |
