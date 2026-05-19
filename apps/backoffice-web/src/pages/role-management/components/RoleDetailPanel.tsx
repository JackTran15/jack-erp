import { cn } from "@erp/ui";
import type { Employee } from "../../employees/employee.types";
import type { RoleRecord } from "../role-management.types";
import { RoleUsersTab } from "./RoleUsersTab";

interface RoleDetailPanelProps {
  role: RoleRecord | null;
  employees: Employee[];
  onChoose: () => void;
  onRemoveEmployee: (employee: Employee) => void;
}

export function RoleDetailPanel({
  role,
  employees,
  onChoose,
  onRemoveEmployee,
}: RoleDetailPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col px-4 pt-3">
      <nav
        aria-label="Tab chi tiết vai trò"
        className="mb-2 flex shrink-0 gap-6"
      >
        <span
          className={cn(
            "inline-block border-b-2 border-primary px-2 pb-1 text-sm font-semibold text-foreground",
          )}
        >
          Danh sách người dùng
        </span>
      </nav>

      {!role ? (
        <p className="text-sm text-muted-foreground">
          Chọn một vai trò để xem danh sách người dùng.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <RoleUsersTab
            employees={employees}
            onChoose={onChoose}
            onRemove={onRemoveEmployee}
          />
        </div>
      )}
    </div>
  );
}
