# Logical design — daily-report-voucher-columns

## Approach

Toàn bộ thay đổi phía API nằm trong **một** file:
`apps/api/src/modules/reporting/pos-daily-report/queries/get-pos-daily-summary-detail.handler.ts`.

Handler đã có sẵn kiến trúc đúng cho việc này: `buildSourceRows` phân nhánh theo category, mỗi
builder trả về `SourceRow[]` (id thô, chưa có tên), rồi `resolveDisplayFields` nạp theo lô và
ánh xạ id → tên hiển thị. Thêm nhân viên là thêm **một id nữa** vào đúng khuôn mẫu đó, không
phải một đường mới.

Ba điểm sửa:

1. **Nguồn của `revenue-cash`.** `buildRevenueRows` đang phục vụ cả `RevenueCash` lẫn
   `RevenueBankTransfer`. Thêm tham số `receiptsOnly`; khi bật thì bỏ qua khối
   `fetchWindowInvoices` + `invoice_payments` và bỏ mệnh đề `r.purpose != :posSale`.
   `RevenueBankTransfer` gọi với `receiptsOnly = false` → không đổi một dòng hành vi nào.
   `fetchWindowInvoices` vẫn ở lại vì `buildRevenuePointsRows` còn dùng.

2. **`staffId` trên `SourceRow`.** Set từ `r.staffId` trong khối phiếu thu và `p.staffId` trong
   `buildExpenseRows`. `resolveDisplayFields` gom tập `staffId` phân biệt và nạp `UserEntity`
   trong đúng `Promise.all` đang nạp customer/deposit/gl/cash account, rồi dựng
   `` `${firstName} ${lastName}`.trim() ``. Chuỗi rỗng phải quy về `undefined` (AC-06).

3. **Đối tượng trên phiếu.** `customerNameDirect` hiện chỉ đọc `payerName`/`payeeName`. Nới
   thành `payerName ?? partnerNameSnapshot` (và `payeeName ?? partnerNameSnapshot`) — phiếu thủ
   công và phiếu thu nợ từ quầy quỹ giữ tên ở cột snapshot chứ không ở `payer_name`.

Contract mở rộng thêm `staffName?: string`; pos-web thêm một khoá cột và một lớp nhãn theo
category. Không migration, không entity mới, không đăng ký module mới.

## Alternatives rejected

| Option | Why not |
|---|---|
| Sửa thẳng thân `buildRevenueRows` cho mọi category | Kéo `revenue-bank-transfer` đi theo. Người dùng chỉ yêu cầu đổi Thu **tiền mặt**; đổi luôn chuyển khoản là mở rộng phạm vi không ai xin, và AC-03 tồn tại để chặn đúng việc đó. |
| Tách hẳn `buildRevenueCashReceiptRows` thành hàm riêng | Nhân đôi khối truy vấn phiếu thu (scope chi nhánh, khoảng `voucher_date`, `voucherStaffIds`, phân loại theo `accountMethod`). Hai bản sao sẽ trôi khỏi nhau ngay lần sửa sau. Một tham số boolean rẻ hơn. |
| Thêm cột `staff_name_snapshot` vào hai bảng chứng từ | Cần migration và phải ghi lúc tạo phiếu. Chưa cần: số dòng mỗi lần mở modal ở mức hàng chục–hàng trăm, nạp theo lô một truy vấn `IN (...)` là đủ. Để lại cho đợt làm giàu phiếu nếu lúc đó có nhu cầu thật. |
| Bắt saga v2 sinh phiếu thu cho mỗi lần bán tiền mặt để hai số khớp nhau | Đụng đường checkout đang chạy và phải né lỗi double-JE đã biết của v1. Akenzy đã chọn phương án "chấp nhận danh sách ngắn" (A-01). |
| Dùng `PartnerResolverService` để phân giải đối tượng | Service đó join sang `customers`/`inventory_providers`/`users` bằng SQL thô cho một phiếu. Ở đây chỉ cần tên đã snapshot sẵn trên chính dòng phiếu — thêm một service vào read path báo cáo là đổi lấy độ trễ không cần thiết. |

## Contracts

`packages/shared-interfaces/src/invoice-report/pos-daily-summary.ts` —
`PosDailySummaryDetailRow` thêm một trường tuỳ chọn:

```ts
/** "NV Thu" / "NV Chi" — `staffId` của phiếu đã phân giải sang tên người dùng. Chỉ 2 category tiền mặt set. */
staffName?: string;
```

Additive, optional → không phá client cũ. Sau khi sửa phải chạy `pnpm openapi:generate` và
commit cả `openapi.snapshot.json` lẫn `packages/api-client/src/generated/schema.ts`.

Endpoint, DTO request, phân trang, `totals` giữ nguyên.

## Error taxonomy

Thay đổi này không thêm nhánh lỗi nào. Các trạng thái suy biến và cách xử lý:

| Tình huống | Hành vi |
|---|---|
| `staff_id` NULL (phần lớn phiếu hiện nay) | `staffName` = `undefined`; ô trống. Không ném lỗi. |
| `staff_id` trỏ tới user đã bị xoá / khác tổ chức | Không có trong map → `staffName` = `undefined`. Nạp luôn kèm `organizationId` để không rò tên qua tổ chức. |
| `firstName` và `lastName` đều rỗng | `.trim()` ra chuỗi rỗng → quy về `undefined` (AC-06). |
| Không có phiếu thu nào trong khoảng ngày | `rows: []`, `total: 0`, `totals.amount: 0`. Modal hiện bảng rỗng — đúng, không phải lỗi. |
| `payer_name` và `partner_name_snapshot` đều NULL | `customerName` = `undefined`. Không dùng đường lui `"Khách lẻ"` — đường lui đó chỉ dành cho dòng bắt nguồn từ hoá đơn (`showCustomerFallback`), và dòng phiếu không set cờ này. |

## ADRs

### ADR-01 — `revenue-cash` đọc `cash_receipts`, chấp nhận lệch với thẻ Thu
**Status:** accepted (Akenzy, 14/08/2026)

Modal Thu chuyển sang nguồn phiếu thu trong khi handler tổng hợp giữ nguyên công thức cũ
(`invoice_payments` + phiếu thu không phải `POS_SALE`). Hệ quả: tổng của modal **không** còn
bằng con số "Tiền mặt" trên thẻ Thu, và trên ngày mẫu 14/08 tụt từ ~8.86M xuống ~2.2M, vì
checkout saga v2 không sinh phiếu thu nào cho lần bán tiền mặt.

Chọn như vậy vì phương án giữ hai số khớp nhau đòi hỏi sửa đường checkout đang chạy — phạm vi
lớn hơn nhiều và mang rủi ro tiền thật. Doc comment của handler hiện khẳng định "mỗi category
tổng đúng bằng trường tương ứng ở handler tổng hợp"; **câu đó phải được sửa lại** trong
T-01-01, nếu không nó thành lời nói dối nằm ngay cạnh code.

Đảo lại được: chỉ cần bật lại khối hoá đơn nếu chủ sản phẩm đổi ý.

### ADR-03 — Nhãn "Loại chứng từ" suy từ `purpose`/`referenceType` + join hoá đơn, không parse `reason`
**Status:** accepted (Akenzy, 14/08/2026 — *"Yes, thêm mới"*)

`cash_receipts.reason` **có** mang thông tin nguồn (`POS sale INV-202608-00001`,
`Cancelled return RTN-202608-00001`) và về mặt kỹ thuật parse được. Không dùng, vì đó là chuỗi
tiếng Anh do consumer tự ghép, người dùng sửa được ở màn Quỹ tiền, và không có ràng buộc định
dạng nào. Parse nó là dựng contract ngầm trên một ô ghi chú.

Khoá đúng đã có sẵn: `reference_id` → `invoices.type`. Khảo sát `erp_dev` 14/08/2026: **8/8**
phiếu thu POSTED join được sang `invoices`, và `invoices.type` chính là bộ từ vựng
`invoiceTypeLabel()` đang dùng cho dòng hoá đơn ở các category khác — nên nhãn tự khớp, không
đẻ ra bảng nhãn thứ hai.

Ca quyết định: `PT000007` có `purpose = POS_SALE` nhưng chứng từ nguồn mã `RTN-202608-00010`.
Theo `invoices.type` → `"Đổi trả, mua thêm"` (đúng). Theo tiền tố mã hoặc theo `reason` →
`"Đổi trả"` (sai). Một dòng dữ liệu thật đủ để loại bỏ cả hai phương án chuỗi.

Thứ tự nhánh **có ý nghĩa** và phải giữ: `DEBT_COLLECTION` → `RETURN_CANCEL` → `POS_SALE` + join
→ mặc định `"Thu khác"`. `RETURN_CANCEL` phải đứng trước nhánh `purpose`, vì những phiếu đó mang
`purpose = OTHER` và sẽ rơi thẳng vào `"Thu khác"` nếu xét theo `purpose` trước.

### ADR-04 — Nạp hoá đơn nguồn bằng truy vấn riêng theo `reference_id`
**Status:** accepted (Claude, 14/08/2026)

Handler đã có `fetchWindowInvoices`, nhưng nó lọc theo **`invoice.issuedAt`** trong khi phiếu thu
lọc theo **`voucher_date`**. Hai tập không trùng nhau: một phiếu thu lập hôm nay hoàn toàn có thể
trỏ tới hoá đơn của tuần trước. Tái dùng tập cũ sẽ làm những dòng đó **âm thầm** rơi về
`"Thu khác"` — sai mà không có lỗi nào nổi lên.

Nên nạp riêng: `invoices` theo `id IN (reference_id…)` + `organizationId`, gom theo lô đúng khuôn
mẫu `resolveDisplayFields` đang dùng cho customer/account/user. AC-13 tồn tại để khoá điều này.

### ADR-02 — Phân giải tên nhân viên lúc đọc, không snapshot lúc ghi
**Status:** accepted (Claude, 14/08/2026 — đã nêu trong plan Akenzy duyệt)

`staff_id` phân giải sang tên bằng một truy vấn `IN (...)` trong `resolveDisplayFields`, thay vì
thêm cột `staff_name_snapshot`. Không migration, và tên đổi thì báo cáo hiện tên mới.

Đánh đổi: thêm một truy vấn mỗi lần mở modal, và tên hiển thị là tên **hiện tại** chứ không phải
tên tại thời điểm lập phiếu. Chấp nhận được ở đây — đây là báo cáo vận hành trong ngày, không
phải chứng từ pháp lý. Nếu sau này cần bất biến thì snapshot lúc lập phiếu, cùng đợt làm giàu
phiếu ở A-02.
