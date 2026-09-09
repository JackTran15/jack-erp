---
feature: treasury-voucher-party-reason-edit
adr_count: 6
---

# Logical design — Phiếu thu chi quỹ tiền

## Approach

Ba lát cắt độc lập, nặng nhẹ rất khác nhau — và điều đó là kết quả của khảo sát chứ không
phải ước lượng: hai yêu cầu đầu hoá ra chỉ thiếu đường dây, còn yêu cầu thứ ba mới là bài
toán kế toán thật.

**Đối tượng tự nhập (US-01)** không cần migration. `CashVoucherPartnerType.OTHER` và
`BankVoucherPartnerType.OTHER` đã nằm sẵn trong cả TypeScript lẫn kiểu enum Postgres;
`partner_name_snapshot varchar(255)` đã có trên cả bốn bảng; `VoucherPartySnapshot.partnerName`
đã khai "Frozen onto partner_name_snapshot"; `PartnerResolverService.resolve` đã trả `null` cho
`OTHER` với chú thích "free-text partner, no validation". Việc còn lại đúng là **mở một đường
ống đã lắp sẵn nhưng chưa nối hai đầu**: thêm `partnerName` vào bốn cặp DTO, cho service ghi nó
xuống `partnerNameSnapshot` khi `partnerType === OTHER`, và ở FE thì thêm mục "Khác", mở khoá ô
tên, gửi kèm `partnerName` trong `mapPartnerFields`.

**Lý do tự điền (US-02)** thuần frontend. `reason` đã là free text trên cả bốn header, và cột
**đầu tiên** của lưới chi tiết đã đúng là `description` / "Diễn giải". Không DTO, không API,
không migration — chỉ một quy tắc sao chép trong handler của bốn dialog.

**Sửa và xoá phiếu đã ghi sổ (US-03, US-04)** là phần thực chất. Toàn bộ CRUD đã viết xong và
đang chết vì một mâu thuẫn: `update()`/`delete()` đòi `status === DRAFT`, còn `create()` luôn ghi
`POSTED` trong cùng transaction với cash movement và bút toán — nên chưa từng có một dòng DRAFT
nào tồn tại. Ta không gỡ mâu thuẫn bằng cách dựng lại bước nháp (đã cân nhắc và loại ở G0), mà
bằng cách cho `update()` chấp nhận phiếu POSTED và **ghi phần chênh lệch thành một cash movement
bù trên chính phiếu đó**. Xoá là cùng một phép tính với `after = []`.

Điểm khác biệt quan trọng so với bản đã làm bên kho: ở kho, tiền chênh lệch phải sinh ra một
*phiếu quỹ* mới, nên vướng khoá chống trùng `(referenceType, referenceId)` và phải bịa
`referenceId` dẫn xuất. Ở đây phiếu quỹ **chính là** chứng từ đang sửa, nên không sinh phiếu thứ
hai và không chạm khoá đó — xem ADR-01.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Dựng bước DRAFT: Lưu → nháp, bấm "Ghi sổ" mới lên sổ quỹ | Thêm một cú bấm vào thao tác hằng ngày mà vẫn **không** giải quyết được việc sửa phiếu đã ghi sổ — đúng cái người dùng đang kêu. Loại ở vòng hỏi G0 |
| Giữ nguyên, chỉ Đảo rồi tạo lại | Chính là hiện trạng bị phàn nàn: một lần gõ nhầm để lại hai dòng trên sổ quỹ và một số phiếu mới |
| Sửa thẳng dòng `cash_movements` / `journal_entries` cũ | Vi phạm bất biến "Journal entries are immutable after posting" (`docs/09-accounting-module.md:39-40`). Mất dấu vết, không đối soát được |
| Sinh một phiếu quỹ thứ hai mang phần chênh lệch (đúng như bên kho) | Lưới Thu chi lại có hai dòng cho một giao dịch — tái tạo đúng vấn đề của Đảo. Bên kho buộc phải vậy vì chứng từ gốc là phiếu kho, không phải phiếu quỹ |
| Thêm giá trị `CANCELLED` vào hai kiểu enum Postgres cho phiếu đã xoá | Hai migration `ALTER TYPE` trên hai kiểu enum, phải chạy `mode: 'each'`, để đổi lấy một thông tin mà `deleted_at` đã trả lời. Xem ADR-02 |
| Dựng danh mục "tên tự do đã dùng" cho ô Đối tượng tra cứu lại | Akenzy loại ở vòng 2 (A-06): thêm bảng, endpoint và migration cho một tiện ích gõ phím |
| Gộp ô Đối tượng quỹ tiền về `POST /v2/counterparties/search` như bên kho | Đúng về dài hạn nhưng là một đợt refactor riêng; `VoucherEntitySearchModal` bám chặt Zustand store, page cache và đường hydrate theo id (A-10) |

## Domain model

| Khái niệm | Nơi ở | Ghi chú |
| --- | --- | --- |
| `VoucherParty` | `partner_type` + `partner_id` + `partner_name_snapshot` trên 4 bảng | Sau feature này có đúng hai hình thái hợp lệ: **đã tra cứu** (`type` ∈ {CUSTOMER, SUPPLIER, EMPLOYEE} và `partner_id` không rỗng) hoặc **tự nhập** (`type = OTHER`, `partner_id` NULL, `partner_name_snapshot` không rỗng). Hình thái thứ ba — `type` rỗng và tên rỗng — vẫn hợp lệ vì phiếu không bắt buộc có đối tượng |
| `VoucherRevision` | Cột `revision int NOT NULL DEFAULT 0` — **mới**, 4 bảng | Số lần đã sửa. Vừa là khoá phân biệt lần sửa trong ghi chú bút toán, vừa là thẻ chống ghi đè đồng thời |
| `AmountDelta` | Tính trong bộ nhớ, không lưu | `newTotal − oldTotal` theo chiều tiền của loại phiếu. `0` nghĩa là chỉ sửa chữ, không chạm sổ |
| `EditableVoucher` | Vị ngữ, không phải cột | `reference_type = MANUAL` **và** `status = POSTED` **và** `reversed_by_voucher_id` NULL **và** `deleted_at` NULL. Một hàm dùng chung cho cả bốn service — xem ADR-05 về việc vì sao là `reference_type` chứ không phải `purpose` |

## Contracts

### PATCH /cash-receipts/:id (và 3 route anh em)

Thêm hai trường vào DTO sẵn có, không đổi route, không đổi permission:

```jsonc
{
  "revision": 0,              // BẮT BUỘC khi sửa phiếu đã ghi sổ — thẻ chống ghi đè
  "partnerName": "Nguyễn Văn A", // chỉ dùng khi partnerType = OTHER
  // ... các trường sẵn có: voucherDate, purpose, partnerType, partnerId,
  //     payerName, reason, staffId, cashAccountId, contraAccountId, lines[]
}
```

Phản hồi 200 trả phiếu sau khi sửa, `revision` đã tăng.

Failure modes:
- `400` phiếu không phải `purpose = OTHER` → `VoucherNotUserCreated`
- `400` quỹ không đủ tiền và `allow_negative = false` → `InsufficientBalance` (ném từ `recordMovement`, không viết lại)
- `400` ngày cũ hoặc ngày mới rơi vào kỳ đã khoá (chỉ tiền gửi) → `PeriodLocked`
- `409` `revision` không khớp → `StaleVoucher`
- `409` phiếu đã đảo hoặc đã xoá → `VoucherTerminal`
- `404` khác org/branch hoặc không tồn tại

### DELETE /cash-receipts/:id (và 3 route anh em)

Không đổi chữ ký. `204`. Cùng bộ failure modes, trừ `InsufficientBalance` — xoá một phiếu thu
làm giảm số dư nên vẫn có thể chạm trần; xoá phiếu chi thì luôn làm tăng.

### GET /cash-vouchers/partners

**Không đổi.** Loại "Khác" không tra cứu gì nên không cần giá trị `other` trong
`PartnerLookupType`; FE chặn trước khi gọi. Đây là hệ quả trực tiếp của A-06.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| `partnerKind` / `partnerName` đang gõ | `useState` trong từng dialog | Vòng đời dialog; reset khi mở CREATE |
| Số dư quỹ | `cash_accounts.balance`, chỉ `CashService` ghi | Vĩnh viễn |
| `revision` | Cột trên phiếu, chỉ `update()`/`delete()` tăng | Vĩnh viễn |
| Danh sách phiếu | TanStack Query, key bắt đầu bằng tên tài nguyên | Invalidate theo prefix sau mỗi mutation |
| Bộ lọc / trang của hộp thoại Chọn đối tượng | Zustand `voucher-entity-search.store` | Phiên làm việc |

## Error taxonomy

| Condition | Failure | UI |
| --- | --- | --- |
| Phiếu do saga/consumer sinh | `BadRequestException` — "Chỉ sửa được phiếu tự tạo" | Nút Sửa/Xóa disabled kèm tooltip nêu lý do; nếu gọi thẳng API thì toast lỗi |
| Quỹ không đủ tiền | `BadRequestException` từ `recordMovement` | Toast, phiếu và số dư không đổi |
| Kỳ đã khoá sổ (tiền gửi) | `BadRequestException` | Toast nêu rõ kỳ nào |
| `revision` lệch | `ConflictException` | Toast "phiếu đã được người khác sửa, tải lại rồi thử lại" |
| Phiếu đã đảo / đã xoá | `ConflictException` | Toast; nút đã disabled sẵn nên chỉ là lưới đua |
| Khác chi nhánh / khác tổ chức | `NotFoundException` | Toast chung |

## Cache & offline

Không có yêu cầu offline — backoffice là SPA chỉ chạy online. Sau mỗi lần sửa/xoá phải
invalidate theo prefix: danh sách phiếu, chi tiết phiếu, số dư quỹ (`use-cash-accounts`) và sổ
chi tiết tiền mặt/tiền gửi. Số dư quỹ là chỗ dễ quên nhất — nó hiển thị trên đầu trang và sẽ
đứng yên ở số cũ nếu chỉ invalidate danh sách.

## Observability

Sửa và xoá đều ghi một dòng log ở mức `log` kèm `voucherId`, `documentNumber`, `revision`,
`deltaAmount` và `actor.userId` — đủ để dựng lại một chuỗi sửa từ log khi đối soát lệch. Không
thêm Kafka topic mới: phiếu quỹ hiện không phát sự kiện khi tạo thủ công, nên phát khi sửa sẽ là
một bề mặt mới không ai tiêu thụ.

## ADRs

### ADR-01 — Chênh lệch ghi thẳng lên phiếu đang sửa, không sinh phiếu thứ hai

**Context.** Bên kho (`warehouse-voucher-edit-delete`), sửa một phiếu nhập phải sinh ra một
*phiếu quỹ* mang phần tiền chênh lệch, và việc đó vướng khoá chống trùng `(referenceType,
referenceId)` của `createAndPostInternal` — cặp gốc đã bị lần ghi sổ đầu chiếm — nên phải bịa
`referenceId` dẫn xuất bằng uuidv5 và đánh đổi mất liên kết "nhảy tới phiếu gốc".

Ở đây tình huống khác hẳn: chứng từ đang sửa **chính là** phiếu quỹ. Nếu ta sinh thêm một phiếu
chi 1.000.000 để bù cho phiếu thu vừa sửa từ 5.000.000 xuống 4.000.000, lưới Thu chi lại có hai
dòng cho một giao dịch — đúng cái người dùng đang phàn nàn ở nút Đảo.

**Decision.** Ghi phần chênh lệch bằng **một lời gọi `CashService.recordMovement`
(hoặc `DepositService.recordMovement`) duy nhất, trong cùng transaction với lệnh sửa phiếu**,
không tạo bản ghi phiếu mới. Chiều movement suy từ loại phiếu và dấu của delta: phiếu thu
delta dương → `DEPOSIT`, delta âm → `WITHDRAWAL`; phiếu chi ngược lại. `notes` mang
`Adjustment for <documentNumber> rev <n>` để đối soát lần ngược được.

**Consequences.** Lưới Thu chi giữ đúng một dòng cho một giao dịch — đạt mục tiêu của feature.
Sổ chi tiết tiền mặt sẽ có nhiều dòng movement trỏ về cùng một số phiếu, và đó là biểu hiện
đúng: sổ là nơi kể lịch sử, danh sách phiếu là nơi kể hiện trạng. Không chạm khoá
`(referenceType, referenceId)` nên không cần `deterministicVoucherRevisionReferenceId` như bên
kho. Đổi lại, một báo cáo nào đó giả định "một phiếu ↔ một movement" sẽ sai — phải rà, xem
T-03-06.

**Status:** accepted

### ADR-02 — Xoá = sửa về rỗng + soft-delete; không thêm `CANCELLED` vào enum

**Context.** `CashVoucherStatus` là `DRAFT | POSTED | REVERSED`, `BankVoucherStatus` thêm
`PENDING_APPROVAL`. Bên kho, `cancel()` vừa đặt `status = CANCELLED` vừa `softDelete`. Làm y
hệt ở đây cần hai migration `ALTER TYPE ... ADD VALUE` trên hai kiểu enum Postgres, và theo
`reference_migrations_transaction_mode_each` thì loại migration này phải chạy `mode: 'each'`,
tức batch mất tính nguyên tử.

**Decision.** Xoá là `update()` với `after = []` — cùng bộ máy tính delta, nên không thể tái
diễn lỗi "đảo tồn kho nhưng quên đảo bút toán" — rồi `softDelete`. **Giữ nguyên `status = POSTED`,
không thêm giá trị enum nào.** Câu hỏi "phiếu này còn không" do `deleted_at` trả lời.

**Consequences.** Không migration enum. Đã kiểm chứng đường đọc chính: truy vấn thô của
`search-cash-vouchers-v2.handler.ts:32` **đã** lọc `deleted_at`, nên AC-18 đạt được mà không
sửa gì ở đó. Hệ quả phải trả: mọi đường đọc bằng SQL thô khác đều phải được rà xem có lọc
`deleted_at` không — TypeORM chỉ tự lọc cho repository API, không lọc cho raw query. Đó là nội
dung ticket T-04-03, và là rủi ro đã biết chứ không phải rủi ro bị bỏ sót.

**Status:** accepted

### ADR-03 — Đối tượng tự nhập dùng lại `partner_name_snapshot`, không thêm cột

**Context.** Cần chỗ chứa một cái tên gõ tay. Có ba lựa chọn: cột mới
(`partner_custom_name`), bảng danh mục mới, hoặc dùng lại `partner_name_snapshot` đang có.

**Decision.** Dùng lại `partner_name_snapshot`. Cột này vốn để đóng băng tên đối tượng tại thời
điểm lập phiếu — một cái tên gõ tay **là** tên đã đóng băng, chỉ khác ở chỗ không có bản ghi
gốc để tra. `partner_type = OTHER` là dấu hiệu phân biệt hai trường hợp.

**Consequences.** Không migration cho US-01. Mọi đường đọc sẵn có hiện tên đúng ngay, kể cả
`COALESCE(NULLIF(btrim(payer_name),''), NULLIF(btrim(partner_name_snapshot),''), '')` ở lưới v2 —
lưu ý thứ tự đó nghĩa là "Người nộp" vẫn thắng "Đối tượng" trên cột hiển thị, và đó là hành vi
sẵn có, không đổi trong feature này. Cái mất: không phân biệt được ở tầng DB giữa "tên đóng băng
của một khách hàng đã bị xoá" và "tên gõ tay" nếu ai đó ghi `OTHER` sai cách — bù lại bằng ràng
buộc ở service (`OTHER` ⇒ `partner_id` phải NULL).

**Status:** accepted

### ADR-04 — Auto-fill Lý do làm trong handler, không dùng `useEffect`

**Context.** Repo đã có năm chỗ chép giá trị header xuống dòng, tất cả đều nằm trong handler
của một hành động rõ ràng, và `PaymentVoucherDialog.tsx:352-357` ghi hẳn lý do: "Done here
rather than in an effect so re-picking the same option after manual edits still restores the
defaults."

**Decision.** Chép trong `onChange`/`onBlur` của ô Lý do, với điều kiện `lines[0].description`
rỗng sau khi `trim()`. Không `useEffect` theo dõi `reason`.

**Consequences.** Không cần cờ dirty cho mỗi dòng. Một effect theo dõi `reason` sẽ chạy cả khi
dialog hydrate một phiếu cũ ở chế độ sửa, và sẽ ghi đè dòng 1 của một phiếu đã lưu — đúng loại
lỗi âm thầm mà quy tắc này chặn.

**Status:** accepted

### ADR-05 — Vị ngữ "sửa được" cưỡng chế ở service, không chỉ ở nút bấm

**Context.** Hiện trạng là nút bị khoá ở FE theo `status === DRAFT` còn service cũng chặn theo
`DRAFT`. Khi nới ra, cám dỗ là chỉ nới ở FE cho nhanh.

**Decision.** `EditableVoucher` là một hàm dùng chung, được gọi **trong service** ở cả
`update()` lẫn `delete()` của cả bốn loại; FE chỉ lặp lại nó để tô xám nút.

Vị ngữ khoá trên **`reference_type = MANUAL`**, không phải `purpose = OTHER`. Akenzy chốt A-01
theo nghĩa "phiếu người dùng tự tạo", và khảo sát cho thấy `purpose` không diễn đạt được điều đó:
`CashPaymentPurpose` có `EXPENSE` và `SALARY` vốn cũng do consumer sinh, còn `CashReceiptPurpose`
có cả `OTHER` lẫn `OTHER_INCOME`. Trong khi đó `cash-receipts.service.ts:168` cho thấy đường tạo
thủ công **ghi cứng** `referenceType: MANUAL`, và DTO không có trường đó nên client không giả mạo
được; mọi đường saga/consumer đi qua `createAndPostInternal` với `referenceType` riêng của chúng
(`INVOICE`, `INVOICE_DEBT`, `FUND_SWAP`, `TRANSFER`, `REVERSAL`, …). `MANUAL` vì thế là dấu hiệu
do server kiểm soát, đúng nghĩa "người dùng tự tạo" hơn `purpose`.

**Consequences.** Gọi thẳng API vẫn bị chặn (AC-13, AC-19 kiểm đúng điều này). Luật sống ở hai
nơi và có thể lệch — chấp nhận, vì lệch theo hướng FE mở hơn service thì service vẫn chặn, còn
lệch ngược lại chỉ làm nút xám oan.

**Status:** accepted

### ADR-06 — Chống ghi đè đồng thời bằng `revision` + khoá bi quan

**Context.** Bên kho đã trả giá cho đúng lỗi này hai lần: một lần thiếu khoá làm double-cancel
ghi hai bộ bút toán đảo, một lần ở PROD ngày 30/08 khi dialog seed state một lần lúc mount rồi
`PATCH` state cũ lên `id` mới.

**Decision.** Thêm cột `revision int NOT NULL DEFAULT 0`. `update()`/`delete()` đọc lại phiếu
bằng `SELECT ... FOR UPDATE` **bên trong** transaction, so `revision` client gửi lên với
`revision` vừa đọc, lệch thì `ConflictException`. Ở FE, ba handler toolbar Sửa/Xem/Nhân bản phải
guard theo `!!dialogMode` và dialog phải mang `key={voucher?.id ?? "new"}`.

**Consequences.** Một migration cho bốn bảng. `revision` thành trường bắt buộc trong DTO sửa —
client cũ (nếu có) sẽ hỏng ngay chứ không hỏng âm thầm, đó là chủ ý. Phần guard FE là phòng thủ
kép: bản thân `key` đã đủ ép remount, nhưng bên kho cho thấy hai lớp mới thực sự đóng được lỗ.

**Status:** accepted
