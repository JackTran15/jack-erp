---
id: UOW-03
slug: warehouse-column-and-widths
title: Cột "Kho" riêng ở cả bốn báo cáo, và ba cột vị trí chốt độ rộng bằng phép đo
demoable: true
duration: 2d
depends_on: [UOW-01, UOW-02]
requirements: [US-04]
verifies: [AC-15, AC-16, AC-17, AC-18, AC-19]
risk: medium
status: todo
rollback: revert T-03-01..T-03-03 bỏ cột "Kho" khỏi 4 khai báo và hàm dùng chung; revert T-03-04 trả ba độ rộng về 220/320. Không có migration, không có cột dữ liệu mới — revert code là đủ
---

# UOW-03 — Cột "Kho" riêng, và độ rộng chốt bằng phép đo

Lát cắt này dọn hai hệ quả của ADR-06, cả hai đều đã nêu với Akenzy lúc chốt ADR-06 và được
yêu cầu sửa ngay sau đó:

1. Không cột nào của 4 báo cáo còn cho biết hàng nằm ở kho nào → cột "Kho" riêng (ADR-07).
2. `320` và `220` đo với chuỗi dài hơn, nay dư; mà thêm cột thứ ba lại đổi tổng bề ngang →
   đo lại cả ba cùng lúc (ADR-08).

Hai việc nằm chung một lát vì cùng chạm đúng dải cột đó của cùng 4 báo cáo, và vì con số độ
rộng chỉ chốt được sau khi cột mới đã có mặt.

## Demo script

1. Dùng chính chi nhánh và mặt hàng A của demo UOW-01 (kệ `A101` ở kho `A1`, `A201` ở kho `A2`).
2. Mở Báo cáo > Tổng hợp nhập xuất tồn kho ở chế độ một chi nhánh.
3. Dải cột vị trí đọc ba ô: **Kho** = `Kho A1, Kho A2`; **Mã vị trí** = `A101, A201`;
   **Tên vị trí** = `Kệ A101, Kệ A201`.
4. Xếp thêm mặt hàng H lên hai kệ `A101` và `A102` **cùng kho `A1`** → cột "Kho" hiện `Kho A1`
   (một mục), cột "Mã vị trí" hiện `A101, A102` (hai mục).
5. Đặt cặp (A, `A101`) sang Ngừng theo dõi, tải lại → cột "Kho" chỉ còn `Kho A2`.
6. Lấy một mặt hàng chỉ còn tồn ở showroom → cột "Kho" hiện tên showroom ở báo cáo tồn.
7. Chuyển sang chế độ xem chuỗi → cả ba cột vị trí biến mất khỏi danh mục cột.
8. Mở "Chi tiết doanh thu theo mặt hàng", "Doanh thu theo mặt hàng", "Lợi nhuận theo mặt hàng"
   → cả ba đều có cột "Kho" với cùng chuỗi; mặt hàng chỉ ở showroom để **trống** cột "Kho".
9. Ở 1440x900, không ô nào trong ba cột bị CSS cắt; số đo ghi trong T-03-04.
10. Xuất Excel → cột "Kho" có trong file với đủ mọi tên kho.

## In scope

- `resolveItemWarehouseLocations` trả thêm `storage` (tên kho, khử trùng); khôi phục
  `ItemShelf.storageName` mà T-01-06 đã xoá (ADR-07).
- Cột "Kho" ở Tổng hợp nhập xuất tồn kho: khai báo BE, `LOCATION_COLUMN_KEYS`, `CATALOG_KEYS`,
  chỗ gán giá trị, và registry frontend (kể cả nhánh lọc cột của chế độ chuỗi).
- Cột "Kho" ở ba báo cáo doanh thu/lợi nhuận: khai báo cột, nhãn tiếng Việt BE, aggregator,
  `REPORT_COLUMN_WIDTHS`, và registry frontend của hai báo cáo có registry.
- Đo lại và chốt độ rộng của cả ba cột vị trí ở 1440x900 (ADR-08).

## Not in scope

- Cho lọc / tìm kiếm theo kho. Cột "Kho" giữ `filterKind: 'none'` y như hai cột kia (A-05).
- Đổi cách 4 báo cáo chọn chi nhánh để tra kệ.
- Thêm cột "Mã kho". Akenzy chốt một cột tên kho (A-19).
- Đụng vào `stock-period.service.ts` hay cách tính số lượng.

## Risks

| Risk | Mitigation |
| --- | --- |
| Thêm trường vào `ItemWarehouseLocation` là đổi hợp đồng của 4 nơi gọi (ADR-01) | T-03-01 chạy `tsc` trước khi đụng tới báo cáo nào; ba nơi không đọc `storage` phải không sửa dòng nào |
| Cột mới lọt vào chế độ chuỗi hoặc chế độ nhiều cửa hàng, nơi kho không có nghĩa (AC-18) | T-03-02 thêm test cho đúng hai chế độ đó, theo mẫu test sẵn có của `positionCode`/`positionName` |
| Ba báo cáo doanh thu có ba đường khai báo cột khác nhau (`INVOICE_ITEM_REVENUE_COLUMNS` + nhãn BE, `REVENUE_BY_ITEM_COLUMNS` + aggregator, `PROFIT_BY_ITEM_COLUMNS`) | T-03-03 làm từng báo cáo một và chạy suite của riêng nó trước khi sang báo cáo kế |
| Chốt độ rộng bằng ước lượng — đã sai một lần trong chính feature này | ADR-08: T-03-04 đo thật; không dựng được môi trường thì `aidlc block`, không hạ xuống ước lượng |

## Definition of done

- [x] AC-15, AC-16, AC-17, AC-18 pass (test). **AC-19 không đạt** — T-03-04 đóng không đo, Akenzy chốt 12/09/2026
- [x] `resolveItemWarehouseLocations` giữ nguyên chữ ký; ở T-03-01 không file `.report.ts` nào bị sửa (ADR-01 giữ được). Ba báo cáo chỉ sửa khi chủ động đọc `storage` ở T-03-03
- [x] Cột "Kho" theo đúng quy tắc chuỗi / nhiều cửa hàng / Ngừng theo dõi / showroom của hai cột kia — có test ở cả bốn báo cáo
- [~] Số đo `scrollWidth`/`clientWidth` — **KHÔNG có**. T-03-04 đã `block` đúng theo ADR-08 (không đăng nhập được API local trên `erp_dev_3008`), rồi Akenzy chốt "mark done". Ba độ rộng giữ nguyên `220`/`220`/`320`: vẫn là số đo cũ với chuỗi **dài hơn** hiện tại nên cột dư chứ không thiếu, nhưng cột "Kho" mới chưa ai đo
- [x] `pnpm --filter @erp/api test` xanh — 4666/4672, 359/362 suite; ba suite đỏ sẵn có, không liên quan (xem DoD của UOW-01). `tsc --noEmit` sạch ở cả `apps/api` lẫn `apps/backoffice-web`
- [x] Demo script chạy được đầu-cuối và được nghiệm thu ở G4 — Akenzy build và kiểm trên nhánh `develop`, 12/09/2026. Nghiệm thu bằng mắt trên môi trường develop, **không** phải demo chạy tay từng bước ở local và không có ảnh chụp; AC-19 vẫn không đạt (xem T-03-04).
