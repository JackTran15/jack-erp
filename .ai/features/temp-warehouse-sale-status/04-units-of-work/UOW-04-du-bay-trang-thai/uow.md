---
id: UOW-04
slug: du-bay-trang-thai
title: Đủ bảy trạng thái có test và có bằng chứng, và SL tồn thôi đếm hàng đã chuyển kho
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-02]
requirements: [US-04]
verifies: [AC-09, AC-10]   # AC có ẢNH CHỤP; AC-11/AC-12 xem 07-verification.md mục "Not verified here"
risk: low
status: todo
rollback: revert commit; phần sửa SL tồn là một vế trừ trong `paired`, gỡ ra là về hành vi cũ
---

# UOW-04 — Đủ bảy trạng thái có test và có bằng chứng

Báo cáo phát ra 7 trạng thái nhưng test và bằng chứng chỉ chạm tới 3. Bốn cái còn lại
(`Chuyển kho xuất đi`, `Chuyển kho trả lại`, `Trả hàng trưng bày`, cặp cân bằng ra chuỗi rỗng)
chưa từng được sinh ra trên dữ liệu nào — `erp_dev` có 0 dòng `showroom_to_warehouse` và 0 dòng
chuyển kho thủ công.

Việc dựng đủ chúng làm lộ một defect: **SL tồn không trừ phần đã chuyển kho** (ADR-07).

## Demo script
1. Backoffice → Báo cáo → Hàng hóa xuất kho tạm, chi nhánh HCM, kỳ "Tháng này"
2. Trang 1 hiện đủ **cả bảy** trạng thái
3. Lọc cột Mã SKU = `VERIFY-TW-` → đúng 4 dòng, mỗi dòng một trạng thái kho tạm khác nhau
4. Dòng `VERIFY-TW-B` (đã "Xử lý chuyển kho") có **SL tồn = 0** — trước khi sửa nó báo 1
5. Dòng `VERIFY-TW-A` (xuất rồi trả cùng người vận chuyển) là **một** dòng, Trạng thái để rỗng

## In scope
- Vế trừ `transfer_id IS NOT NULL AND invoice_id IS NULL` trong `paired` (ADR-07)
- Bảy kịch bản e2e mới chạy SQL thật, phủ nốt lưới trạng thái
- Bốn bước verify trình duyệt lọc theo SKU seed nên số liệu không trôi

## Not in scope
- Sửa "Đóng kho tạm" để nó đóng dấu `transfer_id` lên dòng (AC-11 chỉ **khẳng định** hành vi
  hiện tại: đóng kho tạm không đổi báo cáo ở cả ba chế độ)
- Sửa đường chuyển kho đang lỗi trên `erp_dev` — đã mở task riêng, xem ghi chú ở T-04-02

## Risks
| Risk | Mitigation |
| --- | --- |
| Vế trừ mới làm dòng đã bán bị trừ hai lần (SL tồn ra −1) | `AND invoice_id IS NULL` chặn; có e2e riêng dựng dòng mang cả hai cột |
| Bước verify trôi số khi `erp_dev` có thêm dữ liệu | S5–S8 lọc theo tiền tố SKU nên chỉ thấy dữ liệu seed của mình; S1/S2 vẫn gắn dataset, đã ghi rõ trong Notes |

## Definition of done
- [x] AC-09, AC-10 pass — có ảnh chụp
- [x] AC-11, AC-12 khoá ở tầng dữ liệu bằng e2e (không có bề mặt chụp, xem 07-verification.md)
- [x] `pnpm --filter @erp/api test` xanh — 270 suite / 2622 test
- [x] E2E xanh — 18/18, chạy SQL thật trên `erp_test`
- [x] Kiểm chứng test thật sự khoá: 4 đột biến, mỗi cái bắt đúng test (bảng ở T-04-02)

## Verification evidence
- [x] `verify.py --write` xanh trên `local-backoffice` — 8/8 bước
- [x] Có bằng chứng cho mọi AC trong `verifies`, ở viewport desktop
- [x] `08-evidence.md` sinh lại; `evidence_check.py` xác nhận sha khớp HEAD
- [ ] Bản nháp PR đã chép và contact sheet đã đính vào mô tả PR
