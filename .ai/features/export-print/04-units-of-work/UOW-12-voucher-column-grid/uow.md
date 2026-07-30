---
id: UOW-12
slug: voucher-column-grid
title: Lưới cột chứng từ đúng mẫu — cột ẩn, cột gộp, khối ký từ cột B
demoable: true
duration: 1d
depends_on: [UOW-10, UOW-11]
requirements: [US-07]
verifies: [AC-34]
risk: low
status: todo
rollback: Revert `hidden`/`span` khỏi `DocumentColumn` và 3 mapper; hai renderer bỏ qua field không có là quay về hành vi cũ
---

# UOW-12 — Lưới cột chứng từ đúng mẫu

## Demo script

1. Mở Nhập kho, mở một phiếu, bấm "Xuất khẩu"
2. Mở file: có cột "Giá bán" và "Thành tiền giá bán" đúng vị trí mẫu, và chúng **đang bị ẩn**
3. Bỏ ẩn hai cột đó (chọn cột quanh nó → Unhide) → thấy giá bán mặt hàng và SL × giá bán
4. Ô "Tên hàng hóa" gộp 4 cột ở cả hàng tiêu đề lẫn từng dòng hàng
5. Khối ký: "Người lập phiếu" ở cột B, rồi cách một cột cho mỗi ô tiếp theo
6. Lặp với phiếu xuất kho và lệnh điều chuyển
7. Bấm "In" một phiếu bất kỳ → bản in **không** có hai cột ẩn

## In scope

- `DocumentColumn`: thêm `hidden?` và `span?`
- `VoucherXlsxWriter`: dựng lưới vật lý từ cột logic (span), ẩn cột, khối ký bắt đầu ở cột B
- Ba mapper chứng từ: thêm 2 cột ẩn, đặt `span: 4` cho "Tên hàng hóa"
- `renderVoucherHtml`: bỏ qua cột ẩn, dùng `colspan` cho cột gộp

## Not in scope

- Cột `Serials`, `Vị trí nhập`, `Đơn giá`/`Thành tiền` của chuyển kho — vẫn không có nguồn dữ liệu (A-20)
- Giá bán **tại thời điểm lập phiếu** — hôm nay dùng giá mặc định của mặt hàng (A-24)
- `XlsxStreamWriter` (bảng báo cáo) — báo cáo không có cột ẩn hay cột gộp

## Risks

| Risk | Mitigation |
|---|---|
| Merge mỗi dòng dữ liệu dưới `WorkbookWriter` | Merge đặt trước `row.commit()`, đúng lối `writeBannerRow` đã chạy; chứng từ có số dòng hữu hạn nên chi phí không đáng kể |
| Lệch giữa chỉ số cột logic và cột vật lý làm dòng tổng đặt sai ô | Một hàm duy nhất dựng bản đồ logic→vật lý, mọi chỗ ghi đều đọc từ nó; test khẳng định địa chỉ ô thật |
| Khối ký ở cột B tràn ra ngoài bảng khi bảng hẹp | Bước 2 cột từ B, nhưng lùi về rải đều khi không đủ chỗ |

## Definition of done

- [x] AC-34 pass trên file tải về từ **API thật**, cả 3 loại phiếu. Đọc lại XML của từng file:
      - `<col min="12" max="13" hidden="1">` — đúng hai cột Giá bán / Thành tiền giá bán
      - merge `C11:F11` (tiêu đề) và `C12:F12`, `C13:F13`… (mỗi dòng dữ liệu + dòng tổng)
      - lưới: `A` STT, `B` Mã SKU, `C:F` Tên hàng hóa, `G` ĐVT, `H` Vị trí, `I` SL, `J` Đơn giá,
        `K` Thành tiền, `L` Giá bán (ẩn), `M` Thành tiền giá bán (ẩn), `N` Ghi chú
      - ô ký ở `B18/D18/F18/H18/J18` + `(Ký, họ tên)` ở hàng dưới — **trùng đúng vị trí mẫu MISA**
      - `Giá bán` = giá bán mặt hàng (750.000), `Thành tiền giá bán` = SL × giá bán
- [x] `pnpm --filter @erp/api test` xanh — 200 suite / 1665 pass, 1 skip
- [x] Bản in không có cột ẩn — dựng từ payload thật cho cả 3 loại: 9 `<th>` (không phải 11),
      không có chuỗi "Giá bán", cột tên `colspan="4"`; mở trong trình duyệt và phóng to xác nhận ô
      tên là một ô gộp sạch, không có vạch chia bên trong
