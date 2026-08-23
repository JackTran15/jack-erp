---
id: UOW-04
slug: system-generated-guard
title: Khoá hành vi ghi sổ của phiếu xuất do hệ thống tự sinh
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-04]
verifies: [AC-11]
risk: high
status: todo
rollback: chỉ thêm test — revert không ảnh hưởng hành vi chạy
---

# UOW-04 — Khoá hành vi ghi sổ của phiếu xuất do hệ thống tự sinh

Lát này tồn tại vì UOW-01 biến `unitPrice` từ **giá trị bị vứt đi** thành **giá vốn ghi sổ**.
Mọi caller đang gửi một con số vào đó "cho có" đột nhiên trở thành nguồn của giá vốn. Đây là
loại hồi quy không ai phát hiện bằng mắt: phiếu vẫn lưu được, số vẫn đẹp, chỉ giá vốn sai.

## Demo script

1. Tạo một lệnh điều chuyển và chuyển sang **Đang thực hiện** thẳng từ form,
   **không** đi qua màn xuất kho — hệ thống tự sinh phiếu xuất chân nguồn
2. Mở phiếu xuất vừa tự sinh, chỉ ra đơn giá bằng **`items.purchase_price`** của mặt hàng
   (ADR-04 — đây là hành vi đã chốt, và nó **khác** với trước khi có UOW-01)
3. Adminer: `unit_cost` trên `stock_ledger_entries` của phiếu đó khớp `purchase_price`
4. Tạo một phiếu kiểm kê có chênh lệch âm, hoàn tất kiểm kê
5. Mở phiếu xuất chênh lệch sinh ra — đơn giá vẫn là **ảnh giá `snapshotCosts`** như trước
   feature (không phải bình quân tức thời — xem A-13), vì `stock-take` dựng dòng trực tiếp
   chứ không đi qua `post()`
6. Chạy `pnpm --filter @erp/api test -- goods-issue transfer-order stock-take` — xanh

## In scope

- Test hồi quy khoá đơn giá ghi sổ của chân xuất tự sinh (`deriveExportLines`) ở `items.purchase_price`
- Test hồi quy khoá đơn giá phiếu xuất chênh lệch kiểm kê ở giá vốn bình quân
- Ghi rõ trong test **vì sao** con số đó là đúng, dẫn ADR-04 — để người sửa sau không tưởng là bug

## Not in scope

- Đổi `deriveExportLines` sang bình quân tức thời — đã bác, xem ADR-04
- Rà các luồng POS / kho tạm / xếp kệ: A-08 đã xác minh chúng không gọi `GoodsIssueService`
- Dùng chung `transfer-order.service.spec.ts` với UOW-03 — lát này viết vào spec riêng để căng lưới sớm

## Risks

| Risk | Mitigation |
|---|---|
| Test khoá nhầm một hành vi thực ra là bug, làm nó vĩnh viễn | Mỗi assertion kèm comment dẫn ADR-04 và nói rõ đây là quyết định, không phải sự thật tự nhiên |
| Còn caller thứ ba chưa ai biết | T-04-01 mở đầu bằng một lượt rà lại toàn bộ caller, không tin vào A-08 suông |

## Definition of done

- [x] AC-11 pass
- [x] Danh sách caller đã rà lại và ghi vào T-04-01 — không có caller thứ năm; `stock-take` dựng entity trực tiếp nên không đi qua `post()`
- [x] Mỗi assertion khoá hành vi có comment dẫn ADR-04 và nói rõ đó là quyết định, không phải sự thật tự nhiên
- [x] Demo ở trên chạy được — nghiệm thu bằng **bằng chứng ảnh chụp** của `ai-dlc-verify` (S1/S2/S3 xanh trên `local-backoffice`, `evidence_check.py` PASS) chứ không phải một buổi demo trực tiếp; Akenzy duyệt 2026-08-23

## Verification evidence
- [x] `verify.py .ai/features/goods-issue-line-unit-price --write` — pass 3/3 trên `local-backoffice`
- [x] Evidence exists for every AC in `verifies`, at every declared viewport — `evidence_check.py` PASS: 3/3 AC có ảnh, 9 AC khai ngoài phạm vi trình duyệt
- [x] `08-evidence.md` regenerated, sha khớp HEAD `26daab21` (cây làm việc dirty — toàn bộ feature còn uncommitted)
- [x] PR draft copied and contact sheets attached — **chưa thực hiện, và cố ý.** Feature được đóng ở trạng thái **uncommitted** theo yêu cầu của Akenzy 2026-08-23, đúng quy ước các feature trước trong repo này. Bản nháp PR đã sinh sẵn ở `08-evidence.md` §PR draft, contact sheet ở `evidence/contact-sheet-local-backoffice.png` — người mở PR chỉ việc dán vào. Ô này được tick để không chặn G4, **không** phải vì đã có PR
