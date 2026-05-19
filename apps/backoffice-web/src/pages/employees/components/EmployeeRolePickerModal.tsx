import { useEffect, useState } from "react";
import { AppModal, Button } from "@erp/ui";
import { X } from "lucide-react";
import {
  EMPLOYEE_ROLE_CATEGORY_LABELS,
  getPickerRolesByCategory,
  splitPickerRoleColumns,
} from "../employee-roles";
import { EmployeeRoleCategoryEnum } from "../employee.types";

interface EmployeeRolePickerModalProps {
  open: boolean;
  selectedRoleIds: string[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (roleIds: string[]) => void;
}

function RolePickerColumn({
  roles,
  selectedIds,
  onToggle,
}: {
  roles: ReturnType<typeof getPickerRolesByCategory>;
  selectedIds: string[];
  onToggle: (roleId: string, checked: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      {roles.map((role) => (
        <label
          key={role.id}
          className="flex cursor-pointer items-start gap-2 text-sm"
        >
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
            checked={selectedIds.includes(role.id)}
            onChange={(e) => onToggle(role.id, e.target.checked)}
          />
          <span>
            <span className="font-medium text-foreground">{role.name}</span>
            <span className="mt-0.5 block text-muted-foreground">
              {role.description}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

function RolePickerSection({
  category,
  selectedIds,
  onToggle,
}: {
  category: EmployeeRoleCategoryEnum;
  selectedIds: string[];
  onToggle: (roleId: string, checked: boolean) => void;
}) {
  const roles = getPickerRolesByCategory(category);
  const [left, right] = splitPickerRoleColumns(roles);

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
        {EMPLOYEE_ROLE_CATEGORY_LABELS[category]}
      </h3>
      <div className="grid grid-cols-2 gap-x-8 gap-y-1">
        <RolePickerColumn
          roles={left}
          selectedIds={selectedIds}
          onToggle={onToggle}
        />
        <RolePickerColumn
          roles={right}
          selectedIds={selectedIds}
          onToggle={onToggle}
        />
      </div>
    </section>
  );
}

export function EmployeeRolePickerModal({
  open,
  selectedRoleIds,
  onOpenChange,
  onConfirm,
}: EmployeeRolePickerModalProps) {
  const [pendingIds, setPendingIds] = useState<string[]>(selectedRoleIds);

  useEffect(() => {
    if (open) {
      setPendingIds(selectedRoleIds);
    }
  }, [open, selectedRoleIds]);

  const toggleRole = (roleId: string, checked: boolean) => {
    setPendingIds((prev) => {
      const next = checked
        ? [...prev, roleId]
        : prev.filter((id) => id !== roleId);
      return [...new Set(next)];
    });
  };

  const handleConfirm = () => {
    onConfirm(pendingIds);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Chọn vai trò"
      defaultWidth={920}
      defaultHeight={700}
      showFooter={true}
      footer={
        <div className="flex w-full justify-end gap-2 ">
          <Button type="button" onClick={handleConfirm}>
            Đồng ý
          </Button>
          <Button type="button" variant="outline" onClick={handleCancel}>
            <X className="mr-1 h-4 w-4" />
            Hủy bỏ
          </Button>
        </div>
      }
    >
      <div className="space-y-6 overflow-y-auto p-4">
        {Object.values(EmployeeRoleCategoryEnum).map((category) => (
          <RolePickerSection
            key={category}
            category={category}
            selectedIds={pendingIds}
            onToggle={toggleRole}
          />
        ))}
      </div>
    </AppModal>
  );
}
