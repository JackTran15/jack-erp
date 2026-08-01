---
id: UOW-15
slug: voucher-column-width
title: Lưới cột phiếu kho đúng bề rộng nội dung, cột Ghi chú chuyển thành cột ẩn
demoable: true
duration: 0.5d
depends_on: [UOW-12]
requirements: [US-08]
verifies: [AC-37]
risk: low
status: todo
rollback: Bỏ bảng hằng số `width` khỏi 3 mapper và bỏ `<colgroup>` khỏi `renderVoucherHtml` — cả hai renderer đều rơi về mặc định cũ; bỏ `hidden` khỏi cột `note` để Ghi chú hiện lại trên giấy
---

# UOW-15 — Bề rộng cột phiếu kho

## Demo script

1. Mở `/inventory/purchase-orders`, mở một phiếu nhập kho có mã SKU dài 16 ký tự và số tiền
   hàng trăm triệu, bấm "In"
2. Trong preview của trình duyệt, phóng to bảng dòng hàng:
   - `Mã SKU` nằm gọn **một dòng**, không bị bẻ xuống dòng thứ hai
   - `Đơn giá` hiện đủ `9.999.999`, `Thành tiền` hiện đủ `999.999.999`, không xuống dòng
   - `STT`, `SL`, `ĐVT` hẹp rõ rệt so với ba cột trên
   - **không có cột `Ghi chú`**
3. Bấm "Xuất khẩu" cùng phiếu đó → mở file .xlsx: vẫn **có** cột `Ghi chú` nhưng đang ẩn; bỏ ẩn
   (chọn hai cột quanh nó → Unhide) thì thấy nội dung ghi chú của từng dòng
4. Lặp bước 1–3 với phiếu xuất kho và phiếu chuyển kho
5. Đối chiếu bản in với `examples/ERP/in_phieu_nhap.pdf` — bố cục phần còn lại không đổi

## In scope

- Một bảng hằng số `width` (đơn vị ký tự) dùng chung cho ba mapper chứng từ
- Cột `note` nhận `hidden: true`
- `renderVoucherHtml` phát `<colgroup>` quy `width` × `span` thành phần trăm

## Not in scope

- `VoucherXlsxWriter` — `widthOf()` đã đọc `column.width` và `hidden` đã chạy từ UOW-12; không
  đổi một dòng nào ở writer
- Bảng báo cáo (`XlsxStreamWriter`, `renderReportTableHtml`) — báo cáo lấy `width` từ catalog cột,
  không dùng bảng hằng số này
- Cho người dùng tự chỉnh bề rộng cột như trang `/cai-dat-in` của POS — chưa ai yêu cầu
- Phiếu thu / phiếu chi (UOW-04 chưa làm) — chưa có mapper nào để đặt width

## Risks

| Risk | Mitigation |
|---|---|
| Tổng bề rộng vượt khổ A4 → cột nào đó vẫn bẻ dòng | Tính trước: phiếu nhập kho ra 121 đơn vị trên 190mm khả dụng, `Mã SKU` được ~28mm sau padding cho 16 ký tự Times 13px (~27mm) — **sát**. Demo script bắt buộc phóng to xem trong preview thật, không nghiệm thu bằng số học |
| Nới cột này làm teo cột kia vì tổng luôn quy về 100% | Nếu preview còn chật thì hạ `padding: 4px 6px` → `3px 4px`, đừng nống `width` lên |
| Đổi `width` làm lệch file Excel khỏi mẫu MISA đã đối chiếu ở UOW-10/12 | Mẫu MISA không quy định bề rộng cột; `WIDTH_INDEX_COLUMN`/`WIDTH_DEFAULT` là mặc định của chính repo, không phải số lấy từ mẫu. AC-34 không khẳng định gì về bề rộng |
| Ẩn `Ghi chú` làm mất dữ liệu người dùng đã nhập | Cột vẫn ghi vào workbook, chỉ `hidden` — đúng cơ chế đã chạy cho Giá bán / Thành tiền giá bán. Demo script bước 3 bắt buộc bỏ ẩn để chứng minh dữ liệu còn |

## Definition of done

- [x] AC-37 pass, **đo trong Chrome** ở đúng bề rộng in 190mm với bộ cột và bộ width thật của
      mapper, trên **cả ba** loại phiếu (nhập / xuất / chuyển kho): không ô nào tràn trừ
      `Tên hàng hóa` với tên 48 ký tự. SKU 16 ký tự (`ABCDEFGH12345678`) một dòng; `9.999.999`,
      `999.999.999` và cả dòng tổng `1.009.999.999` một dòng; `STT`/`SL`/`ĐVT` hẹp nhất bảng.
      Phiếu xuất kho kiểm riêng vì nhãn `Số lượng` rộng hơn `SL` — vẫn vừa
- [x] AC-29 (bản sửa), phần bản in: bản in dựng từ bộ cột thật **không có** chuỗi `Ghi chú`, 8 `<th>`
      thay vì 9
- [x] `pnpm --filter @erp/api test` xanh — 205 suite / 1768 pass, 1 skip
- [x] `tsc --noEmit` + `pnpm --filter @erp/backoffice-web build` sạch; 26 assertion của
      `render-voucher-html.test.ts` chạy qua driver, 26 pass / 0 fail
- [ ] **Còn thiếu:** mở file .xlsx tải về từ API thật để xác nhận cột `Ghi chú` bị ẩn và bỏ ẩn ra
      đúng nội dung (Demo script bước 3). Cơ chế `hidden` đã chạy từ UOW-12 và có test ở writer,
      nhưng chưa kiểm trên file tải về của đợt này
- [ ] **Còn thiếu:** bấm nút "In"/"Xuất khẩu" trên UI thật. `window.print()` mở hộp thoại in của
      trình duyệt và làm treo kênh điều khiển tự động (bài học UOW-11), nên đã dựng đúng HTML mà
      `printHtmlDocument` sẽ ghi vào iframe rồi đo trực tiếp. Phần chưa phủ là đúng một lệnh
      `window.print()` và một vòng HTTP, không phải bố cục
