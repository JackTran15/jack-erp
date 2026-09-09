---
feature: 2026090804-treasury-voucher-party-address-print-export
adr_count: 7
---

# Logical design — Phiếu thu chi: đối tượng tự nhập, địa chỉ, In và Xuất khẩu

## Approach

Ba mảng việc, ba hình thái khác nhau, và điều đáng nói là **cả ba đều chủ yếu là nối dây
chứ không phải dựng mới**.

*Đối tượng tự nhập* đã có đủ đường dây từ `c57f92e7` nhưng bị khoá sau một cờ
(`partnerKind === OTHER`) mà không control nào bật được. Thay vì thêm dropdown để bật cờ,
ta **bỏ hẳn cờ khỏi giao diện**: ô Tên luôn gõ được, và loại đối tượng được *suy ra* ở
biên gửi đi — có `partnerId` thì là loại danh mục, không có mà có tên thì là `OTHER`. Cờ
`OTHER` vẫn tồn tại trong dữ liệu và trên đường đọc, chỉ không còn là thứ người dùng phải
biết đến.

*Địa chỉ* là một hàng rào bị bỏ dở giữa hai họ phiếu: phiếu tiền gửi có luật ghi đúng và
chạy tốt, phiếu tiền mặt thiếu trường DTO nên chuỗi rơi ở biên HTTP. Ta chép nguyên luật
của phiếu tiền gửi sang phiếu tiền mặt, không phát minh luật thứ hai.

*In và Xuất khẩu* đã có đường ống generic theo `VoucherKind`, và `VoucherKind` **đã khai
sẵn** 4 giá trị treasury cùng `paper: 'A5'`. Việc còn lại là 4 mapper payload + 8 route
sao chép nguyên mẫu `goods-receipt.controller.ts:95-121`, cộng một route xuất danh sách
dùng `ExportPipeline` với nguồn là truy vấn CQRS đang có.

## Alternatives rejected

| Option | Why not |
|---|---|
| Thêm dropdown "Loại đối tượng" vào 4 dialog, mặc định "Khác" | Akenzy chốt ngược lại (A-01). Thêm một control người dùng phải hiểu để làm việc họ vốn tưởng đã làm được; và vẫn phải sửa `VoucherPartnerFields` y hệt. |
| Thêm `other` vào enum `PartnerLookupType` của backend để modal hết 400 | Route đó là *tìm kiếm danh mục*. Không có gì để tìm cho một cái tên chưa tồn tại; thêm giá trị chỉ để trả về danh sách rỗng là hợp thức hoá một lối cụt. Ta gỡ mục đó khỏi dropdown (ADR-04). |
| Sửa tên sau khi chọn danh mục thì cắt `partner_id`, tự chuyển về `OTHER` | Akenzy chốt giữ liên kết (A-02). Cắt liên kết vì một lần gõ nhầm sẽ làm phiếu rơi khỏi sổ công nợ của khách — hỏng nặng hơn nhiều so với tên in ra lệch danh mục. |
| Dựng module `treasury-print` riêng cho In/Xuất | `report-core/export` và `lib/print` đã là chỗ đúng và đang phục vụ 3 chứng từ kho. Module thứ hai tạo ra khuôn thứ hai — chính điều `export-print` UOW-04 cấm trong definition-of-done của nó. |
| Xuất danh sách Thu chi bằng kiểu buffer như `deposit-ledger/export` | Nó dựng cả workbook trong RAM rồi `res.send`. `ExportPipeline` stream ra sink và đã có trần dòng kiểm trước khi mở phản hồi (ADR-08 của `export-print`). |
| Dùng `LedgerCashPage` cho nút xuất danh sách | Đó là tab *Sổ chi tiết*, không phải *Thu chi* (A-R4). |

## Domain model

Không entity mới, không migration. Các cột đã có và được dùng lại nguyên trạng:

| Cột | Bảng | Vai trò sau feature này |
|---|---|---|
| `partner_type` | 4 bảng phiếu | `OTHER` khi không có `partner_id`; loại danh mục khi có |
| `partner_id` | 4 bảng phiếu | NULL với đối tượng tự nhập; **giữ nguyên** khi người dùng chỉ sửa tên (ADR-02) |
| `partner_name_snapshot` | 4 bảng phiếu | Tên đóng băng trên phiếu — nguồn duy nhất cho bản in |
| `partner_address_snapshot` | 4 bảng phiếu | Địa chỉ đóng băng; phiếu tiền mặt lần đầu tiên ghi được (ADR-03) |
| `revision` | 4 bảng phiếu | Không đổi vai trò; sửa địa chỉ cũng làm tăng revision như mọi sửa khác |

## Contracts

### Thay đổi hợp đồng ghi — 4 DTO tiền mặt

`CreateCashReceiptDto`, `UpdateCashReceiptDto`, `CreateCashPaymentDto`,
`UpdateCashPaymentDto` nhận thêm:

```ts
/** "Địa chỉ" — đóng băng lên phiếu; thắng địa chỉ hiện tại của danh mục. */
@IsOptional() @IsString() @MaxLength(500)
address?: string;
```

`@MaxLength(500)` khớp `varchar(500)` của cột, và khớp DTO tiền gửi đang chạy.

Đồng thời **nới ngữ nghĩa `partnerName`** trên cả 8 DTO (4 create + 4 update): chú thích
hiện tại nói "Only read when `partnerType` is `OTHER`". Sau ADR-02 nó được đọc cả khi có
`partnerId`. Đây là thay đổi hợp đồng ngầm — phải sửa chú thích, nếu không người đọc sau
sẽ tin vào lời hứa cũ.

### Route mới — In và Xuất từng phiếu

Tám route, hai cho mỗi loại phiếu, sao đúng mẫu `goods-receipt.controller.ts:95-121`:

```
GET /cash-receipts/:id/print-payload      → VoucherPrintPayload   (accounting.cash_receipt.read)
GET /cash-receipts/:id/export             → .xlsx                 (accounting.cash_receipt.read)
GET /cash-payments/:id/print-payload      → VoucherPrintPayload   (accounting.cash_payment.read)
GET /cash-payments/:id/export             → .xlsx                 (accounting.cash_payment.read)
GET /bank-receipts/:id/print-payload      → VoucherPrintPayload   (accounting.bank_receipt.read)
GET /bank-receipts/:id/export             → .xlsx                 (accounting.bank_receipt.read)
GET /bank-payments/:id/print-payload      → VoucherPrintPayload   (accounting.bank_payment.read)
GET /bank-payments/:id/export             → .xlsx                 (accounting.bank_payment.read)
```

Tất cả giữ `@RequireBranchScope()` như route `GET :id` cạnh nó. Không permission mới
(A-08) — cùng lập luận đã ghi sẵn ở `cash-voucher-v2.controller.ts:32-33`: một key mới sẽ
403 mọi vai trò hiện có cho tới khi RBAC cấp.

`VoucherPrintPayload` cho phiếu quỹ:

| Trường | Giá trị |
|---|---|
| `kind` | `CASH_RECEIPT` / `CASH_PAYMENT` / `BANK_RECEIPT` / `BANK_PAYMENT` (đã có sẵn trong enum) |
| `paper` | `'A5'` |
| `title` | `PHIẾU THU` / `PHIẾU CHI` cho tiền mặt; `PHIẾU THU (tiền gửi)` / `PHIẾU CHI (tiền gửi)` cho tiền gửi — nguyên văn AC-11, là hợp đồng |
| `info` | Đối tượng (nhãn theo chiều phiếu), Địa chỉ, Người nộp/nhận, Lý do, Quỹ / Tài khoản |
| `lineColumns` | Diễn giải · Mục thu-chi · Số tiền |
| `amountInWords` | `amountInWords(totalAmount)` |
| `signatures` | `["Người lập phiếu", "Kế toán trưởng", "Thủ quỹ", "Người nộp tiền"]` (phiếu chi: "Người nhận tiền") |

### Route mới — Xuất danh sách Thu chi

```
POST /v2/cash-vouchers/export   body: CashVoucherSearchV2Dto   (accounting.cash_receipt.read)
```

POST chứ không GET, vì bộ lọc là chính `CashVoucherSearchV2Dto` mà lưới đang gửi cho
`POST /v2/cash-vouchers/search`. Dùng lại nguyên DTO đó bảo đảm cái xuất ra và cái nhìn
thấy là cùng một truy vấn — kiểu bug "xuất ra khác cái đang xem" chỉ sinh ra khi hai bên
có hai DTO.

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| `counterpartyName` (tên gõ tay hoặc từ danh mục) | state của từng dialog | Dialog |
| `partnerId` / `partnerKind` | state của từng dialog | Dialog; `partnerKind` chỉ còn dùng cho bộ lọc kính lúp và nhãn |
| `address` | state của từng dialog | Dialog |
| `printing` / `exporting` | state của từng dialog | Dialog; khoá nút khi đang chạy |
| Payload in | không giữ — fetch mỗi lần bấm In | Một lần bấm |

## Error taxonomy

| Điều kiện | Phản hồi | UI |
|---|---|---|
| Phiếu không tồn tại / khác tổ chức / khác chi nhánh | 404 | toast "Không tìm thấy phiếu." |
| Thiếu quyền đọc phiếu | 403 | toast lỗi chung; nút vẫn hiện (đúng như chứng từ kho) |
| Xuất danh sách vượt trần dòng | 400 **trước khi** mở phản hồi | toast "Kết quả quá lớn, hãy thu hẹp bộ lọc." |
| Lấy payload in thất bại | — | toast "Không in được phiếu."; không mở cửa sổ in |
| Tải .xlsx thất bại | — | toast "Xuất khẩu thất bại." (đúng chuỗi `LedgerDepositPage` đang dùng) |
| Sửa phiếu với `revision` cũ | 409 | đã có sẵn từ 2026090701; feature này không đụng |

## Observability

Không thêm event Kafka, không thêm metric. In và Xuất đều là đường đọc thuần.
`AuditInterceptor` đã gắn ở `CashVoucherV2Controller` phủ route xuất danh sách.

## ADRs

### ADR-01 — Bỏ cờ "loại đối tượng" khỏi giao diện, suy ra ở biên gửi đi
**Context:** Đường dây đối tượng tự nhập đã hoàn chỉnh nhưng khoá sau `partnerKind === OTHER`,
mà không control nào bật được (xem `00-intent.md`). Có hai cách mở: thêm dropdown để bật cờ,
hoặc bỏ cờ khỏi giao diện.
**Decision:** Bỏ khỏi giao diện. `VoucherPartnerFields` luôn render `[Mã 🔍][Tên]` với ô Tên
gõ được; không còn nhánh bố cục theo `freeText`. `mapPartnerFields` suy `partnerType`:
`partnerId` có → loại danh mục; không có mà tên khác rỗng → `OTHER` + `partnerName`; không
có cả hai → không gửi trường đối tượng nào.
**Consequences:** Người dùng không phải học thêm khái niệm nào — đúng phản xạ "chỉ cần fill
tên thôi". Đổi lại, `partnerKind` mất vai trò *người dùng chọn* và chỉ còn là bộ lọc kính
lúp + nhãn; ai đọc code sau này có thể tưởng nó vẫn là lựa chọn của người dùng, nên phải
ghi rõ trong chú thích. Nhánh `if (freeText)` ở cả hai chế độ (sửa và chỉ đọc) của
`VoucherPartnerFields` bị xoá — chế độ chỉ đọc vẫn phải ẩn ô Mã khi phiếu không có
`partnerId`, nếu không sẽ hiện một ô trống vô nghĩa.
**Status:** accepted

### ADR-02 — Sửa tên không cắt liên kết danh mục
**Context:** Sau ADR-01, một phiếu có thể vừa mang `partner_id` vừa mang tên gõ tay khác tên
danh mục.
**Decision:** Giữ `partner_id`, ghi `partner_name_snapshot` bằng tên người dùng gõ. Backend
đọc `dto.partnerName` cả khi `partnerType` không phải `OTHER` — nới đúng cái luật mà chú
thích DTO hiện đang hứa ngược lại.
**Consequences:** Công nợ và mọi báo cáo quy theo `partner_id` không bị ảnh hưởng bởi việc
sửa tên. Cái giá: tên in trên phiếu có thể khác tên trong danh mục, và đó là **có chủ ý** —
snapshot là ảnh chụp tại thời điểm lập phiếu, đúng như `partner_address_snapshot` vốn đã
hành xử. Phải sửa chú thích ở 8 DTO, nếu không hợp đồng viết một đằng chạy một nẻo.
**Status:** accepted

### ADR-03 — Chép luật địa chỉ từ phiếu tiền gửi, không phát minh luật mới
**Context:** Phiếu tiền gửi đã có `address` trong DTO và luật `dto.address ?? partner?.address`
(`bank-receipts.service.ts:199`). Phiếu tiền mặt thiếu trường nên chuỗi rơi ở biên HTTP.
**Đính chính 2026-09-08 (A-R6):** câu "phiếu tiền gửi chạy tốt" chỉ đúng với *cấu trúc*. Phía
tiền gửi không `.trim()` và không quy chuỗi rỗng về `null`, nên xoá trắng địa chỉ ở đó lưu `''`.
Bản tiền mặt lấy cấu trúc của tiền gửi nhưng lấy cách xử lý rỗng từ `partnerName` (T-01-05).
**Decision:** Thêm `address` vào 4 DTO tiền mặt và áp đúng luật đó. Bỏ dòng hard-set
`partnerAddressSnapshot: null` ở nhánh đối tượng tự nhập (`cash-receipts.service.ts:235`,
`cash-payments.service.ts:231`) — sau ADR-03 nhánh đó cũng có địa chỉ để ghi.
**Consequences:** Hai họ phiếu hành xử giống nhau, và người dùng hết gặp cảnh "phiếu tiền
gửi thì nhớ, phiếu tiền mặt thì quên". Không migration. Rủi ro nhỏ: hàm `update()` phải
phân biệt `undefined` (không gửi) với `''` (xoá trắng) — bẫy `save()` bỏ qua `undefined`
đã ghi trong bộ nhớ dự án và đã có test hai chiều từ 2026090701, phải giữ tiếp cho `address`.
**Status:** accepted

### ADR-04 — Gỡ "Khác" khỏi dropdown của modal "Chọn đối tượng"
**Context (đã sửa 2026-09-08):** `PARTNER_LOOKUP_DIALOG_OPTIONS` chứa "Khác", và đường đó
**chạy được**: `onChange` của select ở `VoucherEntitySearchModal.tsx:303-320` chặn free-text
trước khi gọi `loadPage`, trả về form một lựa chọn rỗng mang `kind: OTHER` rồi đóng modal.
Không có request 400 nào. Đây là đính chính cho kết luận sai ở bản đầu của tài liệu này.
Vấn đề thật: để khai một đối tượng **không** có trong danh mục, người dùng phải mở hộp thoại
*tìm kiếm danh mục* rồi đổi bộ lọc loại — một thao tác không ai đoán ra.
**Decision:** Sau ADR-01, ô Tên trên form luôn gõ được, nên nhánh này thành **dư thừa**:
cùng một việc, làm qua hai đường, một trong hai đường đi ngược trực giác. Gỡ "Khác" khỏi
`PARTNER_LOOKUP_OPTIONS` và gỡ nhánh free-text trong `onChange` của modal. Enum
`PartnerLookupType.OTHER` giữ nguyên vì `inferLookupType` vẫn cần nó khi hydrate phiếu cũ.
**Consequences:** Modal trở lại đúng một việc — chọn từ danh mục. Không mất chức năng: gõ
thẳng vào ô Tên là xong. Cái giá: `isFreeTextLookupType` còn **hai** nơi gọi khác
(`voucher-dialog.utils.ts:85` và `:140`) suy `partnerType` theo cờ đó; chúng phải chuyển
sang căn cứ `partnerId || counterpartyName.trim()` cho khớp `resolvePartyFields`, nếu không
sẽ có hai luật suy loại chạy song song và lệch nhau. Đó là việc thật của T-01-04, không phải
một cú xoá một dòng như bản kế hoạch đầu tưởng.
**Status:** accepted

### ADR-05 — In và Xuất từng phiếu sao nguyên mẫu chứng từ kho
**Context:** `VoucherKind` đã có 4 giá trị treasury, `paper` đã có `'A5'`,
`amount-in-words.util.ts` đã tồn tại, `renderVoucherHtml` đã tham số hoá khổ giấy,
`ExportPipeline` + `VoucherXlsxWriter` + `voucherToReportDocument` đã chạy cho 3 chứng từ kho.
**Decision:** Mỗi loại phiếu thêm một mapper `*-print.mapper.ts` + một `getPrintPayload()`
ở service + 2 route ở controller, sao đúng `goods-receipt.controller.ts:95-121`. Route
`export` **dùng lại chính payload của `print-payload`** qua `voucherToReportDocument` —
một nguồn sự thật cho cả hai, nên bản in và file Excel không thể lệch nhau.
**Consequences:** Rủi ro lớn nhất của kế hoạch cũ (`export-print` UOW-04: "đọc số thành chữ
tiếng Việt nhiều trường hợp biên") **không còn** — hàm đã có và đã có spec. Đổi lại, 4 mapper
là 4 chỗ có thể lệch nhau về nhãn; một bảng nhãn dùng chung giữ chúng thẳng hàng.
**Status:** accepted

### ADR-06 — Xuất danh sách qua `ExportPipeline`, trần dòng kiểm trước khi mở phản hồi
**Context:** Có hai kiểu xuất trong repo: kiểu buffer cũ (`deposit-ledger/export`) và
`ExportPipeline` stream của báo cáo.
**Decision:** Dùng `ExportPipeline`. Nguồn dữ liệu là chính `SearchCashVouchersV2Query` mà
lưới đang dùng, gọi với `limit` = trần xuất khẩu thay vì `limit` của trang. Trần dòng kiểm
**trước** khi gọi `run()`, vì byte đầu tiên rời tiến trình trong `begin` và một phản hồi đã
mở thì không rút lại được (ADR-08 của `export-print`).
**Consequences:** Xuất ra đúng bằng cái đang xem (AC-17) vì cùng một DTO, cùng một handler.
Cái giá: một truy vấn `limit` lớn thay vì phân trang keyset; chấp nhận được ở khối lượng
phiếu quỹ một chi nhánh một kỳ, và trần dòng là cái chặn.
**Status:** accepted

### ADR-07 — Feature này thay thế `export-print` UOW-04
**Context:** `.ai/features/export-print/` UOW-04 "In phiếu thu chi tiền mặt và tiền gửi (A5)"
có 3 ticket `todo` phủ đúng phần In. `export-print` đang treo 8 ticket và chưa đóng được G4.
**Decision:** Phần In làm ở feature này (UOW-03), dùng lại nguyên demo script và tinh thần
AC-14/AC-15 của UOW-04 cũ. Khi UOW-03 ở đây `done`, đóng T-04-01..03 bên `export-print`
bằng `aidlc done --no-review` với lý do trỏ về feature này — bypass được ghi vào trail,
không hand-edit state.
**Consequences:** Một kế hoạch, một lần demo, một PR cho toàn bộ khiếu nại của người dùng.
`export-print` bớt 3 ticket treo. Rủi ro: nếu người đọc sau chỉ nhìn `export-print` sẽ tưởng
phần In chưa ai làm — nên lý do của `done` phải nêu đích danh slug
`2026090804-treasury-voucher-party-address-print-export`.
**Status:** accepted
