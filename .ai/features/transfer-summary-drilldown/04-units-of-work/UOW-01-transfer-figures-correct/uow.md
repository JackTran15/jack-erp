---
id: UOW-01
slug: transfer-figures-correct
title: Số liệu điều chuyển đúng — mã cửa hàng và chênh lệch theo cặp chứng từ
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05]
risk: high
status: todo
rollback: revert 3 commit của UoW (service + seed + migration). Migration chỉ thêm index nên `migration:revert` an toàn, không mất dữ liệu.
---

# UOW-01 — Số liệu điều chuyển đúng

Rủi ro `high` vì đây là UoW duy nhất **đổi con số người dùng đang nhìn**. Ba UoW sau chỉ thêm màn
hình.

## Demo script

1. `pnpm migration:run && pnpm seed:transfer-demo`
2. Mở `/reports/inventory#transfer_in_out_summary`, đặt kỳ **01/09/2026 – 02/09/2026**, bấm
   "Lấy dữ liệu"
3. Cột "Mã cửa hàng" hiện `CH-HCM` / `CH-HN` / `CH-DN` — trước đó rỗng
4. Dòng HCM: "Chênh lệch thực nhận" âm, và bằng đúng tổng của một phiếu đang vận chuyển (TO-3)
   cộng một phiếu lập tay (GI-tay); "Chênh lệch nhập xuất" là một số khác
5. Rà cả lưới: không dòng nào có "Chênh lệch thực nhận" dương
6. Điều chuyển legacy ST-1 đóng góp 0 vào chênh lệch — chứng minh bằng cách so dòng HCM với và
   không có ST-1 trong seed

## In scope

- `PAIRED_RECEIPT_EXISTS` — vị ngữ ghép chứng từ, export để 3 UoW sau dùng lại
- `summarize()`: `b.code`, xoá nhánh UNION 6, dời `received` sang chân xuất
- Hai partial index trên `reference_id`
- Seed điều chuyển tất định + backfill `branches.code`
- Cập nhật spec sẵn có; thêm test bất biến `diff ≤ 0`

## Not in scope

- Mọi dialog drill-down (UOW-02..04)
- `_branchId` trên dòng báo cáo — thuộc T-02-03, vì nó cần hằng số do T-02-01 khai
- Chặn post phiếu nhập vượt số xuất (xem 00-intent "Out of scope")

## Risks

| Risk | Mitigation |
|---|---|
| Số của mọi kỳ lịch sử đổi (ADR-01) | Ghi vào release note; T-01-04 đo và ghi lại con số trước/sau trên seed |
| Phiếu lập tay quá nhiều ⇒ cột chênh lệch thành nhiễu (A-02) | T-01-04 đếm bằng SQL và **báo lại trước khi merge**; nếu tỷ lệ cao thì `aidlc reopen G2` để mở lại ADR-02 |
| Sai cast `varchar` ↔ `uuid` là lỗi lúc chạy (00-intent Constraints) | Chép nguyên mẫu cast ở `transfer-report.service.ts:294, 311`; T-01-04 chạy spec chạm DB thật |
| `EXISTS` chạy seq scan (A-13) | T-01-01 thêm index và ghi `EXPLAIN ANALYZE` trước/sau vào ticket |

## Definition of done

- [ ] AC-01..AC-05 pass
- [ ] `pnpm --filter @erp/api test -- transfer-report.service.spec.ts` xanh
- [ ] `pnpm --filter @erp/api test -- document-detail.service.spec.ts` xanh **không sửa kỳ vọng** (AC-15)
- [ ] `pnpm --filter @erp/api build` và `pnpm --filter @erp/backoffice-web build` xanh
- [ ] Số phiếu `purpose='TRANSFER_OUT' AND reference_id IS NULL` đã đếm và ghi vào T-01-04
- [ ] Demoed và accepted ở gate G4

## Verification evidence

- [ ] `verify.py .ai/features/transfer-summary-drilldown --write` xanh trên mọi môi trường `required`
- [ ] Có bằng chứng cho mọi AC trong `verifies`, ở mọi viewport đã khai
- [ ] `08-evidence.md` đã sinh lại và commit sha khớp HEAD
