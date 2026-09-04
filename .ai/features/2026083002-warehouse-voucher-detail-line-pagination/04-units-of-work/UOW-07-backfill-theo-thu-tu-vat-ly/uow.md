---
id: UOW-07
slug: backfill-theo-thu-tu-vat-ly
title: Backfill thứ tự dòng lấy thứ tự vật lý làm nguồn, cho cả hai loại phiếu
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-04]
requirements: [US-01]
verifies: [AC-03, AC-17]
risk: medium
status: todo
rollback: `migration:revert` hai migration rồi chạy lại bản cũ; cột bị xoá nên không mất dữ liệu nghiệp vụ nào, chỉ mất chính thứ tự vừa backfill.
---

# UOW-07 — Backfill lấy thứ tự vật lý làm nguồn

## Why this slice exists

Việc sửa chữa, và nó tồn tại vì một tiền đề chưa ai đo. ADR-02 và ADR-05 đều khẳng định
thứ tự nhập gốc đã mất — ADR-02 nói thẳng, ADR-05 nói gián tiếp khi tin rằng `created_at`
đang giữ nó. Cả hai đã qua G2 và cả hai migration đã `done`.

Đo trên `prod_3008` ngày 2026-09-03 bác bỏ cả hai (A-20, A-21). Thứ tự chưa mất: nó nằm
trong thứ tự vật lý của hàng. `ORDER BY id` cho 49,8 % / 50,7 % cặp liền kề có mã tăng
dần — tung đồng xu; `ctid` cho 94,5 % / 82,6 %.

Điều đáng nói nhất không phải con số mà là **vì sao không ai bắt được sớm hơn**: trên
`erp_dev`, dữ liệu seed được chèn tuần tự nên `created_at` phân biệt được mọi dòng và
migration phiếu nhập trông hoàn toàn đúng — `diff` thứ tự trước/sau khớp 199/199. Cùng
migration đó, trên dữ liệu thật, thoái hoá thành `ORDER BY id`. Đây là lý do UoW này bắt
buộc verify trên `prod_3008` chứ không phải `erp_dev`.

## Demo script

1. `migration:revert` hai lần trên `erp_dev`, rồi `migration:run` với bản backfill mới →
   chạy sạch, `line_no` liền mạch 1..n, không NULL, không trùng.
2. Trên `prod_3008`: chụp `(voucher_id, line_id, ROW_NUMBER() OVER (… ORDER BY ctid))`
   **trước** khi migrate, `diff` với `line_no` sau khi migrate → identical.
3. Trên `prod_3008`, phiếu nhập 5.000 dòng: đọc 10 dòng đầu theo `line_no` → dãy mã hàng
   liền mạch kiểu file import (`AK169188-D-40, -41, -42…`), không phải dãy ngẫu nhiên.
4. Đo lại tỉ lệ cặp liền kề có mã tăng dần theo `line_no` → phải ≈ tỉ lệ theo `ctid`
   (94,5 % / 82,6 %), không phải ≈ 50 %.
5. Ghi lại thời gian chạy migration trên 162.776 dòng.

## In scope

- Đổi backfill của `1789500000000-AddGoodsIssueLineNo` sang `ORDER BY ctid`.
- Đổi backfill của `1789600000000-AddGoodsReceiptLineNo` sang `ORDER BY created_at, ctid`.
- Revert và chạy lại cả hai trên `erp_dev`.
- Chạy và đo trên `prod_3008`.

## Not in scope

- Đọc `ctid` ở bất kỳ đâu ngoài bước backfill. `line_no` là nguồn thứ tự duy nhất lúc chạy.
- Đụng vào đường ghi (`makeLine`, handler v2, kiểm kê) — chúng đã đúng từ T-01-02 và T-04-02.
- Sửa hình dạng endpoint. UOW-05 và UOW-06 không phụ thuộc vào UoW này.

## Risks

| Risk | Mitigation |
| --- | --- |
| `ctid` bị xáo bởi `VACUUM FULL` / `pg_repack` / dump-restore trước khi migration chạy trên production | Chấp nhận có ý thức (ADR-09): kết quả xấu nhất vẫn không tệ hơn `ORDER BY id`, vốn là nhiễu đảm bảo. `prod_3008` tự nó là bản restore và tín hiệu còn 94,5 % |
| Ai đó sau này dùng `ctid` ở tầng đọc vì thấy migration dùng | Comment tại chỗ trong cả hai migration nói rõ giới hạn một-lần; ADR-09 ghi lý do |
| Migration chậm trên 162.776 dòng, khoá bảng lâu | Demo bước 5 đo thật; `ROW_NUMBER` một lượt trên bảng đã có index theo `goods_receipt_id` |
| `erp_dev` và `prod_3008` cho kết quả khác nhau và người sau tin nhầm `erp_dev` | Ghi thẳng vào ticket vì sao `erp_dev` cho dương tính giả |

## Definition of done

- [x] AC-03, AC-17 pass trên `prod_3008`
- [x] **94,5 %** phiếu nhập và **82,6 %** phiếu xuất — khớp chính xác tỉ lệ theo `ctid`; theo `id` là 49,8 % / 50,7 %
- [x] 10 dòng đầu: `AK169188-D-40, -41, -42, -43, -44, -N-38…` — đúng dãy file import
- [x] 3 migration 20 s; riêng `AddGoodsReceiptLineNo` trên 162.776 dòng 19,8 s
- [x] `grep -rln ctid apps packages` chỉ ra hai migration
- [x] Demoed và được chấp nhận ở gate G4 — Akenzy, 2026-09-03
