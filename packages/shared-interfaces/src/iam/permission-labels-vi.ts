/** Vietnamese labels for permission modules (sidebar groups in role editor). */
export const PERMISSION_MODULE_LABELS_VI: Record<string, string> = {
  customer: 'Khách hàng',
  branch: 'Chi nhánh',
  inventory: 'Kho hàng',
  product: 'Hàng hóa',
  pos: 'Bán hàng',
  accounting: 'Kế toán',
  reporting: 'Báo cáo',
  registration: 'Đăng ký',
  'document-numbering': 'Đánh số chứng từ',
  admin: 'Quản trị',
  assignment: 'Phân công',
  'sales-hierarchy': 'Phân cấp bán hàng',
  events: 'Sự kiện',
  crud: 'Dữ liệu danh mục',
  iam: 'Phân quyền & người dùng',
};

/** Vietnamese labels for permission keys (role editor checkboxes). */
export const PERMISSION_LABELS_VI: Record<string, string> = {
  // Khách hàng
  'customer.read': 'Xem khách hàng',
  'customer.write': 'Thêm/sửa khách hàng',
  'customer.merge': 'Gộp khách hàng trùng',

  // Chi nhánh
  'branch.read': 'Xem chi nhánh',
  'branch.write': 'Thêm/sửa chi nhánh',
  'branch.archive': 'Lưu trữ chi nhánh',

  // Kho hàng
  'inventory.read': 'Xem tồn kho',
  'inventory.write': 'Thêm/sửa tồn kho',
  'inventory.item.read': 'Xem danh mục mặt hàng',
  'inventory.item.write': 'Thêm/sửa danh mục mặt hàng',
  'inventory.storage.read': 'Xem kho lưu trữ',
  'inventory.storage.write': 'Thêm/sửa kho lưu trữ',
  'inventory.showroom.read': 'Xem phòng trưng bày',
  'inventory.showroom.write': 'Thêm/sửa phòng trưng bày',
  'inventory.location.read': 'Xem vị trí kho',
  'inventory.location.write': 'Thêm/sửa vị trí kho',
  'inventory.transfer.approve': 'Duyệt phiếu điều chuyển',
  'inventory.adjustment.approve': 'Duyệt phiếu điều chỉnh tồn',
  'inventory.purchase-order.read': 'Xem đơn mua hàng',
  'inventory.purchase-order.create': 'Tạo đơn mua hàng',
  'inventory.purchase-order.approve': 'Duyệt đơn mua hàng',
  'inventory.purchase-order.receive': 'Nhận hàng theo đơn mua',
  'inventory.purchase-order.cancel': 'Hủy đơn mua hàng',
  'inventory.goods-issue.read': 'Xem phiếu xuất kho',
  'inventory.goods-issue.create': 'Tạo phiếu xuất kho',
  'inventory.goods-issue.approve': 'Duyệt phiếu xuất kho',
  'inventory.goods-issue.post': 'Ghi sổ phiếu xuất kho',
  'inventory.goods-issue.cancel': 'Hủy phiếu xuất kho',
  'goods_receipt.read': 'Xem phiếu nhập kho',
  'goods_receipt.write': 'Tạo/sửa/hủy phiếu nhập kho',
  'goods_receipt.post': 'Ghi nhận nhập kho (hoàn tất phiếu nhập)',
  'inventory.transfer.read': 'Xem phiếu điều chuyển',
  'inventory.transfer.create': 'Tạo phiếu điều chuyển',
  'inventory.transfer.post': 'Ghi nhận điều chuyển (hoàn tất)',
  'inventory.transfer.cancel': 'Hủy phiếu điều chuyển',
  'inventory.adjustment.read': 'Xem phiếu điều chỉnh tồn',
  'inventory.adjustment.create': 'Tạo phiếu điều chỉnh tồn',
  'inventory.adjustment.submit': 'Gửi duyệt phiếu điều chỉnh tồn',
  'inventory.adjustment.post': 'Ghi nhận điều chỉnh tồn (hoàn tất)',
  'inventory.adjustment.cancel': 'Hủy phiếu điều chỉnh tồn',
  'inventory.temp-warehouse.read': 'Xem kho tạm và dòng hàng',
  'inventory.temp-warehouse.write': 'Thêm/sửa/xóa dòng kho tạm',
  'inventory.temp-warehouse.close': 'Đóng phiên kho tạm',
  'inventory.manage': 'Quản lý vận hành kho (phạm vi rộng)',

  // Hàng hóa
  'product.read': 'Xem sản phẩm',
  'product.write': 'Thêm/sửa/xóa sản phẩm',

  // Bán hàng (POS)
  'pos.invoice.read': 'Xem hóa đơn bán hàng',
  'pos.invoice.write': 'Tạo/sửa/hủy hóa đơn bán hàng',
  'pos.sale.create': 'Tạo đơn bán hàng',
  'pos.return.create': 'Tạo trả hàng',
  'pos.exchange.create': 'Tạo đổi hàng',
  'pos.session.manage': 'Mở/đóng ca bán hàng',
  'pos.session.approve_variance': 'Duyệt chênh lệch đối soát ca',
  'pos.promotion.read': 'Xem khuyến mãi',
  'pos.promotion.write': 'Thêm/sửa khuyến mãi',

  // Kế toán
  'accounting.journal.post': 'Ghi sổ bút toán',
  'accounting.journal.reverse': 'Đảo bút toán',
  'accounting.payable.manage': 'Quản lý công nợ phải trả',
  'accounting.receivable.manage': 'Quản lý công nợ phải thu',
  'accounting.cash.read': 'Xem quỹ tiền mặt và phát sinh',
  'accounting.cash.create': 'Tạo quỹ và ghi nhận thu/chi',
  'accounting.expenses.read': 'Xem chi phí',
  'accounting.expenses.create': 'Tạo chi phí',
  'accounting.expenses.update': 'Cập nhật chi phí',
  'accounting.payables.read': 'Xem công nợ phải trả',
  'accounting.payables.create': 'Tạo công nợ phải trả',
  'accounting.payables.update': 'Cập nhật công nợ phải trả',
  'accounting.receivables.read': 'Xem công nợ phải thu',
  'accounting.receivables.create': 'Tạo công nợ phải thu',
  'accounting.receivables.update': 'Cập nhật công nợ phải thu',
  'accounting.receivables.write-off': 'Xóa nợ khó đòi',

  // Báo cáo
  'reporting.dashboard.branch.read': 'Xem báo cáo theo chi nhánh',
  'reporting.dashboard.consolidated.read': 'Xem báo cáo tổng hợp',

  // Đăng ký
  'org.registration.submit': 'Gửi đăng ký tổ chức',
  'org.registration.approve': 'Phê duyệt đăng ký tổ chức',
  'branch.registration.submit': 'Gửi đăng ký chi nhánh',
  'branch.registration.approve': 'Phê duyệt đăng ký chi nhánh',

  // Đánh số chứng từ
  'document-numbering.manage': 'Cấu hình quy tắc đánh số chứng từ',

  // Quản trị
  'admin.crud.manage': 'Quản lý cấu hình danh mục hệ thống',

  // Phân công
  'salesman.assign': 'Phân công nhân viên bán hàng cho chi nhánh',
  'salesmanager.assign': 'Phân công quản lý bán hàng cho chi nhánh',
  'storage.manager.assign': 'Phân công quản lý kho cho chi nhánh',

  // Phân cấp bán hàng
  'sales-hierarchy.read': 'Xem phân cấp bán hàng',
  'sales-hierarchy.manage': 'Quản lý phân cấp bán hàng',

  // Sự kiện
  'events.dead-letter.manage': 'Quản lý hàng đợi thư lỗi sự kiện',

  // Dữ liệu danh mục
  'crud.entity.read': 'Xem bản ghi danh mục',
  'crud.entity.create': 'Tạo bản ghi danh mục',
  'crud.entity.update': 'Cập nhật bản ghi danh mục',
  'crud.entity.delete': 'Xóa bản ghi danh mục',

  // Phân quyền & người dùng
  'iam.user.read': 'Xem người dùng',
  'iam.user.write': 'Thêm/sửa người dùng và đặt lại mật khẩu',
  'iam.user.delete': 'Ngừng hoạt động người dùng',
  'iam.role.read': 'Xem vai trò',
  'iam.role.write': 'Thêm/sửa vai trò',
  'iam.role.delete': 'Xóa vai trò (không áp dụng vai trò hệ thống)',
  'iam.role.permissions.write': 'Gán/thu hồi quyền cho vai trò',
  'iam.user.roles.write': 'Gán vai trò cho người dùng',
  'iam.user.branches.write': 'Gán chi nhánh cho người dùng',
  'iam.permission.read': 'Xem danh mục quyền',
};

export function permissionLabelVi(
  key: string,
  description?: string | null,
): string {
  return PERMISSION_LABELS_VI[key] ?? description?.trim() ?? key;
}

export function permissionModuleLabelVi(module: string): string {
  return PERMISSION_MODULE_LABELS_VI[module] ?? module;
}
