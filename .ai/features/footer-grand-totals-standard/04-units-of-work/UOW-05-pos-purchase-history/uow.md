---
id: UOW-05
slug: pos-purchase-history
title: POS Lịch sử mua hàng — footer, phân trang, và hai bất nhất
demoable: true
duration: 1d
depends_on: [UOW-03]
requirements: [US-03, US-04, US-05, US-06]
verifies: [AC-07, AC-10, AC-11, AC-13, AC-14, AC-15, AC-16]
risk: high
status: todo
rollback: revert; nhưng lưu ý ô lọc quay lại lọc theo `total_paid`
---

# UOW-05 — POS Lịch sử mua hàng

Để cuối vì đây là lát **duy nhất đổi hành vi người dùng thấy được**: ô lọc "Tổng thanh toán" chuyển
sang lọc đúng con số đang hiển thị.

## Demo script
1. POS → Bán hàng → mở dialog khách hàng → tab Lịch sử mua hàng
2. "Tổng hóa đơn: N" và tiền ở footer cùng mô tả một tập
3. Lật trang → xem được dòng tiếp, footer không đổi
4. Lọc "Tổng thanh toán ≤ X" → ẩn đúng những dòng có **giá trị hiển thị** không thoả
5. `pnpm --filter @erp/api test -- search-purchase-history-v2`

## In scope
- Handler: `buildQuery` + whitelist trạng thái server-side + `applyCompare` dùng factory chung
- DTO `totalPaid` → `totalAmount` (BE + FE body)
- FE: mapper thôi loại dòng; `status` nullable, render `—`; state trang trong component; nối pager
- Release note cho thay đổi hành vi ô lọc

## Not in scope
- Tuỳ chọn "Ghi nợ" chỉ gửi `status: 'debt'` trong khi nhãn gộp cả `partial_debt` — defect có sẵn,
  ghi việc riêng

## Risks
| Risk | Mitigation |
| --- | --- |
| Đổi hành vi lọc mà không ai biết | Ghi release note; demo script bước 4 kiểm đúng hành vi mới |
| Dòng trạng thái lạ biến mất như cũ | AC-15: render `—` thay vì bỏ dòng |

## Definition of done
- [x] AC-07, AC-10, AC-11, AC-12, AC-13, AC-14, AC-16 pass — verify S5–S7 (màn hình),
      `pos-pagesize1` S5–S7 (lật trang + về trang 1), `09-api-probe.md`, spec bất biến `limit`
- [x] Release note nêu rõ ô lọc đổi đại lượng — `09-release-note.md`
- [x] `pnpm build` sạch; api-client sinh lại đã kiểm diff

**AC-15** (dòng trạng thái lạ vẫn hiện) là thứ duy nhất còn chưa có bằng chứng chạy được: whitelist
trạng thái ở server đúng bằng 4 trạng thái có nhãn UI nên nhánh `status = null` không dựng được bằng
dữ liệu thật. Code có nhánh render `—`; lý do ghi ở `footer-grand-totals-pos/07-verification.md`.
