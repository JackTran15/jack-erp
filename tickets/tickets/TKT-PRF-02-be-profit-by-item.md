# TKT-PRF-02 Backend — Lợi nhuận theo mặt hàng

## Epic

[EPIC-16072026 Báo cáo lợi nhuận (Profit Reports)](../epics/EPIC-16072026-profit-reports.md)

## Summary

Report definition cho `profit-by-item`: doanh thu/giá vốn/lợi nhuận theo mặt hàng, gộp
theo 1 trong 3 grain (Hàng hoá/Mẫu mã/Nhóm hàng hóa qua filter "Thống kê theo"). Song sinh
với `RevenueByItemReport` — tái dùng `ReportGroupBy` (`ITEM`/`PARENT`/`GROUP`, enum có sẵn
trong `@erp/shared-interfaces`, **không thêm enum mới**), nhưng **không** có tuỳ chọn
`statisticByBrand`. Đã có 4 screenshot UI mẫu thật đối chiếu số liệu.

## Deliverables

- `apps/api/src/modules/reporting/profit-report/profit-by-item.aggregator.ts` +
  `profit-by-item.columns.ts` — parallel với `revenue-by-item.aggregator.ts`/`.columns.ts`
  của `invoice-report/`, KHÔNG import chéo (file private của module khác) — logic gộp nhóm
  giống hệt nhưng input row thêm field `costPrice`.
- `apps/api/src/modules/reporting/profit-report/reports/profit-by-item.report.ts` —
  `ReportDefinition` implement:
  - Query `InvoiceEntity` trong khoảng `issuedAt`, branch-scoped qua `resolveBranchIds` +
    `CONSOLIDATED_PERMISSION` (từ `report-core/report-query.util.ts`, TKT-PRF-01).
  - Query `InvoiceItemEntity` theo `invoiceId`, gộp nhóm theo grain resolve từ `statBy`.
  - `buildColumns(actor, statBy)` trả **catalog khác nhau theo `statBy`** — xem 2 bảng cột
    bên dưới.
- Đăng ký vào `ProfitReportRegistry` (từ TKT-PRF-01) với key `profit-by-item`.

**Filters**:
- `issuedAt` (date range) — bắt buộc.
- `store`/`branchId` — chỉ áp dụng khi actor xem ở chế độ Chuỗi; mặc định org-wide (không
  filter), thu hẹp qua `resolveBranchIds` khi có `branchId` cụ thể.
- `categoryId` — lọc theo nhóm hàng hóa, optional (mặc định "Tất cả nhóm").
- `statBy` (`ReportGroupBy`): `PARENT` (Hàng hoá) | `ITEM` (Mẫu mã, mặc định) | `GROUP`
  (Nhóm hàng hóa).

**Cột — `statBy = ITEM | PARENT`** (cùng bộ cột, khác grain dữ liệu):

| key | label | công thức |
|---|---|---|
| `skuCode` | Mã SKU | pin left |
| `itemName` | Tên hàng hóa | pin left |
| `unit` | Đơn vị tính | |
| `quantity` | Số lượng bán (1) | Σ `quantity`, signed theo `direction` (OUT −IN) |
| `revenue` | Doanh thu (3) | Σ `lineTotal`, signed theo `direction` |
| `costOfGoods` | Giá vốn (GV) (5) | Σ `costPrice × quantity`, signed theo `direction` — **có thể âm** |
| `grossProfit` | Lợi nhuận (LN) (6)=(3)-(5) | |
| `profitPerUnit` | Lợi nhuận đơn vị (7)=(6)/(1) | null nếu `quantity=0` |
| `marginOnRevenue` | Tỷ lệ LN/DT (8)=(6)/(3) | null nếu `revenue=0` |
| `marginOnCost` | Tỷ lệ LN/GV (9)=(6)/(5) | null nếu `costOfGoods=0` |
| `categoryName` | Tên nhóm hàng hóa | |

**Cột — `statBy = GROUP`** (bộ cột khác hẳn — không SKU/đơn vị/số lượng/lợi nhuận đơn vị):

| key | label | công thức |
|---|---|---|
| `categoryCode` | Mã nhóm hàng hóa | |
| `categoryName` | Tên nhóm hàng hóa | |
| `revenue` | Doanh thu (2) | Σ `lineTotal` toàn bộ item trong nhóm |
| `costOfGoods` | Giá vốn (GV) (4) | Σ `costPrice × quantity` toàn bộ item trong nhóm |
| `grossProfit` | Lợi nhuận (LN) (5)=(2)-(4) | |
| `marginOnRevenue` | Tỷ lệ LN/DT (6)=(5)/(2) | |
| `marginOnCost` | Tỷ lệ LN/GV (7)=(5)/(4) | |

## Acceptance Criteria

- [ ] Query filter theo `actor.organizationId`; branch scope qua `resolveBranchIds` +
      `CONSOLIDATED_PERMISSION` giống `RevenueByItemReport` (KHÔNG luôn org-wide như
      debt-reports — đây là điểm khác biệt đã chốt).
- [ ] `GET /reports/profit/columns?reportType=profit-by-item&statBy=item|parent|group` trả
      đúng 1 trong 2 bộ cột ở trên tuỳ `statBy` (mặc định `item` nếu thiếu param).
- [ ] Hoá đơn RETURN/EXCHANGE: `quantity`/`revenue`/`costOfGoods` tách đúng theo
      `invoice_items.direction` (OUT/IN), KHÔNG theo `invoice.type` — test với 1 hoá đơn
      EXCHANGE có cả dòng OUT lẫn IN.
- [ ] `costOfGoods` có thể ra số âm khi 1 mặt hàng có tổng hàng trả (IN) lớn hơn tổng hàng
      bán (OUT) trong kỳ — verify bằng 1 test case cụ thể, **không** coi đây là lỗi cần
      chặn.
- [ ] Dòng Tổng (`totals`): `marginOnRevenue`/`marginOnCost` tính lại từ tổng
      `grossProfit`/tổng `revenue`/tổng `costOfGoods` (không phải trung bình % từng dòng).
      `profitPerUnit` **không xuất hiện** ở dòng Tổng (trả `null`/bỏ qua field này trong
      `totals`).
- [ ] Response envelope `{ rows, totals, total }` — `totals` tính trên toàn bộ rows sau
      filter (không chỉ trang hiện tại).

## Definition of Done

- [ ] `profit-by-item.report.spec.ts`: unit test cho cả 3 `statBy`; 1 test case hoá đơn
      EXCHANGE (direction OUT+IN cùng hoá đơn); 1 test case giá vốn âm (return > sale trong
      kỳ); 1 test case dòng Tổng đúng công thức tỷ lệ tính lại từ tổng (không phải trung
      bình).
- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] Không tiếng Việt trong code/log/comment backend (label cột tiếng Việt chỉ định nghĩa
      ở FE registry, không hard-code ở BE — theo đúng convention debt-reports).

## Tech Approach

```ts
@Injectable()
export class ProfitByItemReport implements ReportDefinition<ProfitReportSearchDto> {
  readonly key = 'profit-by-item';

  async buildColumns(actor: ActorContext, statBy?: ReportGroupBy): Promise<ReportColumnHeader[]> {
    return statBy === ReportGroupBy.GROUP ? PROFIT_BY_GROUP_COLUMNS : PROFIT_BY_ITEM_COLUMNS;
  }

  async buildData(dto: ProfitReportSearchDto, actor: ActorContext): Promise<InvoiceReportResult> {
    const branchIds = resolveBranchIds(hasConsolidated, dto.filters.store, dto.filters.branchId, actor);
    const lines = await this.loadLinesInRange(dto.filters.issuedAt, branchIds, actor.organizationId);
    const grain = resolveGrain(dto.filters.statBy); // 'item' | 'parent' | 'group'
    const groups = aggregateProfitByItem(lines, grain); // adds costOfGoods/grossProfit/margin*
    // paginate, build totals (marginOnRevenue/marginOnCost recomputed from summed totals)
  }
}
```

## Testing Strategy

- Unit: `profit-by-item.report.spec.ts` (mock repos, verify aggregation theo cả 3 grain +
  EXCHANGE direction handling + âm GV + totals formula).
- Không cần E2E riêng — gộp vào TKT-PRF-11.

## Dependencies

- Depends on: TKT-PRF-01.
- Blocks: TKT-PRF-05.
