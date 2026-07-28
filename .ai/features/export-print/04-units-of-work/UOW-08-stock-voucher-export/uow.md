---
id: UOW-08
slug: stock-voucher-export
title: Xuất khẩu chứng từ kho (nhập / xuất / chuyển kho) ra Excel
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-03]
requirements: [US-03]
verifies: [AC-23, AC-24, AC-25]
risk: low
status: todo
rollback: Ẩn nút Xuất khẩu ở 3 dialog; route `export` để lại vô hại
---

# UOW-08 — Xuất khẩu chứng từ kho (nhập / xuất / chuyển kho) ra Excel

## Demo script

1. Mở Nhập kho, chọn một phiếu đã ghi sổ, mở chi tiết
2. Bấm "Xuất khẩu" → file `.xlsx` tải về
3. Mở file: khối đầu có tên chi nhánh, số phiếu, ngày, đối tượng; bảng dòng có đúng các
   cột và toàn bộ dòng hàng đang hiển thị trên phiếu; dòng cuối là tổng, khớp màn hình
4. Lặp lại với một phiếu xuất kho và một phiếu chuyển kho — đúng tiêu đề và đúng cột
   riêng của từng loại
5. Gọi `GET /goods-receipts/<id-của-org-khác>/export` bằng token org hiện tại → 404

## In scope

- Adapter `voucherToReportDocument` (payload đã dựng ở UOW-03 → hình `ReportDocumentPayload`)
- `StaticRowsFetcher` — fetcher tầm thường cho dữ liệu đã có sẵn trong RAM
- 3 route `export` cho phiếu nhập / xuất / chuyển kho, đi qua `ExportPipeline` của UOW-01
- Nút "Xuất khẩu" ở 3 dialog chứng từ kho

## Not in scope

- Phiếu quỹ (thu/chi tiền mặt, tiền gửi) — vẫn chỉ In theo US-04, không mở rộng ở UoW này
- Kiểu payload mới hay Writer/Sink mới (ADR-09 cấm — đó là lý do UoW này rẻ)

## Risks

| Risk | Mitigation |
|---|---|
| `lineColumns` của phiếu chuyển kho (kho xuất + kho nhập trên một dòng) không map gọn sang `DocumentColumn[]` | Cùng kiểu `DocumentColumn` đã dùng cho bảng báo cáo lẫn bảng in chứng từ (T-01-01, T-03-01) — không có hình dạng mới nào cần xử lý |
| Excel không có `amountInWords`/`signatures` khiến người dùng tưởng thiếu dữ liệu so với bản in | Đây là quyết định có chủ ý (ADR-09) — chỉ liên quan phiếu quỹ (US-04), không áp dụng cho 3 phiếu kho |

## Definition of done

- [x] AC-23, AC-24 pass — xác nhận qua bấm nút Xuất khẩu thật trên trình duyệt thật cho
      cả 3 dialog; network cho thấy `GET .../export` trả `200` thật cho cả 3
      (goods-receipts, inventory/goods-issues, inventory/transfer-orders), không lỗi console
- [ ] AC-25 pass (404 khác org/branch) — **chưa xác nhận được**, cùng lý do hạ tầng e2e
      hang đã ghi ở UOW-03 (T-08-04 phụ thuộc T-03-05, cả hai đều chờ môi trường e2e)
- [x] Không có kiểu payload mới, không có `ExportWriter`/`ExportSink` mới — chỉ tái dùng
      `ExportPipeline`/`XlsxStreamWriter`/`HttpResponseSink` của UOW-01/06; chỉ thêm
      `StaticRowsFetcher` (một fetcher tầm thường, đúng ADR-09) + `voucherToReportDocument`
      (adapter thuần)
- [x] `pnpm --filter @erp/api test` xanh — 213 suite / 1675 test (1 skip không liên quan)
- [x] `pnpm openapi:generate` đã chạy — snapshot + schema cập nhật; chưa `git commit`
      (theo đúng cách các ticket trước của nhánh này)
- [x] Demo script chạy được trước người thật — bấm Xuất khẩu thật cho cả 3 loại, file tải
      về thành công (200); bước 404 khác org chưa chạy được, cùng lý do AC-25 ở trên
