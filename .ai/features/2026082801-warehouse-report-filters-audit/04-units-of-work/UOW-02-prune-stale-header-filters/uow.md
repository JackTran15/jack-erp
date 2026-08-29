---
id: UOW-02
slug: prune-stale-header-filters
title: Đổi báo cáo không để lại bộ lọc vô hình
demoable: true
duration: 1d
depends_on: []
requirements: [US-02]
verifies: [AC-05, AC-06, AC-07]
risk: medium
status: todo
rollback: revert 1 commit; `setReportType` giữ nguyên `filters` như cũ
---

# UOW-02 — Đổi báo cáo không để lại bộ lọc vô hình

## Demo script
1. Báo cáo > Kho, chọn "Số lượng tồn kho theo cửa hàng" (báo cáo duy nhất có dòng "Thương hiệu")
2. Đặt Thương hiệu = "Giay MT", bấm Đồng ý → lưới thu hẹp
3. Đổi báo cáo sang "Tổng hợp nhập xuất tồn kho" (không có dòng Thương hiệu), bấm Đồng ý
4. Chân trang hiện **56 dòng** — trước khi sửa là 1, do bộ lọc thương hiệu vẫn chạy ngầm
5. Mở DevTools > Network, xem thân `POST /reports/inventory/search`: không có khoá `brand`
6. Đặt "Nhóm hàng hóa" rồi đổi sang "Chi tiết số lượng nhập xuất tồn kho" (cũng có dòng đó)
   → giá trị còn nguyên trên form

## In scope
- Dọn `filters` trong `setReportType` theo `getReportFormLines` ∪ allowlist (ADR-03, ADR-04)
- Áp dụng cho cả 4 nhóm báo cáo vì store dùng chung — đó là lý do allowlist tồn tại

## Not in scope
- Đồng bộ bộ lọc vào URL để sống qua F5 (A-08)
- Bộ lọc theo cột — `pruneColumnFilters` đã xử lý sẵn

## Risks
| Risk | Mitigation |
| --- | --- |
| Dọn nhầm làm hỏng drill-down (line `SKU`) hoặc kỳ so sánh của "Kết quả kinh doanh" | Allowlist ở ADR-04; T-02-02 có test riêng cho cả hai ca |
| Nhóm Bán hàng / Công nợ / Lợi nhuận hồi quy | T-02-02 chạy trên store dùng chung, không chỉ trên báo cáo kho |

## Definition of done
- [x] AC-05, AC-06, AC-07 pass
- [x] `npx vitest run` trong `apps/backoffice-web` xanh
- [x] Không có trạng thái nào mà form và payload bất đồng
- [x] Demoed và accepted ở G4 — Akenzy, 2026-08-29, trên bằng chứng ảnh của
      `08-evidence.md` (7/7 bước xanh, `evidence_check` PASS)

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
> **Không áp dụng cho feature này** — mục "PR draft copied and contact sheets attached"
> được Akenzy gỡ khỏi định nghĩa hoàn thành ngày 2026-08-29: công việc này không đi qua
> PR, và không commit nào được tạo. Bản nháp PR vẫn nằm sẵn ở cuối `08-evidence.md`, kèm
> `evidence/contact-sheet-local-backoffice.png`, dùng được ngay nếu sau này mở PR.
> Ghi lại thay vì xoá: một yêu cầu bị bỏ nên đọc được, không nên biến mất.
