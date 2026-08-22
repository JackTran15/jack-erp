import { Button } from "@erp/ui";
import type { UserDetail } from "@erp/shared-interfaces";
import { Check, Trash2 } from "lucide-react";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../components/table/BaseDataTable";
import { joinFullName, userDisplayCode } from "../../../lib/iam";

interface RoleUsersTabProps {
  users: UserDetail[];
  loading?: boolean;
  canAssign?: boolean;
  onChoose: () => void;
  onRemove: (user: UserDetail) => void;
}

export function RoleUsersTab({
  users,
  loading = false,
  canAssign = true,
  onChoose,
  onRemove,
}: RoleUsersTabProps) {
  const columns: TableColumn<UserDetail>[] = [
    {
      key: "code",
      label: "Mã / email",
      width: 160,
      render: (row) => userDisplayCode(row),
    },
    {
      key: "fullName",
      label: "Tên người dùng",
      render: (row) => joinFullName(row.firstName, row.lastName),
    },
    {
      key: "email",
      label: "Email",
      width: 200,
      render: (row) => row.email,
    },
  ];

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto pb-12">
        <BaseDataTable
          columns={columns}
          rows={users}
          loading={loading}
          emptyLabel="Chưa có người dùng được gán vai trò này."
          getRowKey={(row) => row.id}
          renderActions={
            canAssign
              ? (row) => {
                  // The server already refuses to re-role an account holding
                  // permissions the caller lacks, and says so per row via
                  // `canEdit`. Without this the button opens a confirm dialog
                  // that can only ever end in a 403 toast.
                  const manageable = row.canEdit ?? true;
                  return (
                    // The title sits on the wrapper, not the button: a disabled
                    // button takes no pointer events (@erp/ui also sets
                    // `disabled:pointer-events-none`), so a title on it never shows.
                    <span
                      title={
                        manageable
                          ? undefined
                          : "Tài khoản này có quyền cao hơn bạn nên bạn không gỡ vai trò của họ được."
                      }
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive h-6"
                        aria-label={`Gỡ ${joinFullName(row.firstName, row.lastName)} khỏi vai trò`}
                        disabled={!manageable}
                        onClick={() => onRemove(row)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  );
                }
              : undefined
          }
        />
      </div>
      {canAssign && (
        <div className="absolute bottom-0 left-0 right-0 z-10 border-t bg-background py-2">
          <Button type="button" size="sm" onClick={onChoose}>
            <Check className="mr-1 h-4 w-4" />
            Chọn
          </Button>
        </div>
      )}
    </div>
  );
}
