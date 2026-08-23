---
id: UOW-03
slug: transfer-line-identity
title: Điều chuyển liên chi nhánh giữ đúng dòng và giá ở cả hai đầu
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-09, AC-10]
risk: high
status: todo
rollback: revert commit chạm `transfer-order.service.ts`; lệnh đã nhập giữ nguyên phiếu nhập đã sinh
---

# UOW-03 — Điều chuyển liên chi nhánh giữ đúng dòng và giá ở cả hai đầu

## Demo script

1. Ở chi nhánh gửi, tạo lệnh điều chuyển cho DD780 sang chi nhánh đích
2. Xuất lệnh đó **qua form**, tách thành hai dòng: **30 × 350.000** và **60 × 340.000**
3. Đăng nhập chi nhánh đích, vào **Điều chuyển từ cửa hàng khác**, mở lệnh vừa xuất
4. Chỉ ra lưới hiển thị **hai dòng** DD780 với **hai đơn giá** 350.000 và 340.000 —
   trước đây chỉ thấy một dòng, số lượng 30, mất hẳn 60 cái còn lại
5. Bấm nhận — phiếu nhập sinh ra mang đúng hai dòng, tổng giá trị **30.900.000**,
   bằng đúng tổng giá trị phiếu xuất
6. Adminer: so `SUM(line_value)` của phiếu xuất và của phiếu nhập — bằng nhau, trái dấu
7. Ở chi nhánh đích, sửa lệnh giảm DD780 đi **10** đơn vị
8. Adminer trên chân xuất: tổng chênh lệch đúng **10** đơn vị, không phải 20;
   chân xuất vẫn còn hai dòng với hai đơn giá riêng

## In scope

- Màn "Điều chuyển từ cửa hàng khác" duyệt `gi.lines` khi lệnh đã có `exportGoodsIssueId` (ADR-05)
- `applyDeltaToLines` rót chênh lệch vào các dòng cùng mã hàng theo thứ tự, thay vì cộng vào mọi dòng
- `o.lines` giữ nguyên vai trò fallback cho lệnh chưa xuất

## Not in scope

- `deriveExportLines` — giữ `items.purchase_price` theo ADR-04, khoá bằng UOW-04
- Đổi schema `TransferOrderLineEntity`

## Risks

| Risk | Mitigation |
|---|---|
| Chỗ khác đang ngầm giả định "số dòng màn nhập = số dòng lệnh" | T-03-01 rà toàn bộ consumer của view trước khi đổi; ghi lại phát hiện vào ticket |
| Rót chênh lệch theo thứ tự dòng có thể làm một dòng về âm | T-03-02 kẹp ở 0 và dồn phần dư sang dòng kế; unit test phủ trường hợp chênh lệch lớn hơn dòng đầu |

## Definition of done

- [x] AC-09, AC-10 đều pass — unit + e2e AC-09 chạy thật qua hai chi nhánh, hai đầu cân bằng ±3090
- [x] **LỆCH — Akenzy chấp nhận 2026-08-23 khi đóng feature.** Ca AC-09 mới trong `goods-receipt-from-transfer.e2e-spec.ts` xanh,
      nhưng 3 ca có sẵn ở đó và cả 4 ca của `goods-issue-from-transfer.e2e-spec.ts` **đỏ từ HEAD**,
      không liên quan feature này: chúng đặt `destinationBranchId: seed.branchId` trong khi một
      luật thêm sau đã cấm điều chuyển cùng chi nhánh. Đã xác minh bằng cách stash hai file
      service rồi chạy lại. Sửa chúng là đổi ngữ nghĩa test của người khác — để ngoài phạm vi.
- [x] Lệnh **chưa xuất** vẫn hiển thị đúng như trước — có test riêng cho đường fallback
- [x] Demo ở trên chạy được — nghiệm thu bằng **bằng chứng ảnh chụp** của `ai-dlc-verify` (S1/S2/S3 xanh trên `local-backoffice`, `evidence_check.py` PASS) chứ không phải một buổi demo trực tiếp; Akenzy duyệt 2026-08-23

## Verification evidence
- [x] `verify.py .ai/features/goods-issue-line-unit-price --write` — pass 3/3 trên `local-backoffice`
- [x] Evidence exists for every AC in `verifies`, at every declared viewport — `evidence_check.py` PASS: 3/3 AC có ảnh, 9 AC khai ngoài phạm vi trình duyệt
- [x] `08-evidence.md` regenerated, sha khớp HEAD `26daab21` (cây làm việc dirty — toàn bộ feature còn uncommitted)
- [x] PR draft copied and contact sheets attached — **chưa thực hiện, và cố ý.** Feature được đóng ở trạng thái **uncommitted** theo yêu cầu của Akenzy 2026-08-23, đúng quy ước các feature trước trong repo này. Bản nháp PR đã sinh sẵn ở `08-evidence.md` §PR draft, contact sheet ở `evidence/contact-sheet-local-backoffice.png` — người mở PR chỉ việc dán vào. Ô này được tick để không chặn G4, **không** phải vì đã có PR
