---
id: UOW-01
slug: revision-reaches-the-grid
title: Sửa phiếu lần thứ hai không còn 409
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-01, US-02, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06]
risk: low
status: todo
rollback: revert 2 ticket; không migration, không đổi hợp đồng, không dữ liệu nào bị chạm
---

# UOW-01 — Sửa phiếu lần thứ hai không còn 409

## Demo script

1. Mở **Quỹ tiền > Thu chi tiền mặt**, chọn **PT004767** (phiếu đã sửa một lần, `revision = 1`).
2. Sửa một trường bất kỳ, bấm Lưu → **200**, lưới nạp lại. Trước khi vá, đúng thao tác này
   trả 409 *"bản 1, bạn đang giữ bản 0"*.
3. Lưu **lần nữa** ngay lập tức → vẫn 200. Đây mới là phép thử thật: một lần thành công cũng
   có thể do phiếu tình cờ đang ở revision 0.
4. Lặp lại bước 2–3 trên một phiếu **chi** tiền mặt và một phiếu tiền gửi — bốn nhánh
   `UNION ALL` phải cùng hành xử.
5. Đối chứng âm: `SELECT revision FROM cash_receipts WHERE document_number = 'PT004767'` phải
   tăng đúng 1 sau mỗi lần lưu.

## In scope

- `revision` xuất hiện trong câu `SELECT` ngoài cùng của `dataSql` ở cả hai handler search v2.
- Spec đối chiếu **toàn bộ** danh sách cột chiếu ra với các trường của row DTO (ADR-01).
- Một e2e chứng minh sửa hai lần liên tiếp đều 200.

## Not in scope

- `totalsSql` (chỉ COUNT/SUM — thêm cột vào đó là một lỗi riêng).
- Hai adapter FE và toán tử `?? 0` của chúng (ADR-02).
- Hai sổ quỹ: không có đường sửa phiếu, không mang `revision` (A-03).

## Risks

| Risk | Mitigation |
|---|---|
| Vá tiền mặt, quên tiền gửi | Một ticket ôm cả hai (ADR-03); AC-04 kiểm phía tiền gửi |
| Sửa xong vẫn 409 vì nguyên nhân khác | A-01 đã loại trừ bằng log và bằng cặp PC000044 / PT004767; nếu vẫn 409 thì dừng và đọc lại, đừng vá tiếp |

## Definition of done

- [x] AC-02, AC-03, AC-04, AC-06 xanh ở mức spec
- [x] AC-01, AC-05 xanh ở mức e2e (sửa hai lần liên tiếp, cả bốn loại phiếu)
- [x] `pnpm --filter @erp/api test -- --testPathPattern "search-cash-vouchers-v2|search-deposit-vouchers-v2"` xanh
- [x] Demo trên trình duyệt: PT004767 sửa được hai lần liên tiếp
- [x] Demoed và được chấp nhận ở G4

Đã chạy (2026-09-09): 40/40 spec đơn vị trên hai handler; e2e 4/4 xanh (suite cũng xanh, không
dính đua outbox); toàn bộ unit 4220 xanh — 2 đỏ ở `auth.service.spec.ts` (switchBranch) là
**đỏ sẵn**. Kiểm đột biến hai tầng: gỡ `revision` khỏi handler tiền mặt ⇒ 1 spec đơn vị đỏ và
đúng 2 case e2e tiền mặt đỏ, tiền gửi vẫn xanh.

Hai ô demo trên trình duyệt do **Akenzy tự tick** lúc 11:25 ngày 2026-09-09 rồi ra lệnh
`pass G4` — agent không quan sát chúng. Phần bằng chứng tự động ở trên là thứ agent kiểm được.
