---
id: UOW-01
slug: transfer-figures-correct
title: Số liệu điều chuyển đúng — mã cửa hàng và chênh lệch theo cặp chứng từ
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03]
risk: high
status: todo
rollback: revert 2 commit của UoW (service + migration). Migration chỉ thêm index nên `migration:revert` an toàn, không mất dữ liệu.
---

# UOW-01 — Số liệu điều chuyển đúng

Rủi ro `high` vì đây là UoW duy nhất **đổi con số người dùng đang nhìn**. Ba UoW sau chỉ thêm màn
hình.

## Demo script

Chạy trên **dữ liệu vận hành thật** đã có sẵn trong `erp_dev` (org MT) — không seed gì cả.

1. `pnpm migration:run`
2. Mở `/reports/inventory#transfer_in_out_summary`, đặt kỳ **09/07/2026 – 30/08/2026**, bấm
   "Lấy dữ liệu"
3. Cột "Mã cửa hàng" hiện SG / DN / JO / CT / VL / KH… — trước đó rỗng toàn bộ
4. Rà cả 15 dòng: không dòng nào có "Chênh lệch thực nhận" dương
5. Dòng "Chi Nhánh cũ không dùng" đọc 22 / 22 / **0** — trước khi sửa nó là 22 / 31 / **+9**,
   đúng ca khách báo
6. Dòng KHO SG: chênh lệch thực nhận −533 còn chênh lệch nhập xuất là số khác, nên hai dải
   phân biệt được

## In scope

- `PAIRED_RECEIPT_EXISTS` — vị ngữ ghép chứng từ, export để 3 UoW sau dùng lại
- `summarize()`: `b.code`, xoá nhánh UNION 6, dời `received` sang chân xuất
- Hai partial index trên `reference_id`
- Cập nhật spec sẵn có; thêm test bất biến `diff ≤ 0`

## Not in scope

- Mọi dialog drill-down (UOW-02..04)
- `_branchId` trên dòng báo cáo — thuộc T-02-03, vì nó cần hằng số do T-02-01 khai
- Chặn post phiếu nhập vượt số xuất (xem 00-intent "Out of scope")
- **Seed dữ liệu.** Đã cân nhắc và bỏ: đo trên `erp_dev` cho thấy dữ liệu thật có 300 cặp phiếu
  đã ghép và 27 phiếu đang vận chuyển, thừa sức chứng minh AC-01/02/03 ở quy mô 15 chi nhánh với
  chứng từ thật của khách. AC-04 và AC-05 thì dữ liệu thật có **0** trường hợp — xem `07-verification.md`
  mục "Not verified here".

## Risks

| Risk | Mitigation |
|---|---|
| Số của mọi kỳ lịch sử đổi (ADR-01) | Ghi vào release note; T-01-04 đã đo và ghi con số trước/sau trên dữ liệu thật |
| Phiếu lập tay quá nhiều ⇒ cột chênh lệch thành nhiễu (A-02) | Đã đo: **0/337** trên `erp_dev`. Rủi ro rỗng ở đây; vẫn phải đo lại trên DB khách |
| Sai cast `varchar` ↔ `uuid` là lỗi lúc chạy (00-intent Constraints) | Chép nguyên mẫu cast ở `transfer-report.service.ts:294, 311`. Spec hiện **mock DataSource** nên không bắt được — chạy SQL thật trên `erp_dev` là cửa duy nhất, T-01-04 làm việc đó |
| `EXISTS` chạy seq scan (A-13) | T-01-01 thêm index và ghi `EXPLAIN ANALYZE` trước/sau vào ticket |

## Definition of done

- [x] AC-01, AC-02, AC-03 pass — bằng chứng S1/S2/S3 trên dữ liệu thật
- [x] `transfer-report.service.spec.ts` 27/27 xanh
- [x] `document-detail.service.spec.ts` xanh **không sửa một dòng kỳ vọng nào** (AC-15)
- [x] `@erp/api build` và `@erp/backoffice-web build` đều OK
- [x] Số phiếu `purpose='TRANSFER_OUT' AND reference_id IS NULL` đã đếm (0/337) và ghi vào T-01-04
- [x] Demo script chạy được đầu-cuối trên dữ liệu thật; bằng chứng ảnh ở `evidence/local-backoffice/desktop/`

## Verification evidence

- [x] `verify.py … --write` **12/12 xanh** trên `local-backoffice` (môi trường `required` duy nhất khai trong 07-verification.md)
- [x] `evidence_check.py` PASS: 12/12 AC có bằng chứng, 3 AC khai ngoài phạm vi ảnh chụp
- [x] `08-evidence.md` sinh lại, sha `bd91b0c6` khớp HEAD
