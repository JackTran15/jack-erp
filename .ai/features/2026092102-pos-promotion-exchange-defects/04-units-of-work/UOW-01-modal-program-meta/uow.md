---
id: UOW-01
slug: modal-program-meta
title: Modal Chương trình khuyến mãi in Hình thức và Mô tả cho mọi dòng
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04]
risk: low
status: todo
rollback: revert 2 commit (domain+shared, POS mapper); response chỉ thêm field nên client cũ không đọc cũng không hỏng
---

# UOW-01 — Modal in Hình thức và Mô tả

## Demo script
1. Backoffice: mở CTKM *Giảm giá hàng hoá ABA2777 15%*, điền *Mô tả* = "Áp cho giày ABA2777", lưu.
2. POS (`localhost:3001`), tab bán: quét `ABA2777-N-42`, mở modal (icon quà) → dòng *Đã áp dụng* có *Hình thức* = "Giảm giá mặt hàng", *Mô tả* = "Áp cho giày ABA2777".
3. Bấm bỏ áp dụng → dòng chuyển *Đã bỏ áp dụng* và **vẫn** in "Giảm giá mặt hàng" + mô tả (ảnh 1 hôm nay in "—").
4. CTKM *KM 30%* (hóa đơn, không mô tả) cùng danh sách: *Hình thức* = "Giảm giá hoá đơn", *Mô tả* = "—".
5. `curl POST /v2/promotions/evaluate` với `excludedProgramIds: [id]` → `skippedPrograms[0].type = "ITEM_DISCOUNT"`, `.description` có mặt.

## In scope
- `SkippedProgram.type`, `description?` trên cả ba nhóm — domain model, resolver, `@erp/shared-interfaces`.
- POS mapper dùng `PROGRAM_TYPE_LABELS[type]` cho nhóm skipped và chép `description`.

## Not in scope
- Cột *Trạng thái*, checkbox, hành vi tick/bỏ tick (UOW-04/09 của `pos-promotion-apply`).
- Backoffice list/form CTKM.

## Risks
| Risk | Mitigation |
| --- | --- |
| `SkippedProgram` được dựng ở 7 chỗ trong resolver — sót một chỗ thì một reason mất `type` | Helper `skip(program, reason, takenBy?)` dùng cho cả 7 chỗ; e2e AC-01 phủ EXCLUDED_BY_CASHIER, NOT_SELECTED và CONDITION_NOT_MET |
| Field bắt buộc `type` trên shared làm `modules/mobile` (nếu dựng `SkippedProgram` tay) đỏ tsc | `grep -rn "SkippedProgram" apps/api/src/modules/mobile` trước khi làm; A-11 của 2026091804 đã ghi mobile chỉ đọc |

## Definition of done
- [ ] AC-01 có e2e xanh; AC-02/03/04 có ảnh headless + assert DOM trong `evidence/`
- [ ] `pnpm --filter @erp/api test -- promotion` và `test:e2e -- promotion-evaluate` không đỏ thêm case nào
- [ ] `tsc --noEmit` api, pos-web, shared-interfaces xanh
- [ ] Không file nào ngoài `touches:` của T-01-01/T-01-02 bị đụng
- [ ] Demo script chạy trước Akenzy
