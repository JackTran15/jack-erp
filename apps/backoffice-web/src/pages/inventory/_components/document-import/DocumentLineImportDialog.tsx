import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { AppModal } from "@erp/ui";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../../components/table/BaseDataTable";
import { StatusBadge } from "../../../../components/status/StatusBadge";
import { ImportFilePicker } from "../../../../components/shared/import-wizard/ImportFilePicker";
import { ImportWizardFooter } from "../../../../components/shared/import-wizard/ImportWizardFooter";
import { ImportWizardStepper } from "../../../../components/shared/import-wizard/ImportWizardStepper";
import {
  cancelDocumentLineImport,
  downloadDocumentLineImportErrors,
  downloadDocumentLineImportTemplate,
  getDocumentLineImportErrorMessage,
  loadValidDocumentLineImportRows,
  useValidateDocumentLineImport,
} from "./document-line-import.api";
import {
  ImportRowStatus,
  ImportWizardStep,
  type DocumentLineImportJob,
  type DocumentLineImportJobRow,
  type DocumentLineImportKind,
} from "./document-line-import.types";

interface ImportColumn {
  key: string;
  label: string;
  rawKey?: string;
  normalizedKey?: keyof NonNullable<DocumentLineImportJobRow["normalizedData"]>;
  width?: number;
  align?: "left" | "right";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: DocumentLineImportKind;
  title: string;
  description: string;
  templateFileName: string;
  errorFileName: string;
  successMessage: (count: number) => string;
  columns: ImportColumn[];
  onApplyDraft: (rows: DocumentLineImportJobRow[]) => void;
}

interface ReviewRow extends DocumentLineImportJobRow {
  statusLabel: string;
}

const ACCEPT =
  ".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

export function DocumentLineImportDialog({
  open,
  onOpenChange,
  kind,
  title,
  description,
  templateFileName,
  errorFileName,
  successMessage,
  columns,
  onApplyDraft,
}: Props) {
  const [step, setStep] = useState(ImportWizardStep.FileSelect);
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<DocumentLineImportJob | null>(null);
  const [rows, setRows] = useState<DocumentLineImportJobRow[]>([]);
  const [importedRows, setImportedRows] = useState(0);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isDownloadingErrors, setIsDownloadingErrors] = useState(false);
  const {
    mutateAsync: validateFile,
    isPending: isValidating,
    reset: resetValidate,
  } = useValidateDocumentLineImport(kind);
  const requestIdRef = useRef(0);
  const validateRef = useRef(validateFile);
  validateRef.current = validateFile;

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setStep(ImportWizardStep.FileSelect);
    setFile(null);
    setJob(null);
    setRows([]);
    setImportedRows(0);
    resetValidate();
  }, [resetValidate]);

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        const pendingJobId = job?.id;
        reset();
        if (pendingJobId) {
          void cancelDocumentLineImport(kind, pendingJobId).catch(
            () => undefined,
          );
        }
      }
      onOpenChange(nextOpen);
    },
    [job?.id, kind, onOpenChange, reset],
  );

  useEffect(() => {
    if (!open || !file) return;
    const requestId = ++requestIdRef.current;
    void validateRef
      .current(file)
      .then((result) => {
        if (requestId !== requestIdRef.current) return;
        setJob(result.job);
        setRows(result.rows);
        setStep(ImportWizardStep.DataReview);
      })
      .catch(async (error) => {
        if (requestId !== requestIdRef.current) return;
        const message = await getDocumentLineImportErrorMessage(
          error,
          "Không thể kiểm tra tệp nhập khẩu",
        );
        if (requestId !== requestIdRef.current) return;
        setFile(null);
        toast.error(message);
      });
    return () => {
      requestIdRef.current += 1;
    };
  }, [file, open]);

  const handleBack = () => {
    const pendingJobId = job?.id;
    reset();
    if (pendingJobId) {
      void cancelDocumentLineImport(kind, pendingJobId).catch(() => undefined);
    }
  };

  const handleApply = async () => {
    if (!job) return;
    try {
      const validRows = await loadValidDocumentLineImportRows(kind, job.id);
      onApplyDraft(validRows);
      await cancelDocumentLineImport(kind, job.id);
      setImportedRows(validRows.length);
      setJob(null);
      setRows(validRows);
      setStep(ImportWizardStep.Complete);
    } catch (error) {
      toast.error(
        await getDocumentLineImportErrorMessage(error, "Nhập khẩu thất bại"),
      );
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      await downloadDocumentLineImportTemplate(kind, templateFileName);
    } catch (error) {
      toast.error(
        await getDocumentLineImportErrorMessage(
          error,
          "Không thể tải tệp mẫu. Vui lòng thử lại.",
        ),
      );
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleDownloadErrors = async () => {
    if (!job) return;
    try {
      setIsDownloadingErrors(true);
      await downloadDocumentLineImportErrors(kind, job.id, errorFileName);
    } catch (error) {
      toast.error(
        await getDocumentLineImportErrorMessage(
          error,
          "Không thể tải file lỗi. Vui lòng thử lại.",
        ),
      );
    } finally {
      setIsDownloadingErrors(false);
    }
  };

  const reviewRows = useMemo<ReviewRow[]>(
    () =>
      rows.map((row) => ({
        ...row,
        statusLabel:
          row.errorMessages?.map((message) => message.message).join("; ") ||
          row.warningMessages?.map((message) => message.message).join("; ") ||
          "Hợp lệ",
      })),
    [rows],
  );

  const tableColumns = useMemo<TableColumn<ReviewRow>[]>(
    () => [
      ...columns.map<TableColumn<ReviewRow>>((column) => ({
        key: column.key,
        label: column.label,
        width: column.width,
        className: column.align === "right" ? "text-right" : undefined,
        render: (row) => {
          const normalizedValue = column.normalizedKey
            ? row.normalizedData?.[column.normalizedKey]
            : undefined;
          return String(
            normalizedValue ??
              (column.rawKey ? row.rawData[column.rawKey] : "") ??
              "",
          );
        },
      })),
      {
        key: "status",
        label: "Tình trạng",
        width: 340,
        render: (row) => (
          <StatusBadge
            variant={
              row.status === ImportRowStatus.ERROR
                ? "danger"
                : row.warningMessages?.length
                  ? "warning"
                  : "success"
            }
          >
            {row.statusLabel}
          </StatusBadge>
        ),
      },
    ],
    [columns],
  );

  if (!open) return null;

  const actions =
    step === ImportWizardStep.DataReview && job
      ? [
          {
            key: "back",
            label: "Quay lại",
            onClick: handleBack,
            variant: "outline" as const,
            icon: ArrowLeft,
          },
          {
            key: "continue",
            label: "Tiếp tục",
            onClick: () => void handleApply(),
            disabled: job.validRows === 0,
            icon: ArrowRight,
            iconPosition: "right" as const,
          },
        ]
      : step === ImportWizardStep.Complete
        ? [
            {
              key: "done",
              label: "Hoàn thành",
              onClick: () => handleClose(false),
              icon: Check,
            },
          ]
        : [];

  return (
    <AppModal
      open
      onOpenChange={handleClose}
      title={title}
      defaultWidth={1000}
      defaultHeight={680}
      bodyClassName="flex flex-col overflow-hidden"
      showFooter
      footer={
        <ImportWizardFooter
          actions={actions}
          onCancel={() => handleClose(false)}
          onHelp={() => toast.message("Tài liệu trợ giúp đang được cập nhật.")}
        />
      }
    >
      <ImportWizardStepper currentStep={step} />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {isValidating ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/80 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Đang kiểm tra dữ liệu…
          </div>
        ) : null}

        {step === ImportWizardStep.FileSelect ? (
          <div className="flex flex-col gap-5">
            <section>
              <p className="text-sm font-medium">{description}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Nhập Mã SKU hoặc Mã vạch và Số lượng.</li>
                <li>
                  Dữ liệu hợp lệ được đưa vào chứng từ đang mở và chưa tự động
                  lưu.
                </li>
                <li>Khuyến nghị mỗi chứng từ không quá 200 hàng hóa.</li>
              </ul>
            </section>
            <section className="flex gap-6">
              <div className="w-44 shrink-0 pt-1">
                <p className="text-sm font-medium">Chọn tệp nhập khẩu:</p>
                <button
                  type="button"
                  className="mt-1 inline-flex items-center gap-1 text-sm text-[#2563eb] hover:underline disabled:opacity-60"
                  disabled={isDownloadingTemplate}
                  onClick={() => void handleDownloadTemplate()}
                >
                  {isDownloadingTemplate ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  (Tải tệp mẫu tại đây)
                </button>
              </div>
              <ImportFilePicker
                accept={ACCEPT}
                file={file}
                onFileChange={setFile}
                validateFile={(picked) => {
                  const supported = [".xlsx", ".xls", ".csv"].some(
                    (extension) =>
                      picked.name.toLowerCase().endsWith(extension),
                  );
                  if (!supported) {
                    toast.error(
                      "Tệp nhập khẩu phải có định dạng Excel hoặc CSV.",
                    );
                  }
                  return supported;
                }}
              />
            </section>
          </div>
        ) : null}

        {step === ImportWizardStep.DataReview && job ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <span>
                Tổng số <strong>{job.totalRows}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Hợp lệ{" "}
                <strong className="text-green-700">{job.validRows}</strong>
              </span>
              {job.errorRows > 0 ? (
                <span>
                  Không hợp lệ{" "}
                  <strong className="text-destructive">{job.errorRows}</strong>{" "}
                  (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[#2563eb] hover:underline"
                    onClick={() => void handleDownloadErrors()}
                  >
                    {isDownloadingErrors ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Tải về
                  </button>
                  )
                </span>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded border">
              <BaseDataTable
                columns={tableColumns}
                rows={reviewRows}
                loading={false}
                emptyLabel="Không có dòng dữ liệu."
                getRowKey={(row) => row.id}
                scrollContainerClassName="max-h-[min(52vh,480px)]"
                className="min-w-full"
              />
            </div>
          </div>
        ) : null}

        {step === ImportWizardStep.Complete ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <Check className="h-16 w-16 rounded-full bg-green-100 p-3 text-green-700" />
            <p className="text-lg font-semibold">Nhập khẩu thành công</p>
            <p className="text-muted-foreground">
              {successMessage(importedRows)}
            </p>
          </div>
        ) : null}
      </div>
    </AppModal>
  );
}
