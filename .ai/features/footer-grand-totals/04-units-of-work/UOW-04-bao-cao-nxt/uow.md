---
id: UOW-04
slug: bao-cao-nxt
title: Ba báo cáo nhập xuất tồn chạy trên hợp đồng mới
demoable: true
duration: 2d
depends_on: [UOW-03]
requirements: [US-03, US-04, US-05]
verifies: [AC-12, AC-15, AC-16, AC-18, AC-19]
risk: medium
status: todo
rollback: tắt cờ phân trang server của ba trang này; shell vẫn chạy chế độ cũ
---

# UOW-04 — Ba báo cáo nhập xuất tồn chạy trên hợp đồng mới

Ba báo cáo dùng chung `StockPeriodService`, nên sửa một service là xong cả ba: Tổng hợp NXT,
Chi tiết SL NXT, Tổng hợp NXT theo chi nhánh.

## Demo script
1. Vào Báo cáo → Tổng hợp nhập xuất tồn kho, kỳ cho ra ~8k dòng
2. Bấm tới trang cuối → tới được dòng cuối cùng; footer không đổi giữa các trang
3. Lọc cột "SL nhập ≥ 10" → lưới và footer cùng đổi, pager về trang 1
4. Kiểm tra footer "Tồn cuối" = Tồn đầu + Nhập − Xuất (cột dẫn xuất tính từ primitive)
5. Lặp nhanh trên Chi tiết SL NXT và Tổng hợp NXT theo chi nhánh

## In scope
- Lọc-theo-cột phía server + totals cho `StockPeriodService` (cả hai nhánh `buildItemSqls` và `buildAggSqls`)
- Ba trang FE chuyển sang hợp đồng mới

## Not in scope
- Hai cột "Đang chuyển đi" / "Sắp nhận về" — ghép bằng JS, thuộc UOW-06

## Risks
| Risk | Mitigation |
| --- | --- |
| Hai nhánh SQL (item vs nhóm/cha) dễ lệch nhau | Cùng một util lọc, cùng một danh sách cột tổng; test cả hai chế độ `itemGroupBy` |
| Cột dẫn xuất bị tổng sai (trung bình của trung bình) | Chỉ tổng primitive ở server; FE suy ra dẫn xuất (AC-19) |

## Definition of done
- [x] AC-12, AC-13, AC-18, AC-19 có ảnh chứng minh: `S7` (trang cuối 77/77, 1.540 dòng — trước đây
      lưới cắt cứng ở 200), `S8` (footer "SL nhập" = 2.196 ở trang cuối), `S9` (báo cáo Chi tiết)
- [x] AC-15, AC-16 đối chiếu trực tiếp API: lọc `inQty >= 5` làm total 1.540 → 37 **và** totals
      in 2.196 → 658, out 41 → 2 — lưới và footer đổi cùng nhau
- [x] Hai cột "Đang chuyển đi"/"Sắp nhận về" tạm ẩn footer (còn ghép bằng JS theo trang), có TODO
      dẫn chiếu T-06-02 — thà bỏ trống còn hơn hiện tổng của một trang
- [x] Cả hai chế độ `itemGroupBy` đều có test — đóng ở UOW-06: `stock-period.service.spec.ts` có
      test "gộp theo hàng cha / nhóm thì hai cột điều chuyển luôn bằng 0", và
      `buildRowKeysSql` bỏ hẳn truy vấn khoá ở chế độ gộp (branch_id/location_id đã bị NULL hoá).
      Đối chiếu API: `itemGroupBy=parent` trả total 887, transferOutQty 0 — khớp cột.

## Kiểm chứng: API đối chiếu (chi nhánh HCM, kỳ 08/2026, báo cáo Tổng hợp NXT)

| Truy vấn | total | openingQty | inQty | outQty |
| --- | ---: | ---: | ---: | ---: |
| `pageSize=5` (trang 1) | 1540 | 0 | 2196 | 41 |
| `pageSize=200, page=8` | 1540 | 0 | 2196 | 41 |
| lọc `inQty >= 5` | 37 | 0 | 658 | 2 |
