import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocumentType } from "@erp/shared-interfaces";
import { formatClientError } from "@erp/api-client";
import { AppModal, Button, Input } from "@erp/ui";
import { apiClient } from "../../lib/api-axios";
import { AdminPageShell } from "../../components/layout/AdminPageShell";
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import {
  DEFAULT_PAGINATION,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";

type ResetPolicy = "NEVER" | "DAILY" | "MONTHLY" | "YEARLY";

interface DocumentNumberRule {
  id: string;
  organizationId: string;
  branchId?: string | null;
  documentType: DocumentType;
  prefix: string;
  suffix?: string | null;
  includeDate: boolean;
  dateFormat: "YYYYMMDD" | "YYYYMM" | "YYYY" | "MMDD" | "MM" | "DD";
  sequenceLength: number;
  resetPolicy: ResetPolicy;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface RuleFormState {
  documentType: DocumentType;
  branchId: string;
  prefix: string;
  suffix: string;
  includeDate: boolean;
  dateFormat: "YYYYMMDD" | "YYYYMM" | "YYYY" | "MMDD" | "MM" | "DD";
  sequenceLength: number;
  resetPolicy: ResetPolicy;
}

const DOCUMENT_TYPE_OPTIONS = Object.values(DocumentType).map((value) => ({
  value,
  label: formatDocumentTypeLabel(value),
}));

const DATE_FORMAT_OPTIONS: RuleFormState["dateFormat"][] = [
  "YYYYMMDD",
  "YYYYMM",
  "YYYY",
  "MMDD",
  "MM",
  "DD",
];

const RESET_POLICY_OPTIONS: { value: ResetPolicy; label: string }[] = [
  { value: "DAILY", label: "Hàng ngày" },
  { value: "MONTHLY", label: "Hàng tháng" },
  { value: "YEARLY", label: "Hàng năm" },
  { value: "NEVER", label: "Không đặt lại" },
];

const DEFAULT_FORM: RuleFormState = {
  documentType: DocumentType.PURCHASE_ORDER,
  branchId: "",
  prefix: "PDH",
  suffix: "",
  includeDate: false,
  dateFormat: "YYYYMM",
  sequenceLength: 6,
  resetPolicy: "NEVER",
};

export function DocumentNumberingPage() {
  const [records, setRecords] = useState<PaginatedResponse<DocumentNumberRule> | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [documentTypeFilter, setDocumentTypeFilter] = useState<string>("");
  const [branchIdFilterInput, setBranchIdFilterInput] = useState("");
  const [branchIdFilter, setBranchIdFilter] = useState("");
  const [editingRule, setEditingRule] = useState<DocumentNumberRule | null>(null);
  const [showForm, setShowForm] = useState(false);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        sortBy: pagination.sortBy ?? "createdAt",
        sortOrder: pagination.sortOrder ?? "desc",
      });

      if (documentTypeFilter) {
        params.set("documentType", documentTypeFilter);
      }
      if (branchIdFilter.trim()) {
        params.set("branchId", branchIdFilter.trim());
      }

      const { data } = await apiClient.get<PaginatedResponse<DocumentNumberRule>>(
        `/document-number-rules?${params.toString()}`,
      );
      setRecords(data);
      setError(null);
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setLoading(false);
    }
  }, [pagination, documentTypeFilter, branchIdFilter]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const handleActivateToggle = async (rule: DocumentNumberRule) => {
    setActionLoadingId(rule.id);
    try {
      if (rule.isActive) {
        await apiClient.post(`/document-number-rules/${rule.id}/deactivate`);
      } else {
        await apiClient.post(`/document-number-rules/${rule.id}/activate`);
      }
      await loadRules();
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  const columns = useMemo<TableColumn<DocumentNumberRule>[]>(
    () => [
      {
        key: "documentType",
        label: "Loại chứng từ",
        render: (row) => formatDocumentTypeLabel(row.documentType),
      },
      {
        key: "scope",
        label: "Phạm vi",
        render: (row) =>
          row.branchId ? (
            <span className="font-mono text-xs">{row.branchId}</span>
          ) : (
            <span className="text-muted-foreground">Toàn tổ chức</span>
          ),
      },
      {
        key: "format",
        label: "Mẫu số",
        render: (row) => (
          <span className="font-mono text-xs">
            {buildFormatPreview(row)}
          </span>
        ),
      },
      {
        key: "resetPolicy",
        label: "Chu kỳ đặt lại",
        render: (row) => formatResetPolicy(row.resetPolicy),
      },
      {
        key: "isActive",
        label: "Trạng thái",
        render: (row) => (
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              row.isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
            }`}
          >
            {row.isActive ? "Đang hoạt động" : "Ngưng hoạt động"}
          </span>
        ),
      },
      {
        key: "updatedAt",
        label: "Cập nhật",
        render: (row) => new Date(row.updatedAt).toLocaleString("vi-VN"),
      },
    ],
    [],
  );

  return (
    <AdminPageShell>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cấu hình đánh số chứng từ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Thiết lập quy tắc đánh số theo loại chứng từ và phạm vi áp dụng.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingRule(null);
            setShowForm(true);
          }}
        >
          + Thêm quy tắc
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={documentTypeFilter}
          onChange={(event) => {
            setDocumentTypeFilter(event.target.value);
            setPagination((prev) => ({ ...prev, page: 1 }));
          }}
        >
          <option value="">Tất cả loại chứng từ</option>
          {DOCUMENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setBranchIdFilter(branchIdFilterInput.trim());
            setPagination((prev) => ({ ...prev, page: 1 }));
          }}
        >
          <Input
            placeholder="Lọc theo branchId (tuỳ chọn)"
            value={branchIdFilterInput}
            onChange={(event) => setBranchIdFilterInput(event.target.value)}
          />
          <Button type="submit" variant="outline">
            Lọc
          </Button>
        </form>
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <BaseDataTable
        columns={columns}
        rows={records?.data ?? []}
        loading={loading}
        emptyLabel="Chưa có quy tắc đánh số."
        getRowKey={(row) => row.id}
        renderActions={(row) => (
          <div className="flex gap-2">
            <Button
              variant="link"
              size="sm"
              className="h-auto px-1 py-0.5"
              onClick={() => {
                setEditingRule(row);
                setShowForm(true);
              }}
            >
              Sửa
            </Button>
            <Button
              variant="link"
              size="sm"
              className={`h-auto px-1 py-0.5 ${
                row.isActive ? "text-destructive" : "text-green-700"
              }`}
              disabled={actionLoadingId === row.id}
              onClick={() => void handleActivateToggle(row)}
            >
              {row.isActive ? "Ngưng" : "Kích hoạt"}
            </Button>
          </div>
        )}
      />

      <PaginationControls
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={records?.total ?? 0}
        onPageChange={(nextPage) =>
          setPagination((prev) => ({ ...prev, page: nextPage }))
        }
      />

      {showForm && (
        <DocumentNumberRuleModal
          rule={editingRule}
          onCancel={() => {
            setShowForm(false);
            setEditingRule(null);
          }}
          onSaved={async () => {
            setShowForm(false);
            setEditingRule(null);
            await loadRules();
          }}
        />
      )}
    </AdminPageShell>
  );
}

function DocumentNumberRuleModal({
  rule,
  onCancel,
  onSaved,
}: {
  rule: DocumentNumberRule | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<RuleFormState>(() => {
    if (!rule) return DEFAULT_FORM;
    return {
      documentType: rule.documentType,
      branchId: rule.branchId ?? "",
      prefix: rule.prefix,
      suffix: rule.suffix ?? "",
      includeDate: rule.includeDate,
      dateFormat: rule.dateFormat,
      sequenceLength: Number(rule.sequenceLength),
      resetPolicy: rule.resetPolicy,
    };
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const preview = buildPreview(form);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.prefix.trim()) {
      setError("Prefix không được để trống.");
      return;
    }
    if (form.sequenceLength < 1 || form.sequenceLength > 12) {
      setError("Độ dài số thứ tự phải từ 1 đến 12.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (rule) {
        await apiClient.patch(`/document-number-rules/${rule.id}`, {
          prefix: form.prefix.trim(),
          suffix: form.suffix.trim() || undefined,
          includeDate: form.includeDate,
          dateFormat: form.dateFormat,
          sequenceLength: Number(form.sequenceLength),
          resetPolicy: form.resetPolicy,
        });
      } else {
        await apiClient.post("/document-number-rules", {
          documentType: form.documentType,
          branchId: form.branchId.trim() || undefined,
          prefix: form.prefix.trim(),
          suffix: form.suffix.trim() || undefined,
          includeDate: form.includeDate,
          dateFormat: form.dateFormat,
          sequenceLength: Number(form.sequenceLength),
          resetPolicy: form.resetPolicy,
        });
      }
      await onSaved();
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={rule ? "Cập nhật quy tắc đánh số" : "Tạo quy tắc đánh số"}
      onCancel={onCancel}
      onSave={() => formRef.current?.requestSubmit()}
      saveLabel={saving ? "Đang lưu..." : "Lưu"}
      saveDisabled={saving}
      className="max-w-[620px]"
    >
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <form ref={formRef} className="flex flex-col gap-3" onSubmit={(e) => void handleSubmit(e)}>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Loại chứng từ</label>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.documentType}
              disabled={Boolean(rule)}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  documentType: event.target.value as DocumentType,
                  prefix: defaultPrefix(event.target.value as DocumentType),
                }))
              }
            >
              {DOCUMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Chi nhánh (branchId)</label>
            <Input
              value={form.branchId}
              disabled={Boolean(rule)}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, branchId: event.target.value }))
              }
              placeholder="Để trống nếu áp dụng toàn tổ chức"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Prefix</label>
            <Input
              value={form.prefix}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, prefix: event.target.value }))
              }
              placeholder="Ví dụ: PO"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Suffix</label>
            <Input
              value={form.suffix}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, suffix: event.target.value }))
              }
              placeholder="Không bắt buộc"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Định dạng ngày</label>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={!form.includeDate}
              value={form.dateFormat}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  dateFormat: event.target.value as RuleFormState["dateFormat"],
                }))
              }
            >
              {DATE_FORMAT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Độ dài số thứ tự</label>
            <Input
              type="number"
              min={1}
              max={12}
              value={form.sequenceLength}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  sequenceLength: Number(event.target.value),
                }))
              }
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Chu kỳ đặt lại</label>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.resetPolicy}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  resetPolicy: event.target.value as ResetPolicy,
                }))
              }
            >
              {RESET_POLICY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.includeDate}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, includeDate: event.target.checked }))
            }
            className="h-4 w-4 rounded border border-input"
          />
          Gắn ngày vào số chứng từ
        </label>

        <div className="rounded-md bg-muted p-3">
          <p className="text-xs text-muted-foreground">Mẫu hiển thị</p>
          <p className="mt-1 font-mono text-sm">{preview}</p>
        </div>
      </form>
    </AppModal>
  );
}

function formatDocumentTypeLabel(documentType: DocumentType): string {
  const labels: Record<DocumentType, string> = {
    [DocumentType.INVOICE]: "Hóa đơn",
    [DocumentType.SALE]: "Bán hàng",
    [DocumentType.RETURN]: "Trả hàng",
    [DocumentType.ADJUSTMENT]: "Điều chỉnh kho",
    [DocumentType.JOURNAL]: "Bút toán",
    [DocumentType.PAYABLE]: "Phải trả",
    [DocumentType.RECEIVABLE]: "Phải thu",
    [DocumentType.PURCHASE_ORDER]: "Phiếu đặt hàng",
    [DocumentType.GOODS_ISSUE]: "Phiếu xuất hàng",
    [DocumentType.GOODS_RECEIPT]: "Phiếu nhập kho",
    [DocumentType.STOCK_TAKE]: "Phiếu kiểm kê kho",
    [DocumentType.QUOTATION]: "Báo hàng",
    [DocumentType.TRANSFER]: "Chuyển kho",
    [DocumentType.TRANSFER_ORDER]: "Lệnh điều chuyển",
    [DocumentType.STOCK_COUNT]: "Kiểm kê kho",
    [DocumentType.CASH_RECEIPT]: "Phiếu thu tiền mặt",
    [DocumentType.CASH_PAYMENT]: "Phiếu chi tiền mặt",
    [DocumentType.CASH_COUNT]: "Kiểm kê quỹ",
    [DocumentType.BANK_RECEIPT]: "Thu tiền gửi",
    [DocumentType.BANK_PAYMENT]: "Chi tiền gửi",
    [DocumentType.EXPENSE]: "Chi phí",
    [DocumentType.RECONCILIATION]: "Phiếu đối soát",
    [DocumentType.DEBT_OFFSET]: "Bù trừ công nợ",
    [DocumentType.CUSTOMER]: "Khách hàng",
    [DocumentType.EMPLOYEE]: "Nhân viên",
    [DocumentType.SUPPLIER]: "Nhà cung cấp",
    [DocumentType.DELIVERY_PARTNER]: "Đối tác giao hàng",
  };
  return labels[documentType];
}

function formatResetPolicy(resetPolicy: ResetPolicy): string {
  const labels: Record<ResetPolicy, string> = {
    DAILY: "Hàng ngày",
    MONTHLY: "Hàng tháng",
    YEARLY: "Hàng năm",
    NEVER: "Không đặt lại",
  };
  return labels[resetPolicy];
}

function defaultPrefix(documentType: DocumentType): string {
  const prefixMap: Record<DocumentType, string> = {
    [DocumentType.INVOICE]: "INV",
    [DocumentType.SALE]: "SAL",
    [DocumentType.RETURN]: "RTN",
    [DocumentType.ADJUSTMENT]: "ADJ",
    [DocumentType.JOURNAL]: "JNL",
    [DocumentType.PAYABLE]: "PAY",
    [DocumentType.RECEIVABLE]: "REC",
    [DocumentType.QUOTATION]: "PBH",
    [DocumentType.PURCHASE_ORDER]: "PDH",
    [DocumentType.GOODS_RECEIPT]: "NK",
    [DocumentType.STOCK_TAKE]: "KK",
    [DocumentType.GOODS_ISSUE]: "XK",
    [DocumentType.TRANSFER]: "CK",
    [DocumentType.TRANSFER_ORDER]: "LDC",
    [DocumentType.STOCK_COUNT]: "KK",
    [DocumentType.CASH_RECEIPT]: "PT",
    [DocumentType.CASH_PAYMENT]: "PC",
    [DocumentType.CASH_COUNT]: "KKQ",
    [DocumentType.BANK_RECEIPT]: "NTTK",
    [DocumentType.BANK_PAYMENT]: "UNC",
    [DocumentType.EXPENSE]: "CP",
    [DocumentType.RECONCILIATION]: "DS",
    [DocumentType.DEBT_OFFSET]: "BTCN",
    [DocumentType.CUSTOMER]: "KH",
    [DocumentType.EMPLOYEE]: "NV",
    [DocumentType.SUPPLIER]: "NCC",
    [DocumentType.DELIVERY_PARTNER]: "DTGH",
  };
  return prefixMap[documentType];
}

function buildPreview(form: RuleFormState): string {
  const datePart = form.includeDate ? `-${form.dateFormat}` : "";
  const sequencePart = `-${"0".repeat(Number(form.sequenceLength) || 5)}`;
  const suffixPart = form.suffix.trim() ? `-${form.suffix.trim()}` : "";
  return `${form.prefix.trim() || "PREFIX"}${datePart}${sequencePart}${suffixPart}`;
}

function buildFormatPreview(rule: DocumentNumberRule): string {
  const datePart = rule.includeDate ? `-${rule.dateFormat}` : "";
  const sequencePart = `-${"0".repeat(Number(rule.sequenceLength))}`;
  const suffixPart = rule.suffix ? `-${rule.suffix}` : "";
  return `${rule.prefix}${datePart}${sequencePart}${suffixPart}`;
}
