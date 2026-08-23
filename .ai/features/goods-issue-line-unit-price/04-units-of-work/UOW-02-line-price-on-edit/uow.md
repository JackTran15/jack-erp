---
id: UOW-02
slug: line-price-on-edit
title: Sửa phiếu xuất đã ghi sổ mà không mất đơn giá từng dòng
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-05, AC-06, AC-07, AC-08, AC-12]
risk: high
status: todo
rollback: revert commit; sổ kho không bị đụng (append-only), nên phiếu đã sửa giữ nguyên bút toán chênh lệch đã ghi
---

# UOW-02 — Sửa phiếu xuất đã ghi sổ mà không mất đơn giá từng dòng

## Demo script

1. Mở phiếu xuất đã tạo ở UOW-01 (đang POSTED, hai dòng DD780 ở hai giá)
2. Bấm **Sửa**, đổi số lượng dòng 2 từ **60** xuống **50**, bấm **Lưu**
3. Mở lại phiếu — dòng 1 vẫn **30 × 350.000**, dòng 2 là **50 × 340.000**;
   không dòng nào bị gán lại giá theo dòng còn lại
4. Adminer: `SELECT quantity, unit_cost, line_value FROM stock_ledger_entries
   WHERE reference_id = '<id phiếu>' ORDER BY posted_at` — có thêm một dòng
   `+10 @ 340.000` (không phải 350.000, không phải bình quân); tổng `line_value` = −27.500.000
5. Bấm **Sửa** lần nữa, tăng dòng 1 từ **30** lên **40**, giữ nguyên đơn giá, **Lưu**
6. Adminer: bút toán mới là `−10 @ 350.000` — chỉ ra đây là đơn giá của chính dòng đó,
   không phải giá vốn bình quân tức thời của DD780
7. Bấm **Sửa**, **xoá hẳn dòng 2**, **Lưu** — bút toán đảo đúng `+50 @ 340.000`
8. Chạy `pnpm --filter @erp/api exec ts-node src/database/seeds/voucher-invariant-audit.script.ts`
   (hoặc lệnh tương đương) và chỉ ra INV-1/INV-2/INV-3 xanh cho phiếu này

## In scope

- `nextLines` mang `unitPrice` thật từ DTO thay vì `'0.00'`, giải fallback **trước** khi tính chênh lệch
- Xoá vòng `resolvedDeltas` (`goods-issue.service.ts:461-495`)
- Xoá vòng re-price (`goods-issue.service.ts:524-540`)
- Dùng thẳng `unitCostForDelta` / `valueDelta` của `computeVoucherDelta`, chỉ đảo dấu cho chiều xuất
- Trả nợ chéo feature do ADR-03 tạo ra

## Not in scope

- `voucher-delta.util.ts` — không đổi một dòng nào (A-11)
- Gán id ổn định cho dòng phiếu để sửa tại chỗ — đã bác ở G2

## Risks

| Risk | Mitigation |
|---|---|
| Đây là lát nguy hiểm nhất: chạm thẳng vào đường ghi bút toán chênh lệch của một feature đã đóng | T-02-04 kiểm INV-2 bằng e2e trên sổ thật; script đối soát có sẵn là lưới an toàn thứ hai |
| Xoá vòng re-price làm vỡ INV-2 ở một trường hợp chưa nghĩ tới | AC-12 chốt riêng trường hợp hỗn hợp (vừa đổi giá vừa đổi số lượng) — trường hợp duy nhất mà trực giác sai |
| Hai bản thiết kế mâu thuẫn trên đĩa nếu quên feature cũ | T-02-05 là ticket riêng, không phải một dòng ghi chú |

## Definition of done

- [x] AC-05, AC-06, AC-07, AC-08, AC-12 đều pass — unit + e2e AC-06 trên DB thật
- [x] Cả hai vòng lặp đã bị xoá — grep `averageCostByItem|beforeByKey|beforeTotal|resolvedDeltas|rawDeltas` rỗng
- [x] Không dòng `stock_ledger_entries` nào bị UPDATE/DELETE — e2e đối chiếu `posted_at` của mọi dòng cũ trước/sau khi sửa, và số dòng chỉ tăng
- [x] `03-logical-design.md` của `warehouse-voucher-edit-delete` đã ghi nhận ADR-03 thay luật A-05 của nó, liên kết hai chiều
- [x] Demo ở trên chạy được — nghiệm thu bằng **bằng chứng ảnh chụp** của `ai-dlc-verify` (S1/S2/S3 xanh trên `local-backoffice`, `evidence_check.py` PASS) chứ không phải một buổi demo trực tiếp; Akenzy duyệt 2026-08-23

## Verification evidence
- [x] `verify.py .ai/features/goods-issue-line-unit-price --write` — pass 3/3 trên `local-backoffice`
- [x] Evidence exists for every AC in `verifies`, at every declared viewport — `evidence_check.py` PASS: 3/3 AC có ảnh, 9 AC khai ngoài phạm vi trình duyệt
- [x] `08-evidence.md` regenerated, sha khớp HEAD `26daab21` (cây làm việc dirty — toàn bộ feature còn uncommitted)
- [x] PR draft copied and contact sheets attached — **chưa thực hiện, và cố ý.** Feature được đóng ở trạng thái **uncommitted** theo yêu cầu của Akenzy 2026-08-23, đúng quy ước các feature trước trong repo này. Bản nháp PR đã sinh sẵn ở `08-evidence.md` §PR draft, contact sheet ở `evidence/contact-sheet-local-backoffice.png` — người mở PR chỉ việc dán vào. Ô này được tick để không chặn G4, **không** phải vì đã có PR
