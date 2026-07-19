# TKT-PRF-03 Backend — Lợi nhuận gộp theo hoá đơn

## Epic

[EPIC-16072026 Báo cáo lợi nhuận (Profit Reports)](../epics/EPIC-16072026-profit-reports.md)

## Summary

Report definition cho `gross-profit-by-invoice`. **Quan trọng**: mặc dù tên gọi "theo hoá
đơn", đây **KHÔNG PHẢI** báo cáo 1-dòng/1-hoá-đơn — verify từ screenshot UI mẫu thật: bảng
hiển thị **1 dòng/1 ngày** trong kỳ, giống hệt grain của `DailySalesSummaryReport`. Tên báo
cáo mô tả cách tính (rollup từ dữ liệu hoá đơn + dòng hàng), không phải grain hiển thị. Đã
verify chéo: dòng Tổng của báo cáo này khớp chính xác dòng Tổng của `profit-by-item` cùng
kỳ (Doanh thu 21.040.000 / Giá vốn −4.757.000 / Lợi nhuận gộp 25.797.000 trong dữ liệu mẫu)
— cùng nguồn dữ liệu, chỉ khác trục gộp nhóm.

## Deliverables

- `apps/api/src/modules/reporting/profit-report/gross-profit-by-invoice.aggregator.ts` +
  `.columns.ts` — song sinh với `daily-sales-summary.report.ts`'s `aggregateByDay` (tái
  dùng `signedGoods`/`invoiceTypeSign` từ `report-core/report-query.util.ts`), cộng thêm
  bước query `InvoiceItemEntity` theo `invoiceId` để tính giá vốn theo ngày (báo cáo gốc
  `DailySalesSummaryReport` không cần join line items, báo cáo này cần).
- `apps/api/src/modules/reporting/profit-report/reports/gross-profit-by-invoice.report.ts`
  — `ReportDefinition` implement, đăng ký vào `ProfitReportRegistry` với key
  `gross-profit-by-invoice`.

**Filters**:
- `issuedAt` (date range) — bắt buộc, 1 khoảng ngày (không phải 2 kỳ như báo cáo #3).
- `store`/`branchId` — chỉ hiện ở chế độ Chuỗi cửa hàng, mặc định org-wide, thu hẹp qua
  `resolveBranchIds`.
- **Không có** filter loại/trạng thái hoá đơn, khách hàng, thu ngân, NV bán hàng (đã xác
  nhận qua screenshot dialog "Chọn báo cáo" — chỉ có Cửa hàng + Kỳ).

**Columns** (đúng dialog "Sửa mẫu"):

| key | label | công thức |
|---|---|---|
| `date` | Ngày | pin left |
| `grossGoods` | Tổng tiền hàng (1) | `signedGoods(invoice)` cộng dồn theo ngày |
| `discount` | Giảm giá (2) | Σ (`discountAmount + pointsDiscountAmount`), signed theo `invoiceTypeSign` |
| `revenue` | Doanh thu (3)=(1)-(2) | |
| `costOfGoods` | Tổng giá vốn (4) | Σ `costPrice × quantity` mọi dòng hàng của hoá đơn phát sinh trong ngày, signed theo `direction` — **có thể âm** |
| `grossProfit` | Lợi nhuận gộp (5)=(3)-(4) | |

## Acceptance Criteria

- [ ] Query filter theo `actor.organizationId`; branch scope qua `resolveBranchIds` +
      `CONSOLIDATED_PERMISSION` (mặc định org-wide khi ở chế độ Chuỗi, giống báo cáo #1).
- [ ] Gộp nhóm theo NGÀY (`issuedAt` cắt về ngày, dùng lại `aggregateByDay`-style logic từ
      `daily-sales-summary.report.ts` làm mẫu), KHÔNG phải theo hoá đơn — đây là điểm dễ
      hiểu nhầm nhất của ticket này, ghi rõ trong code review.
- [ ] `costOfGoods` theo ngày có thể ra số âm (ngày chỉ có hàng trả, không có hàng bán) —
      verify với 1 test case cụ thể (vd: 1 ngày chỉ có invoice RETURN).
- [ ] Dòng Tổng cộng dồn cả 5 cột trên toàn bộ rows sau filter.
- [ ] **Verify chéo bắt buộc**: chạy `profit-by-item` và `gross-profit-by-invoice` với cùng
      1 khoảng ngày, cùng branch scope trên dữ liệu test — dòng Tổng (`revenue`,
      `costOfGoods`, `grossProfit`) của 2 báo cáo phải khớp nhau tuyệt đối. Thêm assertion
      này vào unit test (không chỉ manual QA).
- [ ] Response envelope `{ rows, totals, total }`; `limit` mặc định 31 (giống
      `DailySalesSummaryReport`) để 1 tháng vừa 1 trang.

## Definition of Done

- [ ] `gross-profit-by-invoice.report.spec.ts`: unit test happy-path nhiều ngày; 1 ngày chỉ
      có RETURN (giá vốn âm, doanh thu âm); 1 ngày không có giao dịch (không xuất hiện
      trong rows, giống hành vi `DailySalesSummaryReport` hiện tại — verify lại hành vi gốc
      trước khi assert); test verify-chéo với `profit-by-item`.
- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] Không tiếng Việt trong code/log/comment backend.

## Tech Approach

```ts
@Injectable()
export class GrossProfitByInvoiceReport implements ReportDefinition<ProfitReportSearchDto> {
  readonly key = 'gross-profit-by-invoice';

  async buildData(dto: ProfitReportSearchDto, actor: ActorContext): Promise<InvoiceReportResult> {
    const branchIds = resolveBranchIds(hasConsolidated, dto.filters.store, dto.filters.branchId, actor);
    const invoiceRows = await this.loadInvoicesInRange(dto.filters.issuedAt, branchIds, actor.organizationId);
    const lines = await this.loadLinesForInvoices(invoiceRows.map(i => i.id));
    const buckets = aggregateGrossProfitByDay(invoiceRows, lines); // day -> {grossGoods, discount, revenue, costOfGoods, grossProfit}
    // paginate over sorted day keys, build totals
  }
}
```

## Testing Strategy

- Unit: `gross-profit-by-invoice.report.spec.ts` (mock repos, day-bucket aggregation, âm GV
  ngày chỉ-return, verify-chéo với profit-by-item).
- Không cần E2E riêng — gộp vào TKT-PRF-11.

## Dependencies

- Depends on: TKT-PRF-01.
- Blocks: TKT-PRF-05.
