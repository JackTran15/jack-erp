---
id: UOW-03
slug: pos-invoice-list
title: POS Danh sách hóa đơn — footer tổng toàn tập
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-05, AC-06, AC-07, AC-08]
risk: medium
status: todo
rollback: revert; FE cũ bỏ qua field lạ nên không vỡ
---

# UOW-03 — POS Danh sách hóa đơn

Bảng POS duy nhất **đã** phân trang server thật, nên footer đổi ngay trước mắt người dùng khi lật
trang — lộ rõ nhất, và là chỗ chốt pattern cho hai lát POS sau.

## Demo script
1. POS (:3001), chi nhánh HCM → Danh sách hóa đơn
2. Footer "Tổng tiền" = **26.337.000** (tổng có dấu; `SUM(amount_due)` ngây thơ sẽ ra 28.927.000)
3. Đặt 20 dòng/trang → footer không đổi; sang trang 2 → không đổi
4. Lọc cột tiền → lưới và footer cùng đổi
5. `pnpm --filter @erp/api test -- search-invoices-v2`

## In scope
- `invoiceSignedTotalSql(alias)` trong `modules/pos/services/invoice-amount.util.ts`
- `search-invoices-v2.handler.ts`: tách `buildQuery`, thêm nhánh totals
- FE: `use-invoice-list.ts` bỏ `reduce`, đọc `totals`
- Spec đầu tiên của `modules/pos/queries/`

## Not in scope
- Ô lọc `inv.amountDue` đang khác đại lượng với cột (ghi việc riêng, xem 00-intent)

## Risks
| Risk | Mitigation |
| --- | --- |
| Filter tham chiếu alias `customer.*` ⇒ totals qb thiếu join sẽ không compile | Join nằm trong `buildQuery`; đây đúng bẫy `targetBranch` của đợt 1 |
| Sai dấu đơn trả | Assert 26.337.000, khác hẳn 28.927.000 của bản ngây thơ |

## Definition of done
- [x] AC-05, AC-06 có ảnh: `footer-grand-totals-pos/evidence/local-pos/desktop/S1.png` — footer
      **−215.000** trên bộ lọc mặc định "Hôm nay" (3 phiếu đổi). Số **âm** chính là bằng chứng biểu
      thức có dấu đang chạy: `SUM(amount_due)` ngây thơ sẽ ra 0 cho đúng tập này
- [x] AC-07 đối chiếu API: `limit` 1 / 5 / 100 đều trả cùng `totals` (26.277.000 tại thời điểm đo,
      khớp SQL; bản ngây thơ ra 28.927.000)
- [x] AC-08 khoá bằng spec "applies the same filters to the totals query as to the rows query"
- [x] Spec có test bất biến `limit` và test chống hồi quy `SUM(amount_due)`

## Ghi chú

Bằng chứng POS nằm ở feature riêng `footer-grand-totals-pos` vì `verify.py` nhân chéo mọi bước với
mọi environment — không khai được environment theo từng bước.
