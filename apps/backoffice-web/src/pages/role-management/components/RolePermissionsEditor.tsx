import { useEffect, useMemo, useState } from "react";
import { cn } from "@erp/ui";
import { usePermissions } from "../../../hooks/iam";
import type { PermissionModuleView } from "../role-management.types";

interface RolePermissionsEditorProps {
  permissionKeys: string[];
  onChange: (permissionKeys: string[]) => void;
  readOnly?: boolean;
}

export function RolePermissionsEditor({
  permissionKeys,
  onChange,
  readOnly = false,
}: RolePermissionsEditorProps) {
  const { modules, isLoading, isError } = usePermissions();
  const [activeModuleId, setActiveModuleId] = useState("");

  useEffect(() => {
    if (modules.length > 0 && !activeModuleId) {
      setActiveModuleId(modules[0].module);
    }
  }, [modules, activeModuleId]);

  const activeModule = useMemo(
    () => modules.find((m) => m.module === activeModuleId),
    [modules, activeModuleId],
  );

  const modulePermissionKeys = useMemo(
    () => activeModule?.permissions.map((p) => p.key) ?? [],
    [activeModule],
  );

  const allModuleSelected =
    modulePermissionKeys.length > 0 &&
    modulePermissionKeys.every((key) => permissionKeys.includes(key));

  const someModuleSelected =
    !allModuleSelected &&
    modulePermissionKeys.some((key) => permissionKeys.includes(key));

  const toggleModule = (checked: boolean) => {
    if (readOnly) return;
    if (checked) {
      onChange([...new Set([...permissionKeys, ...modulePermissionKeys])]);
      return;
    }
    onChange(
      permissionKeys.filter((key) => !modulePermissionKeys.includes(key)),
    );
  };

  const togglePermission = (permKey: string, checked: boolean) => {
    if (readOnly) return;
    if (checked) {
      onChange([...new Set([...permissionKeys, permKey])]);
      return;
    }
    onChange(permissionKeys.filter((key) => key !== permKey));
  };

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Đang tải danh mục quyền…</p>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Không tải được danh mục quyền. Vui lòng thử nạp lại trang.
      </p>
    );
  }

  return (
    <PermissionEditorGrid
      modules={modules}
      activeModuleId={activeModuleId}
      onActiveModuleChange={setActiveModuleId}
      activeModule={activeModule}
      permissionKeys={permissionKeys}
      readOnly={readOnly}
      allModuleSelected={allModuleSelected}
      someModuleSelected={someModuleSelected}
      onToggleModule={toggleModule}
      onTogglePermission={togglePermission}
    />
  );
}

interface PermissionEditorGridProps {
  modules: PermissionModuleView[];
  activeModuleId: string;
  onActiveModuleChange: (id: string) => void;
  activeModule: PermissionModuleView | undefined;
  permissionKeys: string[];
  readOnly: boolean;
  allModuleSelected: boolean;
  someModuleSelected: boolean;
  onToggleModule: (checked: boolean) => void;
  onTogglePermission: (permKey: string, checked: boolean) => void;
}

function PermissionEditorGrid({
  modules,
  activeModuleId,
  onActiveModuleChange,
  activeModule,
  permissionKeys,
  readOnly,
  allModuleSelected,
  someModuleSelected,
  onToggleModule,
  onTogglePermission,
}: PermissionEditorGridProps) {
  return (
    <div
      className={cn(
        "flex min-h-[320px] overflow-hidden rounded-md border",
        readOnly && "opacity-90",
      )}
    >
      <nav
        className="w-56 shrink-0 overflow-y-auto border-r bg-muted/30"
        aria-label="Nhóm quyền"
      >
        {modules.map((mod) => {
          const isActive = mod.module === activeModuleId;
          const count = mod.permissions.filter((p) =>
            permissionKeys.includes(p.key),
          ).length;
          return (
            <button
              key={mod.module}
              type="button"
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground hover:bg-muted",
              )}
              onClick={() => onActiveModuleChange(mod.module)}
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
        {readOnly && (
          <p className="mb-3 text-sm text-muted-foreground">
            Vai trò hệ thống — chỉ xem, không chỉnh quyền.
          </p>
        )}
        {activeModule ? (
          <div className="space-y-4">
            <label
              className={cn(
                "flex items-center gap-2 text-sm font-semibold",
                readOnly ? "cursor-default" : "cursor-pointer",
              )}
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={allModuleSelected}
                disabled={readOnly}
                ref={(el) => {
                  if (el) el.indeterminate = someModuleSelected;
                }}
                onChange={(e) => onToggleModule(e.target.checked)}
              />
              <span>{activeModule.label}</span>
            </label>
            <div className="space-y-3 pl-6">
              {activeModule.permissions.map((perm) => (
                <label
                  key={perm.key}
                  className={cn(
                    "flex items-start gap-2 text-sm",
                    readOnly ? "cursor-default" : "cursor-pointer",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
                    checked={permissionKeys.includes(perm.key)}
                    disabled={readOnly}
                    onChange={(e) =>
                      onTogglePermission(perm.key, e.target.checked)
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
