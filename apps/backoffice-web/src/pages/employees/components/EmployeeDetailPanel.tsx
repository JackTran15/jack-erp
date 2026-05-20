import { useMemo, useState, type ReactNode } from "react";
import {
  EmployeeAddressType,
  type EmployeeProfileView,
  type RoleSummary,
  type UserDetail,
  type UserSummary,
} from "@erp/shared-interfaces";
import { cn } from "@erp/ui";
import { formatIamDateTime } from "../../../lib/iam";
import { resolveUserRoles } from "../employee.mappers";
import { EmployeeRolesTab } from "./EmployeeRolesTab";

const moneyVi = (n: number): string =>
  new Intl.NumberFormat("vi-VN").format(n || 0);

const EMPLOYMENT_LABELS_VI: Record<string, string> = {
  OFFICIAL: "Chính thức",
  PROBATION: "Thử việc",
  RESIGNED: "Đã nghỉ",
};
const GENDER_LABELS_VI: Record<string, string> = { MALE: "Nam", FEMALE: "Nữ" };

function formatAddress(
  profile: EmployeeProfileView,
  type: EmployeeAddressType,
): string {
  const a = profile.addresses?.find((x) => x.type === type);
  if (!a) return "—";
  const parts = [a.address, a.ward, a.district, a.province, a.country].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  return parts.length ? parts.join(", ") : "—";
}

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

  const profile =
    user && "profile" in user ? (user.profile ?? null) : null;

  const detailTabPanels = useMemo<Record<
    EmployeeDetailTabEnum,
    ReactNode
  > | null>(() => {
    if (!user) return null;
    return {
      [EmployeeDetailTabEnum.ACCOUNT]: (
        <dl className="space-y-2 text-sm">
          <div className="grid grid-cols-[8rem_1fr] gap-1">
            {profile?.code && (
              <>
                <dt className="text-muted-foreground">Mã nhân viên</dt>
                <dd>{profile.code}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Email</dt>
            <dd>{user.email}</dd>
            {profile?.mobile && (
              <>
                <dt className="text-muted-foreground">ĐT di động</dt>
                <dd>{profile.mobile}</dd>
              </>
            )}
            {profile?.jobPosition && (
              <>
                <dt className="text-muted-foreground">Vị trí công việc</dt>
                <dd>{profile.jobPosition.name}</dd>
              </>
            )}
            {profile && (
              <>
                <dt className="text-muted-foreground">Trạng thái HR</dt>
                <dd>
                  {EMPLOYMENT_LABELS_VI[profile.employmentStatus] ??
                    profile.employmentStatus}
                </dd>
                <dt className="text-muted-foreground">Tiền lương</dt>
                <dd>{moneyVi(profile.salary)} ₫</dd>
              </>
            )}
            <dt className="text-muted-foreground">Trạng thái</dt>
            <dd>{user.isActive ? "Đang hoạt động" : "Ngừng hoạt động"}</dd>
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
      [EmployeeDetailTabEnum.ROLES]: <EmployeeRolesTab roles={assignedRoles} />,
      [EmployeeDetailTabEnum.CONTACT]: profile ? (
        <dl className="space-y-2 text-sm">
          <div className="grid grid-cols-[10rem_1fr] gap-1">
            <dt className="text-muted-foreground">Hộ khẩu thường trú</dt>
            <dd>{formatAddress(profile, EmployeeAddressType.PERMANENT)}</dd>
            <dt className="text-muted-foreground">Chỗ ở hiện tại</dt>
            <dd>{formatAddress(profile, EmployeeAddressType.CURRENT)}</dd>
            <dt className="text-muted-foreground">ĐT bàn</dt>
            <dd>{profile.homePhone || "—"}</dd>
            <dt className="text-muted-foreground">Liên hệ khẩn cấp</dt>
            <dd>
              {profile.emergencyContact?.fullName
                ? `${profile.emergencyContact.fullName}${
                    profile.emergencyContact.relationship
                      ? ` (${profile.emergencyContact.relationship})`
                      : ""
                  }${
                    profile.emergencyContact.mobile
                      ? ` — ${profile.emergencyContact.mobile}`
                      : ""
                  }`
                : "—"}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nhân viên này chưa có hồ sơ HR.
        </p>
      ),
    };
  }, [assignedRoles, user, profile]);

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
