import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ImportDuplicateMode } from "@erp/shared-interfaces";
import { AppModal } from "@erp/ui";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import type { TableColumn } from "../../table/BaseDataTable";
import { ImportStepDataReview } from "./ImportStepDataReview";
import { ImportWizardFileSelect } from "./ImportWizardFileSelect";
import { ImportWizardFooter } from "./ImportWizardFooter";
import { ImportWizardStepper } from "./ImportWizardStepper";
import {
  ImportWizardStep,
  type ImportJob,
  type ImportJobRow,
  type ImportReviewRow,
  type ImportValidateResponse,
} from "./types";

export interface ImportWizardApi<TCommit extends ImportValidateResponse> {
  validate: (
    file: File,
    duplicateMode: ImportDuplicateMode,
  ) => Promise<ImportValidateResponse>;
  commit: (jobId: string) => Promise<TCommit>;
  /** Hủy job validate (đóng dialog / quay lại bước chọn file). */
  cancelJob: (jobId: string) => Promise<void>;
  downloadErrorRows: (jobId: string) => Promise<void>;
  downloadTemplate: () => Promise<void>;
}

interface Props<TCommit extends ImportValidateResponse> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommitted?: () => void;
  title: string;
  introTitle: string;
  introBullets: string[];
  /** Noun in "Khi gặp <noun> đã tồn tại:". */
  duplicateNoun: string;
  api: ImportWizardApi<TCommit>;
  reviewColumns: TableColumn<ImportReviewRow>[];
  /** Step-3 content built from the commit response. */
  renderComplete: (result: TCommit) => ReactNode;
}

/**
 * 3-step MISA-style import wizard (chọn tệp → kiểm tra → hoàn thành) shared
 * by the item/customer/category imports. Domain specifics come in via props;
 * the state machine (auto-validate on file pick with a request-id guard
 * against stale responses, job cancellation on back/close) lives here once.
 */
export function ImportWizardDialog<TCommit extends ImportValidateResponse>({
  open,
  onOpenChange,
  onCommitted,
  title,
  introTitle,
  introBullets,
  duplicateNoun,
  api,
  reviewColumns,
  renderComplete,
}: Props<TCommit>) {
  const [step, setStep] = useState<ImportWizardStep>(
    ImportWizardStep.FileSelect,
  );
  const [duplicateMode, setDuplicateMode] = useState<ImportDuplicateMode>(
    ImportDuplicateMode.UPDATE,
  );
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [rows, setRows] = useState<ImportJobRow[]>([]);
  const [rowsTruncated, setRowsTruncated] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<TCommit | null>(null);

  const validateRequestIdRef = useRef(0);
  const apiRef = useRef(api);
  apiRef.current = api;

  const reset = useCallback(() => {
    validateRequestIdRef.current += 1;
    setStep(ImportWizardStep.FileSelect);
    setDuplicateMode(ImportDuplicateMode.UPDATE);
    setFile(null);
    setJob(null);
    setRows([]);
    setRowsTruncated(false);
    setIsValidating(false);
    setIsCommitting(false);
    setCommitResult(null);
  }, []);

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        const pendingJobId =
          step === ImportWizardStep.DataReview && job ? job.id : null;
        reset();
        if (pendingJobId) {
          void apiRef.current.cancelJob(pendingJobId).catch(() => undefined);
        }
      }
      onOpenChange(nextOpen);
    },
    [job, onOpenChange, reset, step],
  );

  useEffect(() => {
    if (!open || !file) return;

    const requestId = ++validateRequestIdRef.current;
    setIsValidating(true);

    void (async () => {
      try {
        const result = await apiRef.current.validate(file, duplicateMode);
        if (requestId !== validateRequestIdRef.current) return;
        setJob(result.job);
        setRows(result.rows);
        setRowsTruncated(result.rowsTruncated === true);
        setStep(ImportWizardStep.DataReview);
      } catch (err) {
        if (requestId !== validateRequestIdRef.current) return;
        setJob(null);
        setRows([]);
        setRowsTruncated(false);
        toast.error(
          err instanceof Error
            ? err.message
            : "Không thể kiểm tra tệp nhập khẩu",
        );
      } finally {
        if (requestId === validateRequestIdRef.current) {
          setIsValidating(false);
        }
      }
    })();

    return () => {
      validateRequestIdRef.current += 1;
    };
  }, [open, file, duplicateMode]);

  const handleBackFromReview = useCallback(() => {
    const pendingJobId = job?.id;
    validateRequestIdRef.current += 1;
    setFile(null);
    setJob(null);
    setRows([]);
    setRowsTruncated(false);
    setStep(ImportWizardStep.FileSelect);
    if (pendingJobId) {
      void apiRef.current.cancelJob(pendingJobId).catch(() => {
        toast.error("Không thể hủy phiên kiểm tra. Vui lòng thử lại.");
      });
    }
  }, [job?.id]);

  const handleCommit = async () => {
    if (!job) return;
    setIsCommitting(true);
    try {
      const result = await api.commit(job.id);
      setCommitResult(result);
      setStep(ImportWizardStep.Complete);
      onCommitted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nhập khẩu thất bại");
    } finally {
      setIsCommitting(false);
    }
  };

  if (!open) return null;

  let footerActions: Parameters<typeof ImportWizardFooter>[0]["actions"] = [];

  if (step === ImportWizardStep.DataReview && job) {
    const validCount = job.validRows ?? 0;
    footerActions = [
      {
        key: "back",
        label: "Quay lại",
        onClick: handleBackFromReview,
        disabled: isCommitting || isValidating,
        variant: "outline",
        icon: ArrowLeft,
        iconPosition: "left",
      },
      {
        key: "continue",
        label: "Tiếp tục",
        onClick: () => void handleCommit(),
        disabled: validCount === 0 || isCommitting || isValidating,
        loading: isCommitting,
        variant: "primary",
        icon: ArrowRight,
        iconPosition: "right",
      },
    ];
  } else if (step === ImportWizardStep.Complete) {
    footerActions = [
      {
        key: "done",
        label: "Hoàn thành",
        onClick: () => handleClose(false),
        variant: "primary",
        icon: Check,
        iconPosition: "left",
      },
    ];
  }

  return (
    <AppModal
      open
      onOpenChange={handleClose}
      title={title}
      defaultWidth={920}
      defaultHeight={650}
      bodyClassName="flex flex-col overflow-hidden"
      showFooter
      footer={
        <ImportWizardFooter
          actions={footerActions}
          onCancel={() => handleClose(false)}
          onHelp={() => toast.message("Tài liệu trợ giúp đang được cập nhật.")}
        />
      }
    >
      <ImportWizardStepper currentStep={step} />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {isValidating ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-md bg-background/80 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-[#1e3a6e]" />
            Đang kiểm tra dữ liệu…
          </div>
        ) : null}

        {step === ImportWizardStep.FileSelect || (isValidating && !job) ? (
          <ImportWizardFileSelect
            introTitle={introTitle}
            introBullets={introBullets}
            duplicateNoun={duplicateNoun}
            onDownloadTemplate={api.downloadTemplate}
            duplicateMode={duplicateMode}
            onDuplicateModeChange={setDuplicateMode}
            file={file}
            onFileChange={setFile}
          />
        ) : null}

        {step === ImportWizardStep.DataReview && job && !isValidating ? (
          <ImportStepDataReview
            job={job}
            rows={rows}
            rowsTruncated={rowsTruncated}
            columns={reviewColumns}
            onDownloadErrors={api.downloadErrorRows}
          />
        ) : null}

        {step === ImportWizardStep.Complete && commitResult
          ? renderComplete(commitResult)
          : null}
      </div>
    </AppModal>
  );
}
