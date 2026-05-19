import { useEffect, useMemo, useState } from "react";
import { AppModal, Button } from "@erp/ui";
import { X } from "lucide-react";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../components/table/BaseDataTable";
import type { Employee } from "../../employees/employee.types";

interface RoleEmployeePickerModalProps {
  open: boolean;
  roleName: string;
  employees: Employee[];
  assignedEmployeeIds: string[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (employeeIds: string[]) => void;
}

export function RoleEmployeePickerModal({
  open,
  roleName,
  employees,
  assignedEmployeeIds,
  onOpenChange,
  onConfirm,
}: RoleEmployeePickerModalProps) {
  const [pendingIds, setPendingIds] = useState<string[]>(assignedEmployeeIds);

  useEffect(() => {
    if (open) {
      setPendingIds(assignedEmployeeIds);
    }
  }, [open, assignedEmployeeIds]);

  const toggleEmployee = (employeeId: string, checked: boolean) => {
    setPendingIds((prev) => {
      const next = checked
        ? [...prev, employeeId]
        : prev.filter((id) => id !== employeeId);
      return [...new Set(next)];
    });
  };

  const columns: TableColumn<Employee>[] = useMemo(
    () => [
      {
        key: "code",
        label: "Mã nhân viên",
        width: 160,
        render: (row) => row.code,
      },
      {
        key: "fullName",
        label: "Tên nhân viên",
        render: (row) => row.fullName,
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
      title={`Chọn nhân viên vai trò: ${roleName}`}
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
        rows={employees}
        loading={false}
        emptyLabel="Chưa có nhân viên."
        getRowKey={(row) => row.id}
        leadingColumn={{
          width: 40,
          header: <span className="sr-only">Chọn</span>,
          cell: (row) => (
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              aria-label={`Chọn ${row.fullName}`}
              checked={pendingIds.includes(row.id)}
              onChange={(e) => toggleEmployee(row.id, e.target.checked)}
              onClick={(e) => e.stopPropagation()}
            />
          ),
        }}
      />
    </AppModal>
  );
}
