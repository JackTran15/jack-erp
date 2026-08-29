---
id: UOW-01
slug: parent-category-filter
title: Lọc nhóm hàng cha trả về hàng của mọi nhóm con
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04]
risk: medium
status: todo
rollback: revert 2 commit; ngữ nghĩa cũ (khớp đúng một nhóm) trở lại, không có migration
---

# UOW-01 — Lọc nhóm hàng cha trả về hàng của mọi nhóm con

## Demo script
1. Đăng nhập backoffice, chi nhánh "Hồ Chí Minh", vào Báo cáo > Kho
2. Chọn "Tổng hợp nhập xuất tồn kho", kỳ "Tháng này", bấm Đồng ý → chân trang 56 dòng
3. Mở bộ lọc, "Nhóm hàng hóa" chọn nhóm **cha** "GIÀY DÉP", bấm Đồng ý
4. Lưới hiện **53 dòng** (trước khi sửa: 0) — đúng tổng của ba nhóm lá có dữ liệu
5. Đổi sang nhóm lá "Giày nam" → 49 dòng, y như trước khi sửa
6. Đổi báo cáo sang "Chi tiết số lượng nhập xuất tồn kho", vẫn nhóm "GIÀY DÉP" → có dòng

## In scope
- Resolver hậu duệ dùng chung trong `report-scope.util.ts`
- Nối vào cả 7 báo cáo kho có lọc nhóm, nên xuất khẩu và in cũng đúng theo

## Not in scope
- Trang legacy `/reports/storage/*` — vẫn dùng recursive CTE riêng (ADR-02)
- Lọc nhiều nhóm cùng lúc; ô lọc vẫn là single-select

## Risks
| Risk | Mitigation |
| --- | --- |
| Cây nhóm có chu trình làm vòng duyệt treo | Duyệt bằng `visited` set, giống `pos-catalog-product.service.ts`; test có ca chu trình |
| Danh sách id dài làm chậm `= ANY($n)` | Cây thật sâu 2 cấp, rộng nhất 19 nhóm con; T-01-03 đo lại thời gian phản hồi trước/sau |

## Definition of done
- [x] AC-01, AC-02, AC-03, AC-04 pass
- [x] `pnpm --filter @erp/api test`: 305/306 suite xanh — suite đỏ duy nhất là
      `auth.service.spec.ts` (2 test TTL), đã đỏ sẵn trước thay đổi này
- [x] Không thêm bản mở rộng cây thứ ba (ADR-02)
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
