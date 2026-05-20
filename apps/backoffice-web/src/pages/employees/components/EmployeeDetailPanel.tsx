import { useMemo, useState, type ReactNode } from "react";
import type { RoleSummary, UserDetail, UserSummary } from "@erp/shared-interfaces";
import { cn } from "@erp/ui";
import { formatIamDateTime } from "../../../lib/iam";
import { resolveUserRoles } from "../employee.mappers";
import { EmployeeRolesTab } from "./EmployeeRolesTab";

interface EmployeeDetailPanelProps {
  user: UserDetail | UserSummary | null;
  roles: RoleSummary[];
}

export enum EmployeeDetailTabEnum {
  ACCOUNT = "account",
  ROLES = "roles",
  CONTACT = "contact",
}

export const EMPLOYEE_DETAIL_TAB_LABELS: Record<EmployeeDetailTabEnum, string> =
  {
    [EmployeeDetailTabEnum.ACCOUNT]: "Tài khoản",
    [EmployeeDetailTabEnum.ROLES]: "Vai trò",
    [EmployeeDetailTabEnum.CONTACT]: "Liên hệ (HR)",
  };

export function EmployeeDetailPanel({ user, roles }: EmployeeDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<EmployeeDetailTabEnum>(
    EmployeeDetailTabEnum.ACCOUNT,
  );

  const tabs = useMemo<EmployeeDetailTabEnum[]>(
    () => Object.values(EmployeeDetailTabEnum),
    [],
  );

  const assignedRoles = useMemo(() => {
    if (!user || !("roleIds" in user)) return [];
    return resolveUserRoles(user.roleIds, roles);
  }, [roles, user]);

  const detailTabPanels = useMemo<Record<
    EmployeeDetailTabEnum,
    ReactNode
  > | null>(() => {
    if (!user) return null;
    return {
      [EmployeeDetailTabEnum.ACCOUNT]: (
        <dl className="space-y-2 text-sm">
          <div className="grid grid-cols-[8rem_1fr] gap-1">
            <dt className="text-muted-foreground">Email</dt>
            <dd>{user.email}</dd>
            <dt className="text-muted-foreground">Trạng thái</dt>
            <dd>
              {user.isActive ? "Đang hoạt động" : "Ngừng hoạt động"}
            </dd>
            <dt className="text-muted-foreground">Đăng nhập gần nhất</dt>
            <dd>{formatIamDateTime(user.lastLoginAt) || "—"}</dd>
            <dt className="text-muted-foreground">Chi nhánh</dt>
            <dd>
              {"branchIds" in user && user.branchIds.length > 0
                ? `${user.branchIds.length} chi nhánh`
                : "Chưa gán"}
            </dd>
          </div>
        </dl>
      ),
      [EmployeeDetailTabEnum.ROLES]: (
        <EmployeeRolesTab roles={assignedRoles} />
      ),
      [EmployeeDetailTabEnum.CONTACT]: (
        <p className="text-sm text-muted-foreground">
          Dữ liệu liên hệ HR sẽ được đồng bộ trong phiên bản sau.
        </p>
      ),
    };
  }, [assignedRoles, user]);

  return (
    <div className="px-4 py-3">
      <nav
        aria-label="Tab chi tiết nhân viên"
        className="mb-2 flex gap-6"
      >
        {tabs.map((tab) => {
          const isActive = tab === activeTab;
          return (
            <button
              key={tab}
              type="button"
              className={cn(
                "text-sm font-semibold transition-colors",
                isActive
                  ? "inline-block border-b-2 border-primary px-2 pb-1 text-foreground"
                  : "px-2 pb-1 text-primary hover:underline",
              )}
              onClick={() => setActiveTab(tab)}
            >
              {EMPLOYEE_DETAIL_TAB_LABELS[tab]}
            </button>
          );
        })}
      </nav>

      {!user ? (
        <p className="text-sm text-muted-foreground">
          Chọn một nhân viên để xem chi tiết.
        </p>
      ) : (
        detailTabPanels?.[activeTab]
      )}
    </div>
  );
}
