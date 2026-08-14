# Follow-up — "Tất cả chi tiết mục thu đều nên lấy từ phiếu thu"

Ghi lại 14/08/2026. Yêu cầu của Akenzy; **chưa làm**, giữ nguyên code. Đây là phần khảo sát để
lần sau không phải điều tra lại từ đầu.

## Yêu cầu và hiện trạng

Mục Thu (1) có đúng **ba** ô mở được chi tiết (`DailySummaryTab.tsx:115-127`):

| Ô | Category | Nguồn hiện tại | Đổi sang phiếu thu được không? |
|---|---|---|---|
| Tiền mặt | `revenue-cash` | **`cash_receipts` (PT)** | ✅ đã làm — UOW-01/02 |
| Chuyển khoản | `revenue-bank-transfer` | `invoice_payments` | ⚠️ được, nhưng modal sẽ **rỗng hoàn toàn** |
| Điểm | `revenue-points` | `invoices.points*` | ❌ không có chứng từ nào để đọc |

Kết luận ngắn: **không áp dụng đồng loạt được**. Chỉ 1 trong 3 ô có nguồn chứng từ thật.

## Chuyển khoản — chứng từ là NTTK, không phải PT

Phía ngân hàng có bảng **riêng**, không dùng chung `cash_receipts`:

- `BankReceiptEntity` — `apps/api/src/modules/accounting/deposit-vouchers/bank-receipts/bank-receipt.entity.ts`,
  bảng `bank_receipts`, tiền tố **`NTTK`** ("Nộp tiền tài khoản"), khai ở
  `document-numbering.service.ts:56`. Phía chi là `bank_payments`, tiền tố `UNC`.

**Tên cột lệch với `cash_receipts` ở đúng ba chỗ mà truy vấn hiện tại đang dùng** — sao chép
nguyên khối query sẽ không compile, và tệ hơn là có thể compile nhưng lọc sai:

| `cash_receipts` | `bank_receipts` |
|---|---|
| `voucherDate` | **`docDate`** |
| `staffId` | **`collectedBy`** |
| `cashAccountId` | **`depositAccountId`** (FK → `deposit_accounts`) |
| `CashVoucherStatus` | `BankVoucherStatus` (thêm `PENDING_APPROVAL`) |

**Không có luồng nào sinh ra NTTK cho một lần bán POS.** Đây không phải thiếu sót cấu hình mà là
thiết kế:

- `BankReceiptPurpose` (`deposit-vouchers/enums.ts:14-19`) = `OTHER, DEBT_COLLECTION,
  OTHER_INCOME, INTER_BRANCH_IN` — **không có `POS_SALE`**, trong khi `CashReceiptPurpose` có.
- `BankReceiptReferenceType` (`:21-34`) — **không có `INVOICE`**, trong khi phía tiền mặt có.
- v1 checkout (`checkout-invoice.service.ts:452-472`) publish
  `DEPOSIT_VOUCHER_NEEDED_POS_SALE`, nhưng `pos-deposit-sale.consumer.ts:122-139` chỉ ghi
  `deposit_movements` — **không** import `BankReceiptsService`. Tên topic gây hiểu nhầm.
- v2 saga (`post-deposit.step.ts`, nằm ở nhánh `feat/promotions`) cũng chỉ ghi
  `deposit_movements` inline. Giống hệt quyết định của `post-cash.step.ts` bên tiền mặt.

Các đường **thật sự** sinh NTTK: phiếu lập tay, thu nợ qua ngân hàng, điều chuyển liên chi nhánh,
chuyển quỹ tiền mặt→ngân hàng, fund swap, và huỷ phiếu trả đã hoàn qua ngân hàng
(`RETURN_CANCEL`).

**Dữ liệu hiện tại (đã tự kiểm trên `erp_dev` 14/08/2026):**

```
bank_receipts      0
deposit_accounts   0     ← gốc rễ
deposit_movements  0
cash_receipts      8
```

`deposit_accounts` rỗng và `payment_accounts.deposit_account_id` NULL trên cả 6 dòng, nên
`DepositRoutingService` không bao giờ trả `TargetFund.DEPOSIT` — cả đường `deposit_movements`
cũng chết, chứ không riêng phiếu. Một dòng `invoice_payments` phương thức `bank_transfer` duy
nhất trong DB không sinh ra gì phía tiền gửi.

Nên đổi ngay bây giờ sẽ ra **modal rỗng**, khác hẳn ca tiền mặt (ngắn đi nhưng vẫn còn 6 dòng).

### Điều kiện cần trước khi làm

1. `deposit_accounts` được tạo và `payment_accounts.deposit_account_id` được map.
2. Quyết định nghiệp vụ: bán POS qua thẻ/chuyển khoản **có** nên sinh NTTK không? Nếu có thì
   phải thêm `POS_SALE` vào `BankReceiptPurpose` và `INVOICE` vào `BankReceiptReferenceType`,
   rồi cho consumer/step tạo phiếu — đúng bằng công việc mà bên tiền mặt v2 đang **cố ý không**
   làm. Đây là câu hỏi cho Akenzy, không phải chi tiết kỹ thuật.

## Điểm — không có chứng từ, chấm hết

Điểm là **khoản giảm giá**, không có đồng nào vào quỹ, nên không có chứng từ quỹ nào ghi nó.
`buildRevenuePointsRows` đọc `inv.pointsDiscountAmount` / `inv.pointsRedeemed` là đúng bản chất.

Bảng duy nhất liên quan là `point_history` — sổ điểm khách hàng (`card_id`, `invoice_id`, `type`,
`delta`, `note`), **không có cột tiền**, không `status`, không `document_number`, không nối COA.
Muốn có "số chứng từ" cho từng lần đổi điểm thì vẫn phải lấy giá trị tiền từ hoá đơn — tức không
giải quyết được gì, chỉ thêm một join.

`vouchers` là danh mục voucher khuyến mại, không phải chứng từ kế toán; nó nuôi `revenue.voucher`,
một trường khác.

## Bug có sẵn phát hiện khi khảo sát (chưa sửa)

`get-pos-daily-summary-detail.handler.ts` dựng map ở `:185-187` bằng
`accountMethod.set(a.accountId, a.paymentMethod)` — `payment_accounts.account_id` là **id tài
khoản COA**. Nhưng `:355` lại tra bằng `r.cashAccountId` — id của **`cash_accounts`**. Hai không
gian id khác nhau.

Đã kiểm bằng dữ liệu:

```
payment_accounts.account_id khớp cash_accounts :  0 / 6
payment_accounts.account_id khớp accounts (COA):  6 / 6
```

Nên `accountMethod.get(...)` **luôn** trả `undefined`, rơi vào nhánh mặc định `CASH` ở `:357-359`,
và `:360` (`if (bucket !== accountMethodBucket) continue`) **loại sạch** mọi dòng phiếu thu khỏi
`RevenueBankTransfer`. Cùng lỗi ở handler tổng hợp (`get-pos-daily-summary.handler.ts:216-218`).

Hệ quả: ô Chuyển khoản **hiện đã** thực chất chỉ có dòng hoá đơn, không phải do đợt này gây ra.
Công việc ở UOW-01/02 không bị ảnh hưởng — `revenue-cash` cần đúng bucket `CASH`, và nhánh mặc
định vô tình cho ra kết quả đúng.

Sửa lỗi này là việc **riêng**, không gộp vào đợt đổi nguồn: nó chạm cả hai handler và làm đổi số
của một ô báo cáo, nên cần đối chiếu lại với sổ quỹ trước khi đẩy đi.
