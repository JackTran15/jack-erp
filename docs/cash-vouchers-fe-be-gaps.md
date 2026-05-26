# Chênh lệch BE ↔ FE — Quỹ tiền (ghi nhận only)

> Epic BE: EPIC-18052026. **Không sửa BE** trong giai đoạn tích hợp FE này.

| ID | Màn | FE / UI | BE hiện có | Xử lý FE | BE (backlog) |
|----|-----|---------|------------|----------|--------------|
| G1 | Thu/chi | List gộp PT+PC | 2 endpoint riêng | Merge client + type union | Unified list (optional) |
| G2 | Thu/chi | List embed `lines` | List không lines | `GET :id` on select | — |
| G3 | Thu/chi | Tab **Chứng từ** (thu nợ): `documentLines` từ dialog chọn HĐ | `GET :id` không trả schedule; `sourceLink` tối thiểu | **Done (UI):** `DebtCollectionPickDialog` → `GET /invoices/customers/:id/debts?status=open`; tab luôn hiện khi mục đích Thu nợ. **Chưa:** map `documentLines` khi load PT từ API | Embed `documentLines` / debt allocations on receipt DTO |
| G4 | Thu/chi | Modal HĐ full SKU | `sourceLink` minimal | `GET /invoices/:id` | — |
| G5 | Thu/chi | Đối tượng nộp / NV thu (`staffId`, mã/tên) | `staffId`, `partnerId` | `VoucherEntitySearchModal` + `VoucherPartnerFields` / `VoucherStaffFields`; lookup 1 API/loại | — |
| G6 | Kiểm kê | Tab Thành viên | — | Local-only UI | Schema participants |
| G7 | Kiểm kê | `inventoryUntilDate`, `purpose` | `countedAt`, `notes` | Map → `countedAt`/`notes` | Extra columns |
| G8 | Kiểm kê | Denom `description` | `denom`+`count` only | Bỏ cột hoặc local | JSON extend |
| G9 | Kiểm kê | Xóa DRAFT | No DELETE | Disable Xóa | `DELETE` endpoint |
| G10 | Kiểm kê | Lọc kỳ server | No dateFrom/To query | Client filter | Query params |
| G11 | Sổ | Offset pages | Cursor API | Buffer + client slice (tạm) | Offset API (optional) |
| G12 | Sổ | Dòng HĐ trực tiếp | Movement-based | Chỉ qua phiếu | — |
| G13 | Chung | `cashAccountId` picker | Required on ledger | `CashAccountSelect` | — |
| G14 | Thu/chi | Lookup đối tượng (dialog) | 1 endpoint / loại | **Done:** `searchVoucherPartnersByKind`; `VoucherEntitySearchModal` (partner / staff / `debtCollection`); bỏ «Tất cả loại» trong dialog | Unified partner search (optional) |
| G15 | Thu/chi | Thu nợ từ **Đối tác giao hàng** (DTGH) | `invoice_debts` theo `customerId` only | Chọn DTGH trong lookup; **Lấy dữ liệu** → trống + thông báo | Open debts by provider / partner |
| G16 | Thu/chi | Lưu phiếu thu thu nợ nhiều HĐ (`debtId`, `collectAmount` / dòng) | `CreateCashReceiptBody`: 1 `referenceType`/`referenceId`, không `documentLines` | **Done (UI):** tổng hợp 1 dòng Chi tiết + tab Chứng từ local. **Chưa:** `ledgerDetailToCreateReceiptBody` gửi phân bổ nợ | Multi-debt lines / allocations on POST |

**Không ghi gap:** nhân bản phiếu, label VN, column filter client-side, OpenAPI regen.

### FE files — Thu nợ & tra cứu đối tượng (tham chiếu)

| Thành phần | File |
|------------|------|
| Phiếu thu + tab Chi tiết / Chứng từ | `documents/receipt-voucher-dialog/ReceiptVoucherDialog.tsx` |
| Dialog chọn HĐ thu nợ | `documents/receipt-voucher-dialog/DebtCollectionPickDialog.tsx` |
| API công nợ mở (KH) | `documents/receipt-voucher-dialog/debt-collection.api.ts` |
| Lookup KH + DTGH (inline merge) | `documents/receipt-voucher-dialog/debt-collection-search.ts` |
| Modal chọn đối tượng (loại) | `documents/_shared/VoucherEntitySearchModal.tsx` |
| Tra cứu theo loại | `documents/_shared/voucher-partner-search.ts` |
