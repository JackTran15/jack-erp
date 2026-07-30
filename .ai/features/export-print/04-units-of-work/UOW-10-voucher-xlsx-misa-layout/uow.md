---
id: UOW-10
slug: voucher-xlsx-misa-layout
title: File Excel chứng từ kho theo đúng mẫu MISA (có tiền-bằng-chữ và ô ký)
demoable: true
duration: 2d
depends_on: [UOW-08, UOW-09]
requirements: [US-07]
verifies: [AC-27, AC-28, AC-29, AC-31, AC-32]
status: todo
risk: medium
rollback: Ba controller quay lại `new XlsxStreamWriter(payload.docNo)`; `VoucherXlsxWriter` và `amount-in-words.util.ts` để lại vô hại
---

# UOW-10 — File Excel chứng từ kho theo đúng mẫu MISA

## Demo script

1. Mở `/inventory/purchase-orders`, mở một phiếu nhập kho đã ghi sổ
2. Bấm "Xuất khẩu" → mở file cạnh `examples/ERP/export_Phieu_nhap_kho.xlsx`: cùng khối đầu
   (chi nhánh / địa chỉ / tiêu đề căn giữa / dòng ngày / dòng số / các dòng thông tin chung),
   cùng tập cột (STT … Ghi chú, **không** có cột "Kho"), cùng dòng `Tổng`,
   cùng dòng `Số tiền viết bằng chữ: …`, cùng dòng `Ngày.......tháng.......năm............`,
   cùng **5** ô ký kèm `(Ký, họ tên)`
3. Lặp với một phiếu xuất kho ở `/inventory/goods-issues` → nhãn tổng là `Cộng`, có cột ĐVT
4. Lặp với một phiếu chuyển kho ở `/inventory/transfer-orders` → tiêu đề `PHIẾU CHUYỂN KHO`,
   có cột Kho xuất / Vị trí xuất / Kho nhập, **không** có dòng tiền-bằng-chữ (không có dữ liệu giá)
5. Mở một phiếu nhập kho sinh từ lệnh điều chuyển → khối thông tin có thêm dòng
   `Cửa hàng xuất điều chuyển: …`; mở một phiếu nhập kho mua hàng thường → **không** có dòng đó
6. Gọi `GET /goods-receipts/<id-của-org-khác>/export` bằng token org hiện tại → 404

## In scope

- `amount-in-words.util.ts` — đọc số thành chữ tiếng Việt (repo chưa có)
- `VoucherXlsxWriter implements ExportWriter` (ADR-10), dùng `xlsx-style.ts` của UOW-09
- `VoucherPrintPayload`: thêm `totalsLabel?`, siết ngữ nghĩa `docDate` sang dạng dài
- `voucherToReportDocument`: thôi ghép `docNo` vào title, thôi đổ `info` vào `subtitleLines`
- 3 mapper chứng từ: tập cột, nhãn, khối info, 5 ô ký, `totalsLabel`, `amountInWords`
- Dòng `Cửa hàng xuất/nhận điều chuyển` khi chứng từ sinh từ lệnh điều chuyển
- 3 controller đổi Writer

## Not in scope

- Phiếu quỹ A5 (US-04 / UOW-04) — cùng `amount-in-words.util.ts` nhưng khác Writer và khác mapper
- Bản in HTML — UOW-11
- Thêm cột dữ liệu mới vào entity (Serials, Giá bán, giá của chuyển kho) — A-20 chốt là bỏ cột

## Risks

| Risk | Mitigation |
|---|---|
| Đọc số thành chữ sai ở biên (0, hàng tỷ, số âm, phần lẻ) | AC-31 là test riêng cho util, không kiểm gián tiếp qua file Excel |
| Khối ký ghi sau dòng cuối bảng, mà `WorkbookWriter` không lùi lại được | `StaticRowsFetcher` nạp trọn chứng từ vào RAM trước khi Writer bắt đầu, nên `end(totals)` biết chắc bảng đã hết — không mâu thuẫn ADR-08 |
| Tra ngược lệnh điều chuyển thêm query vào đường in/xuất | Một query theo `export_goods_issue_id` / `import_goods_receipt_id` đã có index FK; chỉ chạy khi chứng từ có liên kết |
| Siết ngữ nghĩa `docDate` phá consumer khác | `docDate` chỉ có 2 consumer: `renderVoucherHtml` (UOW-11 sửa cùng đợt) và test — grep trước khi đổi |

## Definition of done

- [x] AC-27, AC-28, AC-29, AC-31, AC-32 pass — cả 5 xác nhận trên file tải về từ API thật, chi tiết
      ở T-10-06
- [x] `pnpm --filter @erp/api test` xanh — 200 suite / 1651 pass, 1 skip
- [x] Ba route export gọi thật, cả ba trả 200 + xlsx hợp lệ + đúng bố cục mẫu (T-10-06)
- [x] `pnpm openapi:generate` đã chạy; snapshot chỉ đổi ở 2 route của UOW-01 còn nợ, không phải
      route chứng từ
- [ ] Bấm nút "Xuất khẩu" trong 3 dialog trên UI — **chưa chạy**. Đường server đã kiểm đủ; phần
      chưa phủ là `handleExport` → `downloadVoucherExcel`, không bị feature này đụng tới
