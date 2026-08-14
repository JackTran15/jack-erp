# Follow-up — nhãn "Loại chứng từ" cho dòng phiếu thu

Ghi lại 14/08/2026, ngay sau khi đóng G5. Đợt này **cố ý** giữ nguyên mapping cũ (A-03); đây là
phần khảo sát để đợt sau không phải làm lại từ đầu.

## Câu hỏi gốc

> "Phiếu thu có lý do, có thể mapping vào loại chứng từ không?"

Được. Nhưng **đừng đọc `reason`** — có khoá tốt hơn, chính xác hơn, đã có sẵn.

## Vì sao không dùng `reason`

`reason` là chuỗi tiếng Anh do consumer tự ghép, không phải contract:

- `refund-cash.consumer` / `invoice-cancel-collect-cash.consumer` → `Cancelled return ${code}`
- `pos-cash-sale.consumer` → `POS sale ${code}`

Người dùng sửa được nó ở màn Quỹ tiền, và không có gì ràng buộc định dạng. Parse chuỗi này là
dựng một contract ngầm lên trên một ô ghi chú — hỏng ngay lần đầu ai đó sửa chữ, hoặc lần đầu
một consumer viết tiếng Việt.

## Khoá đúng: `reference_type` + join `reference_id` → `invoices.type`

Khảo sát trên `erp_dev`, toàn bộ `cash_receipts` đã POSTED (14/08/2026):

```
 document_number | purpose  | reference_type |   invoice_code   | invoice_type
-----------------+----------+----------------+------------------+--------------
 PT000001        | POS_SALE | INVOICE        | INV-202608-00001 | SALE
 PT000002        | POS_SALE | INVOICE        | INV-202608-00002 | SALE
 PT000003        | OTHER    | RETURN_CANCEL  | RTN-202608-00001 | RETURN
 PT000004        | OTHER    | RETURN_CANCEL  | RTN-202608-00004 | EXCHANGE
 PT000005        | OTHER    | RETURN_CANCEL  | RTN-202608-00003 | RETURN
 PT000006        | OTHER    | RETURN_CANCEL  | RTN-202608-00006 | EXCHANGE
 PT000007        | POS_SALE | INVOICE        | RTN-202608-00010 | EXCHANGE
 PT000008        | OTHER    | RETURN_CANCEL  | RTN-202608-00008 | RETURN
```

**8/8 dòng join được sang `invoices`** — `reference_id` luôn có giá trị và luôn trỏ tới một hoá
đơn thật. Và `invoices.type` chính là bộ từ vựng mà `invoiceTypeLabel()` đang dùng, tức nhãn ra
sẽ **tự khớp** với dòng hoá đơn ở các category khác, không cần bảng nhãn thứ hai.

Chú ý `PT000007`: `purpose = POS_SALE` nhưng chứng từ nguồn là `RTN-` (ca EXCHANGE thu thêm
tiền). Đi theo `invoice.type` cho ra `"Đổi trả, mua thêm"` — đúng. Đi theo tiền tố mã chứng từ
sẽ cho ra `"Đổi trả"` — sai. Thêm một lý do nữa để không đoán từ chuỗi.

## Mapping đề xuất

| `purpose` | `reference_type` | → | Nhãn |
|---|---|---|---|
| `POS_SALE` | `INVOICE` | join `invoices.type = SALE` | `Bán hàng` |
| `POS_SALE` | `INVOICE` | join `invoices.type = RETURN` | `Đổi trả` |
| `POS_SALE` | `INVOICE` | join `invoices.type = EXCHANGE` | `Đổi trả, mua thêm` |
| `DEBT_COLLECTION` | `INVOICE_DEBT` | — | `Thu nợ` |
| `OTHER` / `OTHER_INCOME` | `MANUAL` / null | — | `Thu khác` |
| `INTER_BRANCH_IN` | `TRANSFER` / `FUND_SWAP` | — | *(chưa có nhãn)* |
| `OTHER` | `RETURN_CANCEL` | — | **❓ chưa có nhãn — cần Akenzy quyết** |

## Thiếu dữ kiện — hai thứ phải hỏi trước khi làm

1. **`RETURN_CANCEL` gọi là gì?** Đây là **5/8** phiếu thu hiện có, tức đa số. Bản chất: tiền
   **quay trở lại quỹ** vì một phiếu trả hàng bị huỷ. Không khớp bất kỳ nhãn nào trong 7 lựa
   chọn hiện tại. Ứng viên: `"Huỷ trả hàng"`. Nếu không đặt nhãn riêng thì cả 5 dòng tiếp tục
   nằm chung `"Thu khác"` với phiếu thu tay — đọc báo cáo sẽ không phân biệt được.

2. **Có bỏ `"Hoàn tiền mặt"` khỏi dropdown Thu không?** Nhãn này sinh ra từ thiết kế cũ, khi
   khoản hoàn hiện thành **dòng âm** ở phía Thu. Với nguồn chỉ-phiếu-thu thì không phiếu thu nào
   mang nghĩa "tiền đi ra" — nên đây là bộ lọc **vĩnh viễn trả 0 dòng**. Giữ hay bỏ là quyết
   định của Akenzy; giữ thì nên có ghi chú, vì một bộ lọc luôn rỗng trông y hệt một bộ lọc hỏng.

Ngoài ra `INTER_BRANCH_IN` (thu nội bộ giữa chi nhánh) cũng chưa có nhãn, nhưng hiện **0 dòng**
nên chưa cấp bách.

## Ghi chú kỹ thuật cho người làm tiếp

- Handler **đã** nạp sẵn `invoices` cho các category khác (`fetchWindowInvoices`), nhưng nạp theo
  **khoảng `issuedAt`**, còn phiếu thu lọc theo **`voucher_date`**. Hai tập không trùng nhau. Phải
  nạp riêng theo `id IN (reference_id…)` chứ không tái dùng tập cũ, nếu không sẽ mất nhãn cho
  phiếu thu trỏ tới hoá đơn ngoài cửa sổ ngày.
- Nhớ cập nhật `DAILY_SUMMARY_DETAIL_DOCUMENT_TYPES` ở
  `apps/pos-web/src/constants/daily-summary-detail.constant.ts` cho khớp — danh sách đó là **cố
  định, viết tay**, không sinh từ API, nên lệch là chuyện xảy ra âm thầm.
- Có sẵn chỗ bám test: `get-pos-daily-summary-detail.handler.spec.ts`, và `qbStub` trong đó nay
  đã ghi lại SQL nên assert được cả mệnh đề join.
