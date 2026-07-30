---
id: UOW-13
slug: download-filename
title: Tên file tải về là loại chứng từ, và tên do server đặt phải tới được trình duyệt
demoable: true
duration: 0.5d
depends_on: [UOW-10]
requirements: [US-07]
verifies: [AC-35]
risk: low
status: todo
rollback: Bỏ `Content-Disposition` khỏi `exposedHeaders` và trả 3 controller về `payload.docNo`
---

# UOW-13 — Tên file tải về

## Demo script

1. Mở backoffice (:3000), mở một phiếu nhập kho, bấm "Xuất khẩu"
2. File tải về tên **`phieu-nhap-kho.xlsx`** — không phải `chung-tu.xlsx`
3. Lặp với phiếu xuất kho → `phieu-xuat-kho.xlsx`; lệnh điều chuyển → `phieu-chuyen-kho.xlsx`
4. Mở `/reports/sales`, xuất "Doanh thu theo mặt hàng" → `doanh-thu-theo-mat-hang.xlsx`,
   không phải `bao-cao.xlsx`

## In scope

- `Content-Disposition` vào `exposedHeaders` của CORS
- Ba route export chứng từ đặt tên file theo **loại chứng từ** thay vì số chứng từ
- Tên dự phòng phía FE theo từng loại, để đúng cả khi header bị proxy cắt

## Not in scope

- Đổi tên file của ~15 exporter buffered cũ (A-23)
- Ghép số chứng từ vào tên file — người dùng chốt tên theo loại

## Risks

| Risk | Mitigation |
|---|---|
| Mở `Content-Disposition` cho mọi origin | `origin: true` vốn đã cho mọi origin; header này chỉ chứa tên file đã slug hoá, không có dữ liệu nhạy cảm |
| Tải nhiều phiếu cùng loại → trình duyệt tự thêm `(1)`, `(2)` | Đúng hệ quả của việc đặt tên theo loại; ghép thêm số chứng từ là một dòng nếu người dùng đổi ý |

## Definition of done

- [x] AC-35 pass, xác nhận **trong trình duyệt** từ origin `http://localhost:8899` gọi API
      `http://localhost:4000`:
      - `phieu-nhap-kho.xlsx`, `phieu-xuat-kho.xlsx`, `phieu-chuyen-kho.xlsx`
      - báo cáo: `doanh-thu-theo-mat-hang.xlsx`
      - trước khi sửa, `content-disposition` đọc ra `null` ở cả bốn
- [x] `pnpm --filter @erp/api test` xanh — 200 suite / 1665 pass, 1 skip
