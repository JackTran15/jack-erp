# TKT-IOL-01 Shared: nhãn VI report type + cột mới + band "Doanh thu sàn TMĐT"

## Epic

[EPIC-14062026 Bảng kê hóa đơn và đơn hàng](../epics/EPIC-14062026-invoice-order-listing-report.md)

## Summary

Thêm (thuần additive) các nhãn tiếng Việt cho report type mới và các key cột mới vào `@erp/shared-interfaces`, để source backend giữ tiếng Anh (đúng tiền lệ `PERMISSION_LABELS_VI`/`INVOICE_REPORT_COLUMN_LABELS_VI`). Không sửa key/nhãn hiện có (không regress `daily-sales-summary`).

## Deliverables

- `packages/shared-interfaces/src/invoice-report/report-type.ts` — thêm 1 dòng vào `REPORT_TYPE_LABELS_VI`:
  - `'invoice-order-listing': 'Bảng kê hóa đơn và đơn hàng'`
- `packages/shared-interfaces/src/invoice-report/column.ts`:
  - `INVOICE_REPORT_COLUMN_LABELS_VI` — thêm các key mới (giữ nguyên các key cũ): `time` → 'Giờ', `invoiceCode` → 'Số hóa đơn', `status` → 'Trạng thái', `revenue.fee` → 'Tiền phí', `payment.debt` → 'Công nợ', `payment.collectOnBehalf` → 'Thu hộ', `payment.cash` → 'Tiền mặt', `payment.bankTransfer` → 'Tiền gửi NH', `payment.bankAccount` → 'Tài khoản ngân hàng', `customer` → 'Khách hàng', `customerPhone` → 'Số điện thoại', `salesChannel` → 'Kênh bán hàng', `cashier` → 'Thu ngân', `salesperson` → 'NV bán hàng', `note` → 'Ghi chú', `storeCode` → 'Mã cửa hàng', `platform.fee` → 'Phí trả sàn', `platform.otherIncome` → 'Thu khác từ sàn', `platform.revenue` → 'Doanh thu từ sàn'. *(Tái dùng key có sẵn: `date`, `actualRevenue`, `revenue.goods`, `revenue.discount`, `revenue.promoPoints`, `revenue.total`, `revenue.promoRate`, `payment.voucher`, `payment.points`.)*
  - `INVOICE_REPORT_BAND_LABELS_VI` — thêm `platform: 'Doanh thu sàn TMĐT'` (giữ `revenue`/`customerPayment`).
  - `INVOICE_REPORT_COLUMN_DESCS` — (tùy chọn) thêm sub-label công thức cho cột mới **sau khi đối chiếu ảnh MISA ở TKT-03**; không bắt buộc ở ticket này.
- *(Tùy chọn)* map nhãn VI cho giá trị `InvoiceStatus` (draft/pending/paid/debt/partial_debt) nếu FE generic cần render ENUM — additive, có thể defer.

## Acceptance Criteria

- [ ] `REPORT_TYPE_LABELS_VI['invoice-order-listing'] === 'Bảng kê hóa đơn và đơn hàng'`.
- [ ] Mọi key cột mới trong epic có nhãn VI; không trùng/ghi đè key cũ.
- [ ] `INVOICE_REPORT_BAND_LABELS_VI.platform === 'Doanh thu sàn TMĐT'`.
- [ ] Không tiếng Việt trong source backend (nhãn nằm ở shared-interfaces).
- [ ] `daily-sales-summary` không đổi nhãn (no regress).

## Definition of Done

- [ ] `pnpm --filter @erp/shared-interfaces build` xanh; `@erp/api` resolve được symbol mới.
- [ ] Không sửa file generated; không đụng key cũ.

## Tech Approach

Sửa thuần map literal — không logic. Ví dụ:

```ts
// report-type.ts
export const REPORT_TYPE_LABELS_VI: Record<string, string> = {
  'daily-sales-summary': 'Tổng hợp bán hàng theo ngày',
  'invoice-order-listing': 'Bảng kê hóa đơn và đơn hàng',
};

// column.ts (append vào map có sẵn)
export const INVOICE_REPORT_COLUMN_LABELS_VI: Record<string, string> = {
  // ...giữ nguyên các key cũ...
  time: 'Giờ',
  invoiceCode: 'Số hóa đơn',
  status: 'Trạng thái',
  'revenue.fee': 'Tiền phí',
  'payment.debt': 'Công nợ',
  'payment.collectOnBehalf': 'Thu hộ',
  'payment.cash': 'Tiền mặt',
  'payment.bankTransfer': 'Tiền gửi NH',
  'payment.bankAccount': 'Tài khoản ngân hàng',
  customer: 'Khách hàng',
  customerPhone: 'Số điện thoại',
  salesChannel: 'Kênh bán hàng',
  cashier: 'Thu ngân',
  salesperson: 'NV bán hàng',
  note: 'Ghi chú',
  storeCode: 'Mã cửa hàng',
  'platform.fee': 'Phí trả sàn',
  'platform.otherIncome': 'Thu khác từ sàn',
  'platform.revenue': 'Doanh thu từ sàn',
};

export const INVOICE_REPORT_BAND_LABELS_VI: Record<string, string> = {
  revenue: 'Doanh thu',
  customerPayment: 'Khách hàng thanh toán',
  platform: 'Doanh thu sàn TMĐT',
};
```

## Testing Strategy

- Build shared package; rely on TKT-IOL-03/05 specs (buildColumns đọc các nhãn này) để xác thực end-to-end.

## Dependencies

- Depends on: —
- Blocks: TKT-IOL-02, TKT-IOL-03
