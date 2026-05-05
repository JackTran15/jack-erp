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
  LayoutGrid,
  Box,
  Truck,
  UserSquare,
  BookOpen,
  Receipt,
  FileText,
  DollarSign,
  Hash,
  Layers,
} from "lucide-react";
import type { ComponentType } from "react";

export interface NavChild {
  to: string;
  label: string;
  end?: boolean;
  icon?: ComponentType<{ className?: string }>;
}

export interface NavSection {
  id: string;
  label?: string;
  children: NavChild[];
}

export interface NavModule {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  defaultPath: string;
  sections: NavSection[];
  /**
   * When true the sidebar renders sections as a flyout mega-menu panel
   * (multi-column, positioned to the right of the sidebar) instead of
   * the standard single-column collapsible list.
   */
  flyout?: boolean;
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
          { to: "/", label: "Bảng điều khiển", end: true, icon: LayoutDashboard },
        ],
      },
    ],
  },
  {
    id: "inventory",
    label: "Kho hàng",
    icon: Warehouse,
    defaultPath: "/inventory-management",
    sections: [
      {
        id: "inventory-main",
        children: [
          { to: "/inventory-management", label: "Quản lý kho", icon: Package },
          { to: "/products", label: "Sản phẩm", icon: Layers },
          { to: "/inventory/purchase-orders", label: "Phiếu đặt hàng", icon: ShoppingCart },
          { to: "/inventory/goods-issues", label: "Phiếu xuất hàng", icon: PackageMinus },
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
          { to: "/admin/customers", label: "Danh sách khách hàng", icon: Users },
        ],
      },
    ],
  },
  {
    id: "reports",
    label: "Báo cáo",
    icon: BarChart3,
    defaultPath: "/reports",
    sections: [
      {
        id: "reports-overview",
        label: "Tổng hợp",
        children: [
          { to: "/reports", label: "Bảng tổng hợp", end: true, icon: BarChart3 },
        ],
      },
      {
        id: "reports-detail",
        label: "Chi tiết",
        children: [
          { to: "/reports/sales", label: "Doanh số", icon: TrendingUp },
          { to: "/reports/inventory", label: "Tồn kho", icon: PackageOpen },
          { to: "/reports/aging", label: "Công nợ", icon: CreditCard },
          { to: "/reports/cash", label: "Tiền mặt", icon: Banknote },
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
          { to: "/branch-management/sales-hierarchy", label: "Cấp bậc kinh doanh", icon: GitBranch },
        ],
      },
    ],
  },
  {
    id: "onboarding",
    label: "Đăng ký & Phê duyệt",
    icon: ClipboardCheck,
    defaultPath: "/onboarding/approvals",
    sections: [
      {
        id: "onboarding-main",
        children: [
          { to: "/onboarding/approvals", label: "Hàng chờ phê duyệt", icon: CheckSquare },
          { to: "/onboarding/org-registration", label: "Đăng ký tổ chức", icon: Building2 },
          { to: "/onboarding/branch-registration", label: "Đăng ký chi nhánh", icon: PlusCircle },
        ],
      },
    ],
  },
  {
    id: "danh-muc",
    label: "Danh mục",
    icon: LayoutGrid,
    defaultPath: "/admin/inventory-items",
    flyout: true,
    sections: [
      {
        id: "danh-muc-hang-hoa",
        label: "HÀNG HÓA",
        children: [
          { to: "/admin/inventory-items",          label: "Hàng hóa",    icon: Box },
          { to: "/admin/inventory-providers",      label: "Nhà cung cấp", icon: Truck },
          { to: "/admin/inventory-storages",       label: "Kho hàng",    icon: Warehouse },
          { to: "/admin/inventory-stock-balances", label: "Tồn kho",     icon: Package },
        ],
      },
      {
        id: "danh-muc-khach-hang",
        label: "KHÁCH HÀNG",
        children: [
          { to: "/admin/customers", label: "Khách hàng", icon: UserSquare },
        ],
      },
      {
        id: "danh-muc-ke-toan",
        label: "KẾ TOÁN",
        children: [
          { to: "/admin/accounts",     label: "Tài khoản kế toán", icon: BookOpen },
          { to: "/admin/payables",     label: "Phải trả",          icon: Receipt },
          { to: "/admin/receivables",  label: "Phải thu",          icon: FileText },
          { to: "/admin/expenses",     label: "Chi phí",           icon: DollarSign },
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
          { to: "/setup", label: "Thiết lập chung", icon: Settings },
          { to: "/settings/document-numbering", label: "Đánh số chứng từ", icon: Hash },
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
