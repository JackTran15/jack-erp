import {
  LayoutDashboard,
  Settings,
  Warehouse,
  BarChart3,
  GitBranch,
  ClipboardCheck,
  Users,
  ShoppingCart,
  PackageOpen,
  PackageMinus,
  TrendingUp,
  Package,
  CreditCard,
  Banknote,
  Building2,
  CheckSquare,
  PlusCircle,
  Box,
  Truck,
  UserSquare,
  BookOpen,
  Receipt,
  FileText,
  DollarSign,
  Hash,
  Layers,
  LayoutGrid
} from "lucide-react";
import type { ComponentType } from "react";

export interface NavChild {
  to: string;
  label: string;
  end?: boolean;
}

export interface NavSection {
  id: string;
  label?: string;
  children: NavChild[];
}

/** Mega menu configuration for the sidebar. */
export interface NavModuleFlyout {
  enabled: boolean;
  splitLeft?: string[];
  splitRight?: string[];
}

export interface NavModule {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  defaultPath: string;
  sections: NavSection[];
  flyout?: NavModuleFlyout;
}

export function isFlyoutEnabled(module: NavModule): boolean {
  return module.flyout?.enabled === true;
}

export const navConfig: NavModule[] = [
  {
    id: "overview",
    label: "Tổng quan",
    icon: LayoutDashboard,
    defaultPath: "/",
    sections: [
      {
        id: "overview-main",
        children: [
          { to: "/", label: "Bảng điều khiển", end: true },
        ],
      },
    ],
  },
  {
    id: "inventory",
    label: "Kho hàng",
    icon: Warehouse,
    defaultPath: "/inventory-management",
    flyout: { enabled: true },
    sections: [
      {
        id: "inventory-main",
        children: [
          { to: "/inventory-management", label: "Quản lý kho", },
          { to: "/products", label: "Sản phẩm", },
          { to: "/inventory/purchase-orders", label: "Phiếu đặt hàng", },
          { to: "/inventory/goods-issues", label: "Phiếu xuất hàng", },
          { to: "/inventory-management", label: "Quản lý kho", },
          { to: "/inventory/purchase-orders", label: "Phiếu đặt hàng", },
          { to: "/inventory/goods-issues", label: "Phiếu xuất hàng", },
        ],
      },
    ],
  },
  {
    id: "customers",
    label: "Khách hàng",
    icon: Users,
    defaultPath: "/admin/customers",
    sections: [
      {
        id: "customers-main",
        children: [
          { to: "/admin/customers", label: "Danh sách khách hàng", },
        ],
      },
    ],
  },
  {
    id: "reports",
    label: "Báo cáo",
    icon: BarChart3,
    defaultPath: "/reports",
    flyout: { enabled: true },
    sections: [
      {
        id: "reports-overview",
        label: "Tổng hợp",
        children: [
          { to: "/reports", label: "Bảng tổng hợp", end: true },
        ],
      },
      {
        id: "reports-detail",
        label: "Chi tiết",
        children: [
          { to: "/reports/sales", label: "Doanh số", },
          { to: "/reports/inventory", label: "Tồn kho", },
          { to: "/reports/aging", label: "Công nợ", },
          { to: "/reports/cash", label: "Tiền mặt", },
        ],
      },
    ],
  },
  {
    id: "branch",
    label: "Chi nhánh",
    icon: GitBranch,
    defaultPath: "/branch-management/sales-hierarchy",
    sections: [
      {
        id: "branch-main",
        children: [
          { to: "/branch-management/sales-hierarchy", label: "Cấp bậc kinh doanh", },
        ],
      },
    ],
  },
  {
    id: "onboarding",
    label: "Đăng ký & Phê duyệt",
    icon: ClipboardCheck,
    defaultPath: "/onboarding/approvals",
    flyout: { enabled: true },
    sections: [
      {
        id: "onboarding-main",
        children: [
          { to: "/onboarding/approvals", label: "Hàng chờ phê duyệt", },
          { to: "/onboarding/org-registration", label: "Đăng ký tổ chức", },
          { to: "/onboarding/branch-registration", label: "Đăng ký chi nhánh", },
        ],
      },
    ],
  },
  {
    id: "catalog",
    label: "Danh mục",
    icon: LayoutGrid,
    defaultPath: "/admin/inventory-items",
    flyout: {
      enabled: true,
      splitLeft: ["catalog-goods", "catalog-customers", "catalog-suppliers"],
      splitRight: ["catalog-receipts-expenses", "catalog-misc"],
    },
    sections: [
      {
        id: "catalog-goods",
        label: "HÀNG HÓA",
        children: [
          { to: "/admin/inventory-item-groups", label: "Nhóm hàng hoá" },
          { to: "/admin/inventory-items", label: "Hàng hoá" },
          {
            to: "/admin/inventory-item-units", label: "Đơn vị tính" },
          { to: "/admin/inventory-item-barcodes", label: "In tem mã" },
          {
            to: "/admin/inventory-item-prices", label: "Bảng giá" },
          { to: "/admin/inventory-storages", label: "Kho hàng" },
          { to: "/admin/inventory-stock-balances", label: "Tồn kho" },
        ],
      },
      {
        id: "catalog-receipts-expenses",
        label: "THU, CHI",
        children: [
          { to: "/admin/accounts", label: "Tài khoản kế toán" },
          { to: "/admin/payables", label: "Phải trả" },
          { to: "/admin/receivables", label: "Phải thu" },
          { to: "/admin/expenses", label: "Chi phí" },
        ],
      },
      {
        id: "catalog-customers",
        label: "KHÁCH HÀNG",
        children: [
          { to: "/admin/customer-groups", label: "Nhóm khách hàng" },
          { to: "/admin/customers", label: "Khách hàng" },
        ],
      },
      {
        id: "catalog-misc",
        label: "KHÁC",
        children: [
          { to: "/admin/employees", label: "Nhân viên" },
          { to: "/admin/job-positions", label: "Vị trí công việc" },
          { to: "/admin/stores", label: "Cửa hàng" },
          { to: "/admin/cash-boxes", label: "Két đựng tiền" },
          { to: "/admin/work-shifts", label: "Ca làm việc" },
          { to: "/admin/payment-methods", label: "Phương thức dịch vụ và thanh toán" },
          { to: "/admin/bank-accounts", label: "Tài khoản ngân hàng" },
          { to: "/admin/sales-channels", label: "Kênh bán hàng" },
        ],
      },
      {
        id: "catalog-suppliers",
        label: "NHÀ CUNG CẤP",
        children: [
          { to: "/admin/provider-groups", label: "Nhóm nhà cung cấp" },
          { to: "/admin/inventory-providers", label: "Nhà cung cấp" },
          { to: "/admin/delivery-partners", label: "Đối tác giao hàng" },
        ],
      },
    ],
  },
  {
    id: "settings",
    label: "Cấu hình",
    icon: Settings,
    defaultPath: "/setup",
    sections: [
      {
        id: "settings-main",
        children: [
          { to: "/setup", label: "Thiết lập chung", },
          { to: "/settings/document-numbering", label: "Đánh số chứng từ", },
          { to: "/setup", label: "Thiết lập chung" },
        ],
      },
    ],
  },
];

export function activeModuleFor(
  pathname: string,
  config: NavModule[],
): NavModule | undefined {
  return config.find((mod) =>
    mod.sections.some((section) =>
      section.children.some((child) => {
        if (child.end) return pathname === child.to;
        return pathname === child.to || pathname.startsWith(child.to + "/");
      }),
    ),
  );
}
