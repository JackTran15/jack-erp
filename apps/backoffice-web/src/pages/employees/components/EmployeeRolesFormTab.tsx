import { FormField, cn } from "@erp/ui";
import type { EmployeeFormDraft } from "../employee.types";
import { useBranches, useRoles } from "../../../hooks/iam";

interface EmployeeRolesFormTabProps {
  draft: EmployeeFormDraft;
  onChange: (draft: EmployeeFormDraft) => void;
}

export function EmployeeRolesFormTab({
  draft,
  onChange,
}: EmployeeRolesFormTabProps) {
  const { data: roles = [], isLoading: rolesLoading } = useRoles();
  const { data: branches = [], isLoading: branchesLoading } = useBranches();

  const toggleRole = (roleId: string, checked: boolean) => {
    const next = checked
      ? [...draft.roleIds, roleId]
      : draft.roleIds.filter((id) => id !== roleId);
    onChange({ ...draft, roleIds: [...new Set(next)] });
  };

  const toggleBranch = (branchId: string, checked: boolean) => {
    const current = draft.branchIds ?? [];
    const next = checked
      ? [...current, branchId]
      : current.filter((id) => id !== branchId);
    onChange({ ...draft, branchIds: [...new Set(next)] });
  };

  return (
    <div className="space-y-6 p-4">
      <section className="space-y-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
          VAI TRÒ HỆ THỐNG
        </h3>
        {rolesLoading ? (
          <p className="text-sm text-muted-foreground">Đang tải vai trò…</p>
        ) : roles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có vai trò.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {roles.map((role) => (
              <label
                key={role.id}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm",
                  draft.roleIds.includes(role.id) && "border-primary bg-primary/5",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
                  checked={draft.roleIds.includes(role.id)}
                  onChange={(e) => toggleRole(role.id, e.target.checked)}
                />
                <span>
                  <span className="font-medium">{role.name}</span>
                  {role.description && (
                    <span className="mt-0.5 block text-muted-foreground">
                      {role.description}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <FormField label="Chi nhánh được truy cập">
          {branchesLoading ? (
            <p className="text-sm text-muted-foreground">
              Đang tải chi nhánh…
            </p>
          ) : branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có chi nhánh.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {branches.map((branch) => (
                <label
                  key={branch.id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={(draft.branchIds ?? []).includes(branch.id)}
                    onChange={(e) =>
                      toggleBranch(branch.id, e.target.checked)
                    }
                  />
                  {branch.name}
                </label>
              ))}
            </div>
          )}
        </FormField>
      </section>
    </div>
  );
}
