import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImportDuplicateMode } from "@erp/shared-interfaces";
import { AppModal } from "@erp/ui";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { ImportStepDataReview } from "../../../inventory/_components/import/ImportStepDataReview";
import { ImportWizardFooter } from "../../../inventory/_components/import/ImportWizardFooter";
import { ImportWizardStepper } from "../../../inventory/_components/import/ImportWizardStepper";
import { ImportWizardStep } from "../../../inventory/_components/import/import-inventory.types";
import { ImportCustomersStepComplete } from "./ImportCustomersStepComplete";
import { ImportCustomersStepFileSelect } from "./ImportCustomersStepFileSelect";
import { buildCustomerImportReviewColumns } from "./import-customer-review-columns";
import {
  cancelCustomersImportJob,
  downloadCustomersImportErrorRowsExcel,
  useCommitCustomersImport,
  useValidateCustomersImport,
} from "./import-customers.api";
import type { ImportJob, ImportJobRow } from "./import-customers.types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommitted?: () => void;
}

export function ImportCustomersDialog({ open, onOpenChange, onCommitted }: Props) {
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
  const [createdCount, setCreatedCount] = useState(0);
  const [updatedCount, setUpdatedCount] = useState(0);

  const {
    mutateAsync: validateFile,
    isPending: isValidating,
    reset: resetValidate,
  } = useValidateCustomersImport();
  const {
    mutateAsync: commitJob,
    isPending: isCommitting,
    reset: resetCommit,
  } = useCommitCustomersImport();

  const validateRequestIdRef = useRef(0);
  const validateFileRef = useRef(validateFile);
  validateFileRef.current = validateFile;

  const reviewColumns = useMemo(() => buildCustomerImportReviewColumns(), []);

  const reset = useCallback(() => {
    validateRequestIdRef.current += 1;
    setStep(ImportWizardStep.FileSelect);
    setDuplicateMode(ImportDuplicateMode.UPDATE);
    setFile(null);
    setJob(null);
    setRows([]);
    setRowsTruncated(false);
    setCreatedCount(0);
    setUpdatedCount(0);
    resetValidate();
    resetCommit();
  }, [resetCommit, resetValidate]);

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        const pendingJobId =
          step === ImportWizardStep.DataReview && job ? job.id : null;
        reset();
        if (pendingJobId) {
          void cancelCustomersImportJob(pendingJobId).catch(() => undefined);
        }
      }
      onOpenChange(nextOpen);
    },
    [job, onOpenChange, reset, step],
  );

  useEffect(() => {
    if (!open || !file) return;

    const requestId = ++validateRequestIdRef.current;

    void (async () => {
      try {
        const result = await validateFileRef.current({ file, duplicateMode });
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
      void cancelCustomersImportJob(pendingJobId).catch(() => {
        toast.error("Không thể hủy phiên kiểm tra. Vui lòng thử lại.");
      });
    }
  }, [job?.id]);

  const handleCommit = async () => {
    if (!job) return;
    try {
      const result = await commitJob(job.id);
      setCreatedCount(result.customersCreated);
      setUpdatedCount(result.customersUpdated);
      setStep(ImportWizardStep.Complete);
      onCommitted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nhập khẩu thất bại");
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
      title="Nhập khẩu khách hàng"
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
          <ImportCustomersStepFileSelect
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
            onDownloadErrors={downloadCustomersImportErrorRowsExcel}
          />
        ) : null}

        {step === ImportWizardStep.Complete ? (
          <ImportCustomersStepComplete
            createdCount={createdCount}
            updatedCount={updatedCount}
          />
        ) : null}
      </div>
    </AppModal>
  );
}
