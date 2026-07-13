import { ImportDuplicateMode } from "@erp/shared-interfaces";
import { AppModal } from "@erp/ui";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImportSuccessIllustration } from "../../../components/shared/import-wizard/ImportSuccessIllustration";
import { ImportWizardFooter } from "../../../components/shared/import-wizard/ImportWizardFooter";
import { ImportWizardStepper } from "../../../components/shared/import-wizard/ImportWizardStepper";
import { ImportStepDataReviewLocation } from "./ImportStepDataReviewLocation";
import { ImportStepFileSelectLocation } from "./ImportStepFileSelectLocation";
import {
  useCancelLocationImport,
  useCommitLocationImport,
  useValidateLocationImport,
} from "./import-location.api";
import {
  ImportWizardStep,
  type ImportJob,
  type LocationImportJobRow,
} from "./import-location.types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommitted?: () => void;
}

export function ImportLocationDialog({
  open,
  onOpenChange,
  onCommitted,
}: Props) {
  const [step, setStep] = useState<ImportWizardStep>(
    ImportWizardStep.FileSelect,
  );
  const [duplicateMode, setDuplicateMode] = useState<ImportDuplicateMode>(
    ImportDuplicateMode.UPDATE,
  );
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [rows, setRows] = useState<LocationImportJobRow[]>([]);
  const [rowsTruncated, setRowsTruncated] = useState(false);
  const [locationsCommitted, setLocationsCommitted] = useState(0);

  const {
    mutateAsync: validateFile,
    isPending: isValidating,
    reset: resetValidate,
  } = useValidateLocationImport();
  const {
    mutateAsync: commitJob,
    isPending: isCommitting,
    reset: resetCommit,
  } = useCommitLocationImport();
  const { mutateAsync: cancelJob } = useCancelLocationImport();

  const validateRequestIdRef = useRef(0);
  const validateFileRef = useRef(validateFile);
  validateFileRef.current = validateFile;

  const reset = useCallback(() => {
    validateRequestIdRef.current += 1;
    setStep(ImportWizardStep.FileSelect);
    setDuplicateMode(ImportDuplicateMode.UPDATE);
    setFile(null);
    setJob(null);
    setRows([]);
    setRowsTruncated(false);
    setLocationsCommitted(0);
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
          void cancelJob(pendingJobId).catch(() => undefined);
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
      void cancelJob(pendingJobId).catch(() => {
        toast.error("Không thể hủy phiên kiểm tra. Vui lòng thử lại.");
      });
    }
  }, [job?.id]);

  const handleCommit = async () => {
    if (!job) return;
    try {
      const result = await commitJob(job.id);
      setLocationsCommitted(result.locationsCommitted);
      setStep(ImportWizardStep.Complete);
      onCommitted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nhập khẩu thất bại");
    }
  };

  if (!open) return null;

  let footerActions: Parameters<typeof ImportWizardFooter>[0]["actions"] = [];

  if (step === ImportWizardStep.DataReview && job) {
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
        disabled: (job.validRows ?? 0) === 0 || isCommitting || isValidating,
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
      title="Nhập khẩu vị trí hàng hóa"
      defaultWidth={820}
      defaultHeight={600}
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
          <ImportStepFileSelectLocation
            duplicateMode={duplicateMode}
            onDuplicateModeChange={setDuplicateMode}
            file={file}
            onFileChange={setFile}
          />
        ) : null}

        {step === ImportWizardStep.DataReview && job && !isValidating ? (
          <ImportStepDataReviewLocation
            job={job}
            rows={rows}
            rowsTruncated={rowsTruncated}
          />
        ) : null}

        {step === ImportWizardStep.Complete ? (
          <div className="flex flex-col items-center justify-center gap-5 py-10">
            <ImportSuccessIllustration />
            <p className="text-base text-muted-foreground">
              Nhập khẩu thành công
            </p>
            <p>
              <strong className="text-xl font-semibold text-[#2563eb]">
                {locationsCommitted}
              </strong>{" "}
              vị trí hàng hóa
            </p>
          </div>
        ) : null}
      </div>
    </AppModal>
  );
}
