import { useMemo, useState } from "react";
import { cn } from "@erp/ui";
import { PERMISSION_MODULES } from "../permission-catalog";

interface RolePermissionsEditorProps {
  permissionIds: string[];
  onChange: (permissionIds: string[]) => void;
}

export function RolePermissionsEditor({
  permissionIds,
  onChange,
}: RolePermissionsEditorProps) {
  const [activeModuleId, setActiveModuleId] = useState(
    PERMISSION_MODULES[0]?.id ?? "",
  );

  const activeModule = useMemo(
    () => PERMISSION_MODULES.find((m) => m.id === activeModuleId),
    [activeModuleId],
  );

  const modulePermissionIds = useMemo(
    () => activeModule?.permissions.map((p) => p.id) ?? [],
    [activeModule],
  );

  const allModuleSelected =
    modulePermissionIds.length > 0 &&
    modulePermissionIds.every((id) => permissionIds.includes(id));

  const someModuleSelected =
    !allModuleSelected &&
    modulePermissionIds.some((id) => permissionIds.includes(id));

  const toggleModule = (checked: boolean) => {
    if (checked) {
      onChange([...new Set([...permissionIds, ...modulePermissionIds])]);
      return;
    }
    onChange(
      permissionIds.filter((id) => !modulePermissionIds.includes(id)),
    );
  };

  const togglePermission = (permId: string, checked: boolean) => {
    if (checked) {
      onChange([...new Set([...permissionIds, permId])]);
      return;
    }
    onChange(permissionIds.filter((id) => id !== permId));
  };

  return (
    <div className="flex min-h-[320px] overflow-hidden rounded-md border">
      <nav
        className="w-56 shrink-0 overflow-y-auto border-r bg-muted/30"
        aria-label="Nhóm quyền"
      >
        {PERMISSION_MODULES.map((mod) => {
          const isActive = mod.id === activeModuleId;
          const count = mod.permissions.filter((p) =>
            permissionIds.includes(p.id),
          ).length;
          return (
            <button
              key={mod.id}
              type="button"
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground hover:bg-muted",
              )}
              onClick={() => setActiveModuleId(mod.id)}
            >
              <span className="truncate">{mod.label}</span>
              {count > 0 && (
                <span className="ml-1 shrink-0 text-xs text-muted-foreground">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 overflow-y-auto p-4">
        {activeModule ? (
          <div className="space-y-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={allModuleSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someModuleSelected;
                }}
                onChange={(e) => toggleModule(e.target.checked)}
              />
              <span>{activeModule.label}</span>
            </label>
            <div className="space-y-3 pl-6">
              {activeModule.permissions.map((perm) => (
                <label
                  key={perm.id}
                  className="flex cursor-pointer items-start gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
                    checked={permissionIds.includes(perm.id)}
                    onChange={(e) =>
                      togglePermission(perm.id, e.target.checked)
                    }
                  />
                  <span>{perm.label}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Chọn nhóm quyền.</p>
        )}
      </div>
    </div>
  );
}
