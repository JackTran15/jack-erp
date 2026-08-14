---
id: UOW-02
slug: retrofit-bao-cao
title: Retrofit Tổng hợp tồn kho + 8 báo cáo kho sang contract chung
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-01, US-02]
verifies: [AC-01, AC-03, AC-04]
risk: medium
status: todo
rollback: revert; chỉ là đổi tên kiểu, runtime không đổi
---

# UOW-02 — Retrofit Tổng hợp tồn kho + 8 báo cáo kho

Phần lớn là đổi tên kiểu. Giá trị thật của lát này nằm ở chỗ **chạy lại đủ 17 bước verify của đợt 1**
để chứng minh chuẩn hoá không làm sai con số nào.

## Demo script
1. Copy `07-verification.md` của `footer-grand-totals` sang feature này
2. Chạy `/ai-dlc-verify` — cả 17 bước phải xanh với **cùng** các con số cũ
   (tồn kho 2.150; báo cáo NXT trang cuối 2.198; pivot 2.152; xuất kho tạm; …)
3. Kiểm `StockSummaryTotals` nay kế thừa `ReportTotals`, `inventory-reports` dùng alias chung

## In scope
- `StockSummaryTotals extends ReportTotals`
- 6 service `inventory-reports` + facade đổi `Record<string, number>` → `ReportTotals`
- FE type mirror trong `api/stock-summary.ts`, `api/inventory-reports.ts`

## Not in scope
- Đổi bất kỳ con số nào; đổi logic tính toán

## Risks
| Risk | Mitigation |
| --- | --- |
| Đổi kiểu làm lộ chỗ trước đây `any`-ish rồi vỡ runtime | Chạy lại đủ 17 bước, không chỉ tin `tsc` |

## Definition of done
- [x] 17 bước verify xanh sau retrofit
- [x] Không còn `Record<string, number>` viết tay cho totals trong `inventory-reports`
- [x] `tsc` sạch cả hai app; `npx jest` thoát 0

## Ghi chú: ba mốc đã dịch, và vì sao **không** phải hồi quy

S7/S8/S9 (báo cáo Tổng hợp NXT) đỏ ở lần chạy đầu: 1.541 → 1.542 dòng, 2.198 → 2.200.

Nguyên nhân: báo cáo này **không scope theo chi nhánh** — controller cố ý không áp
`@RequireBranchScope` (nó đọc được đa chi nhánh, lọc bằng `branchIds` trong body). Nên nó tính cả
phiếu nhập điều chuyển đã tạo ở Chi nhánh 2 khi kiểm thử POS/điều chuyển trước đó: đúng **+1 dòng
và +2 đơn vị**, khớp từng con số.

Đối chiếu SQL scope theo `branch_id = HCM` vẫn ra 1.541 / 2.198 — tức phần dữ liệu HCM không đổi.
Đã cập nhật mốc sang giá trị toàn tổ chức và ghi rõ trong `07-verification.md` để lần sau không ai
tưởng là lỗi.
