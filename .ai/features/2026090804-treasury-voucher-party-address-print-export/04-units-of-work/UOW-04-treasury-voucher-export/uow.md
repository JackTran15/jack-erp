---
id: UOW-04
slug: treasury-voucher-export
title: Xuất từng phiếu thu chi ra Excel
demoable: true
duration: 1d
depends_on: [UOW-03]
requirements: [US-04]
verifies: [AC-14, AC-15, AC-16]
risk: low
status: todo
rollback: Ẩn nút Xuất khẩu ở 4 dialog; 4 route `export` để lại vô hại
---

# UOW-04 — Xuất từng phiếu thu chi ra Excel

## Demo script

1. Mở Quỹ tiền → Thu chi tiền mặt, mở chi tiết một phiếu chi đã ghi sổ
2. Bấm "Xuất khẩu" → file `.xlsx` tải về, tên file mang loại phiếu và số phiếu
3. Mở file: khối đầu có số phiếu, ngày, đối tượng, địa chỉ, lý do; bảng chi tiết đủ dòng;
   dòng cộng bằng tổng tiền của phiếu; dòng tiền bằng chữ
4. So bản in A5 của chính phiếu đó (UOW-03) với file Excel → cùng số liệu, cùng nhãn
5. Lặp với phiếu thu tiền mặt, phiếu thu tiền gửi, phiếu chi tiền gửi
6. Gọi route xuất với một id không tồn tại → 404, không có file rác nào tải về

## In scope

- 4 route `GET :id/export` dùng lại **chính payload** của `print-payload`
- `EXPORT_PATH` + `FALLBACK_FILENAME` cho 4 kind treasury
- Nút "Xuất khẩu" ở 4 dialog

## Not in scope

- Xuất danh sách (UOW-05) — khác nguồn dữ liệu, khác fetcher
- Mẫu MISA riêng cho phiếu quỹ (A-09): dùng `VoucherXlsxWriter` như chứng từ kho

## Risks

| Risk | Mitigation |
|---|---|
| Bản in và file Excel lệch nhau theo thời gian | Cả hai đọc **cùng một** `getPrintPayload`; bước 4 của demo script kiểm đúng điều đó |
| Tên file rơi về "chung-tu.xlsx" khi `Content-Disposition` bị chặn — lỗi này đã xảy ra một lần | `FALLBACK_FILENAME` khai riêng cho 4 kind; done-when của T-04-02 kiểm cả hai đường |
| Lỗi phát sinh sau khi phản hồi đã mở ⇒ file hỏng, không phải HTTP lỗi | **Rủi ro này đã xảy ra thật, không phải giả định** — `VoucherXlsxWriter.writeTotalsRow` merge sau `row.commit()` làm mọi export phiếu quỹ đứt giữa chừng sau khi client đã nhận 200. T-04-03 (e2e) bắt được; T-04-04 sinh ra để vá. Bài học: 404 *trước* pipeline thì an toàn, nhưng lỗi *bên trong* writer thì không có lưới nào đỡ |

## Nợ đã biết, cố ý không trả trong UoW này

`voucher-xlsx.writer.ts` còn **một** chỗ đổi trạng thái sau `commit()` nữa, phát hiện khi
làm T-04-04: `writeHeaderRow` (~dòng 291-306) gán `row.height = HEADER_ROW_HEIGHT` **sau**
khi `writeGridRow` đã `row.commit()`. Khác với ca merge, phép gán này **không ném** — nhưng
`Row.commit()` của ExcelJS serialize XML của dòng ngay trong lời gọi đó, nên chiều cao
không bao giờ vào file. Lỗi thật, chỉ ảnh hưởng hình thức, và có từ trước feature này —
chứng từ kho cũng dính.

Không sửa ở đây: ngoài phạm vi khiếu nại, và trộn một sửa lỗi hình thức vào ticket vá lỗi
hỏng-file làm diff khó soát. Ghi lại để lần sau ai thắc mắc "sao hàng tiêu đề không cao lên"
thì biết ngay chỗ nhìn.

## Definition of done

- [ ] Cả AC-14..16 pass
- [x] Dùng `ExportPipeline` + `VoucherXlsxWriter` + `voucherToReportDocument`, không writer mới
- [x] `pnpm --filter @erp/api test:e2e -- treasury-voucher-export` xanh
- [x] `pnpm openapi:generate` chạy MỘT lần cho cả feature; 4 route `export` có trong snapshot
- [ ] `schema.ts` + `openapi.snapshot.json` **đã commit** — chưa; toàn bộ feature còn uncommitted
- [ ] Demo script chạy được trước người thật ở gate G4
- [ ] Bằng chứng: 4 file `.xlsx` tải thật, mở được, kèm ảnh chụp (thuộc G4 của UoW, không
      thuộc done-when của ticket nào)
