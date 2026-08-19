---
id: UOW-03
slug: receipt-cash-fund
title: Phiếu nhập tiền mặt — quỹ và chứng từ điều chỉnh khớp sau khi sửa hoặc xoá
demoable: true
duration: 2d
depends_on: [UOW-02]
requirements: [US-02]
verifies: [AC-06, AC-09, AC-11]
risk: high
status: todo
rollback: Nhánh hạch toán CASH nằm sau điều kiện `paymentMethod === CASH`; tắt nhánh thì phiếu tiền mặt quay về trạng thái không sửa được, phiếu công nợ của UOW-02 không ảnh hưởng
---

# UOW-03 — Phiếu nhập tiền mặt: quỹ và chứng từ điều chỉnh

Lát cắt đóng lỗi nặng nhất trong bản audit: xoá phiếu nhập tiền mặt hiện để quỹ hụt tiền vĩnh
viễn. Kết thúc lát này, mọi biến động tiền do sửa hoặc xoá phiếu đều có chứng từ quỹ đi kèm.

## Demo script
1. Tạo phiếu nhập tiền mặt PNK-B 10.000.000, xem sổ quỹ: có phiếu chi 10.000.000
2. Sửa phiếu xuống 7.000.000 → quỹ tăng lại 3.000.000, sổ quỹ có thêm phiếu thu hoàn 3.000.000
3. Sửa lên 9.000.000 → quỹ giảm 2.000.000, sổ quỹ có thêm phiếu chi bổ sung 2.000.000
4. Xoá phiếu → quỹ nhận lại đủ 9.000.000, phát sinh TK 156 do phiếu này sinh ra bằng 0
5. Bấm Xoá hai lần liên tiếp thật nhanh: chỉ một lần có tác dụng, lần sau báo lỗi rõ ràng

## In scope
- Hạch toán chênh lệch tiền qua `CashPaymentsService` / `CashReceiptsService.createAndPostInternal`
- `sourceReference = <documentNumber>#rev<n>` để chống trùng không nuốt mất lần sửa sau
- Khoá chống xoá trùng cho phiếu nhập
- Script đối soát INV-1/INV-2/INV-3 chạy được trên dữ liệu thật

## Not in scope
- Sửa hay huỷ phiếu chi gốc — chứng từ điều chỉnh là chứng từ mới (ADR-05)
- Màn hình phiếu thu/phiếu chi (không đổi)

## Risks
| Risk | Mitigation |
|---|---|
| Ghi đúp bút toán tiền vì vừa `recordMovement` vừa gọi dịch vụ chứng từ | ADR-05: chỉ đi qua `createAndPostInternal`, dịch vụ đó sở hữu cả movement lẫn bút toán |
| Chống trùng theo `sourceReference` nuốt mất chứng từ của lần sửa thứ hai | `revision` nằm trong khoá (ADR-06); T-03-01 có test sửa hai lần liên tiếp |
| Quỹ không đủ tiền khi sửa tăng | Lỗi 400 từ `CashService` làm rollback cả transaction; phiếu giữ nguyên |

## Definition of done
- [x] AC-06, AC-09, AC-11 pass
- [x] INV-3 đúng cho phiếu tiền mặt sau sửa và sau xoá
- [x] Mỗi biến động quỹ do feature này sinh ra đều có đúng một chứng từ quỹ
- [x] Script đối soát chạy trên dữ liệu dev không báo phiếu nào vi phạm — chạy thật trên
      `erp_dev` (2 org), "No invariant violations found"; dựng tay một phiếu lệch thì script
      phát hiện đúng phiếu đó
- [ ] Demoed và được chấp nhận ở G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description
