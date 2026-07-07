# TKT-RFF-02 FE: swap control thô → @erp/ui (SingleSelect / DateTimeField)

## Epic

[EPIC-06072026 Report filter: kho phụ thuộc cửa hàng](../epics/EPIC-06072026-report-filter-store-warehouse.md)

## Summary

Thay các control render bằng `<select>`/`<input type=date>` thô (màu hardcode) trong panel filter báo cáo bằng component có sẵn của `@erp/ui` (`SingleSelect`, `DateTimeField`) để đồng nhất look với StoreScope/InvoiceStatus (đã dùng @erp/ui). **Chỉ đổi control** — giữ nguyên layout row label-trái + Popover container + logic state.

## Deliverables

- `.../ReportFilterLine/ReportSelectField/ReportSelectField.tsx` (rewrite) — giữ **nguyên Props interface** (`value, options, placeholder?, hidePlaceholder?, onChange`), render bằng `SingleSelect` từ `@erp/ui`:
  - Khi `!hidePlaceholder`: prepend option `{ value: "", label: placeholder ?? "— Chọn —" }` để user chọn được "tất cả/none" (SingleSelect không tự có option rỗng như `<select>`).
  - `className="h-9 text-xs"` cho khớp chiều cao hàng hiện tại.
  - `onValueChange={onChange}`.
- `.../ReportFilterLine/PeriodSelect/PeriodSelect.tsx` (edit) — thay `<select>` bằng `SingleSelect` (options = `PERIOD_PRESET_OPTIONS` từ `@erp/ui`), hoặc tái dùng `ReportSelectField` đã đổi.
- `.../ReportFilterLine/DateRangeField/DateRangeField.tsx` (edit) — thay 2 `<input type=date>` bằng `DateTimeField` (date mode, `includeTime={false}`) từ `@erp/ui`; giữ 2 giá trị `fromDate`/`toDate`.
- `.../ReportPageHeaderFilter/ReportPageHeaderFilter.tsx` (edit) — thay `<select>` period bằng `SingleSelect` + 2 `<input type=date>` bằng `DateTimeField`; giữ Button "Lấy dữ liệu".

## Acceptance Criteria

- [ ] Không còn `<select>`/`<input type=date>` thô + màu hardcode (`#CCCCCC`/`#333333`/`#3B6FE5`) trong 4 file trên; dùng semantic token qua @erp/ui.
- [ ] Hành vi giữ nguyên: chọn option → `onChange(value)`; option "tất cả" (value rỗng) vẫn chọn được ở các field không `hidePlaceholder`; STORE_SINGLE (`hidePlaceholder`) không có option rỗng.
- [ ] Period preset + date range vẫn set đúng store (kể cả logic period='custom' ↔ range).
- [ ] Look đồng nhất: chiều cao ~h-9, focus ring theo @erp/ui; không vỡ layout row label-110px.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh; typecheck sạch.
- [ ] Không đổi Props công khai của `ReportSelectField` (mọi consumer qua `RemoteSelectField` + các case PRODUCT_TYPE/STATISTIC_BY/STAT_DATE_TYPE/WORK_SHIFT không phải sửa).
- [ ] Không TODO/FIXME.

## Tech Approach

`SingleSelect` props: `{ options: {value,label}[], value, onValueChange, placeholder?, className?, disabled? }`. Vì `ReportSelectField` là điểm nghẽn chung (nhiều field đi qua nó + `RemoteSelectField`), chỉ cần rewrite 1 file này là phần lớn dropdown đổi theo. Giữ chữ ký cũ để không phải sửa `RemoteSelectField`/`ReportFilterLine`.

## Testing Strategy

- Manual trên dev (verify ở TKT-RFF-04): mở panel, kiểm mọi dropdown/date render @erp/ui, chọn giá trị hoạt động.

## Dependencies

- Depends on: —
- Blocks: TKT-RFF-03 (WarehouseSelectField tái dùng `ReportSelectField` đã đổi).
