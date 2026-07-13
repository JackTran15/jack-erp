import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppModal } from "@erp/ui";
import { ImportWizardFooter } from "../../../../components/shared/import-wizard/ImportWizardFooter";
import { ImportWizardStepper } from "../../../../components/shared/import-wizard/ImportWizardStepper";
import {
  cancelStockTakeImport,
  loadValidStockTakeImportRows,
  useCommitStockTakeImport,
  useValidateStockTakeImport,
} from "./import-stock-take.api";
import {
  ImportWizardStep,
  type StockTakeImportJob,
  type StockTakeImportJobRow,
} from "./import-stock-take.types";
import { StockTakeImportStepComplete } from "./StockTakeImportStepComplete";
import { StockTakeImportStepDataReview } from "./StockTakeImportStepDataReview";
import { StockTakeImportStepFileSelect } from "./StockTakeImportStepFileSelect";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockTakeId?: string;
  storageId: string;
  countByValue: boolean;
  onCommitted?: () => void;
  onApplyDraft?: (rows: StockTakeImportJobRow[]) => Promise<void> | void;
}

export function StockTakeImportDialog({
  open,
  onOpenChange,
  stockTakeId,
  storageId,
  countByValue,
  onCommitted,
  onApplyDraft,
}: Props) {
  const [step, setStep] = useState<ImportWizardStep>(
    ImportWizardStep.FileSelect,
  );
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<StockTakeImportJob | null>(null);
  const [rows, setRows] = useState<StockTakeImportJobRow[]>([]);
  const [rowsTruncated, setRowsTruncated] = useState(false);
  const [importedRows, setImportedRows] = useState(0);

  const {
    mutateAsync: validateFile,
    isPending: isValidating,
    reset: resetValidate,
  } = useValidateStockTakeImport();
  const {
    mutateAsync: commitJob,
    isPending: isCommitting,
    reset: resetCommit,
  } = useCommitStockTakeImport();

  const validateRequestIdRef = useRef(0);
  const validateFileRef = useRef(validateFile);
  validateFileRef.current = validateFile;

  const reset = useCallback(() => {
    validateRequestIdRef.current += 1;
    setStep(ImportWizardStep.FileSelect);
    setFile(null);
    setJob(null);
    setRows([]);
    setRowsTruncated(false);
    setImportedRows(0);
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
          void cancelStockTakeImport(pendingJobId).catch(() => undefined);
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
        const result = await validateFileRef.current({
          target: { stockTakeId, storageId, countByValue },
          file,
        });
        if (requestId !== validateRequestIdRef.current) return;
        setJob(result.job);
        setRows(result.rows);
        setRowsTruncated(result.rowsTruncated === true);
        setStep(ImportWizardStep.DataReview);
      } catch (error) {
        if (requestId !== validateRequestIdRef.current) return;
        setFile(null);
        setJob(null);
        setRows([]);
        setRowsTruncated(false);
        toast.error(
          error instanceof Error
            ? error.message
            : "Không thể kiểm tra tệp nhập khẩu",
        );
      }
    })();

    return () => {
      validateRequestIdRef.current += 1;
    };
  }, [countByValue, file, open, stockTakeId, storageId]);

  const handleBackFromReview = useCallback(() => {
    const pendingJobId = job?.id;
    validateRequestIdRef.current += 1;
    setFile(null);
    setJob(null);
    setRows([]);
    setRowsTruncated(false);
    setStep(ImportWizardStep.FileSelect);
    if (pendingJobId) {
      void cancelStockTakeImport(pendingJobId).catch(() => {
        toast.error("Không thể hủy phiên kiểm tra. Vui lòng thử lại.");
      });
    }
  }, [job?.id]);

  const handleCommit = async () => {
    if (!job) return;
    try {
      if (!stockTakeId) {
        const validRows = await loadValidStockTakeImportRows(job.id);
        await onApplyDraft?.(validRows);
        await cancelStockTakeImport(job.id);
        setImportedRows(validRows.length);
        setJob(null);
        setRows(validRows);
        setRowsTruncated(false);
        setStep(ImportWizardStep.Complete);
        return;
      }
      const result = await commitJob(job.id);
      setImportedRows(result.itemsCommitted);
      setJob(result.job);
      setRows(result.rows);
      setRowsTruncated(result.rowsTruncated === true);
      setStep(ImportWizardStep.Complete);
      onCommitted?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nhập khẩu thất bại",
      );
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
        disabled: job.validRows === 0 || isCommitting || isValidating,
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
      title="Nhập khẩu kiểm kê kho"
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
          <StockTakeImportStepFileSelect
            file={file}
            onFileChange={setFile}
            countByValue={countByValue}
          />
        ) : null}

        {step === ImportWizardStep.DataReview && job && !isValidating ? (
          <StockTakeImportStepDataReview
            job={job}
            rows={rows}
            countByValue={countByValue}
            rowsTruncated={rowsTruncated}
          />
        ) : null}

        {step === ImportWizardStep.Complete ? (
          <StockTakeImportStepComplete importedRows={importedRows} />
        ) : null}
      </div>
    </AppModal>
  );
}
