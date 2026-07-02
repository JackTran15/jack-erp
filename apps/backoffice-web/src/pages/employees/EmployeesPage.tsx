import { useCallback, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  IAM_PERMISSION_KEYS,
  type UserDetail,
  type UserSummary,
} from "@erp/shared-interfaces";
import { DocumentListShell, PageToolbar, type ToolbarItem } from "@erp/ui";
import { PageHeader } from "../../components/layout/PageHeader";
import { resolveBackofficeBreadcrumbs } from "../../components/layout/breadcrumbs";
import { Copy, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  BaseDataTable,
  type TableColumn,
} from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import { ActiveStatusBadge } from "../../components/status/StatusBadge";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  type ColumnFilter,
  type ColumnFilterMode,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import { columnToStringFilter } from "../../components/crud/crudV2Search";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { hasPermission } from "../../lib/permissions";
import {
  draftToUserUpdatePayload,
  formatIamDateTime,
  getIamErrorMessage,
  joinFullName,
  useCreateUser,
  useDeactivateUser,
  useEmployeeSearch,
  useRoles,
  useUpdateUser,
  useUser,
  userDisplayCode,
  type EmployeeSearchBody,
} from "../../hooks/iam";
import type { EmployeeFormDraft, EmployeeFormMode } from "./employee.types";
import { userDetailToEmployeeDraft } from "./employee.mappers";
import { EmployeeDetailPanel } from "./components/EmployeeDetailPanel";
import {
  EmployeeFormModal,
  type EmployeeFormSaveContext,
} from "./components/EmployeeFormModal";

const FILTER_KEYS = ["code", "fullName", "email", "status"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "true", label: "Đang hoạt động" },
  { value: "false", label: "Ngừng hoạt động" },
];

function emptyColumnFilters(): Record<FilterKey, ColumnFilter> {
  return FILTER_KEYS.reduce(
    (acc, k) => {
      acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
      return acc;
    },
    {} as Record<FilterKey, ColumnFilter>,
  );
}

function resolveEmployeeSearchBody(
  columnFilters: Record<FilterKey, ColumnFilter>,
  pagination: PaginationStateDto,
): EmployeeSearchBody {
  const status = columnFilters.status.value;
  return {
    page: pagination.page,
    limit: pagination.pageSize,
    code: columnToStringFilter(columnFilters.code),
    fullName: columnToStringFilter(columnFilters.fullName),
    email: columnToStringFilter(columnFilters.email),
    isActive: status === "true" ? true : status === "false" ? false : undefined,
  };
}

export function EmployeesPage() {
  const location = useLocation();
  const breadcrumbs = resolveBackofficeBreadcrumbs(location.pathname);

  const canRead = hasPermission(IAM_PERMISSION_KEYS.USER_READ);
  const canWrite = hasPermission(IAM_PERMISSION_KEYS.USER_WRITE);
  const canDelete = hasPermission(IAM_PERMISSION_KEYS.USER_DELETE);

  const [pagination, setPagination] =
    useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [columnFilters, setColumnFilters] =
    useState<Record<FilterKey, ColumnFilter>>(emptyColumnFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<EmployeeFormMode>("create");
  const [formInitialDraft, setFormInitialDraft] = useState<
    EmployeeFormDraft | undefined
  >();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{
    id: string;
    label: string;
  } | null>(null);

  // Debounce only the filter inputs so typing doesn't fire a request per
  // keystroke; page/pageSize changes still apply immediately.
  const debouncedFilters = useDebouncedValue(columnFilters, 300);
  const searchBody = useMemo(
    () => resolveEmployeeSearchBody(debouncedFilters, pagination),
    [debouncedFilters, pagination],
  );

  const {
    data: listData,
    isLoading,
    isError,
    error,
    refetch,
  } = useEmployeeSearch(searchBody);
  const { data: roles = [] } = useRoles();
  const { data: userDetail } = useUser(selectedId ?? undefined);

  const createUser = useCreateUser();
  const updateUser = useUpdateUser(editingId ?? "");
  const deactivateUser = useDeactivateUser();

  // Server-side filtered — render rows as-is.
  const listRows = useMemo(() => listData?.data ?? [], [listData?.data]);

  const selectedUser = useMemo((): UserDetail | UserSummary | null => {
    if (!selectedId) return null;
    if (userDetail?.id === selectedId) return userDetail;
    return listRows.find((u) => u.id === selectedId) ?? null;
  }, [listRows, selectedId, userDetail]);

  const openCreate = useCallback(() => {
    setFormMode("create");
    setEditingId(null);
    setFormInitialDraft(undefined);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback(() => {
    if (!selectedId) {
      toast.error("Vui lòng chọn một nhân viên để sửa.");
      return;
    }
    setFormMode("edit");
    setEditingId(selectedId);
    setFormInitialDraft(undefined);
    setFormOpen(true);
  }, [selectedId]);

  const openDuplicate = useCallback(() => {
    if (!userDetail) {
      toast.error("Vui lòng chọn một nhân viên để nhân bản.");
      return;
    }
    const draft = userDetailToEmployeeDraft(userDetail);
    draft.basic.code = "";
    draft.basic.email = "";
    draft.basic.changePassword = false;
    draft.basic.password = "";
    draft.basic.confirmPassword = "";
    setFormMode("create");
    setEditingId(null);
    setFormInitialDraft(draft);
    setFormOpen(true);
  }, [userDetail]);

  const handleReload = useCallback(() => {
    void refetch();
    setPagination((p) => ({ ...p, page: 1 }));
    setColumnFilters(emptyColumnFilters());
    toast.success("Đã nạp lại dữ liệu");
  }, [refetch]);

  const handleColumnFilterValueChange = useCallback(
    (key: string, value: string) => {
      setColumnFilters((prev) => ({
        ...prev,
        [key as FilterKey]: { ...prev[key as FilterKey], value },
      }));
      setPagination((p) => ({ ...p, page: 1 }));
    },
    [],
  );

  const handleColumnFilterModeChange = useCallback(
    (key: string, mode: ColumnFilterMode) => {
      setColumnFilters((prev) => ({
        ...prev,
        [key as FilterKey]: { ...prev[key as FilterKey], mode },
      }));
      setPagination((p) => ({ ...p, page: 1 }));
    },
    [],
  );

  const handleSave = useCallback(
    async (draft: EmployeeFormDraft, context: EmployeeFormSaveContext) => {
      try {
        if (formMode === "create") {
          const created = await createUser.mutateAsync(draft);
          setSelectedId(created.id);
          toast.success("Đã thêm người dùng mới.");
        } else if (editingId) {
          const snapshot = context.loadedUser;
          const previous = snapshot
            ? {
                roleIds: snapshot.roleIds,
                branchIds: snapshot.branchIds,
                isActive: snapshot.isActive,
              }
            : undefined;
          const payload = draftToUserUpdatePayload(draft, previous);
          await updateUser.mutateAsync(payload);
          toast.success("Đã cập nhật người dùng.");
        }

        setFormOpen(false);
        setEditingId(null);
        setFormInitialDraft(undefined);
        void refetch();
      } catch (err) {
        toast.error(getIamErrorMessage(err, "Không lưu được người dùng."));
      }
    },
    [createUser, editingId, formMode, refetch, updateUser],
  );

  const handleSaveAndAddNew = useCallback(
    async (draft: EmployeeFormDraft, context: EmployeeFormSaveContext) => {
      try {
        if (formMode === "create") {
          await createUser.mutateAsync(draft);
          toast.success("Đã thêm người dùng mới.");
        } else if (editingId) {
          const snapshot = context.loadedUser;
          const previous = snapshot
            ? {
                roleIds: snapshot.roleIds,
                branchIds: snapshot.branchIds,
                isActive: snapshot.isActive,
              }
            : undefined;
          const payload = draftToUserUpdatePayload(draft, previous);
          await updateUser.mutateAsync(payload);
          toast.success("Đã cập nhật người dùng.");
        }
        setEditingId(null);
        setFormMode("create");
        setFormInitialDraft(undefined);
        void refetch();
      } catch (err) {
        toast.error(getIamErrorMessage(err, "Không lưu được người dùng."));
      }
    },
    [createUser, editingId, formMode, refetch, updateUser],
  );

  const handleDeactivate = useCallback(async () => {
    if (!confirmDeactivate) return;
    try {
      await deactivateUser.mutateAsync(confirmDeactivate.id);
      setSelectedId((id) => (id === confirmDeactivate.id ? null : id));
      setConfirmDeactivate(null);
      toast.success("Đã ngừng hoạt động tài khoản.");
    } catch (err) {
      toast.error(
        getIamErrorMessage(err, "Không ngừng hoạt động được tài khoản."),
      );
    }
  }, [confirmDeactivate, deactivateUser]);

  const toolbarItems: ToolbarItem[] = [
    {
      id: "add",
      label: "Thêm mới",
      icon: Plus,
      onClick: openCreate,
      disabled: !canWrite,
    },
    {
      id: "clone",
      label: "Nhân bản",
      icon: Copy,
      onClick: openDuplicate,
      disabled: !selectedId || !canWrite,
    },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      onClick: () => void openEdit(),
      disabled: !selectedId || !canWrite,
    },
    { id: "sep1", type: "separator" },
    {
      id: "delete",
      label: "Ngừng HĐ",
      icon: Trash2,
      variant: "danger",
      onClick: () =>
        selectedUser &&
        setConfirmDeactivate({
          id: selectedUser.id,
          label: `${joinFullName(selectedUser.firstName, selectedUser.lastName)} (${selectedUser.email})`,
        }),
      disabled: !selectedUser || !canDelete,
    },
    { id: "sep2", type: "separator" },
    { id: "reload", label: "Nạp", icon: RefreshCw, onClick: handleReload },
  ];

  const columns: TableColumn<UserSummary>[] = [
    {
      key: "code",
      label: "Mã / email",
      width: 160,
      render: (row) => userDisplayCode(row),
    },
    {
      key: "fullName",
      label: "Họ và tên",
      width: 200,
      render: (row) => joinFullName(row.firstName, row.lastName),
    },
    {
      key: "email",
      label: "Email",
      width: 220,
      render: (row) => row.email,
    },
    {
      key: "status",
      label: "Trạng thái",
      width: 140,
      filterKind: "select",
      filterOptions: STATUS_FILTER_OPTIONS,
      render: (row) => <ActiveStatusBadge active={row.isActive} />,
    },
    {
      key: "lastLoginAt",
      label: "Đăng nhập gần nhất",
      width: 180,
      filterKind: "none",
      render: (row) => formatIamDateTime(row.lastLoginAt),
    },
  ];

  const columnFilterControl = useMemo(
    () => ({
      filters: columnFilters as unknown as Record<string, ColumnFilter>,
      onModeChange: handleColumnFilterModeChange,
      onValueChange: handleColumnFilterValueChange,
    }),
    [
      columnFilters,
      handleColumnFilterModeChange,
      handleColumnFilterValueChange,
    ],
  );

  const total = listData?.total ?? 0;

  if (!canRead) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Bạn không có quyền xem danh sách nhân viên (
        {IAM_PERMISSION_KEYS.USER_READ}).
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Nhân viên"
        breadcrumbs={breadcrumbs}
        className="mb-2 shrink-0"
      />
      <DocumentListShell
        toolbar={<PageToolbar items={toolbarItems} tone="primary" />}
        pagination={
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={total}
            onPageChange={(p) =>
              setPagination((prev) => ({ ...prev, page: p }))
            }
            onPageSizeChange={(nextPageSize) =>
              setPagination((prev) => ({
                ...prev,
                page: 1,
                pageSize: nextPageSize,
              }))
            }
          />
        }
        detailPanel={<EmployeeDetailPanel user={selectedUser} roles={roles} />}
      >
        {isError && (
          <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            {getIamErrorMessage(error, "Không tải được danh sách nhân viên.")}
          </p>
        )}
        <BaseDataTable
          columns={columns}
          rows={listRows}
          loading={isLoading}
          emptyLabel="Chưa có nhân viên."
          getRowKey={(row) => row.id}
          onRowClick={(row) => setSelectedId(row.id)}
          columnFilterControl={columnFilterControl}
          leadingColumn={{
            width: 36,
            header: <span className="sr-only">Chọn</span>,
            cell: (row) => (
              <input
                type="checkbox"
                aria-label={`Chọn nhân viên ${joinFullName(row.firstName, row.lastName)}`}
                checked={selectedId === row.id}
                onChange={() =>
                  setSelectedId(selectedId === row.id ? null : row.id)
                }
                onClick={(e) => e.stopPropagation()}
              />
            ),
          }}
        />
      </DocumentListShell>

      <EmployeeFormModal
        open={formOpen}
        mode={formMode}
        userId={editingId ?? undefined}
        initialDraft={formInitialDraft}
        onClose={() => {
          setFormOpen(false);
          setEditingId(null);
          setFormInitialDraft(undefined);
        }}
        onSave={(draft, context) => void handleSave(draft, context)}
        onSaveAndAddNew={(draft, context) =>
          void handleSaveAndAddNew(draft, context)
        }
      />

      {confirmDeactivate && (
        <ConfirmActionModal
          title="Ngừng hoạt động tài khoản"
          message={`Xác nhận ngừng hoạt động tài khoản "${confirmDeactivate.label}"? Người dùng sẽ không đăng nhập được.`}
          confirmLabel="Ngừng hoạt động"
          cancelLabel="Quay lại"
          onCancel={() => setConfirmDeactivate(null)}
          onConfirm={() => void handleDeactivate()}
        />
      )}
    </div>
  );
}
