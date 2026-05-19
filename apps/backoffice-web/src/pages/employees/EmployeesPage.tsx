import { useCallback, useEffect, useMemo, useState } from "react";
import { DocumentListShell, PageToolbar, type ToolbarItem } from "@erp/ui";
import { Copy, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  BaseDataTable,
  type TableColumn,
} from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";

import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import {
  applyColumnFilter,
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  toComparableText,
  type ColumnFilter,
  type ColumnFilterMode,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import type { Employee, EmployeeFormDraft } from "./employee.types";
import { INITIAL_EMPLOYEES } from "./employees.mock";
import {
  createEmptyDraft,
  draftToEmployee,
  employeeToDraft,
  EMPLOYMENT_FILTER_OPTIONS,
  formatEmployeeDate,
  formatEmploymentStatus,
  formatGender,
  GENDER_FILTER_OPTIONS,
  suggestNextEmployeeCode,
} from "./employee.mappers";
import { EmployeeDetailPanel } from "./components/EmployeeDetailPanel";
import {
  EmployeeFormModal,
  type EmployeeFormMode,
} from "./components/EmployeeFormModal";

const FILTER_KEYS = [
  "code",
  "fullName",
  "gender",
  "birthDate",
  "phone",
  "employmentStatus",
] as const;

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

function matchesSelectFilter(rowValue: string, filterValue: string): boolean {
  if (!filterValue) return true;
  return rowValue === filterValue;
}

function matchesDateFilter(rowValue: string, filterValue: string): boolean {
  if (!filterValue) return true;
  return rowValue.startsWith(filterValue);
}

export function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>(() => [
    ...INITIAL_EMPLOYEES,
  ]);
  const [pagination, setPagination] =
    useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [columnFilters, setColumnFilters] =
    useState<Record<FilterKey, ColumnFilter>>(emptyColumnFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<EmployeeFormMode>("create");
  const [formDraft, setFormDraft] = useState<EmployeeFormDraft>(() =>
    createEmptyDraft(suggestNextEmployeeCode(INITIAL_EMPLOYEES)),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null);

  const filteredRows = useMemo(() => {
    return employees.filter((row) => {
      const checks: boolean[] = [
        applyColumnFilter(toComparableText(row.code), columnFilters.code),
        applyColumnFilter(
          toComparableText(row.fullName),
          columnFilters.fullName,
        ),
        matchesSelectFilter(row.gender, columnFilters.gender.value),
        matchesDateFilter(row.birthDate ?? "", columnFilters.birthDate.value),
        applyColumnFilter(toComparableText(row.phone), columnFilters.phone),
        matchesSelectFilter(
          row.employmentStatus,
          columnFilters.employmentStatus.value,
        ),
      ];
      return checks.every(Boolean);
    });
  }, [employees, columnFilters]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, [columnFilters]);

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
  const page = Math.min(pagination.page, totalPages);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pagination.pageSize;
    return filteredRows.slice(start, start + pagination.pageSize);
  }, [filteredRows, page, pagination.pageSize]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedId) ?? null,
    [employees, selectedId],
  );

  const openCreate = useCallback(() => {
    setFormMode("create");
    setEditingId(null);
    setFormDraft(createEmptyDraft(suggestNextEmployeeCode(employees)));
    setFormOpen(true);
  }, [employees]);

  const openEdit = useCallback(() => {
    if (!selectedEmployee) {
      toast.error("Vui lòng chọn một nhân viên để sửa.");
      return;
    }
    setFormMode("edit");
    setEditingId(selectedEmployee.id);
    setFormDraft(employeeToDraft(selectedEmployee));
    setFormOpen(true);
  }, [selectedEmployee]);

  const openDuplicate = useCallback(() => {
    if (!selectedEmployee) {
      toast.error("Vui lòng chọn một nhân viên để nhân bản.");
      return;
    }
    const draft = employeeToDraft(selectedEmployee);
    draft.basic.code = `${selectedEmployee.code}-copy`;
    setFormMode("create");
    setEditingId(null);
    setFormDraft(draft);
    setFormOpen(true);
  }, [selectedEmployee]);

  const handleReload = useCallback(() => {
    setColumnFilters(emptyColumnFilters());
    setPagination((p) => ({ ...p, page: 1 }));
    toast.success("Đã nạp lại dữ liệu");
  }, []);

  const handleSave = useCallback(
    (draft: EmployeeFormDraft, options: { keepOpen: boolean }) => {
      const saved = draftToEmployee(draft, editingId ?? undefined);
      setEmployees((prev) => {
        const idx = prev.findIndex((e) => e.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
      setSelectedId(saved.id);
      toast.success(
        editingId ? "Đã cập nhật nhân viên." : "Đã thêm nhân viên mới.",
      );

      if (options.keepOpen) {
        setFormMode("create");
        setEditingId(null);
        setFormDraft(
          createEmptyDraft(suggestNextEmployeeCode([...employees, saved])),
        );
      } else {
        setFormOpen(false);
        setEditingId(null);
      }
    },
    [editingId, employees],
  );

  const handleDelete = useCallback(() => {
    if (!confirmDelete) return;
    setEmployees((prev) => prev.filter((e) => e.id !== confirmDelete.id));
    setSelectedId((id) => (id === confirmDelete.id ? null : id));
    setConfirmDelete(null);
    toast.success("Đã xóa nhân viên.");
  }, [confirmDelete]);

  const toolbarItems: ToolbarItem[] = [
    { id: "add", label: "Thêm mới", icon: Plus, onClick: openCreate },
    {
      id: "clone",
      label: "Nhân bản",
      icon: Copy,
      onClick: openDuplicate,
      disabled: !selectedEmployee,
    },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      onClick: openEdit,
      disabled: !selectedEmployee,
    },
    { id: "sep1", type: "separator" },
    {
      id: "delete",
      label: "Xóa",
      icon: Trash2,
      variant: "danger",
      onClick: () => selectedEmployee && setConfirmDelete(selectedEmployee),
      disabled: !selectedEmployee,
    },
    { id: "sep2", type: "separator" },
    { id: "reload", label: "Nạp", icon: RefreshCw, onClick: handleReload },
  ];

  const columns: TableColumn<Employee>[] = [
    {
      key: "code",
      label: "Mã nhân viên",
      width: 140,
      render: (row) => row.code,
    },
    {
      key: "fullName",
      label: "Tên nhân viên",
      width: 200,
      render: (row) => row.fullName,
    },
    {
      key: "gender",
      label: "Giới tính",
      width: 120,
      filterKind: "select",
      filterOptions: GENDER_FILTER_OPTIONS,
      render: (row) => formatGender(row.gender),
    },
    {
      key: "birthDate",
      label: "Ngày sinh",
      width: 130,
      filterKind: "date",
      render: (row) => formatEmployeeDate(row.birthDate),
    },
    {
      key: "phone",
      label: "Số điện thoại",
      width: 140,
      render: (row) => row.phone,
    },
    {
      key: "employmentStatus",
      label: "Trạng thái làm việc",
      width: 160,
      filterKind: "select",
      filterOptions: EMPLOYMENT_FILTER_OPTIONS,
      render: (row) => formatEmploymentStatus(row.employmentStatus),
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
        title="Nhân viên"
        toolbar={
          <PageToolbar
            items={toolbarItems}
            tone="primary"
            className="rounded-none"
          />
        }
        pagination={
          <PaginationControls
            page={page}
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
        detailPanel={<EmployeeDetailPanel employee={selectedEmployee} />}
      >
        <BaseDataTable
          columns={columns}
          rows={pagedRows}
          loading={false}
          emptyLabel="Chưa có nhân viên."
          getRowKey={(row) => row.id}
          onRowClick={(row) => setSelectedId(row.id)}
          leadingColumn={{
            width: 36,
            header: <span className="sr-only">Chọn</span>,
            cell: (row) => (
              <input
                type="checkbox"
                aria-label={`Chọn nhân viên ${row.fullName}`}
                checked={selectedId === row.id}
                onChange={() =>
                  setSelectedId(selectedId === row.id ? null : row.id)
                }
                onClick={(e) => e.stopPropagation()}
              />
            ),
          }}
          columnFilterControl={columnFilterControl}
        />
      </DocumentListShell>

      <EmployeeFormModal
        open={formOpen}
        mode={formMode}
        draft={formDraft}
        onDraftChange={setFormDraft}
        onClose={() => {
          setFormOpen(false);
          setEditingId(null);
        }}
        onSave={handleSave}
      />

      {confirmDelete && (
        <ConfirmActionModal
          title="Xóa nhân viên"
          message={`Xác nhận xóa nhân viên "${confirmDelete.fullName}" (${confirmDelete.code})?`}
          confirmLabel="Xóa"
          cancelLabel="Quay lại"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
