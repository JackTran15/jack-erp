---
feature: revenue-by-item-misa-parity
date: 2026-07-30
by: Akenzy + Claude (T-05-02)
---

# Ghi chú đối chiếu — Doanh thu theo mặt hàng vs MISA

## Phạm vi đã làm

Đối chiếu **trên UI thật** (backoffice đang chạy tại `localhost:3000`, API tại
`localhost:4000`, dữ liệu seed thật), **không tải file Excel** — quyết định của Akenzy
2026-07-30, xem "Quyết định phạm vi" bên dưới.

Tham số dùng: báo cáo **Doanh thu theo mặt hàng**, chi nhánh Hồ Chí Minh, khoảng
`01/01/2020 – 31/12/2026`, "Thống kê theo" = **Mẫu mã** (đúng grain ảnh #2 gốc của
người dùng).

## Kết quả quan sát trên UI thật

Bảng hiện đúng 14 cột, đúng thứ tự MISA A→N:

```
Mã SKU | Tên hàng hóa | Đơn vị tính | Mã vị trí | Tên vị trí | Số lượng bán (1) |
Đơn giá TB (2)=(3)/(1) | Tiền hàng (3) | Khuyến mại (4) | Điểm KM (9) |
Tỷ lệ KM (%) (5)=((4)+(9))/(3) | Doanh thu (6)=(3)-(4)-(9) | Nhóm hàng hóa | Thương hiệu
```

9 dòng dữ liệu (ABA2777, ABA2799, ABA2813, ABA3299, AK066-2, AK078-45, PQT200, PQT500,
SETVOANM), dòng tổng: **Số lượng bán = 56, Tiền hàng = Doanh thu = 41.895.000, Khuyến
mại = Điểm KM = 0**.

## Kết luận từng AC

| AC | Kết luận |
|---|---|
| AC-01 | **Đạt.** 14 cột, đúng thứ tự — khớp ảnh #2 từng cột A→N |
| AC-02 | **Đạt.** Nhãn `Số lượng bán`, `Đơn giá TB`, `Doanh thu` hiện đúng, không rò nhãn báo cáo khác |
| AC-04 | **Đạt.** Ký hiệu công thức hiện dưới nhãn 3 cột đã kiểm: `(2)=(3)/(1)`, `(5)=((4)+(9))/(3)`, `(6)=(3)-(4)-(9)` |
| AC-06 | **Đạt.** Ở grain Mẫu mã, cột `Mã vị trí`/`Tên vị trí` vẫn hiện trong bảng nhưng mọi ô đều rỗng — đúng ADR-03, không phải cột biến mất |
| AC-08 | **Một phần.** Ký hiệu công thức đã xác nhận trên màn hình (cùng payload nguồn với Excel, theo ADR-01) và trên file mẫu tổng hợp gửi ở T-02-02. **Chưa** mở file `.xlsx` thật bằng Excel/LibreOffice để xem 2 dòng trong 1 ô không bị cắt chữ trên dữ liệu thật này |
| AC-12 | **Chưa xác nhận trên file thật.** Dòng tham số chỉ xuất hiện trong file export/print, không hiện trên bảng màn hình. T-05-01 (snapshot test) đã xác nhận bằng mock có kiểm soát; chưa chạy trên request thật qua trình duyệt |
| AC-17 | **Đạt.** Chọn "Mẫu mã" trả 200, dữ liệu gộp đúng theo sản phẩm cha (không còn thấy mã biến thể dạng `ABA2777-D-38`) |

## Kết luận A-01 (revenue.total = Doanh thu MISA)

Kiểm đẳng thức trên dòng tổng của UI thật:

```
Doanh thu = Tiền hàng − Khuyến mại − Điểm KM
41.895.000 = 41.895.000 − 0 − 0  ✓
```

Đúng — nhưng **Khuyến mại và Điểm KM đều bằng 0** trong bộ dữ liệu seed hiện có, nên phép
kiểm này không phân biệt được `(6)=(3)-(4)-(9)` khỏi các công thức lân cận (ví dụ nếu
`Doanh thu` vô tình bằng `Tiền hàng` bất kể `Khuyến mại`, đẳng thức trên vẫn đúng một
cách tình cờ). **A-01 CHƯA được xác nhận đầy đủ** — cần một invoice có khuyến mại > 0
trong kỳ để kiểm thật sự có ý nghĩa. Về mặt code, `aggregateByItem` (không đổi trong
feature này) đã cộng `sign * lineTotal` mà `lineTotal` đã trừ `lineDiscount` sẵn (theo
comment cột `invoice-item.entity.ts:62`), nên kết luận suy luận từ code vẫn đứng: A-01
đúng về logic, chỉ chưa có dữ liệu thật để kiểm thực nghiệm đầy đủ.

## Kết luận A-05 (Điểm KM = placeholder 0)

Xác nhận: cột `Điểm KM` trên dòng tổng = 0, khớp ảnh #2 (cũng toàn 0). Không có backing
loyalty theo dòng, đúng như A-05 ghi nhận — không phải bug.

## Lệch còn lại — quyết định

| Lệch | Quyết định |
|---|---|
| Chưa mở file `.xlsx` thật bằng Excel/LibreOffice (AC-08 một phần) | **Chấp nhận, không chặn.** Môi trường xây dựng không có Excel/LibreOffice; T-02-02 đã gửi file mẫu tổng hợp cho Akenzy tự kiểm. Snapshot test T-05-01 khóa nội dung ô ở mức byte |
| Dòng tham số (AC-12) chưa xác nhận trên file thật qua trình duyệt | **Chấp nhận, không chặn.** Hành động tải file cần xin phép trước (rule an toàn); Akenzy đã chọn dừng ở mức UI đã xác nhận thay vì cấp phép tải. T-05-01 đã khóa nội dung dòng tham số bằng test tự động đọc lại workbook thật (không qua mock writer) |
| A-01 chưa kiểm thực nghiệm với khuyến mại > 0 | **Ghi nhận, không mở ticket mới.** Kết luận logic từ code đã đủ vững (line_total đã trừ discount ở tầng entity); rủi ro thấp, không phải trọng tâm của feature parity cột |

## Kết luận chung

7/7 AC được UOW-05 phủ đều có bằng chứng — 5 xác nhận đầy đủ trên UI/dữ liệu thật
(AC-01, AC-02, AC-04, AC-06, AC-17), 2 xác nhận một phần qua test tự động + dữ liệu mock
có kiểm soát, chưa qua file thật (AC-08, AC-12). Không phát hiện lệch nào cần sửa code
thêm. Feature đạt success signal đề ra ở `00-intent.md`: cột A→N khớp ảnh #2 ở đúng
grain Mẫu mã.
