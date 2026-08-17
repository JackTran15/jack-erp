---
id: UOW-02
slug: receipt-credit-ledger
title: Phiếu nhập công nợ — sổ cái và dư nợ NCC khớp sau khi sửa hoặc xoá
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-07, AC-08, AC-10]
risk: high
status: todo
rollback: Nhánh hạch toán CREDIT nằm sau một điều kiện `paymentMethod === CREDIT`; tắt nhánh này thì phiếu công nợ quay lại trạng thái "không sửa được" như trước
---

# UOW-02 — Phiếu nhập công nợ: sổ cái và dư nợ NCC

Lát cắt đưa tiền vào cuộc, phía công nợ trước vì nó không chạm quỹ. Kết thúc lát này, sửa và
xoá một phiếu nhập công nợ cho ra dư nợ NCC và số dư TK 331 đúng bằng giá trị phiếu hiện tại.

## Demo script
1. Tạo phiếu nhập công nợ PNK-C cho một NCC: tổng 10.000.000
2. Mở báo cáo công nợ NCC: dư nợ 10.000.000
3. Sửa phiếu lên 12.000.000 → dư nợ 12.000.000, sổ cái có bút toán chênh lệch 2.000.000 trên 331
4. Ghi nhận một khoản trả NCC 6.000.000
5. Sửa phiếu xuống 4.000.000 → dòng nợ hiện `đã trả 6.000.000 / còn lại −2.000.000`, trạng thái trả thừa
6. Xoá phiếu → tồn kho về như cũ, phát sinh 331 do phiếu này sinh ra bằng 0

## In scope
- Hạch toán chênh lệch DR156/CR331 khi sửa
- Cập nhật `supplier_debts` theo giá trị phiếu, kể cả trường hợp trả thừa
- Giá trị enum `overpaid` + migration
- `cancel()` chạy qua engine chênh lệch cho phiếu công nợ

## Not in scope
- Phiếu nhập tiền mặt và chứng từ quỹ (UOW-03)
- Sinh phiếu thu hoàn tiền cho phần trả thừa — đã chốt là không sinh (A-03)

## Risks
| Risk | Mitigation |
|---|---|
| Quy tắc chặn "nợ đã có thanh toán" bị gỡ, người dùng sửa nhầm phiếu đã trả tiền | Người dùng đã chốt (A-02, A-03); bù lại bằng trạng thái `overpaid` hiển thị rõ trên báo cáo công nợ |
| Thêm giá trị enum rồi dùng ngay trong cùng migration gây lỗi 55P04 | Repo đã đặt `migrationsTransactionMode: 'each'`; vẫn tách thành hai migration nếu chạy còn lỗi |

## Definition of done
- [x] AC-07, AC-08, AC-10 pass
- [x] INV-3 đúng cho phiếu công nợ sau sửa và sau xoá
- [ ] Báo cáo công nợ NCC và số dư TK 331 khớp nhau trên bộ dữ liệu demo — cần click-through
      thật ở G4; script đối soát (T-03-04) kiểm được `supplier_debts.originalAmount` nhưng
      chưa đối chiếu trực tiếp màn hình báo cáo công nợ
- [x] `pnpm --filter @erp/api test` xanh (2680/2680)
- [ ] Demoed và được chấp nhận ở G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description
