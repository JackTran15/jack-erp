---
feature: cash-report-voucher-detail
adr_count: 3
---

# Logical design — Xem chi tiết phiếu / hóa đơn từ báo cáo Quỹ tiền

## Approach

Hầu hết là FE, đi đúng đường drill-down đã có của trang báo cáo:

1. **Registry.** `DrillDownAction` thêm nhánh `{ kind: "voucherDetail"; target: VoucherDetailTarget }`
   với `VoucherDetailTarget = { id: string; kind: CashFundDocumentKind }`. `DRILL_DOWNS` thêm:
   - `"cash-in-out-list": { documentNumber: voucherDetail, invoiceNumber: invoiceDetail, reference: invoiceDetailByRow }`
   - `"expense-list-by-category": { documentNumber: voucherDetail, invoiceNumber: invoiceDetail }`

   `voucherDetail` đọc `CASH_FUND_ROW_KEYS.VOUCHER_ID/VOUCHER_KIND`, trả `null` nếu thiếu.
   `invoiceDetail` là resolver sẵn có (đọc `REPORT_ROW_INVOICE_ID`). `invoiceDetailByRow`
   cho cột Tham chiếu: chỉ bấm được khi `_invoiceId` có giá trị; mã lấy từ `invoiceNumber`
   của dòng (không từ chuỗi "INVOICE HD…").
2. **Quyền.** `DrillDownContext` thêm `can: (permission: string) => boolean`;
   `ReportPageTableView` truyền `usePermissionCheck().has`. Resolver phiếu kiểm quyền theo
   `kind` (`VOUCHER_READ_PERMISSION[kind]`), resolver hóa đơn kiểm
   `REPORT_DOMAIN_PERMISSIONS.sales.floor`. Hai resolver hóa đơn hiện có của báo cáo bán
   hàng không đổi hành vi (người xem báo cáo bán hàng đã có quyền đó).
3. **Store.** `ReportState` thêm `detailVoucher: VoucherDetailTarget | null` +
   `setDetailVoucher`, reset cùng `detailInvoice`. `runDrillDown` rẽ nhánh thêm `voucherDetail`.
4. **Dialog.** `ReportVoucherDetailDialog` (mới, `pages/chain-store/reports/VoucherDetailDialog/`)
   đọc `detailVoucher`, gọi đúng một trong `useCashReceipt` / `useCashPayment` /
   `useBankReceipt` / `useBankPayment` (hook kia `enabled: false`), map qua
   `cashReceiptToVoucherDetail` / `cashPaymentToVoucherDetail` (+ map mục thu/chi
   `useCategoryNameMap`) như `LedgerCashPage.tsx:141-160`, rồi render dialog Sổ quỹ tương
   ứng ở `VIEW`. `onOpenInvoice(code)` → `setDetailInvoice({ code, id: null })`. Mount ở
   `ReportPage.tsx` cạnh `InvoiceDetailDialog` và trong `ReportDrillDownBody`.
5. **Backend (US-02).** Hai report thêm `'REFUND'` vào `INVOICE_REFERENCE_TYPES`, SELECT
   thêm `inv.id AS invoice_id`, `toRow` gán `[REPORT_ROW_INVOICE_ID]: r.invoice_id ?? null`.
   Không đổi catalog cột, envelope, quyền hay export.

## Alternatives rejected

| Option | Why not |
|---|---|
| Link sang `/treasury/{cash|deposit}/receipts-expenses?id=` tab mới (ghi chú T-02-03 của feature trước) | Rời khỏi báo cáo, mất ngữ cảnh lọc; người dùng yêu cầu dialog "giống các hóa đơn khác" |
| Dialog read-only mới cho phiếu | Nhân đôi 4 dialog ~36K dòng mỗi cái; A-02 chọn dùng lại |
| Endpoint `/reports/cash-fund/voucher-detail` | Chỉ cần khi cho người thiếu quyền phiếu xem phiếu; A-03 chọn ẩn link |
| Khoá ẩn mới `CASH_FUND_ROW_KEYS.INVOICE_ID` | Phải viết resolver hóa đơn thứ hai giống hệt; `_invoiceId` đã là quy ước chung (A-06) |
| Tách mã hóa đơn từ chuỗi Tham chiếu "INVOICE HD…" ở FE | Dễ vỡ khi đổi định dạng; không có id ⇒ mở nhầm hóa đơn trùng mã |

## Contracts

- `POST /reports/cash-fund/search` (`cash-in-out-list`, `expense-list-by-category`): mỗi dòng
  chi tiết thêm `_invoiceId: string | null`. Additive, không đổi OpenAPI (rows là
  `Record<string, unknown>`).
- `invoiceNumber` / `reference` của dòng REFUND gắn hóa đơn đổi từ `null` / `"REFUND"` sang
  mã hóa đơn / `"REFUND <mã>"`. Bộ lọc cột trên hai cột này vì thế bắt thêm dòng REFUND.
- FE nội bộ: `VoucherDetailTarget`, `DrillDownAction.voucherDetail`, `DrillDownContext.can`,
  store `detailVoucher` / `setDetailVoucher`.

## State ownership

`detailVoucher` sống trong report store (Zustand, UI state, không phải server data) — cùng
chỗ với `detailInvoice`, mỗi store lồng của drill-down có bản riêng. Dữ liệu phiếu nằm trong
TanStack Query qua các hook treasury sẵn có (key của `treasury-query-keys.ts`).

## Error taxonomy

| Case | Behaviour |
|---|---|
| Thiếu quyền đọc phiếu / hóa đơn | Không có link (A-03) — không phải lỗi |
| Phiếu bị xoá mềm / 404 giữa lúc xem báo cáo và bấm | Dialog hiện "Không tải được chi tiết phiếu." + nút Đóng; không toast lặp |
| Mạng lỗi | Như trên; TanStack Query retry mặc định |
| Hóa đơn 404 | `InvoiceDetailDialog` sẵn có đã hiện "Không tải được chi tiết hóa đơn." |
| `voucherKind` lạ (dữ liệu tương lai) | Resolver trả `null` ⇒ ô là text |

## Cache & offline

Không cache mới. Hook treasury dùng key theo id; mở lại cùng phiếu lấy từ cache.

## Observability

Không thêm. Lỗi hiện qua `X-Request-Id` sẵn có của `erpApi`.

## ADRs

### ADR-01 — Mở phiếu bằng dialog Sổ quỹ ở chế độ VIEW, điều phối qua report store
**Context:** Người dùng muốn xem phiếu ngay trên báo cáo; đã có 4 dialog xem phiếu dùng ở Sổ quỹ.
**Decision:** Một wrapper `ReportVoucherDetailDialog` đọc `detailVoucher` từ report store, tải
phiếu bằng hook treasury và render dialog Sổ quỹ tương ứng ở `VIEW`, không truyền
`onRequestEdit`/`onSave`. Mount ở cả trang và dialog drill-down.
**Consequences:** Giao diện phiếu giống hệt Sổ quỹ, In / Xuất khẩu dùng được ngay; báo cáo
phụ thuộc vào `pages/treasury/documents` (đã là dependency của app).
**Status:** accepted

### ADR-02 — Gating link theo quyền ở resolver, qua `DrillDownContext.can`
**Context:** Quyền báo cáo quỹ và quyền đọc phiếu / hóa đơn tách nhau; A-03 chọn ẩn link.
**Decision:** Resolver nhận `can(permission)` và trả `null` khi thiếu quyền, nên ô tự rơi về
text — không cần nhánh render riêng.
**Consequences:** Một chỗ quyết định "bấm được không"; resolver báo cáo khác không bị ảnh
hưởng vì không gọi `can`.
**Status:** accepted

### ADR-03 — Id hóa đơn đi trong `_invoiceId`, REFUND tính là tham chiếu hóa đơn trong #3/#5
**Context:** Mở hóa đơn theo mã có thể nhầm chi nhánh; phiếu REFUND trỏ tới hóa đơn nhưng
không được JOIN.
**Decision:** Hai report SELECT `inv.id` và gán `REPORT_ROW_INVOICE_ID`; thêm `REFUND` vào
`INVOICE_REFERENCE_TYPES` cục bộ của hai report.
**Consequences:** Resolver `invoiceDetail` sẵn có dùng lại; số liệu tiền không đổi; phân loại
"Chi khác" của #2 không đổi vì dựa trên `purpose` trong `CashFundPeriodService`.
**Status:** accepted
