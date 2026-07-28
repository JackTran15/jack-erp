---
id: UOW-03
slug: stock-voucher-print
title: In chứng từ kho (nhập / xuất / chuyển kho)
demoable: true
duration: 1.5d
depends_on: [UOW-02]
requirements: [US-03]
verifies: [AC-11, AC-12, AC-13]
risk: medium
status: todo
rollback: Ẩn nút In ở 3 dialog; route `print-payload` để lại vô hại
---

# UOW-03 — In chứng từ kho (nhập / xuất / chuyển kho)

## Demo script

1. Mở Nhập kho, chọn một phiếu đã ghi sổ, mở chi tiết
2. Bấm "In" → hộp thoại in mở ra với mẫu A4
3. Kiểm tra: số phiếu, ngày, đối tượng, diễn giải ở khối đầu; bảng dòng hàng có SKU/tên/kho/ĐVT/SL/đơn giá/thành tiền
4. Kiểm tra dòng tổng cộng và hai chỗ ký người giao / người nhận
5. Lặp lại với một phiếu xuất kho và một phiếu chuyển kho — đúng tiêu đề và đúng cột riêng của từng loại
6. Gọi `GET /goods-receipts/<id-của-org-khác>/print-payload` bằng token org hiện tại → nhận 404

## In scope

- Kiểu `VoucherPrintPayload` dùng chung cho cả 7 loại phiếu
- 3 route print-payload + mapper
- Khuôn HTML chứng từ lái bằng dữ liệu (A4 + A5)

## Not in scope

- Phiếu quỹ (UOW-04)
- Mẫu có mã vạch
- Mẫu khổ 80mm

## Risks

| Risk | Mitigation |
|---|---|
| Khuôn dùng chung có thể không vừa cả 3 loại | Bộ xương giống nhau đã kiểm qua khảo sát MISA §2–4; khác biệt nằm ở nhãn + tập cột, đều nằm trong payload (ADR-05) |
| Phiếu chuyển kho có cả kho xuất lẫn kho nhập trên mỗi dòng | `lineColumns` do backend quyết định nên khuôn không cần biết |

## Definition of done

- [x] AC-11, AC-12 pass — xác nhận qua bấm nút In thật trên trình duyệt thật cho cả 3
      dialog (IMP000001, XK000002, LDC000001), stub `contentWindow.print` để chặn dialog
      OS mà không chặn luồng code (title/body render đúng, iframe tự dọn)
- [ ] AC-13 pass — **chưa xác nhận được**: e2e `voucher-print-payload.e2e-spec.ts` viết
      xong (T-03-05) nhưng hạ tầng e2e của nhánh này hang ở `beforeAll` quá 30s, tái hiện
      giống hệt trên một file e2e cũ không đụng tới (`report-export.e2e-spec.ts`) — xác
      nhận đây là vấn đề môi trường có sẵn, không phải do UOW này. 404 vẫn đúng **theo
      cấu trúc** (đọc trực tiếp `findOrFail`/`assertParticipantBranch`), chỉ chưa chạy
      được bằng test thật
- [x] Chỉ có một `renderVoucherHtml`, không phải 3 bản — dùng chung cho GOODS_RECEIPT/
      GOODS_ISSUE/TRANSFER_ORDER, không có nhánh theo `VoucherKind` (unit test khẳng định)
- [x] `pnpm --filter @erp/api test` xanh — 213 suite / 1675 test (1 skip không liên quan)
- [x] `pnpm openapi:generate` đã chạy — snapshot + schema cập nhật; chưa `git commit`
      (theo đúng cách các ticket trước của nhánh này)
- [x] Demo script chạy được trước người thật — bước 1–5 (mở phiếu, bấm In, xem đúng số
      phiếu/ngày/đối tượng/bảng dòng/tổng/chỗ ký cho cả 3 loại) đã xác nhận thật trên
      trình duyệt; bước 6 (404 khác org) chưa chạy được, cùng lý do AC-13 ở trên
