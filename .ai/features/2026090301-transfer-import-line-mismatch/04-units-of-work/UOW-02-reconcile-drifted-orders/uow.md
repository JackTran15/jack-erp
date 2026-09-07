---
id: UOW-02
slug: reconcile-drifted-orders
title: Đối soát và bù các lệnh điều chuyển đang lệch dòng
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-07, AC-08, AC-09]
risk: medium
status: todo
rollback: script hai chế độ; chế độ ghi chỉ chèn dòng transfer_order_lines, xoá lại được bằng id đã in ra
---

# UOW-02 — Đối soát và bù lệnh điều chuyển lệch dòng

## Demo script

1. Chạy script không cờ (dry run) trên bản sao prod. Nó in ra bảng: số hiệu
   lệnh, số hiệu phiếu xuất, trạng thái, các mặt hàng thiếu và số lượng sẽ bù.
2. Chỉ ra trong bảng đó: các lệnh `CANCELLED` và các lệnh đã có phiếu nhập được đánh dấu
   **bỏ qua**, kèm lý do — chỉ lệnh chưa nhập và chưa huỷ mới nằm trong kế hoạch bù.
3. Kiểm chứng script không ghi gì: đếm `transfer_order_lines` trước và sau, bằng nhau.
4. Chạy lại với `--apply`. Script bù đúng những dòng đã in ở bước 1.
5. Chạy dry run lần nữa: kế hoạch rỗng — không còn lệch.
6. Chạy `--apply` lần nữa: không chèn thêm dòng nào (idempotent).
7. Đối chiếu `stock_ledger_entries` và `stock_balances` trước/sau: không đổi một dòng nào.
8. Mở màn Nhập kho ở chi nhánh nhận của một lệnh vừa được bù, lưu phiếu nhập → thành công.

## In scope

- Truy vấn đối soát dùng được lâu dài (`goods_issue_lines EXCEPT transfer_order_lines`).
- Script hai chế độ, idempotent, in kế hoạch trước khi ghi.
- Khẳng định bù không đụng sổ kho, sổ kế toán.

## Not in scope

- Dọn các lệnh đã `CANCELLED` — chúng đã chết, người dùng đã làm phiếu khác thay thế.
- Xoá dòng `requested_qty = 0` còn sót — vô hại, và xoá thì mất dấu vết lịch sử.
- Tự động chạy theo lịch: đây là việc một lần sau khi UOW-01 lên, cộng một công cụ để
  kiểm tra định kỳ bằng tay.

## Risks

| Risk | Mitigation |
| --- | --- |
| Bù nhầm lệnh đã đóng sổ ở chi nhánh nhận | Phạm vi lọc cứng `import_goods_receipt_id IS NULL AND status <> 'CANCELLED'`; demo bước 2 chứng minh |
| Chạy hai lần sinh dòng trùng | Bước 6 của demo là điều kiện đậu, không phải lời hứa |
| Bù xong lại lệch tiếp | UOW-01 phải lên trước — đó là lý do `depends_on: [UOW-01]` |

## Definition of done

- [x] AC-07, AC-08, AC-09 đậu
- [ ] Chạy dry run trên bản sao prod, kế hoạch được người duyệt trước khi ghi
- [x] Script chạy lại được, không sinh dòng trùng
- [ ] Demoed và được chấp nhận ở G4

## Verification (2026-09-04)

- AC-07: dry run against `prod_3008` (read-only, T-02-01) found 233 drifted rows,
  exactly 1 in scope (`LDC000173` / `XK000241`) — matches A-07's prediction.
- AC-08/AC-09: `--apply` verified against synthetic fixtures on `erp_dev`
  (T-02-02) — correct scope (CANCELLED/imported orders skipped), a second
  `--apply` run inserted nothing, and `stock_ledger_entries`/`stock_balances`
  counts were unchanged before/after. Fixtures cleaned up afterward.
- **Still open, genuinely blocking:** the dry-run-then-approve-then-apply
  sequence has only run against `erp_dev` fixtures, never against `prod_3008`
  or a copy of it — this sandbox refuses script writes to any DB named `prod`.
  The one real drifted order (`LDC000173`) is still unrepaired. Someone with
  write access needs to run the three commands in T-02-02's "Còn treo" section
  and get the resulting plan approved before `--apply`.
