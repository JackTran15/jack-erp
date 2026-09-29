# Intent — tracked-zero-stock-barcode-location

## Problem

QA (Danh mục > In tem mã, mục 2): khi thêm hàng hoá vào bảng in tem, cột Kho/Vị trí
để trống nếu chi tiết vị trí của hàng đang *Đang theo dõi* nhưng số lượng <= 0.
Nguyên nhân: `ResolveItemLocationsHandler` bước (b) chọn bin theo tồn với điều kiện
`sb.quantity > 0`, nên vị trí đang theo dõi mà tồn <= 0 bị bỏ qua, rơi xuống bước (c)
(`source: default`) — mà trang In tem mã cố ý để trống với `default`.
Yêu cầu: "Nếu vẫn còn đang theo dõi thì sẽ show lên".

## Success signal

Thêm một hàng hoá chỉ có vị trí *Đang theo dõi* với tồn <= 0 (trong kho nhập mặc định
của chi nhánh) vào bảng In tem mã → Kho/Vị trí tự điền đúng vị trí đó.

## Out of scope

- Tìm vị trí ngoài kho nhập mặc định của chi nhánh (A-02).
- Thay đổi dropdown chọn tay Kho/Vị trí (đã không lọc theo số lượng).
- Vị trí *Ngừng theo dõi* — vẫn bị loại như hiện tại.

## Constraints

Endpoint dùng chung với mobile (`mobile-stock-document-write`); thay đổi áp cho cả hai (A-01).
Không migration, không đổi contract.
