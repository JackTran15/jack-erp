# TKT-IVR-09 FE: "Hiển thị cột" lưu backend template (ColumnConfigDialog)

## Epic

[EPIC-06072026 Báo cáo kho hàng theo structure báo cáo bán hàng](../epics/EPIC-06072026-inventory-report-v2.md)

## Summary

Nối `ColumnConfigDialog` (chain-store ReportPage) với API template: mở dialog → load template đã lưu của reportType (seed draft), Lưu → create-or-update template backend rồi apply local như hiện tại. V1 = **1 template ngầm định per reportType** (không UI đặt tên/danh sách). Hooks viết generic theo `backendSource` để sales adopt sau — epic này chỉ wire cho 8 báo cáo kho.

## Deliverables

- `apps/backoffice-web/src/pages/chain-store/reports/_api/report-template.api.ts` (new) — `listReportTemplates(source, reportType)`, `createReportTemplate(source, payload)`, `updateReportTemplate(source, id, payload)` qua `erpApi`/`requireErpData`; endpoint base theo `backendSource` (`/reports/inventory/templates`; invoice để sẵn nhưng chưa gọi).
- Hook `useReportTemplate(reportType)` (TanStack Query) — `queryKey: ["report-templates", source, reportType]`; mutation create/update + invalidate prefix.
- `ColumnConfigDialog.tsx` + con (`ColumnConfigTable`, ...) (edit):
  - Mở dialog: nếu có template → seed draft từ `columns[]` records (`visible/frozen/order/displayName`); không có → default từ table config hiện tại (backend catalog).
  - Lưu: build `columns[] = {col, displayName: null, visible, frozen, order}` theo thứ tự draft → create (chưa có) / update (đã có, theo name ngầm định `"default"`) → apply local table store như behavior cũ.
  - Chỉ bật persistence khi `backendSource === 'inventory'` (v1); sales giữ behavior cũ.
- Reload flow: `ReportTableConfigSync` (hoặc chỗ hợp lý) merge template đã lưu lên backend catalog khi vào báo cáo (visible/frozen/order override; cột mới trong catalog chưa có trong template → append visible mặc định).

## Acceptance Criteria

- [ ] Cấu hình cột (ẩn/hiện, pin, thứ tự) 1 báo cáo kho → Lưu → reload trang → cấu hình giữ nguyên (từ backend, không phải localStorage).
- [ ] Cấu hình lưu theo org (user khác cùng org thấy chung — semantics org-shared của bảng template); reportType khác không ảnh hưởng nhau.
- [ ] Catalog thêm cột mới (vd branch mới ở pivot #5) → cột mới xuất hiện mặc định, template cũ không vỡ.
- [ ] Lỗi API khi lưu → toast lỗi, draft giữ nguyên, không apply nửa vời.
- [ ] Mutation gửi `X-Idempotency-Key` (erpApi auto).

## Definition of Done

- [ ] Build + typecheck xanh; verify thủ công flow save/reload 2 báo cáo (1 thường + pivot #5).
- [ ] Không đổi behavior sales reports.
- [ ] Không TODO/FIXME.

## Tech Approach

Giữ nguyên UX dialog hiện có (checkbox + pin + reorder buttons) — chỉ thay nguồn seed + đích lưu. Merge logic: map template records theo `col`, iterate catalog theo order template trước rồi append cột catalog chưa có.

## Testing Strategy

- Unit merge logic (template ∪ catalog); manual round-trip trên dev.

## Dependencies

- Depends on: TKT-IVR-06, TKT-IVR-07
- Blocks: TKT-IVR-10
