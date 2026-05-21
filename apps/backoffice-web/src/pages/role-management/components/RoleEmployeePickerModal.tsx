import { useEffect, useMemo, useState } from "react";
import { AppModal, Button } from "@erp/ui";
import type { UserDetail } from "@erp/shared-interfaces";
import { X } from "lucide-react";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../components/table/BaseDataTable";
import { joinFullName, userDisplayCode } from "../../../lib/iam";

interface RoleEmployeePickerModalProps {
  open: boolean;
  roleName: string;
  users: UserDetail[];
  assignedUserIds: string[];
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (userIds: string[]) => void;
}

export function RoleEmployeePickerModal({
  open,
  roleName,
  users,
  assignedUserIds,
  loading = false,
  onOpenChange,
  onConfirm,
}: RoleEmployeePickerModalProps) {
  const [pendingIds, setPendingIds] = useState<string[]>(assignedUserIds);

  useEffect(() => {
    if (open) {
      setPendingIds(assignedUserIds);
    }
  }, [open, assignedUserIds]);

  const toggleUser = (userId: string, checked: boolean) => {
    setPendingIds((prev) => {
      const next = checked
        ? [...prev, userId]
        : prev.filter((id) => id !== userId);
      return [...new Set(next)];
    });
  };

  const columns: TableColumn<UserDetail>[] = useMemo(
    () => [
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
    ],
    [],
  );

  const handleConfirm = () => {
    onConfirm(pendingIds);
    onOpenChange(false);
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Chọn người dùng vai trò: ${roleName}`}
      defaultWidth={800}
      defaultHeight={500}
      showFooter={true}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="button" onClick={handleConfirm}>
            Đồng ý
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            <X className="mr-1 h-4 w-4" />
            Hủy bỏ
          </Button>
        </div>
      }
    >
      <BaseDataTable
        columns={columns}
        rows={users}
        loading={loading}
        emptyLabel="Chưa có người dùng."
        getRowKey={(row) => row.id}
        leadingColumn={{
          width: 40,
          header: <span className="sr-only">Chọn</span>,
          cell: (row) => (
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              aria-label={`Chọn ${joinFullName(row.firstName, row.lastName)}`}
              checked={pendingIds.includes(row.id)}
              onChange={(e) => toggleUser(row.id, e.target.checked)}
              onClick={(e) => e.stopPropagation()}
            />
          ),
        }}
      />
    </AppModal>
  );
}
