---
feature: treasury-voucher-staff-date-autocomplete
adr_count: 8
---

# Logical design — Phiếu thu/chi: nhân viên trên bản in, Ngày thu/chi trên danh sách; tắt autocomplete backoffice

## Approach

Ba mảng việc độc lập, không chung file nào, nên thành ba lát cắt chạy song song.

**In / Xuất phiếu quỹ.** Khuôn in đã là một payload với hai renderer (`render-voucher-html.ts` cho In,
`voucher-xlsx.writer.ts` cho Xuất khẩu). **Kết quả cuối không đổi khuôn in**: chỉ dữ liệu 4 mapper quỹ đưa vào nó
đổi. (Plan ban đầu thêm `signatureNames` để in tên dưới chữ ký — ADR-01; Akenzy bỏ phần đó sau khi xem bản in, ADR-08,
và trường này được gỡ khỏi payload cùng hai renderer.)

Bốn mapper quỹ đổi khối `info`: bỏ dòng quỹ / tài khoản, thêm dòng nhân viên ngay trước "Lý do" (ADR-02), và cột ký đầu
tiên lấy nhãn "Nhân viên thu" / "Nhân viên chi" (ADR-07). Tên nhân viên được resolve **trong service**, không trong
mapper — mapper vẫn thuần như ADR-05 của `treasury-voucher-party-address-print-export` yêu cầu. Phiếu tiền mặt tra tên
qua `VoucherStaffResolver.resolveOne(staffId)`; phiếu tiền gửi dùng thẳng `collectedByName` / `paidByName` mà `getById`
đã gắn (ADR-08). Resolver đang nằm trong `deposit-vouchers`, mà `DepositVouchersModule` import `CashVouchersModule`, nên
nó chuyển về `cash-vouchers/shared` — đúng chỗ `PartnerResolverService` đang nằm và cũng đang được module tiền gửi dùng
lại (ADR-03).

**Danh sách Thu, chi tiền mặt.** Hàng của lưới đã trả `voucherDate` (`CashVoucherRowDto`) nhưng không ai dùng.
Trường lọc `createdAt` của `CashVoucherSearchV2Dto` đổi tên thành `voucherDate`, handler lọc và sắp theo nó
(ADR-04, ADR-06). Vì `POST /v2/cash-vouchers/export` dùng lại đúng DTO đó, file xuất đổi theo mà không cần luồng
riêng; chỉ cột xuất đổi nhãn và nguồn. Phía web, khoá cột được đặt theo tên trường request
(`receipt-cash.constants.ts`), nên đổi khoá là đủ để `buildV2Body` gửi đúng trường.

**Autocomplete.** `Input` của `@erp/ui` đặt `autoComplete="off"` *trước* khi rải `props`, nên nơi nào truyền giá
trị riêng (đăng nhập, đổi mật khẩu) vẫn thắng. Một chỗ sửa phủ 74 file backoffice, gồm `LookupField` (ảnh 5, 7)
và ô "Tên đối tượng". Phần còn lại là `TagsInput`, `MultiSelectChips` và các `<input>` dạng text viết tay (ADR-05).

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Đổi `signatures` thành `Array<{ label; name? }>` | Bắt sửa cả 4 mapper kho và spec của chúng chỉ để đổi hình dạng, không thay đổi gì người dùng thấy. Mảng tuỳ chọn đi kèm giữ phiếu kho nguyên trạng (ADR-01). |
| Thêm trường `preparedByName` và renderer luôn in vào cột ký đầu tiên | Đưa giả định "cột đầu là người lập" vào renderer vốn không phân nhánh theo loại phiếu. Nếu một loại phiếu đổi thứ tự nhãn ký, tên in nhầm cột mà không test nào bắt. |
| Giữ `signatureNames` trong payload và hai renderer, chỉ ngừng đặt nó ở mapper quỹ | Không còn nơi nào dùng — code chết do chính feature này tạo ra, vẫn phải bảo trì và test. Akenzy chọn gỡ hẳn (A-17, ADR-08). |
| Resolve tên nhân viên ở frontend trước khi render | Excel được dựng ở backend từ cùng payload; resolve ở web thì Xuất khẩu không có tên — đúng kiểu lệch hai renderer mà khuôn in dựng ra để tránh. Đường `/admin/users/:id` cũng cần `iam.user.read`, thứ nhân viên quỹ thường không có. |
| `CashVouchersModule` import `DepositVouchersModule` để dùng resolver | Vòng module: `DepositVouchersModule` đã import `CashVouchersModule`. |
| Viết resolver thứ hai trong `cash-vouchers` | Hai cách ghép tên nhân viên sẽ lệch nhau; chuyển file là thay đổi nhỏ hơn. |
| Giữ `createdAt` và thêm `voucherDate` vào DTO | Lưới không còn cột nào lọc theo ngày tạo, nên `createdAt` thành trường chết mà vẫn có trong hợp đồng. Chỉ đáng giữ nếu có client ngoài repo đang gửi nó (A-11). |
| Thêm `autoComplete="off"` tại từng nơi dùng `Input` | Diff 74 file, và ô mới viết sau này lại quên. |
| `MutationObserver` toàn cục gắn `autocomplete="off"` vào mọi input | Sửa DOM sau lưng React; khó lường với ô bị render lại, và không ai đọc component mà biết thuộc tính từ đâu ra. |
| `<form autoComplete="off">` bọc dialog | Phần lớn ô không nằm trong `<form>`, và Chrome không kế thừa thuộc tính từ form một cách nhất quán. |

## Domain model

Không entity mới, không migration (A-15). Cột được đọc thêm:

| Cột | Bảng | Dùng cho |
| --- | --- | --- |
| `staff_id` | `cash_receipts`, `cash_payments` | Dòng "Nhân viên thu/chi" trong khối thông tin |
| `collected_by` / `paid_by` | `bank_receipts` / `bank_payments` | Như trên; đã được `attachStaff` resolve thành `collectedByName` / `paidByName` trong `getById` |
| `voucher_date` | `cash_receipts`, `cash_payments` | Cột, bộ lọc và thứ tự của danh sách |

## Contracts

### `VoucherPrintPayload` (`packages/shared-interfaces/src/printing/voucher-payload.ts`)

**Không đổi so với `main`.** T-01-01 từng thêm `signatureNames?: (string | null)[]` và dạy hai renderer in tên dưới
chữ ký; T-01-08 gỡ lại (ADR-08), nên `voucher-payload.ts`, `render-voucher-html.ts`, `voucher-xlsx.writer.ts` và test
của chúng quay về đúng nội dung `main`.

### Mapper quỹ

```ts
// staffName: Nhân viên thu/chi đã resolve — null khi phiếu không có, hoặc id không thuộc org.
mapCashReceiptToVoucherPayload(receipt, branch, staffName, categoryNames)
mapCashPaymentToVoucherPayload(payment, branch, staffName, categoryNames)
mapBankReceiptToVoucherPayload(receipt, branch, staffName, categoryNames)
mapBankPaymentToVoucherPayload(payment, branch, staffName, categoryNames)

// Service tiền mặt:  (await staffResolver.resolveOne(voucher.staffId, orgId))?.name ?? null
// Service tiền gửi:  receipt.collectedByName ?? null  /  payment.paidByName ?? null   (đã có từ getById)
```

`TreasuryVoucherPeople` và `resolvePeople` (T-01-02) bị gỡ ở T-01-07 — chúng chỉ tồn tại để lùi về tên người tạo.

Tham số tên quỹ / tên tài khoản bị bỏ, cùng các hàm `resolveCashAccountName` / `resolveBankAccountName` nếu không
còn nơi nào khác gọi.

`info` sau thay đổi (phiếu chi tiền mặt; phiếu thu thay nhãn tương ứng):

| # | Nhãn | Nguồn |
| --- | --- | --- |
| 1 | Người nhận tiền | `partnerNameSnapshot` |
| 2 | Địa chỉ | `partnerAddressSnapshot` |
| 3 | Người nhận | `payeeName` |
| 4 | **Nhân viên chi** | `staffName` |
| 5 | Lý do | `reason` |
| 6 | Tham chiếu | `reference` — chỉ phiếu tiền gửi (A-08) |

Dòng nào rỗng thì bỏ, như `infoRow` đang làm.
`signatures` = `[LABELS.staffLabel, "Kế toán trưởng", "Thủ quỹ", LABELS.lastSignature]` (ADR-07). Payload không có
`signatureNames` — không tên nào in sẵn dưới chữ ký (ADR-08).

`TREASURY_PRINT_LABELS` thêm `staffLabel`: "Nhân viên thu" cho 2 loại phiếu thu, "Nhân viên chi" cho 2 loại phiếu chi.

### `POST /v2/cash-vouchers/search` và `POST /v2/cash-vouchers/export`

```diff
- /** Creation-timestamp column, also fed by the period (from/to) filter. */
- createdAt?: DateRangeFilterDto;
+ /** Voucher-date column ("Ngày thu/chi"), also fed by the period (from/to) filter. */
+ voucherDate?: DateRangeFilterDto;
```

Handler: `applyDateRange(where, params, '"voucherDate"::date', dto.voucherDate)`;
`ORDER BY "voucherDate" DESC, "createdAt" DESC, id DESC`. `voucherDate` trong CTE là `voucher_date::text` dạng
`YYYY-MM-DD`, nên sắp theo chuỗi đúng thứ tự ngày. Bộ lọc vẫn chạy ở tầng ngoài CTE như bộ lọc `createdAt` hôm nay,
nên không nhanh hơn cũng không chậm hơn.

Hàng trả về không đổi: vẫn có cả `createdAt` và `voucherDate`.

Cột xuất: `{ col: 'voucherDate', label: 'Ngày thu/chi', type: ReportColumnDataType.DATE }` thay cho cột `createdAt`.
`voucherDate` đã là ngày thuần, nên fetcher chuyển thẳng, không đi qua `new Date()` (tránh lệch múi giờ).

Regenerate `packages/api-client` (`openapi.snapshot.json`, `src/generated/schema.ts`) sau khi đổi DTO.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Bộ lọc cột `voucherDate` (trước là `createdAt`) | `columnFilters` trong `TreasuryCashReceiptsPage` | Trang |
| Kỳ đang áp dụng | `appliedPeriod`, gộp vào khoá `voucherDate` trong `searchBody` | Trang |
| Tên nhân viên thu/chi trên bản in | Payload in, dựng mỗi lần gọi `print-payload` / `export` | Một request |

## Error taxonomy

| Condition | Failure | UI |
| --- | --- | --- |
| `staff_id` / `collected_by` / `paid_by` không có trong `users` của org (user bị xoá, id lạc org) | Không lỗi — resolver bỏ id đó, tên là null | Không có dòng nhân viên; bản in / file vẫn tạo được (AC-07) |
| Client cũ gửi `createdAt` trong body tìm kiếm / xuất | 400 `VALIDATION` (`forbidNonWhitelisted`) | Toast lỗi hiện có của lưới — chỉ xảy ra với client chưa cập nhật (A-11) |
| `voucherDate.from` / `to` sai định dạng | 400 `VALIDATION` từ `DateRangeFilterDto`, như hôm nay | Như hôm nay |
| Phiếu không tồn tại / khác org khi In / Xuất | 404 từ `getById`, không đổi | Như hôm nay |
| Chrome vẫn gợi ý trên một ô dù có `autocomplete="off"` (autofill địa chỉ) | Không phải lỗi ứng dụng | Ghi lại ô đó; xử lý riêng nếu người dùng báo (A-13) |

## Observability

Không sự kiện, không metric mới. Resolver nhân viên thêm đúng một cặp truy vấn `users` + `employee_profiles` cho mỗi
lần In / Xuất một phiếu tiền mặt. Phiếu tiền gửi không thêm truy vấn nào — tên nhân viên đã được `attachStaff` gắn
trong `getById` (ADR-08).

## ADRs

### ADR-01 — Tên dưới chữ ký là mảng tuỳ chọn cùng chỉ số với `signatures`
**Context:** Payload chỉ có nhãn chữ ký. Phiếu quỹ cần in tên dưới "Người lập phiếu"; 4 loại phiếu kho dùng chung
payload và renderer, và không được đổi.
**Decision:** Thêm `signatureNames?: (string | null)[]` vào `VoucherPrintPayload`. Cả `render-voucher-html.ts` và
`voucher-xlsx.writer.ts` in tên ở cột có tên không rỗng; cột không có tên, hoặc payload không có trường này, render
đúng như hiện tại.
**Consequences:** Không mapper kho nào phải sửa. Hai mảng song song có thể lệch nếu một mapper dựng sai — mapper quỹ
dựng cả hai từ cùng một hằng, và spec của nó khẳng định tên nằm đúng chỉ số của "Người lập phiếu".
**Bị thay thế bởi ADR-08 (14/09/2026):** Akenzy bỏ tên in sẵn dưới chữ ký; `signatureNames` được gỡ khỏi payload và
hai renderer (T-01-08). Giữ ADR này để lịch sử cho biết vì sao T-01-01 từng tồn tại.
**Status:** accepted

### ADR-02 — Khối thông tin phiếu quỹ: bỏ quỹ / tài khoản, thêm nhân viên trước Lý do
**Context:** Ảnh 2, 3 yêu cầu bỏ dòng "Quỹ tiền mặt" và thêm "Nhân viên chi"; Akenzy áp dụng cả cho tiền gửi (A-04).
**Decision:** Bỏ `infoRow('Quỹ tiền mặt', …)` và `infoRow('Tài khoản ngân hàng', …)`; thêm
`infoRow(LABELS.staffLabel, staffName)` ngay trước "Lý do". Dòng nhân viên không lùi về người tạo (A-07).
"Tham chiếu" giữ nguyên (A-08).
**Consequences:** Bản in không còn cho biết quỹ / tài khoản nào; thông tin đó vẫn có trên dialog phiếu. Spec mapper
đang khẳng định dòng quỹ / tài khoản phải sửa theo.
**Status:** accepted

### ADR-03 — `VoucherStaffResolver` chuyển về `cash-vouchers/shared`
**Context:** Resolver nằm ở `deposit-vouchers/shared`; `DepositVouchersModule` import `CashVouchersModule`, nên
module tiền mặt không import ngược được. `PartnerResolverService` đã đi đúng hướng này: nằm ở `cash-vouchers/shared`
và được `DepositVouchersModule` tự khai lại làm provider.
**Decision:** Chuyển file sang `cash-vouchers/shared/voucher-staff.resolver.ts`. `CashVouchersModule` thêm
`UserEntity`, `EmployeeProfileEntity` vào `forFeature` và khai resolver làm provider; `DepositVouchersModule` giữ
provider của mình, chỉ đổi đường import. Service phiếu tiền mặt dùng resolver để lấy tên nhân viên thu/chi khi In /
Xuất (cách gọi cụ thể: ADR-08).
**Consequences:** Hai dòng import trong service tiền gửi đổi đường dẫn. (Bản đầu của ADR này cho 4 service gọi
`resolveMany([nhân viên, createdBy])` để có cả tên người tạo; ADR-08 bỏ phần người tạo.)
**Status:** accepted

### ADR-04 — Trường lọc `createdAt` đổi tên thành `voucherDate`, không giữ alias
**Context:** Khoá cột lưới được đặt trùng tên trường request để `buildV2Body` không cần bảng dịch. Cột đổi thành Ngày
thu/chi thì trường lọc ngày tạo không còn cột nào dùng.
**Decision:** Đổi tên trường trong `CashVoucherSearchV2Dto`; lưới, bộ lọc kỳ và file xuất cùng dùng `voucherDate`.
Không giữ `createdAt`. Quyết định này đứng trên A-11 — nếu Akenzy biết có client ngoài repo gửi `createdAt`, ADR này
đổi thành "thêm `voucherDate`, giữ `createdAt` làm alias có hạn".
**Consequences:** Client chưa cập nhật gửi `createdAt` nhận 400. Backoffice đổi cùng lúc; `api-client` phải
regenerate.
**Status:** accepted

### ADR-05 — `Input` của `@erp/ui` mặc định `autoComplete="off"`, giá trị truyền vào thắng
**Context:** Dropdown lịch sử của Chrome che bảng gợi ý của `LookupField` và các ô chọn khác (ảnh 5–7). Akenzy chọn
phạm vi toàn backoffice (A-02).
**Decision:** Trong `input.tsx`, đặt `autoComplete="off"` trước `{...props}`. Làm tương tự với `<input>` bên trong
`TagsInput` và `MultiSelectChips`. Các `<input>` dạng text / search / number / tel / email viết tay trong
`apps/backoffice-web/src` nhận `autoComplete="off"` tại chỗ. Ô ngày (`type="date"`) không đổi — Chrome không gợi ý
lịch sử trên chúng.
**Consequences:** Ô đăng nhập và đổi mật khẩu giữ token của mình vì truyền giá trị tường minh. `pos-web` không đổi vì
không dùng `Input` này. Thẻ `<input>` viết tay mới về sau vẫn có thể quên thuộc tính — ghi trong summary, không dựng
guard tự động.
**Status:** accepted

### ADR-06 — Danh sách sắp theo ngày thu/chi, rồi thời điểm tạo
**Context:** Cột đổi thành Ngày thu/chi mà lưới vẫn sắp theo `createdAt` thì phiếu lập lùi ngày nằm lẫn giữa các ngày
khác. Akenzy chọn sắp theo ngày thu/chi (A-03).
**Decision:** `ORDER BY "voucherDate" DESC, "createdAt" DESC, id DESC`. Luồng xuất dùng cùng câu truy vấn nên cùng thứ tự.
**Consequences:** Phân trang ổn định nhờ `id` cuối. Spec handler đang khẳng định `ORDER BY "createdAt" DESC, id DESC`
phải sửa theo.
**Status:** accepted

### ADR-07 — Cột ký đầu tiên của phiếu quỹ là "Nhân viên thu" / "Nhân viên chi"
**Context:** ADR-01/ADR-02 in tên nhân viên dưới nhãn "Người lập phiếu" có sẵn trong `SIGNATURES`. Xem bản Xuất khẩu,
Akenzy yêu cầu nhãn cột đó theo loại phiếu: "Nhân viên thu" trên phiếu thu, "Nhân viên chi" trên phiếu chi (A-16).
**Decision:** `SIGNATURES` của 4 mapper quỹ lấy phần tử đầu từ `LABELS.staffLabel` — cùng hằng với dòng nhân viên trong
khối thông tin, nên nhãn trên hai chỗ không thể lệch nhau. Phiếu kho giữ "Người lập phiếu".
**Consequences:** Spec mapper đang khẳng định `'Người lập phiếu'` phải sửa; e2e T-01-05 khẳng định nhãn mới. Nhãn giữ
nguyên sau ADR-08 — chỉ tên bên dưới bị bỏ.
**Status:** accepted

### ADR-08 — Không in sẵn tên dưới chữ ký; gỡ `signatureNames` và việc tra người tạo
**Context:** Sau ADR-01 và ADR-07, cột ký đầu tiên in tên nhân viên thu/chi (trống thì người tạo) dưới "(Ký, họ tên)".
Xem bản in PC000044 ngày 14/09/2026, Akenzy nói "Không cần fill sẵn name phía dưới Người phiếu chi; Người phiếu thu" và
chọn gỡ hẳn phần in tên, không để lại code không dùng (A-17). A-01, A-10 bị bác.
**Decision:** 4 mapper quỹ không đặt `signatureNames` và nhận `staffName: string | null` thay cho
`people: TreasuryVoucherPeople`. Service tiền mặt lấy tên bằng `staffResolver.resolveOne(staffId, orgId)`; service tiền
gửi dùng `collectedByName` / `paidByName` mà `getById` đã gắn, không tra thêm. `resolvePeople` và `TreasuryVoucherPeople`
bị xoá (T-01-07). `signatureNames` bị gỡ khỏi `VoucherPrintPayload`, `render-voucher-html.ts`, `voucher-xlsx.writer.ts`
và test của chúng — 5 file đó quay về nội dung `main` (T-01-08).
**Consequences:** Khuôn in chung không đổi so với `main`, nên AC-09 (phiếu kho) đúng bằng cấu tạo. In phiếu tiền gửi
không thêm truy vấn nào; in phiếu tiền mặt thêm một lượt tra `users` + `employee_profiles` cho nhân viên thu/chi. Công sức
T-01-01 và phần người tạo của T-01-02 bị hoàn tác — ghi lại để `aidlc flow` phản ánh đúng.
**Status:** accepted
