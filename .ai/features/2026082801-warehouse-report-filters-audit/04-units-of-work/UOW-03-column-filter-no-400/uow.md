---
id: UOW-03
slug: column-filter-no-400
title: Ô lọc cột chỉ hiện ở cột lọc được
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-08, AC-09, AC-10]
risk: low
status: todo
rollback: revert 1 commit; ô lọc hiện lại và trả 400 như cũ
---

# UOW-03 — Ô lọc cột chỉ hiện ở cột lọc được

## Demo script
1. Báo cáo > Kho > "Bảng kê chi tiết phiếu nhập xuất kho", bấm Đồng ý
2. Cuộn ngang tới cột "Mã chi nhánh" — ô lọc ở dòng đầu bảng **trống**, không có control
   (trước khi sửa: gõ vào đó ra toast `Cột "branchCode" không hỗ trợ lọc trên báo cáo này`)
3. Cột "Tên chi nhánh" ngay bên cạnh vẫn có ô lọc và vẫn lọc được
4. Lặp ở "Chi tiết số lượng nhập xuất tồn kho" với 6 cột `inWh`, `inOther`,
   `outPurchaseReturn`, `outWh`, `outVoid`, `outOther`
5. Chạy `evidence/probe2.py` → 8 báo cáo, không cột nào trả 400

## In scope
- `filterKind: 'none'` cho 9 cột luôn null trong catalog của 3 báo cáo
- Test bảo vệ: mọi cột còn ô lọc đều có `ReportColumnSpec`

## Not in scope
- Bổ sung dữ liệu cho 9 cột đó (ADR-05) — chúng vẫn hiện và vẫn rỗng
- Bỏ cột khỏi catalog: template cột đã lưu đang tham chiếu tên cột

## Risks
| Risk | Mitigation |
| --- | --- |
| Đánh nhầm `filterKind` lên cột có dữ liệu ⇒ mất khả năng lọc | T-03-02 kiểm hai chiều: cột có spec **phải** còn ô lọc |

## Definition of done
- [x] AC-08, AC-09, AC-10 pass — ở **mọi** hạt sau khi UOW-05 đóng D5 mà test bất biến
      T-03-02 phát hiện. Bằng chứng ảnh: S5 (ô lọc biến mất), S6 (lọc chạy)
- [x] `pnpm --filter @erp/api test`: 305/306 suite xanh — suite đỏ duy nhất là
      `auth.service.spec.ts`, đã đỏ sẵn trước thay đổi này
- [x] `probe2.py` không còn dòng REJECTED nào (evidence/probe-column-filters-after.txt)
- [x] Demoed và accepted ở G4 — Akenzy, 2026-08-29, trên bằng chứng ảnh của
      `08-evidence.md` (7/7 bước xanh, `evidence_check` PASS)

## D5 — phát hiện trong lúc dựng T-03-02 (đã sửa ở UOW-05)

Test bất biến chạy `buildColumns` rồi đẩy một bộ lọc qua từng cột, cho cả bốn tổ hợp
`viewMode` × `statBy`. Ở hạt mặc định ("Hàng hoá") và chế độ chuỗi: sạch. Ở hai hạt còn lại:

| Báo cáo | Mẫu mã | Nhóm hàng hóa |
| --- | --- | --- |
| `inventory-stock-summary` | 6 cột 400 | 5 |
| `inventory-stock-quantity-detail` | 9 | 9 |
| `inventory-stock-summary-by-store` | 10 | 10 |
| `inventory-stock-by-store-pivot` | 11 | 11 |
| `inventory-transfer-by-store` | 10 | 10 |

Dựng lại trên API thật:

```
GET  /reports/inventory/columns?reportType=inventory-stock-summary&viewMode=single&statBy=parent
  → catalog vẫn có "sku", không đánh filterKind
POST /reports/inventory/search  … "statBy":"parent", columnFilters:[{col:"sku",contains:"A"}]
  → 400 Cột "sku" không hỗ trợ lọc trên báo cáo này
```

Khác D3 ở một điểm quyết định hướng sửa: 9 cột của D3 **luôn null**, còn ở đây `sku`/`name`
tại hạt Mẫu mã **có dữ liệu thật** (SQL gộp đưa mã/tên sản phẩm cha vào đúng hai cột đó). Nên
ADR-05 ("cột luôn rỗng thì ẩn ô lọc") không áp thẳng sang được — đây là quyết định mới, cần
ADR riêng và một UoW riêng.

UOW-05 đã đóng: 91 → 0 tổ hợp. `column-filterability.spec.ts` không còn ngoại lệ nào, và có
thêm chiều kiểm ngược để việc "ẩn hết cho xanh" cũng đỏ.

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
> **Không áp dụng cho feature này** — mục "PR draft copied and contact sheets attached"
> được Akenzy gỡ khỏi định nghĩa hoàn thành ngày 2026-08-29: công việc này không đi qua
> PR, và không commit nào được tạo. Bản nháp PR vẫn nằm sẵn ở cuối `08-evidence.md`, kèm
> `evidence/contact-sheet-local-backoffice.png`, dùng được ngay nếu sau này mở PR.
> Ghi lại thay vì xoá: một yêu cầu bị bỏ nên đọc được, không nên biến mất.
