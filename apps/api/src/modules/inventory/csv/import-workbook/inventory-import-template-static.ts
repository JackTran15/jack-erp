export const STATIC_GUIDE_GRID: string[][] = [
  ['HƯỚNG DẪN NHẬP KHẨU HÀNG HÓA'],
  ['TH1: Nhập mới hàng hóa'],
  [
    'Điền dữ liệu từ dòng 5 trong sheet «Danh sách hàng hóa». Các cột bắt buộc gồm Mã SKU, Tên hàng hóa, Đơn vị tính.',
  ],
  ['TH2: Cập nhật hàng hóa đã có'],
  ['Chọn chế độ «Cập nhật» để cập nhật thông tin khi mã SKU đã tồn tại.'],
  ['TH3: Bỏ qua khi trùng mã SKU'],
  ['Chọn chế độ «Bỏ qua» để giữ nguyên dữ liệu hiện có và chỉ nhập SKU mới.'],
  ['TH4: Dữ liệu số'],
  ['Giá và số lượng hỗ trợ định dạng 350.000 hoặc 350000.00.'],
  ['TH5: Dữ liệu tùy chọn'],
  ['Các cột không bắt buộc có thể để trống.'],
  ['TH6: Kiểm tra lỗi'],
  ['Sau bước kiểm tra, tải file lỗi để xem cột «Tình trạng» và chỉnh lại dữ liệu.'],
];

export const STATIC_FIELD_GRID: string[][] = [
  ['STT', 'Nhóm', 'Tên cột', 'Diễn giải', 'Giá trị nếu để trống'],
  ['1', 'Thông tin hàng hóa', 'Mã SKU', 'Mã định danh duy nhất của hàng hóa', 'Bắt buộc'],
  ['2', 'Thông tin hàng hóa', 'Tên hàng hóa', 'Tên hiển thị của hàng hóa', 'Bắt buộc'],
  ['3', 'Thông tin hàng hóa', 'Đơn vị tính', 'Đơn vị cơ bản dùng để quản lý tồn kho', 'Bắt buộc'],
  ['4', 'Giá bán', 'Giá bán', 'Giá bán lẻ của hàng hóa', '0'],
  ['5', 'Giá mua', 'Giá mua', 'Giá vốn/giá nhập gần nhất', '0'],
  ['6', 'Kho', 'Vị trí kho', 'Vị trí lưu kho mặc định', ''],
  ['7', 'Hình ảnh', 'Link ảnh hàng hóa', 'URL ảnh sản phẩm', ''],
];
