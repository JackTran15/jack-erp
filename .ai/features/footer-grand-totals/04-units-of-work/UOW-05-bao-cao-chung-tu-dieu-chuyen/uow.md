---
id: UOW-05
slug: bao-cao-chung-tu-dieu-chuyen
title: Báo cáo chứng từ NXT và hai báo cáo điều chuyển chạy trên hợp đồng mới
demoable: true
duration: 2d
depends_on: [UOW-03]
requirements: [US-03, US-04, US-05]
verifies: [AC-12, AC-13, AC-15, AC-18]
risk: medium
status: todo
rollback: tắt cờ phân trang server của ba trang này
---

# UOW-05 — Báo cáo chứng từ NXT + hai báo cáo điều chuyển

Ba báo cáo: Chi tiết chứng từ NXT (2), Tổng hợp điều chuyển (6), Điều chuyển theo chi nhánh (7).

Báo cáo 6 có một bất thường phải xử lý ở đây: facade trả **toàn bộ** dữ liệu nhưng vẫn echo
`page`/`pageSize` (`inventory-reports.service.ts:181-190`) — nó chưa từng phân trang thật.

## Demo script
1. Báo cáo → Chi tiết chứng từ nhập xuất kho, kỳ rộng cho ra nhiều trang
2. Tới trang cuối; footer không đổi giữa các trang; lọc một cột → lưới và footer cùng đổi
3. Báo cáo → Tổng hợp điều chuyển: kiểm tra request mang `page`/`pageSize` và response chỉ trả
   đúng số dòng của trang (trước đây trả hết)
4. Báo cáo → Điều chuyển theo chi nhánh: footer Số lượng / Giá trị không đổi khi chuyển trang

## In scope
- `document-detail.service.ts`: lọc cột + totals (mở rộng `countSql:313-320`)
- `transfer-report.service.ts`: `summarize()` phân trang thật + totals bằng reduce;
  `byBranch()` lọc cột + totals qua `countSql:453-460` và `:525-529`
- Facade cắt trang cho báo cáo 6
- Ba trang FE chuyển sang hợp đồng mới

## Not in scope
- Cột đơn giá bình quân không được tổng ở server — FE suy ra từ giá trị/số lượng (AC-19)

## Risks
| Risk | Mitigation |
| --- | --- |
| Báo cáo 2 ở chế độ keyset bỏ qua `COUNT` (`:343-345`) | Chế độ keyset chỉ dùng cho đường xuất khẩu; trả `totals` rỗng ở đó và ghi rõ |
| Báo cáo 6 đang trả hết dữ liệu, FE có thể ngầm dựa vào điều đó | Kiểm cả trang xuất khẩu/in nếu có dùng chung endpoint |

## Definition of done
- [x] AC-12, AC-13, AC-18 có ảnh: `S10` (Chi tiết chứng từ NXT, 1.532 dòng, tới trang cuối, footer
      "Giá trị nhập" = 691.778.000), `S11`/`S12` (hai báo cáo điều chuyển mở được, phân trang server)
- [x] Báo cáo 6 phân trang thật — việc cắt trang chuyển vào service để `data`/`total`/`totals`
      cùng một nguồn; `page`/`pageSize` đã vào khoá cache
- [x] AC-15 (lọc tác dụng toàn tập) — đối chiếu API trên báo cáo 2; hai báo cáo điều chuyển không
      dựng được cảnh có dữ liệu, xem mục dưới

## Kiểm chứng bằng số thật

`erp_dev` ban đầu không có điều chuyển liên chi nhánh nào, nên đã **tạo dữ liệu** qua chính các
API mà backoffice gọi (lệnh điều chuyển HCM → Chi nhánh 2, xác nhận xuất, tạo kho nhận, xác nhận
nhập — chi tiết ở `07-verification.md`). Sau đó cả hai báo cáo đều kiểm được bằng số:

| Báo cáo | total | totals |
| --- | ---: | --- |
| Chi tiết chứng từ NXT | 1.534 | `inQty 2.190, inValue 692.478.000, outQty 4, outValue 1.400.000` — giống nhau ở trang 1 và trang cuối |
| Tổng hợp điều chuyển | 2 | `qtyIn 2, valueIn 700.000, qtyOut 2, valueOut 700.000, qtyReceived 2`, chênh lệch 0 |
| Điều chuyển theo chi nhánh | 1 | `outQty 2, outValue 700.000` — không đổi giữa `pageSize` 1 và 50 |

Chênh lệch nhập-xuất bằng 0 đúng bất biến "sổ khoẻ" mà báo cáo 6 mô tả. Ảnh: `S10`, `S11`, `S12`.
