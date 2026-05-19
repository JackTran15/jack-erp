import { useMemo, useState } from "react";
import { Button, Input } from "@erp/ui";
import { MoreHorizontal } from "lucide-react";
import type { EmployeeFormDraft } from "../employee.types";
import { MOCK_ROLES } from "../employees.mock";
import { EmployeeRolePickerModal } from "./EmployeeRolePickerModal";

interface EmployeeRolesFormTabProps {
  draft: EmployeeFormDraft;
  onChange: (draft: EmployeeFormDraft) => void;
}

export function EmployeeRolesFormTab({
  draft,
  onChange,
}: EmployeeRolesFormTabProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const quickRoles = MOCK_ROLES.filter((r) => r.quickPick);

  const selectedPickerLabels = useMemo(
    () =>
      MOCK_ROLES.filter((r) => draft.roleIds.includes(r.id) && r.category)
        .map((r) => r.name)
        .join(", "),
    [draft.roleIds],
  );

  const pickerSelectedIds = useMemo(
    () =>
      draft.roleIds.filter((id) => {
        const role = MOCK_ROLES.find((r) => r.id === id);
        return Boolean(role?.category);
      }),
    [draft.roleIds],
  );

  const toggleRole = (roleId: string, checked: boolean) => {
    const next = checked
      ? [...draft.roleIds, roleId]
      : draft.roleIds.filter((id) => id !== roleId);
    onChange({ ...draft, roleIds: [...new Set(next)] });
  };

  const handlePickerConfirm = (pickerIds: string[]) => {
    const quickPickIds = draft.roleIds.filter((id) =>
      MOCK_ROLES.some((r) => r.id === id && r.quickPick),
    );
    onChange({
      ...draft,
      roleIds: [...new Set([...quickPickIds, ...pickerIds])],
    });
  };

  const hasManageRole = useMemo(
    () =>
      ["role-admin", "role-chain"].some((roleId) =>
        draft.roleIds.includes(roleId),
      ),
    [draft.roleIds],
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-6">
        {quickRoles.map((role) => (
          <label key={role.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.roleIds.includes(role.id)}
              onChange={(e) => toggleRole(role.id, e.target.checked)}
            />
            Vai trò {role.name}
          </label>
        ))}
      </div>

      {!hasManageRole && (
        <div className="flex gap-1">
          <Input
            readOnly
            placeholder="Chọn 1 hoặc nhiều vai trò"
            value={selectedPickerLabels}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Chọn vai trò"
            onClick={() => setPickerOpen(true)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      )}

      <EmployeeRolePickerModal
        open={pickerOpen}
        selectedRoleIds={pickerSelectedIds}
        onOpenChange={setPickerOpen}
        onConfirm={handlePickerConfirm}
      />
    </div>
  );
}
