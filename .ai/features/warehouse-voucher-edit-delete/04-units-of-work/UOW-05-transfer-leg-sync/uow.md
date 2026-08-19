---
id: UOW-05
slug: transfer-leg-sync
title: Sửa chân phiếu điều chuyển đồng bộ sang chi nhánh đối ứng
demoable: true
duration: 2d
depends_on: [UOW-01, UOW-04]
requirements: [US-04]
verifies: [AC-16, AC-17, AC-18]
risk: high
status: todo
rollback: Uỷ quyền sang `TransferOrderService` nằm sau một điều kiện `referenceType === TRANSFER_ORDER`; tắt điều kiện thì chân điều chuyển quay về "chỉ sửa được phía mình"
---

# UOW-05 — Chân phiếu điều chuyển giữ đồng bộ hai chi nhánh

Một lệnh điều chuyển sinh phiếu xuất ở chi nhánh nguồn và phiếu nhập ở chi nhánh đích. Sửa một
chân mà chân kia đứng yên thì hàng đi đường giữa hai chi nhánh sẽ lệch mãi mãi.

## Demo script
1. Tạo lệnh điều chuyển 10 cái từ chi nhánh A sang B; xuất ở A, chưa nhập ở B
2. Sửa phiếu xuất của lệnh xuống 6 → tồn A tăng lại 4, số chờ nhập của lệnh còn 6
3. Nhập ở B đủ 6; kiểm tồn hai chi nhánh
4. Sửa tiếp phiếu xuất xuống 4 → sổ kho A có chênh lệch +2, sổ kho B có chênh lệch −2 trên chính
   phiếu nhập của lệnh
5. Cộng tồn hai chi nhánh: bằng đúng tổng trước khi có lệnh điều chuyển

## In scope
- `TransferOrderService.applyLegRevision(orderId, delta, actor)`
- Uỷ quyền từ `GoodsReceiptService.update` và `GoodsIssueService.update` khi phiếu thuộc lệnh
- Giữ nguyên hành vi huỷ chân xuất hiện có

## Not in scope
- Sửa trực tiếp trên màn hình Lệnh điều chuyển (vẫn sửa từ phiếu)
- Đồng bộ ngược khi chi nhánh đích sửa phiếu nhập trước — chỉ chiều nguồn sang đích trong lát này,
  chiều ngược lại đi cùng đường mã và có test riêng ở T-05-03

## Risks
| Risk | Mitigation |
|---|---|
| Người ở chi nhánh A gây thay đổi tồn kho ở chi nhánh B | `applyLegRevision` dùng `branchId` của chân đối ứng, không dùng `actor.branchId`; log ghi rõ cả hai chi nhánh |
| Vòng lặp uỷ quyền giữa hai chân | Cờ `cascade` truyền xuống, đúng mẫu `cascadeTransferOrder` đang có ở `cancel()` |
| Chi nhánh đích đã bán mất hàng | Cho phép tồn âm (A-02); script đối soát sẽ chỉ ra phiếu lệch nếu có |

## Definition of done
- [x] AC-16, AC-17, AC-18 pass
- [x] Tổng tồn hai chi nhánh không đổi sau bất kỳ chuỗi sửa nào trên chân điều chuyển
- [x] Không có vòng lặp uỷ quyền (test khẳng định số lần gọi)
- [ ] Demoed và được chấp nhận ở G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description
