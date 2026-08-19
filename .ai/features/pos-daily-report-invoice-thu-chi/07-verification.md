---
feature: pos-daily-report-invoice-thu-chi
environments: [local-pos]
viewports: [desktop]
---

# Verification — POS Báo cáo theo ngày (Thu/Chi từ hoá đơn)

Chạy trên chi nhánh **HCM** (`${LOCAL_POS_BRANCH_ID}`) với kỳ **"Toàn bộ"**. Chọn "Toàn bộ" thay
vì một ngày cụ thể để bằng chứng không phụ thuộc ngày chạy — mọi preset theo ngày sẽ rỗng vào
hôm khác và một khối rỗng thì chứng minh được rất ít.

Số kỳ vọng dưới đây **không** lấy từ màn hình mà tính độc lập bằng SQL trên `erp_dev`, theo đúng
định nghĩa mô hình tiền mới, rồi mới đối chiếu với UI:

| Dòng | Kỳ vọng | Nguồn |
|---|---:|---|
| Thu › Tiền mặt | 40.295.500 | Σ sign × `invoice_payments.amount` (cash) + `debt_payments` (cash) + chân thu chuyển quỹ (`cash_receipts` FUND_SWAP) |
| Thu › Thẻ | 0 | không có payment nào method `card` |
| Thu › Chuyển khoản | 11.064.500 | Σ sign × `invoice_payments.amount` (bank_transfer) |
| Thu › Voucher | 0 | `invoice_promotions` chưa có dòng `promotionType='voucher'` |
| Thu › Điểm | 650.000 | Σ sign × `invoices.points_discount_amount` |
| _(Tổng thu)_ | _52.010.000_ | tổng đúng 5 dòng trên — **không** được render trên tab Tổng hợp, chỉ có trong bản in / xlsx, nên không assert trực tiếp được |
| Chi › Tiền mặt | 16.004.000 | Σ (`refunded_amount` − `offset_amount`) `refund_method='CASH'` (9.637.000) + `cash_payments` POSTED `purpose<>REFUND` (6.367.000) |
| Chi › Chuyển khoản | 3.123.000 | `bank_payments` POSTED `purpose<>REFUND`: trả NCC 3.000.000 + rút tiền gửi về quỹ 123.000 |
| Công nợ › Giảm nợ | 465.000 | `debt_payments` (fixture thu nợ, xem `## Notes`) |
| **Tổng (1) − (2)** | **32.883.000** | 52.010.000 − 19.127.000 |
| Hàng trả | −18 / −13.850.000 | Σ `invoice_items` direction `IN` |
| SL hoá đơn | 43 / 30 / 10 / 3 | tổng / bán hàng / đổi trả / đổi trả mua thêm |

Đối chiếu cũ↔mới cho AC-05 và AC-06 — toàn bộ chênh lệch là phiếu chi của **chứng từ đã huỷ**:

| Nhóm phiếu chi POSTED (chi nhánh HCM) | Số tiền | Mô hình mới |
|---|---:|---|
| Hoá đơn `paid` — RETURN | 9.422.000 | tính |
| Hoá đơn `paid` — EXCHANGE | 215.000 | tính |
| Hoá đơn `cancelled` — SALE | 4.089.000 | **bỏ** |
| Hoá đơn `cancelled` — RETURN | 3.239.000 | **bỏ** |
| Hoá đơn `cancelled` — EXCHANGE | 185.000 | **bỏ** |
| **Tổng phiếu chi** | **17.150.000** | Chi mới = 9.637.000 |

Chi vẫn đọc phiếu chi, nhưng lọc `purpose <> REFUND`: mọi phiếu chi loại REFUND đều do hoá đơn
tự sinh ra (return hoặc huỷ hoá đơn), nên nguồn hoá đơn đã sở hữu chúng — đếm thêm lần nữa chính
là lỗi ban đầu. Phiếu chi khác (chi phí, lương, mua hàng, **trả nợ nhà cung cấp**) không có hoá
đơn bán hàng nào đứng sau nên chỉ có thể lấy từ phiếu.

Query cũ đọc `cash_payments` không lọc `purpose` và không bao giờ xem hoá đơn, nên tính cả
7.513.000 tiền hoàn của chứng từ đã bị huỷ. Bỏ luôn khoản hoàn của hoá đơn huỷ là có chủ ý:
`applyInvoiceStatusFilter` đã loại hoá đơn cancelled khỏi Thu, nên nếu để phiếu chi của nó quay
lại thì báo cáo ghi nhận tiền ra mà không có tiền vào đối ứng. Con số Chi giảm **không phải** vì
bỏ sót, mà vì thôi tính những khoản đã bị đảo.

**Chuyển quỹ phải khớp cả hai chân.** Lệnh "Chuyển tiền gửi thành tiền mặt" ghi `bank_payments`
`purpose=CASH_TRANSFER` (tiền rời tài khoản) **và** `cash_receipts` `referenceType=FUND_SWAP`
(tiền vào két). Chân chi không phải REFUND nên Chi đã tính nó; nếu Thu bỏ chân thu thì báo cáo ghi
nhận tiền ra cho khoản chỉ đổi quỹ chứ không rời chi nhánh. Vì vậy Thu đọc thêm `cash_receipts` /
`bank_receipts` lọc theo `referenceType = FUND_SWAP` — lọc theo `referenceType` chứ không theo
`purpose`, vì cả hai chân đều ghi `purpose = OTHER`.

Chuyển sang **chi nhánh khác** thì không ghép: `INTER_BRANCH_OUT` là tiền rời chi nhánh gửi thật,
còn chân `INTER_BRANCH_IN` thuộc báo cáo của chi nhánh nhận.

## Steps

Dropdown kỳ báo cáo là một popover có nút **Áp dụng** — chọn radio thôi thì chưa áp dụng, nên
mỗi bước phải chạy đủ ba động tác mở → chọn → áp dụng trước khi đọc số. Kỳ báo cáo là state của
component (`useState("TODAY")`), không lưu vào URL hay localStorage, nên không bước nào thừa
hưởng được lựa chọn của bước trước.

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Khối Thu có đúng 5 dòng, không còn "Khuyến mại", và các số khớp SQL | `/daily-report` | `click text=Hôm nay; click text=Toàn bộ; click text=Áp dụng; wait text=32.883.000` | AC-01, AC-02 | `no-text=Khuyến mại; text=40.295.500; text=11.064.500; text=650.000` |
| S2 | Điểm được cộng vào tổng — nếu bị loại trừ, Tổng sẽ là 32.233.000 | `/daily-report` | `click text=Hôm nay; click text=Toàn bộ; click text=Áp dụng; wait text=32.883.000` | AC-02 | `text=32.883.000; no-text=32.233.000` |
| S3 | Chi không còn tính tiền hoàn của chứng từ đã huỷ (phiếu chi loại REFUND bị loại) | `/daily-report` | `click text=Hôm nay; click text=Toàn bộ; click text=Áp dụng; wait text=32.883.000` | AC-03, AC-05, AC-06 | `text=16.004.000; no-text=17.150.000` |
| S4 | Tổng (1) − (2) đúng bằng Thu − Chi, và khoản thu nợ hiện đồng thời ở Giảm nợ | `/daily-report` | `click text=Hôm nay; click text=Toàn bộ; click text=Áp dụng; wait text=32.883.000` | AC-03, AC-08 | `text=32.883.000; text=465.000` |
| S5 | Hàng trả hiển thị số âm | `/daily-report` | `click text=Hôm nay; click text=Toàn bộ; click text=Áp dụng; wait text=32.883.000` | AC-09 | `text=-13.850.000` |
| S6 | Drill-down Chi › Tiền mặt liệt kê hoá đơn RTN kèm Loại chứng từ, tổng khớp dòng tổng | `/daily-report` | `click text=Hôm nay; click text=Toàn bộ; click text=Áp dụng; wait text=32.883.000; click button:has-text("Tiền mặt") >> nth=1` | AC-07 | `text=Tổng chi tiền mặt; text=Đổi trả; text=16.004.000` |
| S7 | Chú thích mô tả đúng phạm vi của Chênh lệch | `/daily-report` | `click text=Hôm nay; click text=Toàn bộ; click text=Áp dụng; wait text=32.883.000` | AC-10 | `text=chưa gồm tiền thừa khách không lấy lại` |
| S8 | Drill-down Thu › Tiền mặt có dòng "Thu nợ" lấy từ `debt_payments`, tổng khớp dòng tổng | `/daily-report` | `click text=Hôm nay; click text=Toàn bộ; click text=Áp dụng; wait text=32.883.000; click button:has-text("Tiền mặt") >> nth=0` | AC-08 | `text=Tổng tiền mặt; text=Thu nợ; text=40.295.500` |
| S9 | Chuyển quỹ khớp hai chân: chân thu nằm trong Thu › Tiền mặt | `/daily-report` | `click text=Hôm nay; click text=Toàn bộ; click text=Áp dụng; wait text=32.883.000; click button:has-text("Tiền mặt") >> nth=0` | AC-11 | `text=Chuyển quỹ; text=40.295.500` |
| S10 | Chân chi của cùng lệnh chuyển quỹ nằm trong Chi › Chuyển khoản | `/daily-report` | `click text=Hôm nay; click text=Toàn bộ; click text=Áp dụng; wait text=32.883.000; click button:has-text("Chuyển khoản") >> nth=1` | AC-11 | `text=Tổng chi chuyển khoản; text=Rút về quỹ tiền mặt; text=3.123.000` |

## Not verified here

- **AC-04** (hoàn tiền qua chuyển khoản → Chi › Chuyển khoản) — **không tạo được fixture**: POS
  chặn ngay tại bước thanh toán với "Phương thức \"Chuyển khoản\" chưa liên kết tài khoản ngân
  hàng" (guard của #190), và `erp_dev` không có **bất kỳ** bản ghi `deposit_accounts` nào để liên
  kết. Muốn chụp được phải tạo mới một tài khoản tiền gửi rồi gán vào `payment_accounts` của
  phương thức `bank_transfer` — tức đổi cấu hình định tuyến thanh toán của môi trường dùng chung.
  Hiện phủ bằng unit test `routes a BANK-method refund to Chi chuyển khoản` trong
  `get-pos-daily-summary.handler.spec.ts`, cộng với test drill-down
  `expense-bank-transfer: lists RTN invoices refunded by BANK, net of the debt offset`.
- **Dòng Voucher** — chưa có `invoice_promotions` loại `voucher` nào trong `erp_dev`; giá trị 0
  trên ảnh chỉ chứng minh dòng tồn tại, không chứng minh phép tính. Phép tính do unit test
  `reproduces the reference report` phủ (voucher 100.000 trong tổng 419.669.000).
- **Khoản hoàn có `offset_amount > 0`** — toàn bộ dữ liệu `erp_dev` có `offset_amount = 0`, nên
  phần trừ cấn nợ không xuất hiện trên màn hình. Phủ bằng unit test `charges only the part of a
  refund that left the till, not the share offset against debt` (1.000.000 − 400.000 = 600.000).
- **Xuất xlsx / bản in** — là file tải về, không phải trạng thái trang; runner không mở được.
  `pos-daily-summary-export.service.spec.ts` phủ phần dựng workbook.

## Notes

- Kỳ vọng được tính lại bằng SQL trước mỗi lần chạy nếu `erp_dev` thay đổi. Query nằm trong
  `## Steps` phía trên dưới dạng định nghĩa; chúng chỉ đọc, không ghi.
- `console_errors` vẫn đang tắt trong `.ai/aidlc.yaml` — chưa có baseline xanh, bật lên sẽ làm
  đỏ mọi bước vì log nhiễu không liên quan.
- Selector của dropdown kỳ báo cáo (`text=Hôm nay` → `text=Toàn bộ` → `text=Áp dụng`) đã đối
  chiếu DOM thật; POS không có `data-testid` nào nên nhãn là handle duy nhất.
- **Fixture thu nợ (AC-08)**: phiếu thu `PT000032` ngày 19/08/2026, thu 465.000 tiền mặt của
  `Khách quen` (KH939355) trên công nợ `INV-202608-00014`, tạo qua Backoffice › Quỹ tiền ›
  Tiền mặt › Thêm mới › Phiếu thu tiền › Thu nợ. Đây là dữ liệu thật đã ghi vào `erp_dev`; mọi
  con số kỳ vọng ở trên đã tính lại sau khi tạo.
