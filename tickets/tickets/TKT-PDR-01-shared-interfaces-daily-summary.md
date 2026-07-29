# TKT-PDR-01 shared-interfaces: PosDailySummaryResult types

## Epic

[EPIC-27072026 Báo cáo theo ngày (POS Daily Report)](../epics/EPIC-27072026-pos-daily-report.md)

## Summary

Khai báo hợp đồng type cho response của endpoint tổng hợp (TKT-PDR-03) trong `@erp/shared-interfaces` để FE tiêu thụ qua api-client. Thuần additive, không đổi type sẵn có.

## Deliverables

- `packages/shared-interfaces/src/invoice-report/pos-daily-summary.ts` (new) — export:
  - `PosDailySummaryThu { cash; card; atm; transfer; voucher; points; total }`
  - `PosDailySummaryChi { cash; transfer; total }`
  - `PosDailySummaryCongNo { ghiNo; giamNo }`
  - `PosDailySummaryHang { quantity; value }` (dùng cho hàng bán & hàng trả)
  - `PosDailySummaryKhac { totalInvoices; saleInvoices; returnInvoices; exchangeInvoices; voucherCount; promoCodeCount; cardReceiptCount }`
  - `PosDailySummaryResult { thu; chi; thuTruChi; congNo; hangBan; hangTra; khac }`
- Export type mới qua `packages/shared-interfaces/src/invoice-report/index.ts` (hoặc barrel hiện có của domain `invoice-report`) và package index.

## Acceptance Criteria

- [ ] Tất cả field số là `number` (đơn vị đồng, không format). Không thêm enum/nhãn VI ở đây (nhãn ở FE).
- [ ] Không đổi/không phá type/`INVOICE_REPORT_COLUMN_LABELS_VI` hiện có.
- [ ] `pnpm --filter @erp/shared-interfaces build` xanh; type export ra ngoài package.

## Definition of Done

- [ ] Build shared-interfaces xanh; type nhìn thấy được từ `@erp/shared-interfaces`.
- [ ] No Vietnamese trong tên type/field (chỉ code).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
// packages/shared-interfaces/src/invoice-report/pos-daily-summary.ts
export interface PosDailySummaryThu {
  cash: number; card: number; atm: number; transfer: number;
  voucher: number; points: number; total: number;
}
export interface PosDailySummaryKhac {
  totalInvoices: number; saleInvoices: number; returnInvoices: number;
  exchangeInvoices: number; voucherCount: number;
  promoCodeCount: number; cardReceiptCount: number;
}
export interface PosDailySummaryResult {
  thu: PosDailySummaryThu;
  chi: { cash: number; transfer: number; total: number };
  thuTruChi: number;
  congNo: { ghiNo: number; giamNo: number };
  hangBan: { quantity: number; value: number };
  hangTra: { quantity: number; value: number };
  khac: PosDailySummaryKhac;
}
```

## Testing Strategy

- Build-time type check (tsc). Không có runtime test riêng.

## Dependencies

- Depends on: —
- Blocks: TKT-PDR-03
