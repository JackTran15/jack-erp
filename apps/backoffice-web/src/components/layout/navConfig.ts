import { LayoutDashboard, Settings, Warehouse, BarChart3, GitBranch, ClipboardCheck, Building2, Users } from "lucide-react";
import type { ComponentType } from "react";

export interface NavChild {
  to: string;
  label: string;
  end?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  children: NavChild[];
}

export const navConfig: NavSection[] = [
  {
    id: "overview",
    label: "Tổng quan",
    icon: LayoutDashboard,
    children: [
      { to: "/", label: "Bảng điều khiển", end: true },
    ],
  },
  {
    id: "inventory",
    label: "Kho hàng",
    icon: Warehouse,
    children: [
      { to: "/inventory-management", label: "Quản lý kho" },
      { to: "/inventory/purchase-orders", label: "Phiếu đặt hàng" },
      { to: "/inventory/goods-issues", label: "Phiếu xuất hàng" },
    ],
  },
  {
    id: "customers",
    label: "Khách hàng",
    icon: Users,
    children: [
      { to: "/admin/customers", label: "Danh sách khách hàng" },
    ],
  },
  {
    id: "reports",
    label: "Báo cáo",
    icon: BarChart3,
    children: [
      { to: "/reports", label: "Tổng hợp", end: true },
      { to: "/reports/sales", label: "Doanh số" },
      { to: "/reports/inventory", label: "Tồn kho" },
      { to: "/reports/aging", label: "Công nợ" },
      { to: "/reports/cash", label: "Tiền mặt" },
    ],
  },
  {
    id: "branch",
    label: "Chi nhánh",
    icon: GitBranch,
    children: [
      { to: "/branch-management/sales-hierarchy", label: "Cấp bậc kinh doanh" },
    ],
  },
  {
    id: "onboarding",
    label: "Đăng ký & Phê duyệt",
    icon: ClipboardCheck,
    children: [
      { to: "/onboarding/approvals", label: "Phê duyệt" },
      { to: "/onboarding/org-registration", label: "Đăng ký tổ chức" },
      { to: "/onboarding/branch-registration", label: "Đăng ký chi nhánh" },
    ],
  },
  {
    id: "settings",
    label: "Cấu hình",
    icon: Settings,
    children: [
      { to: "/setup", label: "Thiết lập chung" },
    ],
  },
];
