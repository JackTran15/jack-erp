---
id: UOW-02
slug: luat-thanh-toan
title: Panel thanh toán khớp luật đổi trả nhanh (ép thu đủ, không cấn nợ)
demoable: true
duration: 0.5d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-10, AC-11]
risk: low
status: todo
rollback: Revert hai commit FE; hành vi quay về "hiện checkbox nhưng BE tự hạ cấp OFFSET→CASH"
---

# UOW-02 — Panel thanh toán khớp luật đổi trả nhanh

Sau UOW-01, panel thanh toán hoạt động đúng theo dấu của net mà không cần sửa gì (A-06).
Còn lại đúng một chỗ lệch: hai checkbox công nợ vẫn hiện ở luồng không có hoá đơn gốc,
nơi chúng vô nghĩa — "Tính vào công nợ" chiều hoàn thì không có công nợ gốc nào để cấn,
còn chiều thu thì Akenzy đã chốt là phải thu đủ (ADR-03).

## Demo script

1. POS → "Đổi trả nhanh". Tab "Trả hàng" thêm món A 300.000₫, tab "Mua thêm" thêm món B 500.000₫.
2. Panel bên phải: thấy "Còn phải thu 200.000₫". **Không** thấy checkbox "Tính vào công nợ".
3. Nhập 100.000₫ → nút Thanh toán **khoá**. Nhập đủ 200.000₫ → nút mở.
4. Đổi giỏ thành trả 500.000₫ / mua 300.000₫: panel chuyển sang "Hình thức đổi trả".
   **Không** thấy checkbox "Tính vào công nợ".
5. Chọn một tài khoản ngân hàng ở picker → chốt → tiền về đúng quỹ tiền gửi đó
   (Backoffice → Sổ chi tiết tiền gửi).
6. **Không hồi quy:** mở tab "Đổi trả theo hoá đơn" từ một hoá đơn còn công nợ →
   hai checkbox đó **vẫn hiện** và vẫn chạy như cũ.
7. Với một tab đổi trả nhanh đã lỡ bật cờ `debt` từ trước (mô phỏng: sửa localStorage
   `debt: true` rồi reload) → request gửi lên vẫn không kèm `dueDate`/`creditDays`.

## In scope

- Ẩn `DebtCheckRow` và `RefundToDebtRow` khi luồng đổi trả không có `originalInvoiceId`
- Ép `putOnDebt`/`offsetToDebt`/`dueDate`/`creditDays` về false/undefined ở tầng dựng request

## Not in scope

- Mở công nợ cho đổi trả nhanh (đã chốt là không)
- Bất kỳ thay đổi nào ở `CheckoutReturnService` — fallback OFFSET→CASH giữ nguyên làm lưới an toàn

## Risks

| Risk | Mitigation |
|---|---|
| Ẩn nhầm ở luồng đổi trả theo hoá đơn ⇒ mất tính năng cấn nợ đang dùng thật | Điều kiện ẩn dựa trên `originalInvoiceId` chứ không dựa trên variant; bước 6 của demo script kiểm trực tiếp |
| Chỉ ẩn UI mà state cũ trong localStorage vẫn lọt cờ `debt` | T-02-02 chặn ở tầng request, bước 7 của demo script kiểm |

## Definition of done

- [ ] AC-10, AC-11 pass
- [ ] Demo script chạy hết 7 bước
- [ ] Luồng đổi trả theo hoá đơn giữ nguyên cả hai checkbox
- [ ] `pnpm --filter @erp/pos-web build` xanh
- [ ] Demoed và accepted ở gate G4
