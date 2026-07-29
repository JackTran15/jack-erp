# TKT-PDR-06 FE: toolbar + filter Thu ngân/NVBH + custom-range modal

## Epic

[EPIC-27072026 Báo cáo theo ngày (POS Daily Report)](../epics/EPIC-27072026-pos-daily-report.md)

## Summary

Hoàn thiện toolbar dùng chung cho cả 2 tab: bộ lọc thời gian (preset + "Khác"), select **Thu ngân** + **NVBH**, và 2 nút In/Xuất (chỉ enable ở tab Tổng hợp — hành vi In/Xuất ở TKT-PDR-08). Wire preset "Khác" (OTHER) mở modal "Chọn thời gian" chọn from–to đầy đủ. Filter Thu ngân/NVBH áp vào request của cả 2 tab.

## Deliverables

- `apps/pos-web/src/components/page-components/DailyReport/DailyReportToolbar/DailyReportToolbar.tsx` — `PosDateRangeFilter` + 2 `PosSelect` (Thu ngân/NVBH) + nút In/Xuất (disabled khi tab ≠ Tổng hợp).
- `apps/pos-web/src/components/common/PosDateRangeFilter/PosDateRangeCustomDialog/PosDateRangeCustomDialog.tsx` — modal "Chọn thời gian" (2 field ngày+giờ từ–đến) trên `PosDialog`, nút Đồng ý/Đóng.
- Edit `apps/pos-web/src/lib/common/dateRangeFilter.ts` — `dateRangeToISO(opt, now?, customRange?)`: khi `opt==='OTHER'` trả `customRange ?? {}` (backward-compatible, param optional).
- Edit `apps/pos-web/src/components/common/PosDateRangeFilter/PosDateRangeFilter.tsx` — prop optional `onSelectOther?: () => void`, gọi khi user chọn "Khác" (caller khác không bị ảnh hưởng).
- Cập nhật `use-daily-report.ts` — state `cashierId`, `salespersonId`, `customRange`, `customRangeOpen`; đưa `cashierId`/`salespersonId` vào cả body `daily-summary` lẫn `filters` của `revenue-by-item`; nguồn options Thu ngân/NVBH từ `GET /reports/invoices/filter-options` (service mới nếu cần).

## Acceptance Criteria

- [ ] Preset khớp screenshot (Toàn bộ, Hôm nay, Hôm qua, Tuần này, Tuần trước, Tháng này, Tháng trước, Khác); mặc định Hôm nay.
- [ ] Chọn "Khác" mở `PosDateRangeCustomDialog`; Đồng ý set `customRange {from,to}`; badge khoảng ngày hiển thị đúng; cả 2 tab refetch theo from–to.
- [ ] Đổi Thu ngân/NVBH → request cả 2 tab gửi `cashierId`/`salespersonId` (revenue-by-item qua `filters.cashierId`/`filters.salespersonId`), số liệu lọc đúng.
- [ ] Nút In/Xuất disabled/ẩn khi đang ở tab Doanh thu theo mặt hàng.
- [ ] Callers cũ của `PosDateRangeFilter`/`dateRangeToISO` không đổi hành vi (OTHER vẫn `{}` khi không truyền customRange).

## Definition of Done

- [ ] `pnpm --filter @erp/pos-web build` xanh.
- [ ] Không phá `InvoiceListPage` (dùng chung `PosDateRangeFilter`/`dateRangeFilter`).
- [ ] Tuân thủ pos-web CLAUDE.md.

## Tech Approach

```ts
// dateRangeFilter.ts
export function dateRangeToISO(
  opt: PosDateRangeFilterOption, now: Date = new Date(),
  customRange?: { from?: string; to?: string },
): { from?: string; to?: string } {
  if (opt === 'OTHER') return customRange ?? {};
  // ... presets như cũ
}
```

## Testing Strategy

- `tsc` build; verify custom range + filter Thu ngân/NVBH ở TKT-PDR-09 (network panel).

## Dependencies

- Depends on: TKT-PDR-05
- Blocks: TKT-PDR-08
