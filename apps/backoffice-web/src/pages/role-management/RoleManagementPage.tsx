import { useCallback, useMemo, useState } from "react";
import { DocumentListShell, PageToolbar, type ToolbarItem } from "@erp/ui";
import { Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  BaseDataTable,
  type TableColumn,
} from "../../components/table/BaseDataTable";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import {
  applyColumnFilter,
  DEFAULT_COLUMN_FILTER_MODE,
  toComparableText,
  type ColumnFilter,
  type ColumnFilterMode,
} from "../../components/table/pagination.dto";
import type { Employee } from "../employees/employee.types";
import { RoleDetailPanel } from "./components/RoleDetailPanel";
import { RoleEditModal } from "./components/RoleEditModal";
import { RoleEmployeePickerModal } from "./components/RoleEmployeePickerModal";
import {
  buildInitialRoleEmployees,
  buildInitialRoles,
  draftToRole,
  roleToDraft,
} from "./role-management.mock";
import type { RoleFormDraft, RoleRecord } from "./role-management.types";

const FILTER_KEYS = ["name", "description"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

function emptyColumnFilters(): Record<FilterKey, ColumnFilter> {
  return FILTER_KEYS.reduce(
    (acc, k) => {
      acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
      return acc;
    },
    {} as Record<FilterKey, ColumnFilter>,
  );
}

function employeeHasRole(employee: Employee, roleId: string): boolean {
  return employee.roles.some((r) => r.id === roleId);
}

function roleSnapshot(role: RoleRecord): Pick<Employee["roles"][number], "id" | "name" | "description"> {
  return { id: role.id, name: role.name, description: role.description };
}

export function RoleManagementPage() {
  const [roles, setRoles] = useState<RoleRecord[]>(() => buildInitialRoles());
  const [employees, setEmployees] = useState<Employee[]>(() =>
    buildInitialRoleEmployees(),
  );
  const [columnFilters, setColumnFilters] =
    useState<Record<FilterKey, ColumnFilter>>(emptyColumnFilters);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<RoleFormDraft>({
    name: "",
    description: "",
    permissionIds: [],
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Employee | null>(null);

  const filteredRoles = useMemo(() => {
    return roles.filter((row) => {
      const checks = [
        applyColumnFilter(toComparableText(row.name), columnFilters.name),
        applyColumnFilter(
          toComparableText(row.description),
          columnFilters.description,
        ),
      ];
      return checks.every(Boolean);
    });
  }, [roles, columnFilters]);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  const roleEmployees = useMemo(() => {
    if (!selectedRoleId) return [];
    return employees.filter((e) => employeeHasRole(e, selectedRoleId));
  }, [employees, selectedRoleId]);

  const assignedEmployeeIds = useMemo(
    () => roleEmployees.map((e) => e.id),
    [roleEmployees],
  );

  const openEdit = useCallback(() => {
    if (!selectedRole) {
      toast.error("Vui lòng chọn một vai trò để sửa.");
      return;
    }
    setEditDraft(roleToDraft(selectedRole));
    setEditOpen(true);
  }, [selectedRole]);

  const handleReload = useCallback(() => {
    setRoles(buildInitialRoles());
    setEmployees(buildInitialRoleEmployees());
    setColumnFilters(emptyColumnFilters());
    setSelectedRoleId(null);
    toast.success("Đã nạp lại dữ liệu");
  }, []);

  const handleSaveRole = useCallback(() => {
    if (!selectedRole) return;
    if (!editDraft.name.trim()) {
      toast.error("Tên vai trò không được để trống.");
      return;
    }
    const updated = draftToRole(editDraft, selectedRole.id);
    setRoles((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r)),
    );
    setEmployees((prev) =>
      prev.map((emp) => {
        if (!employeeHasRole(emp, updated.id)) return emp;
        return {
          ...emp,
          roles: emp.roles.map((r) =>
            r.id === updated.id ? roleSnapshot(updated) : r,
          ),
        };
      }),
    );
    setEditOpen(false);
    toast.success("Đã cập nhật vai trò.");
  }, [editDraft, selectedRole]);

  const syncEmployeesForRole = useCallback(
    (role: RoleRecord, employeeIds: string[]) => {
      const snap = roleSnapshot(role);
      setEmployees((prev) =>
        prev.map((emp) => {
          const shouldHave = employeeIds.includes(emp.id);
          const has = employeeHasRole(emp, role.id);
          if (shouldHave && !has) {
            return { ...emp, roles: [...emp.roles, snap] };
          }
          if (!shouldHave && has) {
            return {
              ...emp,
              roles: emp.roles.filter((r) => r.id !== role.id),
            };
          }
          if (shouldHave && has) {
            return {
              ...emp,
              roles: emp.roles.map((r) =>
                r.id === role.id ? snap : r,
              ),
            };
          }
          return emp;
        }),
      );
    },
    [],
  );

  const handlePickerConfirm = useCallback(
    (employeeIds: string[]) => {
      if (!selectedRole) return;
      syncEmployeesForRole(selectedRole, employeeIds);
      toast.success("Đã cập nhật danh sách người dùng.");
    },
    [selectedRole, syncEmployeesForRole],
  );

  const handleRemoveEmployee = useCallback(() => {
    if (!confirmRemove || !selectedRole) return;
    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === confirmRemove.id
          ? {
              ...emp,
              roles: emp.roles.filter((r) => r.id !== selectedRole.id),
            }
          : emp,
      ),
    );
    setConfirmRemove(null);
    toast.success("Đã gỡ nhân viên khỏi vai trò.");
  }, [confirmRemove, selectedRole]);

  const toolbarItems: ToolbarItem[] = [
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      onClick: openEdit,
      disabled: !selectedRole,
    },
    { id: "sep", type: "separator" },
    { id: "reload", label: "Nạp", icon: RefreshCw, onClick: handleReload },
  ];

  const columns: TableColumn<RoleRecord>[] = [
    {
      key: "name",
      label: "Tên vai trò",
      width: 280,
      render: (row) => row.name,
    },
    {
      key: "description",
      label: "Diễn giải",
      render: (row) => row.description,
    },
  ];

  const columnFilterControl = useMemo(
    () => ({
      filters: columnFilters as unknown as Record<string, ColumnFilter>,
      onModeChange: (key: string, mode: ColumnFilterMode) =>
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], mode },
        })),
      onValueChange: (key: string, value: string) =>
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], value },
        })),
    }),
    [columnFilters],
  );

  return (
    <>
      <DocumentListShell
        title="Quản lý vai trò"
        toolbar={
          <PageToolbar
            items={toolbarItems}
            tone="primary"
            className="rounded-none"
          />
        }
        detailPanel={
          <RoleDetailPanel
            role={selectedRole}
            employees={roleEmployees}
            onChoose={() => setPickerOpen(true)}
            onRemoveEmployee={(emp) => setConfirmRemove(emp)}
          />
        }
      >
        <BaseDataTable
          columns={columns}
          rows={filteredRoles}
          loading={false}
          emptyLabel="Chưa có vai trò."
          getRowKey={(row) => row.id}
          onRowClick={(row) => setSelectedRoleId(row.id)}
          leadingColumn={{
            width: 36,
            header: <span className="sr-only">Chọn</span>,
            cell: (row) => (
              <input
                type="checkbox"
                aria-label={`Chọn vai trò ${row.name}`}
                checked={selectedRoleId === row.id}
                onChange={() =>
                  setSelectedRoleId(
                    selectedRoleId === row.id ? null : row.id,
                  )
                }
                onClick={(e) => e.stopPropagation()}
              />
            ),
          }}
          columnFilterControl={columnFilterControl}
        />
      </DocumentListShell>

      <RoleEditModal
        open={editOpen}
        draft={editDraft}
        onDraftChange={setEditDraft}
        onClose={() => setEditOpen(false)}
        onSave={handleSaveRole}
      />

      {selectedRole && (
        <RoleEmployeePickerModal
          open={pickerOpen}
          roleName={selectedRole.name}
          employees={employees}
          assignedEmployeeIds={assignedEmployeeIds}
          onOpenChange={setPickerOpen}
          onConfirm={handlePickerConfirm}
        />
      )}

      {confirmRemove && selectedRole && (
        <ConfirmActionModal
          title="Gỡ nhân viên khỏi vai trò"
          message={`Xác nhận gỡ "${confirmRemove.fullName}" (${confirmRemove.code}) khỏi vai trò "${selectedRole.name}"?`}
          confirmLabel="Gỡ"
          cancelLabel="Quay lại"
          onCancel={() => setConfirmRemove(null)}
          onConfirm={handleRemoveEmployee}
        />
      )}
    </>
  );
}
