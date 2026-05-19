import type { PermissionItem, PermissionModule } from "./role-management.types";

const MODULE_LABELS: Record<string, string> = {
  customer: "Khách hàng",
  branch: "Chi nhánh",
  inventory: "Kho hàng",
  product: "Hàng hóa",
  pos: "Bán hàng",
  accounting: "Kế toán",
  reporting: "Báo cáo",
  registration: "Đăng ký",
  "document-numbering": "Đánh số chứng từ",
  admin: "Quản trị",
  assignment: "Phân công",
  "sales-hierarchy": "Phân cấp bán hàng",
  events: "Sự kiện",
  crud: "Dữ liệu danh mục",
};

const PERMISSION_LABELS_VI: Record<string, string> = {
  "customer.read": "Xem khách hàng",
  "customer.write": "Thêm/sửa khách hàng",
  "customer.merge": "Gộp khách hàng trùng",
  "branch.read": "Xem chi nhánh",
  "branch.write": "Thêm/sửa chi nhánh",
  "branch.archive": "Lưu trữ chi nhánh",
  "inventory.read": "Xem kho",
  "inventory.write": "Thêm/sửa kho",
  "inventory.item.read": "Xem danh mục hàng",
  "inventory.item.write": "Thêm/sửa danh mục hàng",
  "inventory.storage.read": "Xem kho lưu trữ",
  "inventory.storage.write": "Thêm/sửa kho lưu trữ",
  "inventory.showroom.read": "Xem phòng trưng bày",
  "inventory.showroom.write": "Thêm/sửa phòng trưng bày",
  "inventory.location.read": "Xem vị trí kho",
  "inventory.location.write": "Thêm/sửa vị trí kho",
  "inventory.transfer.approve": "Duyệt điều chuyển",
  "inventory.adjustment.approve": "Duyệt điều chỉnh kho",
  "inventory.purchase-order.read": "Xem đơn đặt hàng",
  "inventory.purchase-order.create": "Tạo đơn đặt hàng",
  "inventory.purchase-order.approve": "Duyệt đơn đặt hàng",
  "inventory.purchase-order.receive": "Nhận hàng đơn đặt",
  "inventory.purchase-order.cancel": "Hủy đơn đặt hàng",
  "inventory.goods-issue.read": "Xem phiếu xuất kho",
  "inventory.goods-issue.create": "Tạo phiếu xuất kho",
  "inventory.goods-issue.approve": "Duyệt phiếu xuất kho",
  "inventory.goods-issue.post": "Ghi sổ phiếu xuất kho",
  "inventory.goods-issue.cancel": "Hủy phiếu xuất kho",
  "goods_receipt.read": "Xem phiếu nhập kho",
  "goods_receipt.write": "Thêm/sửa phiếu nhập kho",
  "goods_receipt.post": "Ghi sổ phiếu nhập kho",
  "inventory.transfer.read": "Xem điều chuyển",
  "inventory.transfer.create": "Tạo điều chuyển",
  "inventory.transfer.post": "Ghi sổ điều chuyển",
  "inventory.transfer.cancel": "Hủy điều chuyển",
  "inventory.adjustment.read": "Xem điều chỉnh kho",
  "inventory.adjustment.create": "Tạo điều chỉnh kho",
  "inventory.adjustment.submit": "Gửi điều chỉnh kho",
  "inventory.adjustment.post": "Ghi sổ điều chỉnh kho",
  "inventory.adjustment.cancel": "Hủy điều chỉnh kho",
  "inventory.temp-warehouse.read": "Xem kho tạm",
  "inventory.temp-warehouse.write": "Xuất / trả hàng từ kho tạm",
  "inventory.temp-warehouse.close": "Đóng phiên kho tạm",
  "inventory.manage": "Quản lý kho (toàn quyền)",
  "product.read": "Xem hàng hóa",
  "product.write": "Thêm/sửa hàng hóa",
  "pos.invoice.read": "Xem hóa đơn POS",
  "pos.invoice.write": "Thêm/sửa/hủy hóa đơn POS",
  "pos.sale.create": "Tạo bán hàng POS",
  "pos.return.create": "Tạo trả hàng POS",
  "pos.exchange.create": "Tạo đổi hàng POS",
  "pos.session.manage": "Quản lý ca bán hàng",
  "pos.session.approve_variance": "Duyệt chênh lệch ca",
  "pos.promotion.read": "Xem khuyến mại POS",
  "pos.promotion.write": "Thêm/sửa khuyến mại POS",
  "accounting.journal.post": "Ghi sổ bút toán",
  "accounting.journal.reverse": "Đảo bút toán",
  "accounting.payable.manage": "Quản lý công nợ phải trả",
  "accounting.receivable.manage": "Quản lý công nợ phải thu",
  "accounting.cash.read": "Xem quỹ tiền mặt",
  "accounting.cash.create": "Ghi nhận quỹ tiền mặt",
  "accounting.expenses.read": "Xem chi phí",
  "accounting.expenses.create": "Tạo chi phí",
  "accounting.expenses.update": "Cập nhật chi phí",
  "accounting.payables.read": "Xem phải trả",
  "accounting.payables.create": "Tạo phải trả",
  "accounting.payables.update": "Cập nhật phải trả",
  "accounting.receivables.read": "Xem phải thu",
  "accounting.receivables.create": "Tạo phải thu",
  "accounting.receivables.update": "Cập nhật phải thu",
  "accounting.receivables.write-off": "Xóa nợ phải thu",
  "reporting.dashboard.branch.read": "Bảng điều khiển chi nhánh",
  "reporting.dashboard.consolidated.read": "Bảng điều khiển tổng hợp",
  "org.registration.submit": "Gửi đăng ký tổ chức",
  "org.registration.approve": "Duyệt đăng ký tổ chức",
  "branch.registration.submit": "Gửi đăng ký chi nhánh",
  "branch.registration.approve": "Duyệt đăng ký chi nhánh",
  "document-numbering.manage": "Quản lý đánh số chứng từ",
  "admin.crud.manage": "Quản lý cấu hình CRUD",
  "salesman.assign": "Phân công nhân viên bán hàng",
  "salesmanager.assign": "Phân công quản lý bán hàng",
  "storage.manager.assign": "Phân công quản lý kho",
  "sales-hierarchy.read": "Xem phân cấp bán hàng",
  "sales-hierarchy.manage": "Quản lý phân cấp bán hàng",
  "events.dead-letter.manage": "Quản lý hàng đợi lỗi",
  "crud.entity.read": "Xem bản ghi danh mục",
  "crud.entity.create": "Tạo bản ghi danh mục",
  "crud.entity.update": "Cập nhật bản ghi danh mục",
  "crud.entity.delete": "Xóa bản ghi danh mục",
};

interface SeedRow {
  key: string;
  description: string;
  module: string;
}

const PERMISSION_SEEDS: SeedRow[] = [
  { key: "customer.read", description: "View customer records", module: "customer" },
  { key: "customer.write", description: "Create and update customer records", module: "customer" },
  { key: "customer.merge", description: "Merge duplicate customer records", module: "customer" },
  { key: "branch.read", description: "View branch information", module: "branch" },
  { key: "branch.write", description: "Create and update branches", module: "branch" },
  { key: "branch.archive", description: "Archive branches", module: "branch" },
  { key: "inventory.read", description: "View inventory records", module: "inventory" },
  { key: "inventory.write", description: "Create and update inventory records", module: "inventory" },
  { key: "inventory.item.read", description: "View item master data", module: "inventory" },
  { key: "inventory.item.write", description: "Create and update item master data", module: "inventory" },
  { key: "inventory.storage.read", description: "View storage records", module: "inventory" },
  { key: "inventory.storage.write", description: "Create and update storage records", module: "inventory" },
  { key: "inventory.purchase-order.read", description: "View purchase orders", module: "inventory" },
  { key: "inventory.purchase-order.create", description: "Create purchase orders", module: "inventory" },
  { key: "inventory.goods-issue.read", description: "View goods issues", module: "inventory" },
  { key: "inventory.goods-issue.create", description: "Create goods issues", module: "inventory" },
  { key: "goods_receipt.read", description: "View goods receipts", module: "inventory" },
  { key: "goods_receipt.write", description: "Create/update goods receipts", module: "inventory" },
  { key: "inventory.transfer.read", description: "View inventory transfers", module: "inventory" },
  { key: "inventory.transfer.create", description: "Create inventory transfers", module: "inventory" },
  { key: "inventory.temp-warehouse.read", description: "View temp warehouse", module: "inventory" },
  { key: "inventory.temp-warehouse.write", description: "Temp warehouse in/out", module: "inventory" },
  { key: "inventory.manage", description: "Manage inventory operations", module: "inventory" },
  { key: "product.read", description: "View product records", module: "product" },
  { key: "product.write", description: "Create, update and delete product records", module: "product" },
  { key: "pos.invoice.read", description: "View POS invoices", module: "pos" },
  { key: "pos.invoice.write", description: "Create, update and cancel POS invoices", module: "pos" },
  { key: "pos.sale.create", description: "Create POS sales", module: "pos" },
  { key: "pos.return.create", description: "Create POS returns", module: "pos" },
  { key: "pos.session.manage", description: "Open and close POS sessions", module: "pos" },
  { key: "pos.promotion.read", description: "View POS promotions", module: "pos" },
  { key: "pos.promotion.write", description: "Create and update POS promotions", module: "pos" },
  { key: "accounting.cash.read", description: "View cash accounts", module: "accounting" },
  { key: "accounting.cash.create", description: "Create cash accounts", module: "accounting" },
  { key: "accounting.expenses.read", description: "View expense records", module: "accounting" },
  { key: "accounting.expenses.create", description: "Create expense records", module: "accounting" },
  { key: "accounting.journal.post", description: "Post journal entries", module: "accounting" },
  { key: "reporting.dashboard.branch.read", description: "View branch dashboards", module: "reporting" },
  { key: "reporting.dashboard.consolidated.read", description: "View consolidated dashboards", module: "reporting" },
  { key: "document-numbering.manage", description: "Manage document numbering", module: "document-numbering" },
  { key: "crud.entity.read", description: "Read CRUD entity records", module: "crud" },
  { key: "crud.entity.create", description: "Create CRUD entity records", module: "crud" },
  { key: "crud.entity.update", description: "Update CRUD entity records", module: "crud" },
  { key: "crud.entity.delete", description: "Delete CRUD entity records", module: "crud" },
];

function permissionIdFromKey(key: string): string {
  return `perm-${key.replace(/\./g, "-")}`;
}

function buildCatalog(): PermissionModule[] {
  const byModule = new Map<string, PermissionItem[]>();

  for (const seed of PERMISSION_SEEDS) {
    const item: PermissionItem = {
      id: permissionIdFromKey(seed.key),
      key: seed.key,
      label: PERMISSION_LABELS_VI[seed.key] ?? seed.description,
      moduleId: seed.module,
    };
    const list = byModule.get(seed.module) ?? [];
    list.push(item);
    byModule.set(seed.module, list);
  }

  return [...byModule.entries()].map(([moduleId, permissions]) => ({
    id: moduleId,
    label: MODULE_LABELS[moduleId] ?? moduleId,
    permissions,
  }));
}

export const PERMISSION_MODULES: PermissionModule[] = buildCatalog();

export const ALL_PERMISSION_ITEMS: PermissionItem[] = PERMISSION_MODULES.flatMap(
  (m) => m.permissions,
);

export function getPermissionById(id: string): PermissionItem | undefined {
  return ALL_PERMISSION_ITEMS.find((p) => p.id === id);
}

export function getModuleById(moduleId: string): PermissionModule | undefined {
  return PERMISSION_MODULES.find((m) => m.id === moduleId);
}
