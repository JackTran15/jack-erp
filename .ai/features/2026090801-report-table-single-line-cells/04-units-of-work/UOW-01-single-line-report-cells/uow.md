---
id: UOW-01
slug: single-line-report-cells
title: Lưới báo cáo: cột đủ rộng, mỗi dòng một dòng
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07]
risk: low
status: done
rollback: Revert một commit 3 file FE; không có migration, không đổi API
---

# UOW-01 — Lưới báo cáo: cột đủ rộng, mỗi dòng một dòng

## Demo script
1. Đăng nhập backoffice, chế độ "Chuỗi cửa hàng"
2. Báo cáo > Kho > "Số lượng tồn kho theo cửa hàng" → "Mã SKU" 140px, `ABA2777-D-38` nằm
   trên một dòng, mọi dòng cao 32px; hover ô SKU thấy tooltip
3. Báo cáo > Bán hàng > "Doanh thu theo mặt hàng", kỳ "Tháng trước" → Mã SKU 140px, Tên
   hàng hóa 220px (width backend), cột số 112px (fallback); tên hàng dài ("Ba lô đeo vai
   TX2024…") cắt "..."
4. Lọc "Tên hàng hóa" = "Ba lô đeo vai" → mọi dòng còn lại vẫn một dòng
5. Kéo cột "Tên hàng hóa" hẹp lại → chữ cắt "...", dòng không phình
6. Bấm một tên hàng để mở drill-down → lưới trong dialog cùng hành vi

## In scope
- Backend: bảng width chung cho cột định danh của hoá đơn / công nợ / lợi nhuận (ADR-04)
- Mapper cột từ API đọc `width` backend, fallback theo `dataType`
- `<td>` tbody/tfoot: `maxWidth` + `truncate` + `title` cho cột text

## Not in scope
- Header cột (ADR-03), width backend cho cột số / tiền của 3 nhóm, lỗi 400 drill-down có
  từ trước (A-06)

## Risks
| Risk | Mitigation |
| --- | --- |
| Template cột đã lưu mang `columnSizing` cũ 112px | Template chỉ lưu order / visibility / pinning (`mergeTemplateColumnsState`), không lưu sizing — đối chiếu mã 2026-09-08 |
| `maxWidth` làm cột ghim (sticky) lệch nền | Kiểm tra cuộn ngang trên báo cáo kho: cột sku ghim trái vẫn đục nền, không lộ chữ |

## Definition of done
- [x] AC-01..AC-07 pass
- [x] `tsc --noEmit` của `@erp/backoffice-web` và `@erp/api` xanh; 51 suite `modules/reporting` xanh
- [x] Không đổi file ngoài 3 file FE + 5 file backend đã nêu
- [x] Demoed và chấp nhận ở G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description
