---
id: UOW-05
slug: cash-voucher-list-export
title: Xuất danh sách Thu chi tiền mặt ra Excel
demoable: true
duration: 1d
depends_on: []
requirements: [US-05]
verifies: [AC-17, AC-18]
risk: medium
status: todo
rollback: Ẩn nút Xuất khẩu ở `TreasuryCashReceiptsPage`; route `POST /v2/cash-vouchers/export` để lại vô hại
---

# UOW-05 — Xuất danh sách Thu chi tiền mặt ra Excel

Độc lập với UOW-01..04 — không chung file nào, nên chạy song song được ngay từ đầu.

## Demo script

1. Mở Quỹ tiền → Thu chi tiền mặt
2. Đặt một khoảng ngày và chọn một quỹ sao cho kết quả **nhiều hơn một trang**
3. Bấm "Xuất khẩu" → file `.xlsx` tải về
4. Mở file: số dòng bằng tổng số kết quả của bộ lọc, **không** bằng số dòng trang đang xem
5. Đối chiếu vài dòng đầu với lưới trên đủ 7 cột: ngày tạo, số phiếu, loại chứng từ,
   trạng thái, số tiền, đối tượng, lý do
6. Đổi bộ lọc sang một khoảng ngày chắc chắn không có phát sinh, bấm Xuất khẩu → file vẫn
   tải về, chỉ có hàng tiêu đề, không toast lỗi
7. Đặt bộ lọc rộng nhất có thể trên dữ liệu thật để chạm trần dòng → toast báo thu hẹp bộ
   lọc, **không** phải một file hỏng

## In scope

- `POST /v2/cash-vouchers/export` nhận đúng `CashVoucherSearchV2Dto` mà lưới đang gửi
- Fetcher lấy toàn bộ kết quả theo bộ lọc, trần dòng kiểm trước khi mở phản hồi
- Nút "Xuất khẩu" trên `TreasuryCashReceiptsPage`

## Not in scope

- Nút stub ở `LedgerCashPage.tsx:252` (tab *Sổ chi tiết*, không phải *Thu chi*) — vẫn thuộc
  `export-print` UOW-05, không đụng
- Xuất danh sách phiếu tiền gửi
- Refactor `deposit-ledger/export` kiểu buffer cũ

## Risks

| Risk | Mitigation |
|---|---|
| "Xuất ra khác cái đang xem" — lỗi kinh điển của mọi tính năng xuất khẩu | Dùng **cùng** DTO và **cùng** handler CQRS mà lưới dùng; bước 5 của demo script đối chiếu trực tiếp |
| Bộ lọc rộng làm truy vấn `limit` lớn treo tiến trình | Trần dòng kiểm **trước** `run()`, trả 400 khi vượt (ADR-06); demo script có bước 7 để chứng minh |
| `POST` trả 201 thay vì 200 và client coi là lỗi — bẫy đã ghi trong bộ nhớ dự án | `@HttpCode(HttpStatus.OK)` tường minh trên route; T-05-03 khẳng định đúng 200 |
| `SearchCashVouchersV2Query` có `@Max(100)` trên `limit` — gọi thẳng với trần xuất khẩu sẽ bị validate chặn | T-05-01 gọi handler ở tầng trong, không đi qua DTO validation của route search; ghi rõ trong ticket |

## Definition of done

- [ ] Cả AC-17..18 pass
- [x] Dùng `ExportPipeline`, không dựng workbook trong RAM rồi `res.send`
- [x] Xuất và lưới dùng chung một DTO và một handler — không có truy vấn thứ hai
- [x] `pnpm --filter @erp/api test:e2e -- cash-voucher-list-export` xanh
- [x] `pnpm openapi:generate` đã chạy; `POST /v2/cash-vouchers/export` có trong snapshot
- [ ] snapshot **đã commit** — chưa; toàn bộ feature còn uncommitted
- [ ] Demo script chạy được trước người thật ở gate G4
- [ ] Bằng chứng: file `.xlsx` của một bộ lọc nhiều trang, kèm số dòng đối chiếu với `total`
      của lưới (thuộc G4 của UoW, không thuộc done-when của ticket nào)
