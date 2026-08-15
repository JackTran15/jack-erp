---
id: UOW-02
slug: nguon-ban-showroom
title: Nguồn bán showroom — đã cài, chạy đúng, rồi gỡ
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: []
verifies: []
risk: medium
status: todo
rollback: đã thực hiện — T-02-03 gỡ toàn bộ nguồn này
---

# UOW-02 — Nguồn bán showroom: đã cài, chạy đúng, rồi gỡ

Lát cắt này mang nghiệp vụ "hàng trưng showroom bán ra" vào báo cáo, bằng nguồn thứ hai lấy từ
`invoice_items` trừ đi phần kho tạm đã nhận. Nó **chạy đúng** — invariant tổng SL bán khớp hóa đơn
trên 18/18 hóa đơn, 12 test e2e trên SQL thật, ba đột biến đều bị bắt.

Rồi bị **gỡ** ngày 2026-08-15 theo quyết định của chủ sở hữu: trên dữ liệu thật nó chiếm **64/71
dòng**, tức 90% nội dung của một báo cáo tên "Hàng hóa xuất kho tạm" lại là hàng không xuất kho tạm.
Lý do đầy đủ ở **ADR-05**.

Giữ lát cắt này trong hồ sơ thay vì xóa, vì hai lẽ: git history có một vòng cài-rồi-gỡ cần giải
thích, và **ba defect nó phát hiện ra vẫn còn giá trị**.

## Demo script

Demo của lát cắt này giờ là **chứng minh nó đã biến mất sạch**, không để lại vết:

1. Backoffice → Báo cáo → Hàng hóa xuất kho tạm, chi nhánh Buôn Ma Thuật, kỳ "Tháng này"
2. Mọi dòng đều có SL xuất ≥ 1 — không dòng nào có `SL xuất = 0`, dấu hiệu của nguồn showroom cũ
3. Không dòng nào mang trạng thái "Bán hàng trưng bày"; mở bộ lọc Trạng thái, giá trị đó cũng
   không còn trong danh sách
4. Số dòng bằng đúng số dòng của báo cáo trước toàn bộ tính năng (trên `erp_dev` kỳ 08/2026: 7)
5. POS: bán một mặt hàng **không** stage kho tạm → về báo cáo, hóa đơn đó **không** xuất hiện.
   Đây là hành vi mong muốn sau ADR-05, không phải thiếu sót

## Kết cục của từng ticket

| Ticket | Trạng thái | Còn lại gì sau khi gỡ |
| --- | --- | --- |
| T-02-01 — CTE `tw_claimed` + `showroom` + `movements` | done → **đã gỡ** bởi T-02-03 | Không còn dòng code nào. Bài học về lệch múi giờ khi UNION hai kiểu timestamp và về trừ nhiều lần khi hóa đơn tách dòng đã vào ADR-05 |
| T-02-02 — E2E chạy SQL thật | done → **rút gọn** bởi T-02-03 | File e2e **được giữ**: báo cáo này trước đó không có e2e nào. Còn 4 test cho phần kho tạm, trong đó test múi giờ là hồi quy trực tiếp cho defect T-02-01 gây ra |
| T-02-03 — Gỡ nguồn showroom | mới | Đưa báo cáo về đúng phạm vi kho tạm |

## Ba defect phát hiện được, vẫn còn giá trị

1. **Lệch múi giờ khi UNION hai kiểu timestamp** — `timestamp` naive-UTC hợp với `timestamptz` thì
   Postgres nâng cả hai lên `timestamptz`, và biểu thức `AT TIME ZONE 'UTC' AT TIME ZONE '...'` đổi
   overload: trừ 7h thay vì cộng, sai cả ngày. Không còn áp dụng (đã hết union), nhưng có một test
   e2e khoá lại cách render, nên nếu sau này lại union nguồn khác thì nó sẽ đỏ.
2. **Trừ nhiều lần khi hóa đơn tách dòng** — `LEFT JOIN` một bảng đã gộp vào bảng chưa gộp thì trừ
   một lần cho mỗi dòng. Nút "Tách dòng" ở POS tạo ra đúng cảnh này.
3. **Hóa đơn hủy vẫn tính là đã bán** — `cancel-invoice.service.ts` không đụng `temp_warehouse_lines`,
   nên dòng kho tạm giữ nguyên `invoice_id` và báo cáo vẫn đọc `Bán hàng kho tạm`. **Defect này còn
   nguyên** sau khi gỡ, vì nó nằm ở nhánh kho tạm. Có test e2e khẳng định hành vi hiện tại; sửa là
   việc riêng.

Ngoài ra, một phát hiện độc lập đã mở task riêng: vị từ kỳ của nhánh kho tạm so cột naive-UTC với
tham số `Date`, nên biên kỳ lệch đúng bằng offset múi giờ của tiến trình API.

## Definition of done
- [x] Nguồn showroom đã gỡ khỏi `temp-warehouse-report.service.ts` (T-02-03)
- [x] `pnpm --filter @erp/api test` xanh — 217 suite / 1991 test
- [x] E2E còn 4 test, tất cả xanh
- [x] Ba defect ghi vào ADR-05; defect còn hiệu lực (số 3) có test khẳng định hành vi
