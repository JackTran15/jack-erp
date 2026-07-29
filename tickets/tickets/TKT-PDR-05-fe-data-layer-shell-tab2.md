# TKT-PDR-05 FE: data layer + page shell + route/menu + TAB 2 table

## Epic

[EPIC-27072026 Báo cáo theo ngày (POS Daily Report)](../epics/EPIC-27072026-pos-daily-report.md)

## Summary

Dựng khung trang `/daily-report` (pos-web) theo pattern `InvoiceListPage`: page shell + page-hook + service + react-query hook + dtos/interfaces/constants + query keys, wire route/menu, và tab **"Doanh thu theo mặt hàng"** (bảng `revenue-by-item` có phân trang + dòng tổng, cột gồm Đơn giá). Tab "Tổng hợp" để placeholder (panel làm ở TKT-PDR-07).

## Deliverables

- `apps/pos-web/src/pages/DailyReportPage.tsx` — shell: `DailyReportTabs` + `DailyReportToolbar` (toolbar chi tiết ở TKT-PDR-06, ở đây dựng skeleton) + nội dung theo tab; gọi `useDailyReport()`.
- `apps/pos-web/src/hooks/page-hooks/daily-report/use-daily-report.ts` — state `activeTab`, `dateRange`, `customRange`, phân trang TAB 2; build request body `revenue-by-item`; đọc branch từ `usePosBranchStore`.
- `apps/pos-web/src/services/daily-report.service.ts` — `searchRevenueByItem(body) → http.post('/reports/invoices/search', {reportType:'revenue-by-item', columns, filters, page, limit})`; `getDailySummary(body) → http.post('/reports/pos/daily-summary', body)` (dùng ở TKT-PDR-07).
- `apps/pos-web/src/hooks/react-query/use-query-daily-report.ts` — `useRevenueByItemReportQuery(body)` (+ `useDailySummaryQuery` cho PDR-07); `branchId` trong queryKey; `placeholderData: keepPreviousData`.
- `apps/pos-web/src/dtos/daily-report.dto.ts`, `interfaces/daily-report.interface.ts` (`RevenueByItemReportRow`, `CashHandoverForm`…), `types/daily-report.type.ts` (`DailyReportTab`), `constants/daily-report.constant.ts` (cột TAB 2 gồm `unitPrice`, nhãn section, mệnh giá kiểm đếm).
- `apps/pos-web/src/components/page-components/DailyReport/DailyReportTabs/DailyReportTabs.tsx`, `.../RevenueByItemTab/RevenueByItemTab.tsx`, `.../RevenueByItemTable/RevenueByItemTable.tsx` (dòng tổng cuối bảng), tái dùng `components/common/PosPaginationBar`.
- Edit `constants/react-query-key.constant.ts` — thêm `DAILY_REPORT_KEYS` (`ALL`, `SUMMARY(body)`, `REVENUE_BY_ITEM(body)`).
- Edit `App.tsx` — `<Route path="/daily-report" element={<DailyReportPage/>}/>` trong nhóm `PosLayout`.
- Edit `constants/pos-menu.constant.ts` — thêm `route: "/daily-report"` vào item `bao-cao-theo-ngay`.

## Acceptance Criteria

- [ ] `/daily-report` mở được từ menu; hiển thị 2 tab, mặc định "Tổng hợp".
- [ ] Tab "Doanh thu theo mặt hàng" gọi `POST /reports/invoices/search` (reportType `revenue-by-item`), render bảng cột: Mã hàng hóa, Tên hàng hóa, Nhóm hàng hóa, ĐVT, SL bán, **Đơn giá**, Tiền hàng, Khuyến mại, Doanh thu; phân trang (page size 100) + dòng tổng.
- [ ] `branchId` nằm trong queryKey → đổi chi nhánh refetch.
- [ ] Tuân thủ pos-web CLAUDE.md: named export, không `index.ts`, `@erp/pos/...` full path, API chỉ trong `services/`, React Query chỉ trong `hooks/react-query/`, queryKey từ constant.

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` (tsc) xanh.
- [ ] Không gọi `http` ngoài `services/`; không hard-code queryKey.
- [ ] FE strings tiếng Việt; enum/ID English.

## Tech Approach

```ts
// react-query-key.constant.ts
export const DAILY_REPORT_KEYS = {
  ALL: ['daily-report'] as const,
  SUMMARY: (body: unknown) => ['daily-report', 'summary', body] as const,
  REVENUE_BY_ITEM: (body: unknown) => ['daily-report', 'revenue-by-item', body] as const,
};
```

## Testing Strategy

- `tsc` build; verify bảng + phân trang + dòng tổng bằng browser preview ở TKT-PDR-09.

## Dependencies

- Depends on: TKT-PDR-04
- Blocks: TKT-PDR-06, TKT-PDR-07
