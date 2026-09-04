---
id: UOW-02
slug: counterpart-detail
title: Bấm "Tên cửa hàng" mở chi tiết theo cửa hàng đối ứng
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-06, AC-07, AC-12]
risk: medium
status: todo
rollback: gỡ entry `branchName` khỏi `DRILL_DOWNS` — ô về text thường, phần còn lại vô hại vì 3 report type mới không nằm trong ô chọn báo cáo.
---

# UOW-02 — Chi tiết theo cửa hàng đối ứng (L1)

UoW này dựng **cả tầng L1 lẫn hai thay đổi hạ tầng** mà UOW-03/04 dùng lại: cờ `link` cho catalog
inventory (ADR-07) và dialog-mở-được-dialog (ADR-05). Đó là lý do nó là UoW nặng nhất.

## Demo script

1. Mở `/reports/inventory#transfer_in_out_summary`, kỳ **01/09/2026 – 02/09/2026**, "Lấy dữ liệu"
2. Cột "Tên cửa hàng" hiện màu link; ô có giá trị 0 ở các cột số vẫn là text thường
3. Click "Cửa hàng HCM" → dialog "CHI TIẾT NHẬP XUẤT ĐIỀU CHUYỂN THEO CỬA HÀNG", phụ đề nêu tên
   cửa hàng và kỳ, dữ liệu **tự nạp**
4. Mỗi dòng là một chi nhánh đối ứng (HN, DN), cùng bộ dải cột như báo cáo cha
5. So dòng Tổng cộng của dialog với dòng HCM của báo cáo cha — khớp trên cả sáu chỉ tiêu
6. Số trong dialog hiển thị theo `vi-VN` (`12.500.000`), kể cả ở ô có link
7. Đóng dialog → báo cáo cha giữ nguyên report type và kỳ (không có `ReportUrlSync` trong dialog)

## In scope

- Khoá `inventory-transfer-summary-by-counterpart` + nhãn + `REPORT_ROW_BRANCH_ID`
- `summarizeByCounterpart()` phân trang trong SQL + report definition + wiring module
- Cờ `link` cho `InventoryColumnDef` / `buildInventoryHeaders` (ADR-07)
- `ReportDrillDownBody` mount lại `ReportDrillDownMount` (ADR-05)
- Định dạng số trong ô link (A-09)
- Resolver `branchName`

## Not in scope

- Ô "Chênh lệch thực nhận" của **báo cáo cha** vẫn không click được — xem 00-intent "Out of scope"
- Mọi tầng dưới L1 (UOW-03/04)

## Risks

| Risk | Mitigation |
|---|---|
| Σ dòng L1 không khớp dòng cha ⇒ drill-down mâu thuẫn với ô mở ra nó | T-02-02 có spec chạy **cả hai** truy vấn trên cùng seed và so từng chỉ tiêu (A-11) |
| Cờ `link` bôi nhầm sang 8 báo cáo kho khác | Cờ opt-in trên từng `InventoryColumnDef`; T-02-03 assert đúng tập cột dự kiến |
| Đệ quy dialog không dừng, hoặc dialog dưới nằm sau overlay | A-06: đệ quy dừng vì `drillDown` trong cùng là `null`; z-index đã giải sẵn ở `app-modal.tsx`. T-02-04 kiểm bằng tay ở bước demo 3 |
| Report definition mới vi phạm luật cấm `paginateRows` | `report-definitions.guard.spec.ts` sẽ đỏ ngay; T-02-02 phân trang trong SQL từ đầu |

## Definition of done

- [x] AC-06, AC-07, AC-12 pass
- [x] `report-definitions.guard.spec.ts` xanh
- [x] `tsc` sạch ở cả hai app; `vite build` OK
- [x] Ô chọn báo cáo kho vẫn đúng 8 mục
- [x] Demo script chạy được đầu-cuối trên dữ liệu thật; bằng chứng ảnh ở `evidence/local-backoffice/desktop/`

## Verification evidence

- [x] `verify.py … --write` **12/12 xanh** trên `local-backoffice` (môi trường `required` duy nhất khai trong 07-verification.md)
- [x] `evidence_check.py` PASS: 12/12 AC có bằng chứng, 3 AC khai ngoài phạm vi ảnh chụp
- [x] `08-evidence.md` sinh lại, sha `bd91b0c6` khớp HEAD
