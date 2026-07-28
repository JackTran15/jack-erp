---
id: UOW-07
slug: report-keyset-fetch
title: Keyset + phân mảnh thời gian cho báo cáo kiểu liệt kê
demoable: true
duration: 2d
depends_on: [UOW-06]
requirements: [US-06]
verifies: [AC-18, AC-20, AC-22, AC-02]
risk: medium
status: todo
rollback: Gỡ `exportSource` khỏi hai report — `ReportExportService` tự rơi về `SingleShotFetcher`, trở lại đúng hành vi UOW-06. Không có state nào để hoàn tác
---

# UOW-07 — Keyset + phân mảnh thời gian cho báo cáo kiểu liệt kê

## Demo script

1. Mở Báo cáo → Bán hàng → Danh sách hoá đơn, đặt kỳ cả năm trên org có > 50.000 hoá đơn
2. Bấm "Xuất khẩu" → file .xlsx tải về đầy đủ, **không** còn lỗi vượt trần dòng
3. Mở file: đối chiếu dòng tổng cộng với `POST search` cùng bộ lọc — khớp trên toàn kỳ
4. Xem log API: `path=keyset`, kèm một dòng mỗi partition với số trang / số dòng / mili-giây
5. Trong lúc export đang chạy, tạo một hoá đơn mới trong kỳ đang xuất → file kết quả không
   có mã chứng từ lặp và không sót mã nào tồn tại lúc bắt đầu
6. Làm lại bước 2 trên báo cáo Chi tiết chứng từ (kho) → cùng đường xử lý
7. Đặt `EXPORT_PARTITION_PARALLEL=1`, chạy lại bước 2 → file giống hệt, log cho thấy các
   partition chạy tuần tự thay vì chồng nhau

## In scope

- `splitIntoWindows` + `TimePartitionKeysetFetcher` (flush theo thứ tự partition, backpressure)
- Capability tuỳ chọn `exportSource` trên `ReportDefinition` + chỗ chọn fetcher
- Cài `exportSource` cho `invoice-order-listing` và `document-detail`
- E2E đối chiếu hai đường fetch

## Not in scope

- 15 report tổng hợp còn lại — chúng không có `(at, id)` để làm con trỏ (ADR-07). Log số
  dòng theo `reportType` là danh sách chờ, không phải phỏng đoán
- Đổi `buildData` — màn hình vẫn dùng nguyên đường cũ
- Bỏ trần dòng ở đường single-shot — trần đó vẫn cần cho report tổng hợp

## Risks

| Risk | Mitigation |
|---|---|
| Con trỏ mất độ chính xác micro giây ⇒ nhảy hoặc lặp dòng | `at` lấy bằng `::text`, không qua `Date` của JS; T-07-01 và T-07-03 đều có test cho ca nhiều dòng trùng dấu thời gian |
| Drain song song giữ gần hết dữ liệu trong RAM ⇒ mất đúng mục tiêu của UoW | `EXPORT_BUFFER_HIGH_WATER` chặn dòng chờ flush; T-07-01 test bằng fetcher giả với trần nhỏ |
| Totals đường keyset lệch đường single-shot | T-07-05 đối chiếu trực tiếp hai đường trên cùng bộ lọc, không chỉ so với `POST search` |
| `exportSource` chép lại điều kiện lọc của `buildData` rồi lệch dần | T-07-03/04 bắt buộc dùng lại đúng khối dựng query sẵn có, chỉ thêm mệnh đề partition + cursor |
| Thứ tự dòng trong file đổi (hoà theo `id` thay vì `code`) | Đã ghi vào ADR-07 là hệ quả chấp nhận; T-07-05 so tập dòng, không so thứ tự tuyệt đối ở nhóm trùng dấu thời gian |

## Definition of done

- [ ] AC-18, AC-20, AC-22, AC-02 pass
- [ ] `pnpm --filter @erp/api test` xanh
- [ ] Xuất được một kỳ > 50.000 dòng thật, không phải mock
- [ ] Report không có `exportSource` không đổi hành vi một chút nào
- [ ] Demo script chạy trước người thật ở gate G4
