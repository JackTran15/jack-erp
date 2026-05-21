import { cn } from "@erp/ui";
import type { RoleSummary, UserDetail } from "@erp/shared-interfaces";
import { RoleUsersTab } from "./RoleUsersTab";

interface RoleDetailPanelProps {
  role: RoleSummary | null;
  users: UserDetail[];
  usersLoading?: boolean;
  canAssign?: boolean;
  onChoose: () => void;
  onRemoveUser: (user: UserDetail) => void;
}

export function RoleDetailPanel({
  role,
  users,
  usersLoading = false,
  canAssign = true,
  onChoose,
  onRemoveUser,
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
            users={users}
            loading={usersLoading}
            canAssign={canAssign}
            onChoose={onChoose}
            onRemove={onRemoveUser}
          />
        </div>
      )}
    </div>
  );
}
