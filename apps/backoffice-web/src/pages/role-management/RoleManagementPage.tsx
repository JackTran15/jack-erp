import {
  IAM_PERMISSION_KEYS,
  type RoleSummary,
  type UserDetail,
} from "@erp/shared-interfaces";
import {
  Badge,
  DocumentListShell,
  PageToolbar,
  type ToolbarItem,
} from "@erp/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BaseDataTable,
  type TableColumn,
} from "../../components/table/BaseDataTable";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  applyColumnFilter,
  toComparableText,
  type ColumnFilter,
  type ColumnFilterMode,
} from "../../components/table/pagination.dto";
import {
  emptyRoleDraft,
  getIamErrorMessage,
  joinFullName,
  roleToFormDraft,
  useAllUserDetails,
  useCreateRole,
  useDeleteRole,
  useRole,
  useRoles,
  useSetRolePermissions,
  useSyncRoleUsers,
  useUpdateRole,
} from "../../hooks/iam";
import type { RoleFormDraft } from "../../lib/iam";
import { hasPermission } from "../../lib/permissions";
import { RoleDetailPanel } from "./components/RoleDetailPanel";
import { RoleEditModal, type RoleEditMode } from "./components/RoleEditModal";
import { RoleEmployeePickerModal } from "./components/RoleEmployeePickerModal";

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

export function RoleManagementPage() {
  const qc = useQueryClient();
  const canRead = hasPermission(IAM_PERMISSION_KEYS.ROLE_READ);
  const canWrite = hasPermission(IAM_PERMISSION_KEYS.ROLE_WRITE);
  const canDelete = hasPermission(IAM_PERMISSION_KEYS.ROLE_DELETE);
  const canAssignUsers = hasPermission(IAM_PERMISSION_KEYS.USER_ROLES_WRITE);

  const { data: roles = [], isLoading, isError, error, refetch } = useRoles();
  const { data: allUserDetails = [], isLoading: usersLoading } =
    useAllUserDetails(canRead && canAssignUsers);

  const [columnFilters, setColumnFilters] =
    useState<Record<FilterKey, ColumnFilter>>(emptyColumnFilters);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<RoleEditMode>("edit");
  const [editDraft, setEditDraft] = useState<RoleFormDraft>(emptyRoleDraft());
  const [editRoleId, setEditRoleId] = useState<string | null>(null);
  const [originalPermissionKeys, setOriginalPermissionKeys] = useState<
    string[]
  >([]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<UserDetail | null>(null);
  const [confirmDeleteRole, setConfirmDeleteRole] = useState(false);

  const { data: editRoleDetail } = useRole(
    editOpen && editMode === "edit" ? (editRoleId ?? undefined) : undefined,
  );

  const createRole = useCreateRole();
  const updateRole = useUpdateRole(editRoleId ?? "");
  const setPermissions = useSetRolePermissions(editRoleId ?? "");
  const deleteRole = useDeleteRole();
  const syncRoleUsers = useSyncRoleUsers();

  const filteredRoles = useMemo(() => {
    return roles.filter((row) => {
      const checks = [
        applyColumnFilter(toComparableText(row.name), columnFilters.name),
        applyColumnFilter(
          toComparableText(row.description ?? ""),
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

  const editingIsSystem =
    editRoleDetail?.isSystem ?? selectedRole?.isSystem ?? false;

  const roleUsers = useMemo((): UserDetail[] => {
    if (!selectedRoleId) return [];
    return allUserDetails.filter((u) => u.roleIds.includes(selectedRoleId));
  }, [allUserDetails, selectedRoleId]);

  const assignedUserIds = useMemo(
    () => roleUsers.map((u) => u.id),
    [roleUsers],
  );

  const openCreate = useCallback(() => {
    setEditMode("create");
    setEditRoleId(null);
    setEditDraft(emptyRoleDraft());
    setOriginalPermissionKeys([]);
    setEditOpen(true);
  }, []);

  const openEdit = useCallback(() => {
    if (!selectedRole) {
      toast.error("Vui lòng chọn một vai trò để sửa.");
      return;
    }
    setEditMode("edit");
    setEditRoleId(selectedRole.id);
    setEditDraft(roleToFormDraft(selectedRole));
    setOriginalPermissionKeys([]);
    setEditOpen(true);
  }, [selectedRole]);

  useEffect(() => {
    if (editRoleDetail && editMode === "edit" && editOpen) {
      setEditDraft(roleToFormDraft(editRoleDetail));
      setOriginalPermissionKeys([...editRoleDetail.permissionKeys]);
    }
  }, [editRoleDetail, editMode, editOpen]);

  const handleReload = useCallback(() => {
    void refetch();
    void qc.invalidateQueries({ queryKey: ["iam", "users"] });
    setColumnFilters(emptyColumnFilters());
    toast.success("Đã nạp lại dữ liệu");
  }, [qc, refetch]);

  const permissionsChanged = useCallback(
    (draft: RoleFormDraft) => {
      const a = [...draft.permissionKeys].sort().join(",");
      const b = [...originalPermissionKeys].sort().join(",");
      return a !== b;
    },
    [originalPermissionKeys],
  );

  const handleSaveRole = useCallback(async () => {
    if (!editDraft.name.trim()) {
      toast.error("Tên vai trò không được để trống.");
      return;
    }

    try {
      if (editMode === "create") {
        await createRole.mutateAsync(editDraft);
        toast.success("Đã tạo vai trò mới.");
      } else if (editRoleId) {
        if (editingIsSystem) {
          toast.error("Vai trò hệ thống không thể chỉnh sửa.");
          return;
        }
        await updateRole.mutateAsync({
          draft: editDraft,
          isSystem: false,
        });
        if (permissionsChanged(editDraft)) {
          await setPermissions.mutateAsync(editDraft);
        }
        toast.success("Đã cập nhật vai trò.");
      }
      setEditOpen(false);
      void refetch();
    } catch (err) {
      toast.error(getIamErrorMessage(err, "Không lưu được vai trò."));
    }
  }, [
    createRole,
    editDraft,
    editMode,
    editRoleId,
    permissionsChanged,
    refetch,
    editingIsSystem,
    setPermissions,
    updateRole,
  ]);

  const handleDeleteRole = useCallback(async () => {
    if (!selectedRole || selectedRole.isSystem) return;
    try {
      await deleteRole.mutateAsync(selectedRole.id);
      setSelectedRoleId(null);
      setConfirmDeleteRole(false);
      toast.success("Đã xóa vai trò.");
    } catch (err) {
      toast.error(getIamErrorMessage(err, "Không xóa được vai trò."));
    }
  }, [deleteRole, selectedRole]);

  const handlePickerConfirm = useCallback(
    async (userIds: string[]) => {
      if (!selectedRoleId) return;
      try {
        const usersPayload = allUserDetails.map((u) => ({
          id: u.id,
          roleIds: u.roleIds,
        }));
        const count = await syncRoleUsers.mutateAsync({
          allUsers: usersPayload,
          roleId: selectedRoleId,
          desiredUserIds: userIds,
        });
        toast.success(
          count > 0 ? `Đã cập nhật ${count} người dùng.` : "Không có thay đổi.",
        );
      } catch (err) {
        toast.error(
          getIamErrorMessage(err, "Không cập nhật được danh sách người dùng."),
        );
      }
    },
    [allUserDetails, selectedRoleId, syncRoleUsers],
  );

  const handleRemoveUser = useCallback(async () => {
    if (!confirmRemove || !selectedRoleId) return;
    const nextIds = assignedUserIds.filter((id) => id !== confirmRemove.id);
    await handlePickerConfirm(nextIds);
    setConfirmRemove(null);
  }, [assignedUserIds, confirmRemove, handlePickerConfirm, selectedRoleId]);

  const saving =
    createRole.isPending || updateRole.isPending || setPermissions.isPending;

  const toolbarItems: ToolbarItem[] = [
    {
      id: "add",
      label: "Thêm mới",
      icon: Plus,
      onClick: openCreate,
      disabled: !canWrite,
    },
    {
      id: "edit",
      label: selectedRole?.isSystem ? "Xem" : "Sửa",
      icon: Pencil,
      onClick: openEdit,
      disabled: !selectedRole || !canWrite,
    },
    {
      id: "delete",
      label: "Xóa",
      icon: Trash2,
      variant: "danger",
      onClick: () => setConfirmDeleteRole(true),
      disabled: !selectedRole || !canDelete || selectedRole?.isSystem === true,
    },
    { id: "sep", type: "separator" },
    { id: "reload", label: "Nạp", icon: RefreshCw, onClick: handleReload },
  ];

  const columns: TableColumn<RoleSummary>[] = [
    {
      key: "name",
      label: "Tên vai trò",
      width: 280,
      render: (row) => (
        <span className="flex items-center gap-2">
          {row.name}
          {row.isSystem && (
            <Badge variant="outline" className="text-xs font-normal">
              Hệ thống
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "description",
      label: "Diễn giải",
      render: (row) => row.description ?? "—",
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

  if (!canRead) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Bạn không có quyền xem quản lý vai trò ({IAM_PERMISSION_KEYS.ROLE_READ}
        ).
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <DocumentListShell
        toolbar={<PageToolbar items={toolbarItems} tone="primary" />}
        title="Quản lý vai trò"
        detailPanel={
          <RoleDetailPanel
            role={selectedRole}
            users={roleUsers}
            usersLoading={usersLoading}
            canAssign={canAssignUsers}
            onChoose={() => setPickerOpen(true)}
            onRemoveUser={(user) => setConfirmRemove(user)}
          />
        }
      >
        {isError && (
          <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            {getIamErrorMessage(error, "Không tải được danh sách vai trò.")}
          </p>
        )}
        <BaseDataTable
          columns={columns}
          rows={filteredRoles}
          loading={isLoading}
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
                  setSelectedRoleId(selectedRoleId === row.id ? null : row.id)
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
        mode={editMode}
        draft={editDraft}
        isSystem={editMode === "edit" && editingIsSystem}
        saving={saving}
        onDraftChange={setEditDraft}
        onClose={() => setEditOpen(false)}
        onSave={() => void handleSaveRole()}
      />

      {selectedRole && (
        <RoleEmployeePickerModal
          open={pickerOpen}
          roleName={selectedRole.name}
          users={allUserDetails}
          assignedUserIds={assignedUserIds}
          loading={usersLoading}
          onOpenChange={setPickerOpen}
          onConfirm={(ids) => void handlePickerConfirm(ids)}
        />
      )}

      {confirmRemove && selectedRole && (
        <ConfirmActionModal
          title="Gỡ người dùng khỏi vai trò"
          message={`Xác nhận gỡ "${joinFullName(confirmRemove.firstName, confirmRemove.lastName)}" (${confirmRemove.email}) khỏi vai trò "${selectedRole.name}"?`}
          confirmLabel="Gỡ"
          cancelLabel="Quay lại"
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => void handleRemoveUser()}
        />
      )}

      {confirmDeleteRole && selectedRole && (
        <ConfirmActionModal
          title="Xóa vai trò"
          message={`Xác nhận xóa vai trò "${selectedRole.name}"?`}
          confirmLabel="Xóa"
          cancelLabel="Quay lại"
          onCancel={() => setConfirmDeleteRole(false)}
          onConfirm={() => void handleDeleteRole()}
        />
      )}
    </div>
  );
}
