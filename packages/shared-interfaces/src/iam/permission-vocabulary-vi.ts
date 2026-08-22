/**
 * Short Vietnamese vocabulary for permission keys: the noun of the resource a
 * key acts on, and the verb of its action. PERMISSION_LABELS_VI holds the full
 * sentence for the same key (used as the seeded DB description and as a
 * tooltip); this file holds the two halves the role editor renders as a card
 * title plus a checkbox label.
 */

/** Card titles, keyed by resource id (permission key minus its action). */
export const PERMISSION_RESOURCE_LABELS_VI: Record<string, string> = {
  // Bán hàng
  "pos.invoice": "Hóa đơn bán hàng",
  "pos.sale": "Đơn bán hàng",
  "pos.return": "Trả hàng",
  "pos.exchange": "Đổi hàng",
  "pos.session": "Ca bán hàng",
  "pos.promotion": "Khuyến mãi",
  promotion: "Chương trình khuyến mại",
  customer: "Khách hàng",

  // Kho hàng & hàng hóa
  inventory: "Tồn kho",
  "inventory.item": "Danh mục mặt hàng",
  "inventory.location": "Vị trí kho",
  "inventory.storage": "Kho lưu trữ",
  "inventory.showroom": "Phòng trưng bày",
  "inventory.temp-warehouse": "Kho tạm",
  goods_receipt: "Phiếu nhập kho",
  "inventory.purchase-order": "Đơn mua hàng",
  "inventory.goods-issue": "Phiếu xuất kho",
  "inventory.transfer": "Phiếu điều chuyển",
  "inventory.adjustment": "Phiếu điều chỉnh tồn",
  product: "Sản phẩm",

  // Kế toán — tiền mặt
  "accounting.cash": "Quỹ tiền mặt",
  "accounting.cash_receipt": "Phiếu thu tiền mặt",
  "accounting.cash_payment": "Phiếu chi tiền mặt",
  "accounting.cash_count": "Kiểm kê tiền mặt",
  "accounting.cash_transfer": "Chuyển tiền mặt liên chi nhánh",
  "accounting.cash_ledger": "Sổ chi tiết tiền mặt",
  "accounting.cash_voucher_category": "Loại phiếu thu/chi",
  "accounting.cash_voucher_partner": "Đối tượng phiếu thu/chi",

  // Kế toán — tiền gửi & ngân hàng
  "accounting.bank": "Ngân hàng",
  "accounting.payment_account": "Tài khoản thanh toán",
  "accounting.deposit_account": "Tài khoản tiền gửi",
  "accounting.bank_receipt": "Phiếu thu tiền gửi",
  "accounting.bank_payment": "Phiếu chi tiền gửi",
  "accounting.deposit_transfer": "Chuyển tiền gửi liên chi nhánh",
  "accounting.fund_swap": "Chuyển tiền mặt / tiền gửi",
  "accounting.deposit_recon": "Đối chiếu tiền gửi",
  "accounting.deposit_period": "Khóa sổ tiền gửi",
  "accounting.deposit_ledger": "Sổ chi tiết tiền gửi",
  "accounting.deposit_payment_policy": "Chính sách thanh toán tiền gửi",
  "accounting.deposit_dashboard": "Dashboard số dư tiền gửi",
  "accounting.deposit_movement": "Bút toán tiền gửi",
  "accounting.deposit_audit": "Nhật ký kiểm toán tiền gửi",

  // Kế toán — công nợ, chi phí
  "accounting.receivables": "Công nợ phải thu",
  "accounting.payables": "Công nợ phải trả",
  "accounting.expenses": "Chi phí",
  "accounting.journal": "Bút toán",

  // Báo cáo
  "reporting.dashboard": "Báo cáo",
  "reporting.invoice": "Báo cáo hóa đơn",
  "reporting.invoice-template": "Mẫu báo cáo hóa đơn",
  "reporting.debts": "Báo cáo công nợ",
  "reporting.profit": "Báo cáo lợi nhuận",
  "inventory.reports": "Báo cáo nhập xuất tồn",

  // Hệ thống
  "iam.user": "Người dùng",
  "iam.role": "Vai trò",
  "iam.permission": "Danh mục quyền",
  branch: "Chi nhánh",
  salesman: "Nhân viên bán hàng",
  salesmanager: "Quản lý bán hàng",
  "storage.manager": "Quản lý kho",
  "sales-hierarchy": "Phân cấp bán hàng",
  "org.registration": "Đăng ký tổ chức",
  "branch.registration": "Đăng ký chi nhánh",
  "document-numbering": "Đánh số chứng từ",
  "crud.entity": "Bản ghi danh mục",
  "admin.crud": "Cấu hình danh mục hệ thống",
  "events.dead-letter": "Hàng đợi thư lỗi sự kiện",
};

/** Resources that are the same nghiệp vụ under two key prefixes. */
export const PERMISSION_RESOURCE_ALIASES: Record<string, string> = {
  "accounting.payable": "accounting.payables",
  "accounting.receivable": "accounting.receivables",
};

/** Short labels for the action segment of a permission key. */
export const PERMISSION_ACTION_LABELS_VI: Record<string, string> = {
  read: "Xem",
  create: "Thêm",
  update: "Sửa",
  delete: "Xóa",
  write: "Thêm/sửa",
  manage: "Quản lý",
  post: "Ghi sổ",
  reverse: "Đảo",
  approve: "Duyệt",
  submit: "Gửi duyệt",
  cancel: "Hủy",
  confirm: "Xác nhận",
  close: "Đóng",
  lock: "Khóa sổ",
  unlock: "Mở khóa",
  reconcile: "Đối chiếu",
  unreconcile: "Hủy đối chiếu",
  export: "Xuất khẩu",
  import: "Nhập khẩu",
  assign: "Phân công",
  merge: "Gộp trùng",
  archive: "Lưu trữ",
  receive: "Nhận hàng",
  disposal: "Hủy hàng",
  "write-off": "Xóa nợ khó đòi",
  "other-issue": "Xuất mục đích khác",
  "other-receipt": "Nhập khác",
  approve_variance: "Duyệt chênh lệch",
  evaluate: "Áp dụng khuyến mãi",
  "read.all": "Xem mọi chi nhánh",
  "roles.write": "Gán vai trò",
  "branches.write": "Gán chi nhánh",
  "branches.write.all": "Gán mọi chi nhánh",
  "permissions.write": "Gán/thu hồi quyền",
  "branch.read": "Theo chi nhánh",
  "consolidated.read": "Tổng hợp toàn chuỗi",
};

/** Checkbox order inside a card; unlisted actions keep catalogue order at the end. */
export const PERMISSION_ACTION_ORDER = [
  "read",
  "write",
  "create",
  "update",
  "delete",
  "submit",
  "approve",
  "confirm",
  "receive",
  "post",
  "reverse",
  "cancel",
  "close",
  "lock",
  "unlock",
  "reconcile",
  "unreconcile",
  "export",
  "import",
  "assign",
  "manage",
];

/** Per-key overrides where the generic action label would be misleading. */
export const PERMISSION_SHORT_LABELS_VI: Record<string, string> = {
  "inventory.manage": "Quản lý vận hành (phạm vi rộng)",
  "inventory.transfer.export": "Xác nhận xuất kho",
  "inventory.transfer.import": "Xác nhận nhập kho",
  "inventory.transfer.post": "Hoàn tất điều chuyển",
  "inventory.adjustment.post": "Hoàn tất điều chỉnh",
  "inventory.purchase-order.receive": "Nhận hàng theo đơn",
  "goods_receipt.write": "Tạo/sửa/hủy",
  "goods_receipt.post": "Ghi nhận nhập kho",
  "pos.session.manage": "Mở/đóng ca",
  "accounting.cash.create": "Tạo quỹ & ghi thu/chi",
  "accounting.fund_swap.create": "Chuyển tiền",
  "accounting.deposit_recon.export": "Xuất Excel",
  "accounting.cash_transfer.create": "Tạo lệnh chuyển",
  "accounting.deposit_transfer.create": "Tạo lệnh chuyển",
  "iam.role.delete": "Xóa (trừ vai trò hệ thống)",
};

/**
 * Splits a permission key into the resource it acts on and its action, using
 * the longest registered resource prefix. Falls back to the first two segments
 * so keys added after this file was written still resolve to something.
 */
export function resolvePermissionResource(key: string): {
  resourceId: string;
  action: string;
} {
  const segments = key.split(".");
  for (let take = segments.length - 1; take >= 1; take -= 1) {
    const candidate = segments.slice(0, take).join(".");
    if (
      PERMISSION_RESOURCE_LABELS_VI[candidate] ||
      PERMISSION_RESOURCE_ALIASES[candidate]
    ) {
      return {
        resourceId: PERMISSION_RESOURCE_ALIASES[candidate] ?? candidate,
        action: segments.slice(take).join("."),
      };
    }
  }
  if (segments.length >= 3) {
    return {
      resourceId: segments.slice(0, 2).join("."),
      action: segments.slice(2).join("."),
    };
  }
  return { resourceId: segments[0], action: segments[1] ?? "" };
}

/** Card title for a resource id; falls back to the humanized id. */
export function permissionResourceLabelVi(resourceId: string): string {
  return (
    PERMISSION_RESOURCE_LABELS_VI[resourceId] ??
    resourceId.split(".").pop()!.replace(/[-_]/g, " ")
  );
}

/**
 * Checkbox label for a permission key: the per-key override, else the verb of
 * its action, else `fallback` (normally the full label from
 * PERMISSION_LABELS_VI).
 */
export function permissionShortLabelVi(
  key: string,
  action: string,
  fallback: string,
): string {
  return (
    PERMISSION_SHORT_LABELS_VI[key] ??
    PERMISSION_ACTION_LABELS_VI[action] ??
    fallback
  );
}

/** Sort weight for an action inside a card; unlisted actions go last. */
export function permissionActionWeight(action: string): number {
  const index = PERMISSION_ACTION_ORDER.indexOf(action);
  return index === -1 ? PERMISSION_ACTION_ORDER.length : index;
}
