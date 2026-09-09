---
id: UOW-03
slug: treasury-voucher-print
title: In phiếu thu chi tiền mặt và tiền gửi (A5)
demoable: true
duration: 1.5d
depends_on: [UOW-01, UOW-02]
requirements: [US-03]
verifies: [AC-10, AC-11, AC-12, AC-13]
risk: low
status: todo
rollback: Ẩn nút In ở 4 dialog; 4 route `print-payload` để lại vô hại
---

# UOW-03 — In phiếu thu chi tiền mặt và tiền gửi (A5)

Thay thế `.ai/features/export-print/` UOW-04 (ADR-07). Demo script dưới đây kế thừa của
UoW đó, có bổ sung bước 6 cho đối tượng tự nhập — thứ UOW-04 cũ chưa thể có vì khi nó được
viết thì đối tượng tự nhập chưa tồn tại.

## Demo script

1. Mở Quỹ tiền → Thu chi tiền mặt, chọn một phiếu thu đã ghi sổ, mở chi tiết
2. Bấm "In" → hộp thoại in mở ra với bản xem trước khổ A5
3. Kiểm khối đầu: tiêu đề "PHIẾU THU", số phiếu, ngày dạng dài, đối tượng, địa chỉ, lý do
4. Kiểm bảng Diễn giải / Mục thu / Số tiền và dòng tổng
5. Kiểm dòng "Số tiền bằng chữ" — thử một số lẻ hàng nghìn (1.234.567) và một số có phần
   trăm/chục rỗng (1.000.005 → "Một triệu không trăm lẻ năm đồng chẵn"). Lưu ý: util đọc
   **"lẻ"**, không phải "linh"; bản đầu của demo script này viết nhầm là "linh".
6. Mở một phiếu chi có **đối tượng tự nhập và địa chỉ gõ tay** (tạo ở UOW-01/02) → bản in
   hiện đúng tên và địa chỉ đã gõ, không để trống
7. Lặp với phiếu chi tiền mặt, phiếu thu tiền gửi, phiếu chi tiền gửi — đúng tiêu đề và
   đúng nhãn "Người nộp tiền" / "Người nhận tiền"
8. Mở dialog **tạo mới** → nút In không hiện

## In scope

- 4 mapper `VoucherPrintPayload` + bảng nhãn dùng chung
- 4 route `GET :id/print-payload`
- Nút "In" ở 4 dialog, nối qua `fetchVoucherPrintPayload` → `renderVoucherHtml` →
  `printHtmlDocument`

## Not in scope

- Mẫu khổ 80mm cho máy in nhiệt (A-04 chốt là chưa cần)
- Phiếu kiểm kê quỹ, phiếu chuyển quỹ, phiếu chuyển chi nhánh
- Xuất .xlsx (UOW-04) — cùng payload nhưng khác đường ra

## Risks

| Risk | Mitigation |
|---|---|
| Bốn mapper là bốn chỗ có thể lệch nhãn nhau | T-03-01 dựng **một** bảng nhãn dùng chung; T-03-05 test cả 4 loại trong một bảng ca |
| Đọc số thành chữ tiếng Việt nhiều ca biên | **Rủi ro này đã tắt**: `amount-in-words.util.ts` đã tồn tại và đã có spec (A-R3). Mapper chỉ gọi, không viết lại |
| Bốn mapper mỗi cái tự khai một `infoRow()` riêng, giống nhau từng byte (phát hiện ở T-03-05) — sửa một bản mà quên ba bản kia thì chỉ bảng test bắt được, kiểu hệ thống không bắt | Chấp nhận trong feature này: bảng test T-03-05 **là** cái chặn. Nếu muốn gỡ trùng lặp thật thì mở ticket riêng, đừng nhét vào đây |
| `VoucherKind` treasury đã khai nhưng chưa ai dùng — có thể lệch với thứ FE mong đợi | T-03-04 nối qua `PRINT_PAYLOAD_PATH` sẵn có; nếu thiếu key thì hàm ném lỗi rõ ràng ("Chứng từ chưa hỗ trợ in"), không im lặng |

## Nợ đã biết, cố ý không trả trong UoW này

`cash-vouchers.adapters.ts` có hàm thứ ba, `cashLedgerRowToUiRow`, dựng một object hình
`LedgerCashVoucherDetail` cho luồng sổ hỗn hợp của `LedgerCashPage` (số dư đầu kỳ + hoá đơn
+ phiếu, khoá theo `movementId` tổng hợp, và có sẵn trường riêng `apiVoucherId` đúng cho
mục đích này). Nó **không** đặt `id`, nên nếu `LedgerCashPage` có ngày nào mở
`ReceiptVoucherDialog`/`PaymentVoucherDialog` từ một dòng sổ thì nút In sẽ ẩn ở đó.

Không nằm trong demo script của UoW này (demo mở phiếu từ tab *Thu chi*, tức
`TreasuryCashReceiptsPage`) và không nằm trong `touches:` của T-03-04. Ghi lại để lần sau
ai gặp "nút In không hiện ở màn Sổ chi tiết" thì biết ngay chỗ nhìn, thay vì đi tìm lại.

## Definition of done

- [ ] Cả AC-10..13 pass
- [x] Dùng lại `renderVoucherHtml` và `amount-in-words.util`, không thêm khuôn in thứ hai
- [x] `pnpm --filter @erp/api test -- --testPathPattern "print.mapper"` xanh
- [x] `pnpm openapi:generate` đã chạy; 4 route `print-payload` có trong snapshot
- [ ] snapshot **đã commit** — chưa; toàn bộ feature còn uncommitted
- [ ] Demo script chạy được trước người thật ở gate G4
- [ ] Bằng chứng trình duyệt: ảnh chụp bản xem trước A5 của cả 4 loại phiếu, trong đó có
      một phiếu đối tượng tự nhập (thuộc G4 của UoW, không thuộc done-when của ticket nào)
- [ ] `export-print` T-04-01..03 được đóng bằng `aidlc done --no-review` với lý do trỏ về
      slug `2026090804-treasury-voucher-party-address-print-export` (ADR-07)
