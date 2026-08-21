# Requirements — Phiếu chuyển kho: quét mã vạch kế thừa kho nhập

Bối cảnh: trên `Phiếu chuyển kho` (backoffice, `/inventory/stock-transfers`), sau khi bấm
"Chọn kho" để đặt Kho xuất/Kho nhập cho phiếu, hai đường thêm dòng phải cho cùng kết quả.
Trước khi sửa, đường quét mã vạch dựng dòng mới từ `emptyLine()` nên `destStorageId` rỗng;
`fillTransferLocations` lọc dòng đó ra và cả Kho nhập lẫn Vị trí nhập đều trống.

| ID | Given / When / Then |
|---|---|
| AC-01 | **Given** một phiếu chuyển kho mới đã bấm "Chọn kho" với Kho xuất `Kho Lưu trữ HCM` và Kho nhập `HCM - Showroom`, **when** bật "Quét mã vạch" và quét một mã SKU chưa có trên phiếu, **then** dòng vừa thêm hiện đúng Kho nhập `HCM - Showroom` và Vị trí nhập được tự điền từ kệ ưu tiên của mã đó tại kho nhập. |
| AC-02 | **Given** cùng phiếu và cùng lựa chọn kho, **when** nhập mã SKU trực tiếp vào ô "Mã SKU" trên bảng và chọn từ dropdown, **then** dòng hiện đúng Kho nhập và Vị trí nhập giống hệt đường quét mã vạch — hai đường không được lệch behavior. |
