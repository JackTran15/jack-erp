---
feature: invoice-number-format
adr_count: 6
---

# Logical design — invoice-number-format

## Approach

Định dạng số chứng từ trong hệ thống này **là dữ liệu, không phải code**: nó nằm ở bảng
`document_number_rules`. Nên hướng đi là làm cho bộ dựng số **diễn đạt được** dạng
`2608210001` rồi cấu hình lại rule, chứ không thêm nhánh `if (documentType === INVOICE)`
vào code định dạng.

Bộ dựng hiện thiếu đúng hai thứ:

1. **Token ngày `YYMMDD`** — `formatDate` chỉ có `YYYYMMDD/YYYYMM/YYYY/MMDD/MM/DD`.
2. **Cách bỏ dấu phân cách** — `formatDocumentNumber` luôn `parts.join('-')` khi rule có
   ngày hoặc hậu tố, nên rule tiền tố rỗng sẽ ra `-260821-0001`.

Thêm token `YYMMDD` và một cột `separator` (mặc định `'-'`) là đủ cho cả hai. Mặc định `'-'`
khiến **mọi rule đang tồn tại render y hệt như trước**, nên thay đổi này không rò ra ngoài
phạm vi hoá đơn.

Sau đó, một migration đặt lại rule `INVOICE` và `RETURN`:

| documentType | prefix | includeDate | dateFormat | seqLen | separator | suffix | resetPolicy | Kết quả |
|---|---|---|---|---|---|---|---|---|
| INVOICE | `''` | true | `YYMMDD` | 4 | `''` | — | DAILY | `2608210001` |
| RETURN | `''` | true | `YYMMDD` | 4 | `''` | `TH` | DAILY | `2608210001TH` |

Nửa còn lại nằm ở POS: bỏ hẳn hàm sinh số ngẫu nhiên, và gán số thật vào biên lai từ
response của `/checkout` — đúng nếp đã có sẵn cho `pointsEarned`/`pointsBalanceAfter`.

## Alternatives rejected

| Option | Why not |
|---|---|
| Hardcode định dạng cho INVOICE/RETURN trong `formatDocumentNumber` | Màn "Cấu hình đánh số chứng từ" sẽ nói dối: quản trị viên sửa rule mà số không đổi. Và lần sau đổi định dạng lại phải sửa code. |
| Thay `prefix/suffix/dateFormat/...` bằng một cột `pattern` kiểu `{YYMMDD}{SEQ:4}TH` | Phải viết bộ parse template, migrate 18 rule đang có, và viết lại cả màn cấu hình. Đổi một định dạng không đáng một engine. |
| Để POS tự sinh số rồi gửi lên cho server dùng | Client không thể đảm bảo duy nhất. Đúng chiều là server cấp, client in lại. |
| Sinh số thật **trước** khi gọi API để in ngay | Số phải do transaction thanh toán cấp thì mới rollback được cùng nó (ADR-02 của `checkout-saga`). Cấp trước = số mồ côi mỗi lần thanh toán lỗi. |
| Tách `DocumentType.EXCHANGE` riêng khỏi `RETURN` | Migration enum + sửa mọi chỗ đọc RTN, đổi lấy việc phân biệt hai thứ mà người dùng nói là không cần phân biệt (A-03). |
| Backfill mã hoá đơn cũ sang định dạng mới | Chứng từ đã ghi sổ là bất biến; mã cũ đã in ra giấy, đã nằm trong báo cáo và phiếu thu (A-05). |

## Domain model

| Thực thể | Thay đổi | Ghi chú |
|---|---|---|
| `DocumentNumberRuleEntity` | **+ `separator: string`** (`varchar(5)`, NOT NULL, default `'-'`) | Chuỗi nối giữa các đoạn; `''` = dính liền |
| `DocumentNumberCounterEntity` | không đổi | `resetKey` `varchar(20)` chứa vừa `2026-08-22` (10 ký tự) |
| `DEFAULT_DOC_NUMBER_CONFIG` | mở rộng từ `{prefix, continuous}` thành `{prefix, continuous, dateFormat?, sequenceLength?, resetPolicy?, separator?, suffix?}` | Các trường tuỳ chọn mặc định đúng bằng giá trị đang hardcode hôm nay |

## Contracts

### `formatDocumentNumber(rule, now, sequence) → string`

Hai bản sao (xem ADR-05) đổi **cùng một cách**:

```ts
const seq = sequence.toString().padStart(rule.sequenceLength, "0");
// Giữ nguyên: rule liên tục (NK, PT…) không ngày không hậu tố → "NK000001"
if (!rule.includeDate && !rule.suffix) return `${rule.prefix}${seq}`;

const parts = [rule.prefix];
if (rule.includeDate) parts.push(formatDate(rule.dateFormat, now));
parts.push(seq);
if (rule.suffix) parts.push(rule.suffix);
return parts.join(rule.separator);      // ← trước đây là join("-")
```

Ma trận kết quả phải giữ nguyên với mọi rule đang có:

| prefix | date | seqLen | separator | suffix | Trước | Sau |
|---|---|---|---|---|---|---|
| `INV` | YYYYMM | 5 | `-` | — | `INV-202608-00013` | `INV-202608-00013` |
| `PT` | — | 6 | `-` | — | `PT000012` | `PT000012` |
| `''` | YYMMDD | 4 | `''` | — | *(không dựng được)* | `2608210001` |
| `''` | YYMMDD | 4 | `''` | `TH` | *(không dựng được)* | `2608210001TH` |

### `formatDate(format, date)`

Thêm đúng một dòng vào bảng tra: `YYMMDD: ${year.slice(-2)}${month}${day}`. Nhánh fallback
(`?? YYYYMMDD`) không đổi.

### Migration `AddDocumentNumberSeparatorAndInvoiceFormat`

```sql
ALTER TABLE document_number_rules
  ADD COLUMN separator varchar(5) NOT NULL DEFAULT '-';

-- Chặn trước: rule theo chi nhánh cho hoá đơn + bộ đếm riêng = hai chi nhánh
-- cùng ra 2608210001 → vi phạm uq_invoice_org_code (organization_id, code).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM document_number_rules
             WHERE document_type IN ('INVOICE','RETURN')
               AND is_active AND branch_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Active branch-scoped INVOICE/RETURN numbering rules exist; '
                    'the YYMMDDxxxx format has no branch segment and would collide '
                    'on uq_invoice_org_code. Deactivate them first.';
  END IF;
END $$;

UPDATE document_number_rules SET prefix='', suffix=NULL, include_date=true,
       date_format='YYMMDD', sequence_length=4, reset_policy='DAILY', separator=''
 WHERE document_type='INVOICE' AND is_active;

UPDATE document_number_rules SET prefix='', suffix='TH', include_date=true,
       date_format='YYMMDD', sequence_length=4, reset_policy='DAILY', separator=''
 WHERE document_type='RETURN' AND is_active;
```

`down()` trả rule về `INV`/`RTN` + `YYYYMM` + 5 + `MONTHLY` rồi `DROP COLUMN separator`.

**Không có `UPDATE invoices SET code`** ở bất kỳ đâu.

### `POST/PATCH /document-numbering/rules`

- `prefix`: `@Matches(/^[A-Za-z0-9\-_/]+$/)` → `*` và chuyển thành `@IsOptional()` — tiền tố
  rỗng hiện đang bị API từ chối.
- `dateFormat`: thêm `'YYMMDD'` vào `@IsEnum([...])`.
- **+ `separator?: string`**: `@IsOptional() @IsString() @MaxLength(5)`.

### POS — `InvoicePayload`

`invoiceNumber: string` → `invoiceNumber?: string`. Renderer chỉ in `<div class="doc-number">`
khi có giá trị. Đây cũng chính là cách phiếu tạm tính hết mang số giả (AC-13).

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| Số chứng từ kế tiếp | `document_number_counters` (row khoá `pessimistic_write` trong chính transaction thanh toán) | Vĩnh viễn |
| Định dạng số | `document_number_rules` | Vĩnh viễn, sửa qua màn cấu hình |
| Mã hoá đơn | `invoices.code`, ghi một lần lúc `persistInvoice` | Bất biến sau khi ghi sổ |
| `receiptPayload` | biến cục bộ trong `use-checkout-actions` | Một lần thanh toán; vá `invoiceNumber` sau khi API trả về, in xong là bỏ |

## Error taxonomy

| Condition | Hành vi | UI |
|---|---|---|
| Org chưa có rule INVOICE/RETURN | `ensureDefaultActiveRule` / `createDefaultRule` tạo rule theo config mới | Trong suốt |
| `dateFormat` lạ trong DB | `formatDate` fallback `YYYYMMDD` (giữ nguyên hôm nay) | Trong suốt |
| Trùng mã `23505` trên `uq_invoice_org_code` | Transaction thanh toán rollback | Toast lỗi thanh toán |
| Hai giao dịch cùng mở kỳ đếm mới | `DOC_NUMBER_COUNTER_CONFLICT` (đã có) | Toast "vui lòng thử lại" |
| Response checkout thiếu `code` | Phiếu in **không có dòng `Số:`** | Không in số sai — đây là điểm mấu chốt của cả feature |
| Migration gặp rule INVOICE/RETURN theo chi nhánh | `RAISE EXCEPTION`, migration dừng | Người vận hành xử lý rồi chạy lại |

## Cache & offline

Không có. Số chứng từ không bao giờ được cache — mỗi lần cấp là một lần ghi DB.
`INVOICE_KEYS.ALL` đã được invalidate sẵn sau checkout nên danh sách hoá đơn tự thấy mã mới.

## Observability

`ensureDefaultActiveRule` đã `logger.warn` khi tự tạo rule — giữ nguyên, và log đó chính là
tín hiệu để biết org nào chưa được migration chạm tới.

## ADRs

### ADR-01 — Dấu phân cách là một cột của rule, không phải quy ước ngầm

**Context:** cần dựng `2608210001` (không dấu) trong khi `INV-202608-00013` (có dấu) phải
giữ nguyên từng ký tự. Cách rẻ nhất là "prefix rỗng thì bỏ dấu" — một quy tắc ngầm.
**Decision:** thêm cột `separator varchar(5) NOT NULL DEFAULT '-'`; `formatDocumentNumber`
join bằng nó.
**Consequences:** một cột + một migration; đổi lại quản trị viên nhìn thấy và sửa được dấu
phân cách trên màn cấu hình, và mọi rule cũ giữ nguyên nhờ giá trị mặc định. Nhánh tắt
`!includeDate && !suffix` được **giữ nguyên có chủ ý** để `NK000001`/`PT000012` không đổi.
**Status:** accepted

### ADR-02 — Migration sửa rule tại chỗ, không tạo rule mới rồi vô hiệu hoá rule cũ

**Context:** đổi định dạng có thể làm bằng cách `is_active=false` rule cũ + `INSERT` rule mới.
**Decision:** `UPDATE` chính hàng đang active.
**Consequences:** `rule_id` không đổi nên các hàng `document_number_counters` cũ vẫn treo vào
đúng rule đó — vô hại vì `resetKey` đổi từ `2026-08` sang `2026-08-22`, bộ đếm ngày mới bắt
đầu từ 1. Tránh hẳn việc phải lách hai partial unique index `UQ_doc_rule_org_default` /
`UQ_doc_rule_org_branch`. Muốn quay lại thì `down()` `UPDATE` ngược.
**Status:** accepted

### ADR-03 — Số in lấy từ response sau khi thanh toán xong, không đoán trước

**Context:** biên lai được dựng **trước** khi gọi API (`use-checkout-actions.ts:221`), nên
lúc dựng chưa có số thật. Đó chính là lý do bản gốc sinh số ngẫu nhiên.
**Decision:** dựng biên lai không số, rồi gán `receiptPayload.invoiceNumber = soldInvoice.code`
(bán) / `posted.code` (trả, đổi) ngay sau mutation — cùng chỗ đã vá `pointsEarned`. Không có
số thì renderer ẩn hẳn dòng `Số:`.
**Consequences:** phiếu tạm tính tự nhiên hết mang số giả (AC-13). Trường hợp response thiếu
`code` thì in thiếu số — cố ý: **thiếu số tốt hơn sai số**, vì một con số trông đúng mà tra
không ra là thứ đã sinh ra chính bug này.
**Status:** accepted

### ADR-04 — Trả hàng và đổi hàng dùng chung một dải số, phân biệt bằng hậu tố `TH`

**Context:** cả hai đi qua `DocumentType.RETURN`; `invoices.type` mới là chỗ phân biệt
`RETURN` với `EXCHANGE`.
**Decision:** giữ một `DocumentType`, một rule, một bộ đếm; hậu tố `TH` cho cả hai (A-03).
**Consequences:** trong một ngày, `2608210001` (bán) và `2608210001TH` (trả/đổi) cùng tồn tại
mà không đâm nhau — hậu tố chính là thứ tách hai dải. Muốn tách đổi khỏi trả về sau thì phải
thêm `DocumentType` mới, chứ không lách bằng hậu tố khác trên cùng loại.
**Status:** accepted

### ADR-05 — Sửa cả hai bản sao của bộ định dạng trong cùng một ticket

**Context:** `formatDocumentNumber`/`formatDate`/`computeResetKey` tồn tại **hai bản**:
private trong `DocumentNumberingService`, và bản port công khai ở
`pos/checkout-saga/application/steps/document-number-format.ts` (saga cần chạy trong
transaction của chính nó — ADR-02 của `checkout-saga`). Đơn **bán** đi qua bản saga; đơn
**trả/đổi** đi qua `DocumentNumberingService.generate`.
**Decision:** một ticket sửa cả hai, và mở rộng bộ test chống drift đã có để phủ `YYMMDD` +
`separator`.
**Consequences:** sửa sót một bản thì đơn bán và đơn trả ra hai định dạng khác nhau — đúng
kiểu bug mà feature này đang đi sửa. Không hợp nhất hai bản ở đây: đó là refactor riêng, và
lý do tách chúng vẫn còn nguyên giá trị.
**Status:** accepted

### ADR-06 — Migration dừng lại nếu gặp rule đánh số hoá đơn theo chi nhánh

**Context:** `uq_invoice_org_code` là `(organization_id, code)`. Định dạng `YYMMDDxxxx` không
có đoạn nào phân biệt chi nhánh (A-02). Nếu một org đang có rule INVOICE/RETURN gắn
`branch_id`, mỗi chi nhánh sẽ có bộ đếm riêng và chi nhánh thứ hai đâm 23505 **giữa lúc
khách đang thanh toán**.
**Decision:** migration `RAISE EXCEPTION` khi phát hiện rule như vậy, thay vì âm thầm cập nhật.
**Consequences:** một org cấu hình như thế sẽ deploy hỏng và phải xử lý tay. Đó là đánh đổi
có chủ ý: hỏng lúc deploy nhìn thấy được, hỏng ở quầy thì không. `erp_dev` hiện không có rule
nào như vậy nên migration chạy suôn.
**Status:** accepted
