import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@erp/ui";
import type { Employee } from "../employee.types";
import { EmployeeRolesTab } from "./EmployeeRolesTab";
import { EmployeeContactTab } from "./EmployeeContactTab";

interface EmployeeDetailPanelProps {
  employee: Employee | null;
}

export enum EmployeeDetailTabEnum {
  ROLES = "roles",
  CONTACT = "contact",
}

export const EMPLOYEE_DETAIL_TAB_LABELS: Record<EmployeeDetailTabEnum, string> =
  {
    [EmployeeDetailTabEnum.ROLES]: "Vai trò",
    [EmployeeDetailTabEnum.CONTACT]: "Thông tin liên hệ",
  };

export function EmployeeDetailPanel({ employee }: EmployeeDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<EmployeeDetailTabEnum>(
    EmployeeDetailTabEnum.ROLES,
  );

  const tabs = useMemo<EmployeeDetailTabEnum[]>(
    () => Object.values(EmployeeDetailTabEnum),
    [],
  );

  const detailTabPanels = useMemo<Record<
    EmployeeDetailTabEnum,
    ReactNode
  > | null>(() => {
    if (!employee) return null;
    return {
      [EmployeeDetailTabEnum.ROLES]: <EmployeeRolesTab employee={employee} />,
      [EmployeeDetailTabEnum.CONTACT]: (
        <EmployeeContactTab employee={employee} />
      ),
    };
  }, [employee]);

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

      {!employee ? (
        <p className="text-sm text-muted-foreground">
          Chọn một nhân viên để xem chi tiết.
        </p>
      ) : (
        detailTabPanels?.[activeTab]
      )}
    </div>
  );
}
