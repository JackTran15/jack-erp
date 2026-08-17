---
id: UOW-01
slug: delta-engine-receipt-stock
title: Sửa phiếu nhập kho ghi đúng chênh lệch lên sổ kho
demoable: true
duration: 2d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-15]
risk: high
status: todo
rollback: Endpoint PATCH giữ nguyên guard cũ (chỉ cho DRAFT) bằng một dòng điều kiện; engine chênh lệch nằm ở file riêng nên gỡ ra không ảnh hưởng luồng ghi sổ lần đầu
---

# UOW-01 — Sửa phiếu nhập kho ghi đúng chênh lệch lên sổ kho

Lát cắt đặt nền: hàm tính chênh lệch, khả năng ghi giá trị tường minh xuống sổ kho, và
đường sửa phiếu nhập chạy được đầu-cuối ở mức tồn kho. Chưa đụng tới tiền — phần hạch toán
nằm ở UOW-02 (công nợ) và UOW-03 (tiền mặt), nên lát này demo bằng phiếu nhập không có
hình thức thanh toán.

## Demo script
1. Tạo một phiếu nhập kho (mục đích Khác, không chọn hình thức thanh toán): 1 dòng, 10 cái, đơn giá 100.000
2. Ghi lại tồn kho của mặt hàng và số phiếu vừa sinh
3. Gọi `PATCH /goods-receipts/:id` sửa dòng đó thành 7 cái
4. Mở lại phiếu: vẫn đúng số phiếu cũ, dòng hàng hiển thị 7 cái
5. Mở sổ kho của mặt hàng: có thêm đúng một dòng −3 trỏ về phiếu, ba dòng gốc còn nguyên
6. Tồn kho giảm đúng 3
7. Sửa tiếp chỉ đơn giá 100.000 → 120.000: sổ kho có dòng số lượng 0, giá trị +200.000

## In scope
- Hàm thuần `computeVoucherDelta(before, after)` và bộ test của nó
- `RecordMovementParams.lineValue` tường minh trên `StockLedgerService`
- Cột `revision` trên hai bảng phiếu + migration
- `GoodsReceiptService.update()` chạy được trên phiếu `POSTED`, có khoá row

## Not in scope
- Bút toán kế toán và quỹ (UOW-02, UOW-03)
- Phiếu xuất kho (UOW-04)
- Chân phiếu điều chuyển (UOW-05)
- Giao diện (UOW-06) — lát này nghiệm thu bằng API

## Risks
| Risk | Mitigation |
|---|---|
| `lineValue` tường minh chạm service dùng chung cho POS, kiểm kê, điều chuyển | Thay đổi cộng tính: chỉ thêm nhánh khi trường có mặt, giữ nguyên công thức cũ; T-01-02 test cả hai nhánh |
| Khoá row sai chỗ làm nghẽn ghi sổ | Khoá đúng một dòng phiếu, trong transaction, theo đúng mẫu đã có ở `cancel()` hiện tại |

## Definition of done
- [x] AC-01, AC-02, AC-03, AC-04, AC-05, AC-15 pass
- [x] INV-1 và INV-2 đúng sau ba lần sửa liên tiếp trên cùng một phiếu
- [x] Không có `UPDATE` hay `DELETE` nào lên `stock_ledger_entries`
- [x] `pnpm --filter @erp/api test` xanh (2680/2680)
- [ ] Demoed và được chấp nhận ở G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description
