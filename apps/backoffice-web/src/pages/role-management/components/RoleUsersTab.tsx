import { Button } from "@erp/ui";
import { Check, Trash2 } from "lucide-react";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../components/table/BaseDataTable";
import type { Employee } from "../../employees/employee.types";

interface RoleUsersTabProps {
  employees: Employee[];
  onChoose: () => void;
  onRemove: (employee: Employee) => void;
}

export function RoleUsersTab({
  employees,
  onChoose,
  onRemove,
}: RoleUsersTabProps) {
  const columns: TableColumn<Employee>[] = [
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
  ];

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto pb-12">
        <BaseDataTable
          columns={columns}
          rows={employees}
          loading={false}
          emptyLabel="Chưa có người dùng được gán vai trò này."
          getRowKey={(row) => row.id}
          renderActions={(row) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive h-6"
              aria-label={`Gỡ ${row.fullName} khỏi vai trò`}
              onClick={() => onRemove(row)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        />
      </div>
      <div className="absolute bottom-0 left-0 right-0 z-10 border-t bg-background py-2">
        <Button type="button" size="sm" onClick={onChoose}>
          <Check className="mr-1 h-4 w-4" />
          Chọn
        </Button>
      </div>
    </div>
  );
}
