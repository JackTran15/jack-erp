import { useCallback, useEffect, useRef, useState } from "react";
import {
  InventoryImportExcelField,
  ImportDuplicateMode,
  ImportRowStatus,
} from "@erp/shared-interfaces";
import { AppModal } from "@erp/ui";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { ImportStepComplete } from "./ImportStepComplete";
import { ImportStepDataReview } from "./ImportStepDataReview";
import { ImportStepFileSelect } from "./ImportStepFileSelect";
import { ImportWizardFooter } from "./ImportWizardFooter";
import { ImportWizardStepper } from "./ImportWizardStepper";
import {
  cancelImportJob,
  useCommitImport,
  useValidateImport,
} from "./import-inventory.api";
import {
  ImportWizardStep,
  type ImportJob,
  type ImportJobRow,
} from "./import-inventory.types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommitted?: () => void;
}

function countDistinctModelNames(rows: ImportJobRow[]): number {
  const names = new Set<string>();
  for (const row of rows) {
    if (
      row.status !== ImportRowStatus.VALID &&
      row.status !== ImportRowStatus.COMMITTED
    ) {
      continue;
    }
    const name = String(
      row.rawData[InventoryImportExcelField.MODEL_NAME] ?? "",
    ).trim();
    if (name) names.add(name);
  }
  return names.size;
}

export function ImportInventoryDialog({
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
  const [rows, setRows] = useState<ImportJobRow[]>([]);
  const [rowsTruncated, setRowsTruncated] = useState(false);
  const [productsCount, setProductsCount] = useState(0);
  const [itemsCount, setItemsCount] = useState(0);

  const {
    mutateAsync: validateFile,
    isPending: isValidating,
    reset: resetValidate,
  } = useValidateImport();
  const {
    mutateAsync: commitJob,
    isPending: isCommitting,
    reset: resetCommit,
  } = useCommitImport();

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
    setProductsCount(0);
    setItemsCount(0);
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
          void cancelImportJob(pendingJobId).catch(() => undefined);
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
      void cancelImportJob(pendingJobId).catch(() => {
        toast.error("Không thể hủy phiên kiểm tra. Vui lòng thử lại.");
      });
    }
  }, [job?.id]);

  const handleCommit = async () => {
    if (!job) return;
    try {
      const result = await commitJob(job.id);
      const modelCount =
        result.productsCreated > 0
          ? result.productsCreated
          : countDistinctModelNames(result.rows);
      setProductsCount(modelCount);
      setItemsCount(result.itemsCommitted);
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
      title="Nhập khẩu hàng hóa"
      defaultWidth={920}
      defaultHeight={620}
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
          <ImportStepFileSelect
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
          />
        ) : null}

        {step === ImportWizardStep.Complete ? (
          <ImportStepComplete
            productsCount={productsCount}
            itemsCount={itemsCount}
          />
        ) : null}
      </div>
    </AppModal>
  );
}
