import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppModal } from "@erp/ui";
import { ImportWizardFooter } from "../../inventory/_components/import/ImportWizardFooter";
import { ImportWizardStepper } from "../../inventory/_components/import/ImportWizardStepper";
import {
  cancelGoodsReceiptImport,
  getGoodsReceiptImportErrorMessage,
  loadValidGoodsReceiptImportRows,
  useValidateGoodsReceiptImport,
} from "./import-goods-receipt.api";
import {
  ImportWizardStep,
  type GoodsReceiptImportJob,
  type GoodsReceiptImportJobRow,
} from "./import-goods-receipt.types";
import { GoodsReceiptImportStepDataReview } from "./GoodsReceiptImportStepDataReview";
import { GoodsReceiptImportStepFileSelect } from "./GoodsReceiptImportStepFileSelect";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyDraft: (rows: GoodsReceiptImportJobRow[]) => void;
}

export function GoodsReceiptImportDialog({
  open,
  onOpenChange,
  onApplyDraft,
}: Props) {
  const [step, setStep] = useState(ImportWizardStep.FileSelect);
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<GoodsReceiptImportJob | null>(null);
  const [rows, setRows] = useState<GoodsReceiptImportJobRow[]>([]);
  const [importedRows, setImportedRows] = useState(0);
  const { mutateAsync: validateFile, isPending: isValidating, reset: resetValidate } =
    useValidateGoodsReceiptImport();
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
        if (pendingJobId) void cancelGoodsReceiptImport(pendingJobId).catch(() => undefined);
      }
      onOpenChange(nextOpen);
    },
    [job?.id, onOpenChange, reset],
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
        const message = await getGoodsReceiptImportErrorMessage(
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
    if (pendingJobId) void cancelGoodsReceiptImport(pendingJobId).catch(() => undefined);
  };

  const handleApply = async () => {
    if (!job) return;
    try {
      const validRows = await loadValidGoodsReceiptImportRows(job.id);
      onApplyDraft(validRows);
      await cancelGoodsReceiptImport(job.id);
      setImportedRows(validRows.length);
      setJob(null);
      setRows(validRows);
      setStep(ImportWizardStep.Complete);
    } catch (error) {
      toast.error(
        await getGoodsReceiptImportErrorMessage(error, "Nhập khẩu thất bại"),
      );
    }
  };

  if (!open) return null;

  const actions =
    step === ImportWizardStep.DataReview && job
      ? [
          { key: "back", label: "Quay lại", onClick: handleBack, variant: "outline" as const, icon: ArrowLeft },
          { key: "continue", label: "Tiếp tục", onClick: () => void handleApply(), disabled: job.validRows === 0, icon: ArrowRight, iconPosition: "right" as const },
        ]
      : step === ImportWizardStep.Complete
        ? [{ key: "done", label: "Hoàn thành", onClick: () => handleClose(false), icon: Check }]
        : [];

  return (
    <AppModal
      open
      onOpenChange={handleClose}
      title="Nhập khẩu hàng hóa nhập kho"
      defaultWidth={1000}
      defaultHeight={680}
      bodyClassName="flex flex-col overflow-hidden"
      showFooter
      footer={<ImportWizardFooter actions={actions} onCancel={() => handleClose(false)} onHelp={() => toast.message("Tài liệu trợ giúp đang được cập nhật.")} />}
    >
      <ImportWizardStepper currentStep={step} />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {isValidating ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/80 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Đang kiểm tra dữ liệu…
          </div>
        ) : null}
        {step === ImportWizardStep.FileSelect ? <GoodsReceiptImportStepFileSelect file={file} onFileChange={setFile} /> : null}
        {step === ImportWizardStep.DataReview && job ? <GoodsReceiptImportStepDataReview job={job} rows={rows} /> : null}
        {step === ImportWizardStep.Complete ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <Check className="h-16 w-16 rounded-full bg-green-100 p-3 text-green-700" />
            <p className="text-lg font-semibold">Nhập khẩu thành công</p>
            <p className="text-muted-foreground">{importedRows} dòng đã được đưa vào phiếu nhập kho.</p>
          </div>
        ) : null}
      </div>
    </AppModal>
  );
}
