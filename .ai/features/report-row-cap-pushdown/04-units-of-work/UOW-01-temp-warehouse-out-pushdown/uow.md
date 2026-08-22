---
id: UOW-01
slug: temp-warehouse-out-pushdown
title: Báo cáo Xuất kho tạm chạy phân trang và lọc dưới SQL
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-02, US-04]
verifies: [AC-02, AC-03, AC-09, AC-12, AC-13, AC-14, AC-22, AC-24]
risk: medium
status: todo
rollback: revert 3 file — `temp-warehouse-out.report.ts`, `report-column-mapper.util.ts`, `report-data.util.ts`; hợp đồng HTTP không đổi nên giao diện không cần đụng
---

# UOW-01 — Báo cáo Xuất kho tạm chạy phân trang và lọc dưới SQL

## Demo script

1. Đăng nhập backoffice, mở Báo cáo → Kho → "Xuất kho tạm", kỳ "Tháng này"
2. Bấm Lấy dữ liệu → lưới lên trang 1, footer có số; mở Network xem payload gửi page=1 limit=50
3. Chuyển sang trang 2 → tập dòng khác hẳn, footer và tổng số dòng KHÔNG đổi
4. Gõ vào ô lọc cột "Nhân viên" → số dòng ở footer giảm theo, không phải chỉ trang hiện tại bị cắt
5. Bấm Xuất khẩu trên tổ chức vượt trần → vẫn nhận 400 "Report exceeds 50000 rows" (trần đã chuyển sang countRows, không mất)

## In scope

- Lớp chuyển đổi từ vựng dùng chung `toEngineFilters` — khoá cột báo cáo → field engine, toán tử dạng-trường → toán tử dạng-giá trị (ADR-02, ADR-03)
- Helper `toTotalsRow` chiếu `ReportTotals` của engine lên `dto.columns`, thay `buildTotalsRow`
- `countRows()` cho `temp-warehouse-out` để trần rời khỏi `buildData` mà đường export vẫn có người canh (ADR-01)
- Chuyển trọn `temp-warehouse-out.report.ts` sang pushdown — báo cáo duy nhất đã phủ đủ 13/13 spec nên không phải viết SQL mới

## Not in scope

- Sáu báo cáo còn lại (UOW-02..UOW-08)
- Xoá `applyColumnFilters` / `paginateRows` khỏi `report-data.util.ts` — còn sáu báo cáo đang dùng, dọn ở UOW-09

## Risks

| Risk | Mitigation |
|---|---|
| Adapter là chỗ cả bảy báo cáo sẽ đi qua; sai ở đây là sai bảy lần | Viết trước, có test riêng cho từng toán tử và cho trường hợp nhiều toán tử (A-01), rồi mới có báo cáo đầu tiên dùng nó |
| Gỡ assert khỏi buildData mà quên countRows sẽ để export không người canh (A-06) | T-01-02 làm cả hai trong một ticket; done-when có test export ném 400 |

## Definition of done

- [x] Toàn bộ AC-02, AC-03, AC-09, AC-12, AC-13, AC-14, AC-24 xanh
- [x] `temp-warehouse-out.report.ts` không còn tham chiếu `assertUnderRowCap`, `applyColumnFilters`, `paginateRows`, `buildTotalsRow`
- [x] `pnpm --filter @erp/api test` xanh trọn vẹn
- [ ] Demo được nghiệm thu ở gate G4
